// PPO (Proximal Policy Optimization). 정책망·가치망 분리, GAE, 보상 정규화, 여러 환경 동시 수집.
// 결정론: 같은 시드·같은 프로젝트면 학습 결과가 같다 (엔진 RNG 만 사용).

import type { Env } from '../engine/env';
import { Rng } from '../engine/rng';
import { Agent, sample } from './agent';
import { EpisodeTracker, RunningVar, stepSkip, type UpdateStats } from './common';
import type { LearnConfig } from './config';
import { Adam, MLP, softmax } from './nn';
import type { Trainer } from './trainer';

export class PpoTrainer implements Trainer {
  readonly pi: MLP;
  readonly vf: MLP;
  private optPi: Adam;
  private optVf: Adam;
  private rng: Rng;
  private envs: Env[];
  private obs: number[][];
  private discRet: number[];
  private retVar = new RunningVar();
  private eps: EpisodeTracker;
  steps = 0;

  constructor(
    makeEnv: () => Env,
    readonly cfg: LearnConfig,
    init?: Agent,
  ) {
    const p = cfg.ppo;
    this.rng = new Rng((cfg.seed ?? 0) * 9973 + 17);
    this.envs = Array.from({ length: p.nEnvs }, makeEnv);
    const e0 = this.envs[0];
    const nObs = e0.observationSpace.shape[0];
    const nAct = e0.actionSpace.n;
    const { hidden, activation } = cfg.network;
    this.pi = init?.net ? MLP.fromJSON(init.net.toJSON()) : new MLP([nObs, ...hidden, nAct], this.rng, 0.01, activation);
    // 예전 AI 에는 가치망이 없을 수 있다 → 새로 시작 (정책은 이어서)
    this.vf = init?.value ? MLP.fromJSON(init.value.toJSON()) : new MLP([nObs, ...hidden, 1], this.rng, 1, activation);
    this.steps = init?.steps ?? 0;
    this.optPi = new Adam(this.pi.params, cfg.lr);
    this.optVf = new Adam(this.vf.params, cfg.lr);
    this.obs = this.envs.map((env) => env.reset(this.nextSeed()).obs);
    this.discRet = this.envs.map(() => 0);
    this.eps = new EpisodeTracker(p.nEnvs);
  }

  private nextSeed(): number {
    return Math.floor(this.rng.next() * 2 ** 31);
  }

  agent(): Agent {
    const e = this.envs[0];
    return new Agent('ppo', e.observationSpace.labels, e.actionSpace.names, this.steps, this.cfg.frameSkip, MLP.fromJSON(this.pi.toJSON()), undefined, MLP.fromJSON(this.vf.toJSON()));
  }

  /** 수집 한 번 + 학습 한 번 */
  update(): UpdateStats {
    const c = this.cfg;
    const p = c.ppo;
    const nE = p.nEnvs;
    const N = p.nSteps * nE;
    const obsBuf: number[][] = new Array(N);
    const act = new Int32Array(N);
    const logp = new Float64Array(N);
    const val = new Float64Array(N);
    const rew = new Float64Array(N);
    const done = new Uint8Array(N);

    // ── 1. 수집 ──
    for (let t = 0; t < p.nSteps; t++) {
      for (let e = 0; e < nE; e++) {
        const k = t * nE + e;
        const o = this.obs[e];
        const pr = softmax(this.pi.forward(o));
        const a = sample(pr, this.rng);
        obsBuf[k] = o;
        act[k] = a;
        logp[k] = Math.log(pr[a] + 1e-12);
        val[k] = this.vf.forward(o)[0];

        const r = stepSkip(this.envs[e], a, c.frameSkip);
        this.steps += r.frames;
        this.discRet[e] = this.discRet[e] * c.gamma + r.reward;
        this.retVar.update(this.discRet[e]);
        let rn = Math.max(-10, Math.min(10, r.reward / Math.sqrt(this.retVar.var + 1e-8)));
        // 시간 초과로 끊긴 경우는 실패가 아니므로 남은 가치를 이어 붙인다
        if (r.truncated && !r.terminated) rn += c.gamma * this.vf.forward(r.obs)[0];
        rew[k] = rn;
        const d = this.eps.add(e, r);
        done[k] = d ? 1 : 0;
        if (d) {
          this.discRet[e] = 0;
          this.obs[e] = this.envs[e].reset(this.nextSeed()).obs;
        } else {
          this.obs[e] = r.obs;
        }
      }
    }

    // ── 2. GAE ──
    const adv = new Float64Array(N);
    const ret = new Float64Array(N);
    for (let e = 0; e < nE; e++) {
      let gae = 0;
      let nextV = this.vf.forward(this.obs[e])[0];
      for (let t = p.nSteps - 1; t >= 0; t--) {
        const k = t * nE + e;
        const nonTerm = 1 - done[k];
        const delta = rew[k] + c.gamma * nextV * nonTerm - val[k];
        gae = delta + c.gamma * p.lambda * nonTerm * gae;
        adv[k] = gae;
        ret[k] = gae + val[k];
        nextV = val[k];
      }
    }
    normalize(adv);

    // ── 3. 학습 ──
    const idx = Int32Array.from({ length: N }, (_, i) => i);
    let entSum = 0;
    let klSum = 0;
    let clipCount = 0;
    let count = 0;
    const nAct = this.envs[0].actionSpace.n;
    for (let ep = 0; ep < p.epochs; ep++) {
      shuffle(idx, this.rng);
      for (let start = 0; start < N; start += p.minibatch) {
        const end = Math.min(N, start + p.minibatch);
        const B = end - start;
        const gp = this.pi.zeroGrads();
        const gv = this.vf.zeroGrads();
        const actsP: Float64Array[] = [];
        const actsV: Float64Array[] = [];
        const dLogits = new Float64Array(nAct);
        const dV = new Float64Array(1);
        for (let q = start; q < end; q++) {
          const k = idx[q];
          const pr = softmax(this.pi.forward(obsBuf[k], actsP));
          const a = act[k];
          const lp = Math.log(pr[a] + 1e-12);
          const ratio = Math.exp(lp - logp[k]);
          const A = adv[k];
          let H = 0;
          for (let j = 0; j < nAct; j++) H -= pr[j] * Math.log(pr[j] + 1e-12);
          const clipped = (A >= 0 && ratio > 1 + p.clip) || (A < 0 && ratio < 1 - p.clip);
          for (let j = 0; j < nAct; j++) {
            const pg = clipped ? 0 : -A * ratio * ((j === a ? 1 : 0) - pr[j]);
            const ent = p.entCoef * pr[j] * (Math.log(pr[j] + 1e-12) + H);
            dLogits[j] = (pg + ent) / B;
          }
          this.pi.backward(actsP, dLogits, gp.gW, gp.gb);
          const v = this.vf.forward(obsBuf[k], actsV)[0];
          dV[0] = (v - ret[k]) / B;
          this.vf.backward(actsV, dV, gv.gW, gv.gb);
          entSum += H;
          klSum += logp[k] - lp;
          if (Math.abs(ratio - 1) > p.clip) clipCount++;
          count++;
        }
        this.optPi.step([...gp.gW, ...gp.gb], 0.5);
        this.optVf.step([...gv.gW, ...gv.gb], 0.5);
      }
    }
    return this.eps.stats(this.steps, { entropy: entSum / count, approxKl: klSum / count, clipFrac: clipCount / count });
  }
}

export function normalize(x: Float64Array): void {
  const n = x.length;
  let m = 0;
  for (let i = 0; i < n; i++) m += x[i];
  m /= n;
  let s = 0;
  for (let i = 0; i < n; i++) s += (x[i] - m) ** 2;
  const sd = Math.sqrt(s / n) + 1e-8;
  for (let i = 0; i < n; i++) x[i] = (x[i] - m) / sd;
}

export function shuffle(idx: Int32Array, rng: Rng): void {
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
}
