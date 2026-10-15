// Q-table (표 Q-학습): 관찰 값마다 칸(bins)으로 나눠 "상태 번호"를 만들고, 상태×행동 표에 점수를 적어 가며 배운다.
//   Q[s][a] ← Q[s][a] + α (r + γ · max Q[s'] − Q[s][a])
// 신경망이 없어 원리가 가장 눈에 보인다. 대신 관찰이 많으면 상태가 너무 많아져 배우지 못한다 (칸^관찰 수).

import type { Env } from '../engine/env';
import { Rng } from '../engine/rng';
import { Agent, QTable, argmax } from './agent';
import { EpisodeTracker, stepSkip, type UpdateStats } from './common';
import type { LearnConfig } from './config';
import type { Trainer } from './trainer';

const DECISIONS_PER_UPDATE = 2048;
/** 표가 이보다 커지면 새 상태를 더 만들지 않는다 (메모리·저장 크기 보호) */
export const MAX_STATES = 200_000;

export class QTableTrainer implements Trainer {
  readonly table: QTable;
  private rng: Rng;
  private env: Env;
  private obs: number[];
  private eps = new EpisodeTracker(1);
  private decisions = 0;
  private resumed: boolean;
  steps = 0;

  constructor(
    makeEnv: () => Env,
    readonly cfg: LearnConfig,
    init?: Agent,
  ) {
    this.resumed = !!init;
    this.rng = new Rng((cfg.seed ?? 0) * 4099 + 5);
    this.env = makeEnv();
    const s = this.env.observationSpace;
    this.table = init?.qtable ? QTable.fromJSON(init.qtable.toJSON(), this.env.actionSpace.n) : new QTable(cfg.qtable.bins, s.low, s.high, this.env.actionSpace.n);
    this.steps = init?.steps ?? 0;
    this.obs = this.env.reset(this.nextSeed()).obs;
  }

  private nextSeed(): number {
    return Math.floor(this.rng.next() * 2 ** 31);
  }

  epsilon(): number {
    const q = this.cfg.qtable;
    if (this.resumed) return q.epsEnd;
    const total = (this.cfg.steps / this.cfg.frameSkip) * q.epsFraction;
    const t = Math.min(1, this.decisions / Math.max(1, total));
    return q.epsStart + (q.epsEnd - q.epsStart) * t;
  }

  agent(): Agent {
    const e = this.env;
    const copy = QTable.fromJSON(this.table.toJSON(), e.actionSpace.n);
    return new Agent('qtable', e.observationSpace.labels, e.actionSpace.names, this.steps, this.cfg.frameSkip, undefined, copy);
  }

  update(): UpdateStats {
    const c = this.cfg;
    const nAct = this.env.actionSpace.n;
    let full = 0;
    for (let i = 0; i < DECISIONS_PER_UPDATE; i++) {
      const s = this.table.key(this.obs);
      const qs = this.table.get(s);
      const a = this.rng.next() < this.epsilon() ? this.rng.int(0, nAct - 1) : argmax(qs);
      const r = stepSkip(this.env, a, c.frameSkip);
      this.steps += r.frames;
      this.decisions++;
      const next = r.terminated ? 0 : Math.max(...this.table.get(this.table.key(r.obs)));
      let row = this.table.table.get(s);
      if (!row && this.table.table.size < MAX_STATES) this.table.table.set(s, (row = new Float64Array(nAct)));
      if (row) row[a] += c.qtable.alpha * (r.reward + c.gamma * next - row[a]);
      else full = 1;
      if (this.eps.add(0, r)) this.obs = this.env.reset(this.nextSeed()).obs;
      else this.obs = r.obs;
    }
    return this.eps.stats(this.steps, { epsilon: this.epsilon(), states: this.table.table.size, full });
  }
}

/** 관찰 수와 칸 수로 가능한 상태 수 (설계 창 경고용) */
export function stateCount(nObs: number, bins: number): number {
  return bins ** nObs;
}
