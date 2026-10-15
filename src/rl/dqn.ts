// DQN (Deep Q-Network): 경험 재생 버퍼 + 목표망 + ε-탐욕, Double DQN 선택.
// 보상은 Atari DQN 처럼 [-1, 1] 로 자른다 (게임마다 점수 크기가 달라도 같은 설정으로 학습되게).

import type { Env } from '../engine/env';
import { Rng } from '../engine/rng';
import { Agent, argmax } from './agent';
import { EpisodeTracker, stepSkip, type UpdateStats } from './common';
import type { LearnConfig } from './config';
import { Adam, MLP } from './nn';
import type { Trainer } from './trainer';

const DECISIONS_PER_UPDATE = 1024;

export class DqnTrainer implements Trainer {
  readonly q: MLP;
  private target: MLP;
  private opt: Adam;
  private rng: Rng;
  private env: Env;
  private obs: number[];
  private eps = new EpisodeTracker(1);
  private nObs: number;
  private nAct: number;
  // 재생 버퍼 (원형)
  private bS: Float64Array;
  private bS2: Float64Array;
  private bA: Int32Array;
  private bR: Float64Array;
  private bD: Uint8Array;
  private size = 0;
  private head = 0;
  private decisions = 0;
  private lossSum = 0;
  private lossN = 0;
  steps = 0;

  /** 이어서 학습이면 처음부터 ε 를 낮게 (이미 아는 것을 다시 무작위로 헤매지 않게) */
  private resumed: boolean;

  constructor(
    makeEnv: () => Env,
    readonly cfg: LearnConfig,
    init?: Agent,
  ) {
    this.resumed = !!init;
    this.rng = new Rng((cfg.seed ?? 0) * 7919 + 3);
    this.env = makeEnv();
    this.nObs = this.env.observationSpace.shape[0];
    this.nAct = this.env.actionSpace.n;
    const { hidden, activation } = cfg.network;
    this.q = init?.net ? MLP.fromJSON(init.net.toJSON()) : new MLP([this.nObs, ...hidden, this.nAct], this.rng, 1, activation);
    this.steps = init?.steps ?? 0;
    this.target = new MLP([this.nObs, ...hidden, this.nAct], undefined, 1, activation);
    this.target.copyFrom(this.q);
    this.opt = new Adam(this.q.params, cfg.lr);
    const B = cfg.dqn.buffer;
    this.bS = new Float64Array(B * this.nObs);
    this.bS2 = new Float64Array(B * this.nObs);
    this.bA = new Int32Array(B);
    this.bR = new Float64Array(B);
    this.bD = new Uint8Array(B);
    this.obs = this.env.reset(this.nextSeed()).obs;
  }

  private nextSeed(): number {
    return Math.floor(this.rng.next() * 2 ** 31);
  }

  /** ε: 학습 전체 결정 수의 epsFraction 동안 epsStart → epsEnd 로 줄인다 */
  epsilon(): number {
    const d = this.cfg.dqn;
    if (this.resumed) return d.epsEnd;
    const total = (this.cfg.steps / this.cfg.frameSkip) * d.epsFraction;
    const t = Math.min(1, this.decisions / Math.max(1, total));
    return d.epsStart + (d.epsEnd - d.epsStart) * t;
  }

  agent(): Agent {
    const e = this.env;
    return new Agent('dqn', e.observationSpace.labels, e.actionSpace.names, this.steps, this.cfg.frameSkip, MLP.fromJSON(this.q.toJSON()));
  }

  update(): UpdateStats {
    const d = this.cfg.dqn;
    for (let i = 0; i < DECISIONS_PER_UPDATE; i++) {
      const o = this.obs;
      const a = this.rng.next() < this.epsilon() ? this.rng.int(0, this.nAct - 1) : argmax(this.q.forward(o));
      const r = stepSkip(this.env, a, this.cfg.frameSkip);
      this.steps += r.frames;
      this.decisions++;
      // 저장: 시간 초과는 끝이 아니므로 다음 상태 가치를 이어 붙인다 (done = terminated 만)
      const k = this.head;
      this.bS.set(o, k * this.nObs);
      this.bS2.set(r.obs, k * this.nObs);
      this.bA[k] = a;
      this.bR[k] = Math.max(-1, Math.min(1, r.reward));
      this.bD[k] = r.terminated ? 1 : 0;
      this.head = (this.head + 1) % d.buffer;
      this.size = Math.min(this.size + 1, d.buffer);

      if (this.eps.add(0, r)) this.obs = this.env.reset(this.nextSeed()).obs;
      else this.obs = r.obs;

      if (this.decisions >= d.learningStarts && this.decisions % d.trainFreq === 0) this.learn();
      if (this.decisions % d.targetUpdate === 0) this.target.copyFrom(this.q);
    }
    const info = { epsilon: this.epsilon(), loss: this.lossN ? this.lossSum / this.lossN : 0, buffer: this.size };
    this.lossSum = this.lossN = 0;
    return this.eps.stats(this.steps, info);
  }

  private learn(): void {
    const d = this.cfg.dqn;
    const g = this.q.zeroGrads();
    const acts: Float64Array[] = [];
    const dOut = new Float64Array(this.nAct);
    const B = d.batch;
    for (let i = 0; i < B; i++) {
      const k = Math.floor(this.rng.next() * this.size);
      const s = this.bS.subarray(k * this.nObs, (k + 1) * this.nObs);
      const s2 = this.bS2.subarray(k * this.nObs, (k + 1) * this.nObs);
      let next = 0;
      if (!this.bD[k]) {
        const tq = this.target.forward(s2);
        // Double DQN: 행동은 지금 망이 고르고, 값은 목표망으로 잰다 (과대평가를 줄인다)
        next = d.double ? tq[argmax(this.q.forward(s2))] : tq[argmax(tq)];
      }
      const y = this.bR[k] + this.cfg.gamma * next;
      const qv = this.q.forward(s, acts);
      const err = qv[this.bA[k]] - y;
      dOut.fill(0);
      dOut[this.bA[k]] = Math.max(-1, Math.min(1, err)) / B; // Huber 손실의 기울기
      this.q.backward(acts, dOut, g.gW, g.gb);
      this.lossSum += Math.abs(err) <= 1 ? 0.5 * err * err : Math.abs(err) - 0.5;
      this.lossN++;
    }
    this.opt.step([...g.gW, ...g.gb], 10);
  }
}
