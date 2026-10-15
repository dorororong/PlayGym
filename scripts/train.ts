// headless 학습: 예제 이름 또는 프로젝트 JSON 경로를 받아 학습하고, 무작위 행동과 비교한다.
// 프로젝트의 학습 설계(training)를 기본으로 쓰고, 옵션으로 덮어쓴다.
//   npm run train -- dino [--algo ppo|dqn|reinforce|qtable] [--steps 300000] [--skip 4] [--lr 5e-4]
//                          [--hidden 64,64] [--act tanh|relu|sigmoid] [--bins 6] [--seed 0] [--eval 20] [--out 폴더]
//                          [--resume 폴더/agent.json]   ← 저장된 AI 에서 이어서 학습 (--steps 만큼 더)
//                          [--ent 0.03]                 ← 탐험 보너스 (PPO·REINFORCE 엔트로피 계수)
//                          [--eps-end 0.05] [--eps-frac 0.3]  ← DQN·Q-table 의 마지막 ε, ε 를 줄이는 기간

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createEnv } from '../src/engine/env';
import type { Project } from '../src/engine/types';
import { Agent, PLAY_TEMPERATURE, type AgentJson } from '../src/rl/agent';
import { evaluate } from '../src/rl/common';
import { describeConfig, resolveConfig, type Activation, type Algo } from '../src/rl/config';
import { createTrainer } from '../src/rl/trainer';
import { loadTemplate } from './templates';

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const name = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) ?? 'dino';
const project = (loadTemplate(name) ?? JSON.parse(readFileSync(name, 'utf8'))) as Project;

const cfg = resolveConfig(project.training);
if (opt('algo')) cfg.algo = opt('algo') as Algo;
if (opt('steps')) cfg.steps = Number(opt('steps'));
if (opt('skip')) cfg.frameSkip = Number(opt('skip'));
if (opt('lr')) cfg.lr = Number(opt('lr'));
if (opt('hidden') !== undefined) cfg.network.hidden = opt('hidden')!.split(',').filter(Boolean).map(Number);
if (opt('act')) cfg.network.activation = opt('act') as Activation;
if (opt('bins')) cfg.qtable.bins = Number(opt('bins'));
if (opt('gamma')) cfg.gamma = Number(opt('gamma'));
if (opt('ent')) cfg.ppo.entCoef = cfg.reinforce.entCoef = Number(opt('ent'));
if (opt('eps-end')) cfg.dqn.epsEnd = cfg.qtable.epsEnd = Number(opt('eps-end'));
if (opt('eps-frac')) cfg.dqn.epsFraction = cfg.qtable.epsFraction = Number(opt('eps-frac'));
cfg.seed = Number(opt('seed') ?? 0);
const out = opt('out');
const evalEps = Number(opt('eval') ?? 20);

const makeEnv = () => createEnv(project);
const random = evaluate(makeEnv, null, evalEps);
console.log(`[${name}] ${describeConfig(cfg)} · ${cfg.steps.toLocaleString()} 프레임`);
console.log(`  무작위 행동: 점수 ${random.meanScore.toFixed(1)} · 보상 ${random.meanReturn.toFixed(1)} · 길이 ${random.meanLength.toFixed(0)}`);

const init = opt('resume') ? Agent.fromJSON(JSON.parse(readFileSync(opt('resume')!, 'utf8')) as AgentJson) : undefined;
const tr = createTrainer(makeEnv, cfg, init);
const target = tr.steps + cfg.steps;
if (init) console.log(`  이어서 학습: ${init.steps.toLocaleString()} 프레임 배운 AI 에서 ${cfg.steps.toLocaleString()} 프레임 더`);
const rows: string[] = ['steps,seconds,meanScore,meanReturn,meanLength,info'];
const t0 = performance.now();
let lastPrint = 0;
while (tr.steps < target) {
  const s = tr.update();
  const sec = (performance.now() - t0) / 1000;
  const info = Object.entries(s.info)
    .map(([k, v]) => `${k}=${+v.toFixed(4)}`)
    .join(' ');
  rows.push([s.steps, sec.toFixed(2), s.meanScore ?? '', s.meanReturn ?? '', s.meanLength ?? '', info].join(','));
  if (sec - lastPrint > 10 || tr.steps >= target) {
    lastPrint = sec;
    console.log(
      `  ${String(s.steps).padStart(8)} 프레임 ${sec.toFixed(0).padStart(4)}초 | 점수 ${s.meanScore?.toFixed(1) ?? '-'} 보상 ${s.meanReturn?.toFixed(1) ?? '-'} 길이 ${s.meanLength?.toFixed(0) ?? '-'} | ${info}`,
    );
  }
}
const sec = (performance.now() - t0) / 1000;
const agent = tr.agent();
const greedy = evaluate(makeEnv, agent, evalEps);
const play = evaluate(makeEnv, agent, evalEps, 1000, PLAY_TEMPERATURE);
console.log(`[${name}] 학습 ${tr.steps.toLocaleString()} 프레임 / ${sec.toFixed(0)}초 (${Math.round((tr.steps - (init?.steps ?? 0)) / sec).toLocaleString()} 프레임/초)`);
console.log(`  학습된 AI (최선만)   : 점수 ${greedy.meanScore.toFixed(1)} · 보상 ${greedy.meanReturn.toFixed(1)} · 길이 ${greedy.meanLength.toFixed(0)}`);
console.log(`  학습된 AI (화면 방식): 점수 ${play.meanScore.toFixed(1)} · 보상 ${play.meanReturn.toFixed(1)} · 길이 ${play.meanLength.toFixed(0)}`);

if (out) {
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/log.csv`, rows.join('\n') + '\n');
  writeFileSync(`${out}/agent.json`, JSON.stringify(agent.toJSON()));
  writeFileSync(`${out}/summary.json`, JSON.stringify({ target: name, resumedFrom: init?.steps ?? 0, cfg, steps: tr.steps, seconds: sec, random, greedy, play }, null, 2));
}
