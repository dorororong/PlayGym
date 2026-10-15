// REINFORCE: 가장 기본적인 정책 경사. 한 판을 끝까지 해 보고, 받은 보상만큼 그 판의 행동 확률을 올리거나 내린다.
// 여러 판의 할인 보상 합(G)을 평균 0·분산 1로 맞춰 기준선으로 쓴다. 가치망이 없어 원리가 가장 단순하다.

import type { Env } from '../engine/env';
import { Rng } from '../engine/rng';
import { Agent, sample } from './agent';
import { EpisodeTracker, stepSkip, type UpdateStats } from './common';
import type { LearnConfig } from './config';
import { Adam, MLP, softmax } from './nn';
import { normalize } from './ppo';
import type { Trainer } from './trainer';

export class ReinforceTrainer implements Trainer {
  readonly pi: MLP;
  private opt: Adam;
  private rng: Rng;
  private env: Env;
  private eps = new EpisodeTracker(1);
  steps = 0;

  constructor(
    makeEnv: () => Env,
    readonly cfg: LearnConfig,
    init?: Agent,
  ) {
    this.rng = new Rng((cfg.seed ?? 0) * 6113 + 11);
    this.env = makeEnv();
    const { hidden, activation } = cfg.network;
    this.pi = init?.net ? MLP.fromJSON(init.net.toJSON()) : new MLP([this.env.observationSpace.shape[0], ...hidden, this.env.actionSpace.n], this.rng, 0.01, activation);
    this.steps = init?.steps ?? 0;
    this.opt = new Adam(this.pi.params, cfg.lr);
  }

  agent(): Agent {
    const e = this.env;
    return new Agent('reinforce', e.observationSpace.labels, e.actionSpace.names, this.steps, this.cfg.frameSkip, MLP.fromJSON(this.pi.toJSON()));
  }

  update(): UpdateStats {
    const c = this.cfg;
    const nAct = this.env.actionSpace.n;
    const obs: number[][] = [];
    const act: number[] = [];
    const G: number[] = [];
    for (let ep = 0; ep < c.reinforce.episodes; ep++) {
      let { obs: o } = this.env.reset(Math.floor(this.rng.next() * 2 ** 31));
      const rews: number[] = [];
      for (;;) {
        const a = sample(softmax(this.pi.forward(o)), this.rng);
        obs.push(o);
        act.push(a);
        const r = stepSkip(this.env, a, c.frameSkip);
        this.steps += r.frames;
        rews.push(r.reward);
        o = r.obs;
        if (this.eps.add(0, r)) break;
      }
      // 뒤에서부터 할인 보상 합
      const g = new Array<number>(rews.length);
      let run = 0;
      for (let t = rews.length - 1; t >= 0; t--) g[t] = run = rews[t] + c.gamma * run;
      G.push(...g);
    }
    const adv = Float64Array.from(G);
    normalize(adv);
    const grads = this.pi.zeroGrads();
    const acts: Float64Array[] = [];
    const dLogits = new Float64Array(nAct);
    const N = obs.length;
    let entSum = 0;
    for (let i = 0; i < N; i++) {
      const p = softmax(this.pi.forward(obs[i], acts));
      let H = 0;
      for (let j = 0; j < nAct; j++) H -= p[j] * Math.log(p[j] + 1e-12);
      for (let j = 0; j < nAct; j++) {
        const pg = -adv[i] * ((j === act[i] ? 1 : 0) - p[j]);
        dLogits[j] = (pg + c.reinforce.entCoef * p[j] * (Math.log(p[j] + 1e-12) + H)) / N;
      }
      this.pi.backward(acts, dLogits, grads.gW, grads.gb);
      entSum += H;
    }
    this.opt.step([...grads.gW, ...grads.gb], 1);
    return this.eps.stats(this.steps, { entropy: entSum / N, decisions: N });
  }
}
