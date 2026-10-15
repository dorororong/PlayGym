// 학습된 AI (에이전트): 알고리즘에 상관없이 "관찰 → 행동" 을 한다. 프로젝트에 JSON 으로 저장된다.

import type { Env } from '../engine/env';
import { Rng } from '../engine/rng';
import type { ActionName } from '../engine/types';
import type { Algo } from './config';
import { MLP, softmax, type MlpJson } from './nn';

export interface QTableJson {
  bins: number;
  low: number[];
  high: number[];
  /** 상태 키 → 행동별 Q 값 */
  table: Record<string, number[]>;
}

export interface AgentJson {
  version: 1;
  algo: Algo;
  labels: string[];
  actions: ActionName[];
  /** 학습한 프레임 수 */
  steps: number;
  frameSkip: number;
  /** ppo·reinforce: 정책망(행동 점수), dqn: Q망 */
  net?: MlpJson;
  /** ppo: 가치망 (이어서 학습할 때 쓴다) */
  value?: MlpJson;
  qtable?: QTableJson;
  /** 예전 형식(PPO 만 있던 때)의 정책망 */
  pi?: MlpJson;
}

/** 관찰을 칸 번호로 나눠 상태 키를 만든다 (Q-table) */
export class QTable {
  readonly table = new Map<string, Float64Array>();

  constructor(
    readonly bins: number,
    readonly low: number[],
    readonly high: number[],
    readonly nAct: number,
  ) {}

  key(obs: ArrayLike<number>): string {
    let k = '';
    for (let i = 0; i < obs.length; i++) {
      const span = this.high[i] - this.low[i] || 1;
      const b = Math.min(this.bins - 1, Math.max(0, Math.floor(((obs[i] - this.low[i]) / span) * this.bins)));
      k += i ? `,${b}` : `${b}`;
    }
    return k;
  }

  /** 없는 상태는 0 (만들지는 않는다) */
  get(key: string): Float64Array {
    return this.table.get(key) ?? new Float64Array(this.nAct);
  }

  toJSON(): QTableJson {
    const table: Record<string, number[]> = {};
    for (const [k, v] of this.table) table[k] = Array.from(v, (x) => +x.toFixed(4));
    return { bins: this.bins, low: this.low, high: this.high, table };
  }

  static fromJSON(j: QTableJson, nAct: number): QTable {
    const q = new QTable(j.bins, j.low, j.high, nAct);
    for (const [k, v] of Object.entries(j.table)) q.table.set(k, Float64Array.from(v));
    return q;
  }
}

export function argmax(p: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
  return best;
}

export function sample(p: ArrayLike<number>, rng: Rng): number {
  let u = rng.next();
  for (let i = 0; i < p.length; i++) {
    u -= p[i];
    if (u <= 0) return i;
  }
  return p.length - 1;
}

/** 화면의 "학습된 AI" 가 쓰는 온도. 실험으로 정했다 (README "학습 실험") */
export const PLAY_TEMPERATURE = 0.5;

export class Agent {
  constructor(
    readonly algo: Algo,
    readonly labels: string[],
    readonly actions: ActionName[],
    readonly steps: number,
    readonly frameSkip: number,
    readonly net?: MLP,
    readonly qtable?: QTable,
    /** PPO 가치망. 플레이에는 안 쓰고 이어서 학습할 때만 쓴다 */
    readonly value?: MLP,
  ) {}

  /**
   * 행동 고르기. rng 가 없거나 온도 0 이면 가장 좋은 행동만.
   * - 정책망(PPO·REINFORCE): 확률을 온도로 조정해 뽑는다
   * - 가치 기반(DQN·Q-table): 가장 큰 Q 를 고르되, 같은 실수를 반복하지 않도록 온도×5% 확률로 무작위
   */
  act(obs: ArrayLike<number>, rng?: Rng, temperature = 1): number {
    const n = this.actions.length;
    if (this.qtable) {
      if (rng && temperature > 0 && rng.next() < 0.05 * temperature) return rng.int(0, n - 1);
      return argmax(this.qtable.get(this.qtable.key(obs)));
    }
    const out = this.net!.forward(obs);
    // REINFORCE 정책은 덜 날카로워서 뽑으면 실수가 잦다 (실험: 공룡 최선만 3000 / 온도 0.5 260) → 최선 행동만
    if (this.algo === 'reinforce' && temperature <= PLAY_TEMPERATURE) return argmax(out);
    if (this.algo === 'dqn') {
      if (rng && temperature > 0 && rng.next() < 0.05 * temperature) return rng.int(0, n - 1);
      return argmax(out);
    }
    if (!rng || temperature <= 0) return argmax(out);
    return sample(softmax(Array.from(out, (v) => v / temperature)), rng);
  }

  /** 지금 환경과 맞는지 (관찰 이름표·행동 목록이 같아야 한다) */
  fits(env: Env): boolean {
    const s = env.observationSpace.labels;
    const a = env.actionSpace.names;
    return s.length === this.labels.length && s.every((l, i) => l === this.labels[i]) && a.length === this.actions.length && a.every((x, i) => x === this.actions[i]);
  }

  toJSON(): AgentJson {
    return {
      version: 1,
      algo: this.algo,
      labels: [...this.labels],
      actions: [...this.actions],
      steps: this.steps,
      frameSkip: this.frameSkip,
      ...(this.net ? { net: this.net.toJSON() } : {}),
      ...(this.qtable ? { qtable: this.qtable.toJSON() } : {}),
      ...(this.value ? { value: this.value.toJSON() } : {}),
    };
  }

  static fromJSON(j: AgentJson): Agent {
    const algo = j.algo ?? 'ppo';
    const net = j.net ?? j.pi;
    return new Agent(
      algo,
      j.labels,
      j.actions,
      j.steps ?? 0,
      j.frameSkip ?? 1,
      net ? MLP.fromJSON(net) : undefined,
      j.qtable ? QTable.fromJSON(j.qtable, j.actions.length) : undefined,
      j.value ? MLP.fromJSON(j.value) : undefined,
    );
  }
}
