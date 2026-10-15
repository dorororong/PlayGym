// 학습 가능성 실험: 예제 × 알고리즘 × 시드를 차례로 학습하고 무작위 행동과 비교한다.
// 결과: experiments/<이름>/ (results.json, results.md, 학습 곡선 CSV, 에이전트 JSON)
// 실행: npm run experiment -- [--games dino,flappy] [--algos ppo,dqn] [--seeds 3] [--steps 1000000] [--name 폴더이름]
//       (--steps 를 안 주면 예제의 학습 설계 길이. --games 에 project.json 경로도 줄 수 있다)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { Project } from '../src/engine/types';
import { cpus } from 'node:os';
import { createEnv } from '../src/engine/env';
import { PLAY_TEMPERATURE } from '../src/rl/agent';
import { evaluate } from '../src/rl/common';
import { ALGO_PRESETS, resolveConfig, type Algo } from '../src/rl/config';
import { createTrainer } from '../src/rl/trainer';
import { TEMPLATE_NAMES, loadTemplate } from './templates';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const games = opt('games', TEMPLATE_NAMES.join(',')).split(',');
const algos = opt('algos', '').split(',').filter(Boolean) as Algo[];
const seeds = Number(opt('seeds', '3'));
const stepsOverride = opt('steps', '');
const EVAL = 30;

const name = opt('name', new Date().toISOString().slice(0, 10));
const dir = `experiments/${name}`;
mkdirSync(dir, { recursive: true });

interface Row {
  game: string;
  algo: Algo;
  seed: number;
  frames: number;
  frameSkip: number;
  seconds: number;
  fps: number;
  randomScore: number;
  greedyScore: number;
  playScore: number;
  playLength: number;
  /** 최근 20판 평균 점수가 무작위의 2배(무작위가 0 이면 1점) 이상이 된 첫 시점 */
  secondsTo2x: number | null;
}
const rows: Row[] = [];

for (const arg of games) {
  const project = loadTemplate(arg) ?? (JSON.parse(readFileSync(arg, 'utf8')) as Project);
  const game = basename(arg, '.json');
  const makeEnv = () => createEnv(project);
  const random = evaluate(makeEnv, null, EVAL);
  const base = resolveConfig(project.training);
  for (const algo of algos.length ? algos : [base.algo]) {
    for (let seed = 0; seed < seeds; seed++) {
      const cfg = algo === base.algo ? structuredClone(base) : resolveConfig({ ...project.training, algo, ...ALGO_PRESETS[algo] });
      cfg.seed = seed;
      if (stepsOverride) cfg.steps = Number(stepsOverride);
      const tr = createTrainer(makeEnv, cfg);
      const curve: string[] = ['steps,seconds,meanScore,meanReturn,meanLength'];
      const t0 = performance.now();
      let to2x: number | null = null;
      while (tr.steps < cfg.steps) {
        const s = tr.update();
        const sec = (performance.now() - t0) / 1000;
        curve.push([s.steps, sec.toFixed(2), s.meanScore ?? '', s.meanReturn ?? '', s.meanLength ?? ''].join(','));
        if (to2x === null && s.meanScore !== null && s.meanScore >= Math.max(1, 2 * random.meanScore)) to2x = sec;
      }
      const seconds = (performance.now() - t0) / 1000;
      const agent = tr.agent();
      const g = evaluate(makeEnv, agent, EVAL);
      const p = evaluate(makeEnv, agent, EVAL, 1000, PLAY_TEMPERATURE);
      const row: Row = {
        game,
        algo,
        seed,
        frames: tr.steps,
        frameSkip: cfg.frameSkip,
        seconds: +seconds.toFixed(1),
        fps: Math.round(tr.steps / seconds),
        randomScore: +random.meanScore.toFixed(2),
        greedyScore: +g.meanScore.toFixed(2),
        playScore: +p.meanScore.toFixed(2),
        playLength: Math.round(p.meanLength),
        secondsTo2x: to2x === null ? null : +to2x.toFixed(1),
      };
      rows.push(row);
      writeFileSync(`${dir}/curve_${game}_${algo}_seed${seed}.csv`, curve.join('\n') + '\n');
      writeFileSync(`${dir}/agent_${game}_${algo}_seed${seed}.json`, JSON.stringify(agent.toJSON()));
      console.log(JSON.stringify(row));
    }
  }
}

const env = { node: process.version, cpu: cpus()[0]?.model, cores: cpus().length, date: new Date().toISOString() };
writeFileSync(`${dir}/results.json`, JSON.stringify({ env, rows }, null, 2));
const md = [
  `# 학습 실험 결과 (${name})`,
  '',
  `환경: Node ${env.node}, ${env.cpu} (${env.cores}코어, 단일 스레드 사용). 평가 ${EVAL} 판. "화면 방식" = 화면의 학습된 AI 와 같은 행동 선택.`,
  '',
  '| 게임 | 알고리즘 | 시드 | 프레임 | 유지 | 시간(초) | 프레임/초 | 무작위 점수 | 학습 점수(최선만) | 학습 점수(화면 방식) | 2배 도달(초) |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(
    (r) =>
      `| ${r.game} | ${r.algo} | ${r.seed} | ${r.frames.toLocaleString()} | ${r.frameSkip} | ${r.seconds} | ${r.fps.toLocaleString()} | ${r.randomScore} | ${r.greedyScore} | ${r.playScore} | ${r.secondsTo2x ?? '-'} |`,
  ),
  '',
];
writeFileSync(`${dir}/results.md`, md.join('\n'));
console.log(`결과: ${dir}/results.md`);
