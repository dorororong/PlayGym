// 알고리즘 공통: 행동 유지(frame skip), 에피소드 기록, 평가, 체크포인트 녹화.

import type { Env, StepResult } from '../engine/env';
import { Rng } from '../engine/rng';
import type { Agent } from './agent';

/** 같은 행동을 k 프레임 반복. 보상은 합치고 끝나면 바로 멈춘다 */
export function stepSkip(env: Env, a: number, k: number): StepResult & { frames: number } {
  let reward = 0;
  let r: StepResult;
  let frames = 0;
  do {
    r = env.step(a);
    reward += r.reward;
    frames++;
  } while (frames < k && !r.terminated && !r.truncated);
  return { ...r, reward, frames };
}

export interface EpisodeStat {
  ret: number;
  len: number;
  score: number;
}

export interface UpdateStats {
  steps: number;
  episodes: number;
  /** 최근 에피소드(최대 20개) 평균. 끝난 에피소드가 없으면 null */
  meanReturn: number | null;
  meanLength: number | null;
  meanScore: number | null;
  /** 알고리즘별 진단값 (엔트로피, ε, 상태 수 등) */
  info: Record<string, number>;
}

/** 여러 환경의 에피소드 보상·길이를 세고 최근 20개 평균을 낸다 */
export class EpisodeTracker {
  readonly recent: EpisodeStat[] = [];
  episodes = 0;
  private ret: number[];
  private len: number[];

  constructor(n: number) {
    this.ret = new Array(n).fill(0);
    this.len = new Array(n).fill(0);
  }

  add(e: number, r: StepResult & { frames: number }): boolean {
    this.ret[e] += r.reward;
    this.len[e] += r.frames;
    if (!r.terminated && !r.truncated) return false;
    this.recent.push({ ret: this.ret[e], len: this.len[e], score: r.info.score });
    if (this.recent.length > 20) this.recent.shift();
    this.episodes++;
    this.ret[e] = 0;
    this.len[e] = 0;
    return true;
  }

  stats(steps: number, info: Record<string, number>): UpdateStats {
    const avg = (f: (x: EpisodeStat) => number) => (this.recent.length ? this.recent.reduce((a, x) => a + f(x), 0) / this.recent.length : null);
    return { steps, episodes: this.episodes, meanReturn: avg((x) => x.ret), meanLength: avg((x) => x.len), meanScore: avg((x) => x.score), info };
  }
}

/** 할인 보상 합의 분산을 추적해 보상 크기를 맞춘다 (게임마다 점수 크기가 달라도 같은 설정으로 학습되게) */
export class RunningVar {
  mean = 0;
  var = 1;
  count = 1e-4;
  update(x: number): void {
    const n = this.count + 1;
    const d = x - this.mean;
    this.mean += d / n;
    this.var = (this.var * this.count + d * d * (this.count / n)) / n;
    this.count = n;
  }
}

export interface EvalResult {
  meanReturn: number;
  meanScore: number;
  meanLength: number;
  episodes: number;
}

/** 에이전트(없으면 무작위 행동)로 에피소드를 돌려 평균을 낸다. temperature 0 = 가장 좋은 행동만 */
export function evaluate(makeEnv: () => Env, agent: Agent | null, episodes: number, seed = 1000, temperature = 0): EvalResult {
  const env = makeEnv();
  const rng = new Rng(seed);
  let R = 0;
  let S = 0;
  let L = 0;
  for (let ep = 0; ep < episodes; ep++) {
    let { obs } = env.reset(seed + ep);
    for (;;) {
      const a = agent ? agent.act(obs, rng, temperature) : rng.int(0, env.actionSpace.n - 1);
      const r = stepSkip(env, a, agent?.frameSkip ?? 1);
      R += r.reward;
      obs = r.obs;
      if (r.terminated || r.truncated) {
        S += r.info.score;
        L += r.info.frame;
        break;
      }
    }
  }
  return { meanReturn: R / episodes, meanScore: S / episodes, meanLength: L / episodes, episodes };
}

/** 한 판을 녹화한다. 환경이 결정론적이라 시드 + 프레임별 행동만 있으면 똑같이 다시 볼 수 있다 */
export interface EpisodeRecording {
  seed: number;
  /** 프레임마다 행동 번호 한 글자 */
  actions: string;
  score: number;
  ret: number;
  length: number;
}

export function recordEpisode(makeEnv: () => Env, agent: Agent | null, seed: number, temperature: number): EpisodeRecording {
  const env = makeEnv();
  const rng = new Rng(seed * 31 + 7);
  let { obs } = env.reset(seed);
  let actions = '';
  let ret = 0;
  for (;;) {
    const a = agent ? agent.act(obs, rng, temperature) : rng.int(0, env.actionSpace.n - 1);
    const k = agent?.frameSkip ?? 1;
    for (let i = 0; i < k; i++) {
      const r = env.step(a);
      actions += String(a);
      ret += r.reward;
      obs = r.obs;
      if (r.terminated || r.truncated) return { seed, actions, score: r.info.score, ret, length: r.info.frame };
    }
  }
}
