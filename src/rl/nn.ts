// 작은 다층 퍼셉트론(MLP)과 Adam. 외부 라이브러리 없이 브라우저·Node 양쪽에서 돈다.
// 관찰이 수십 차원, 행동이 몇 개뿐이라 64×64 정도의 망이면 충분하고, 순수 JS 로도 빠르다.

import { Rng } from '../engine/rng';
import type { Activation } from './config';

export interface MlpJson {
  sizes: number[];
  act?: Activation;
  W: number[][];
  b: number[][];
}

const ACT: Record<Activation, { f: (x: number) => number; /** 출력값 h 로 표현한 미분 */ df: (h: number) => number }> = {
  tanh: { f: Math.tanh, df: (h) => 1 - h * h },
  relu: { f: (x) => (x > 0 ? x : 0), df: (h) => (h > 0 ? 1 : 0) },
  sigmoid: { f: (x) => 1 / (1 + Math.exp(-x)), df: (h) => h * (1 - h) },
};

/** 은닉층은 활성함수(tanh·relu·sigmoid), 출력층은 선형. W[l] 은 (out × in) 행 우선 */
export class MLP {
  readonly W: Float64Array[] = [];
  readonly b: Float64Array[] = [];
  private f: (x: number) => number;
  private df: (h: number) => number;

  constructor(
    readonly sizes: number[],
    rng?: Rng,
    outScale = 1,
    readonly act: Activation = 'tanh',
  ) {
    this.f = ACT[act].f;
    this.df = ACT[act].df;
    const r = rng ?? new Rng(1);
    for (let l = 0; l + 1 < sizes.length; l++) {
      const nIn = sizes[l];
      const nOut = sizes[l + 1];
      const last = l + 2 === sizes.length;
      // 균등 분포 초기화 (tanh·sigmoid 는 Xavier, relu 는 He). 출력층은 outScale 배 (정책이 처음엔 거의 균등하도록)
      const base = act === 'relu' && !last ? Math.sqrt(6 / nIn) : Math.sqrt(6 / (nIn + nOut));
      const lim = base * (last ? outScale : 1);
      const w = new Float64Array(nIn * nOut);
      for (let i = 0; i < w.length; i++) w[i] = (r.next() * 2 - 1) * lim;
      this.W.push(w);
      this.b.push(new Float64Array(nOut));
    }
  }

  get params(): Float64Array[] {
    return [...this.W, ...this.b];
  }

  /** 순전파. acts 를 주면 층별 활성값을 저장한다 (역전파용) */
  forward(x: ArrayLike<number>, acts?: Float64Array[]): Float64Array {
    let h = Float64Array.from(x);
    if (acts) acts[0] = h;
    const L = this.W.length;
    for (let l = 0; l < L; l++) {
      const nIn = this.sizes[l];
      const nOut = this.sizes[l + 1];
      const w = this.W[l];
      const out = new Float64Array(nOut);
      for (let o = 0; o < nOut; o++) {
        let s = this.b[l][o];
        const row = o * nIn;
        for (let i = 0; i < nIn; i++) s += w[row + i] * h[i];
        out[o] = l + 1 < L ? this.f(s) : s;
      }
      h = out;
      if (acts) acts[l + 1] = h;
    }
    return h;
  }

  /** 역전파: 출력 기울기 dOut 를 받아 gW, gb 에 더한다 */
  backward(acts: Float64Array[], dOut: Float64Array, gW: Float64Array[], gb: Float64Array[]): void {
    let d = dOut;
    for (let l = this.W.length - 1; l >= 0; l--) {
      const nIn = this.sizes[l];
      const nOut = this.sizes[l + 1];
      const hIn = acts[l];
      const w = this.W[l];
      const gw = gW[l];
      const g = gb[l];
      const dIn = l > 0 ? new Float64Array(nIn) : null;
      for (let o = 0; o < nOut; o++) {
        const dv = d[o];
        if (dv === 0) continue;
        g[o] += dv;
        const row = o * nIn;
        for (let i = 0; i < nIn; i++) {
          gw[row + i] += dv * hIn[i];
          if (dIn) dIn[i] += dv * w[row + i];
        }
      }
      if (!dIn) break;
      for (let i = 0; i < nIn; i++) dIn[i] *= this.df(hIn[i]);
      d = dIn;
    }
  }

  zeroGrads(): { gW: Float64Array[]; gb: Float64Array[] } {
    return { gW: this.W.map((w) => new Float64Array(w.length)), gb: this.b.map((b) => new Float64Array(b.length)) };
  }

  toJSON(): MlpJson {
    return { sizes: [...this.sizes], act: this.act, W: this.W.map((w) => Array.from(w)), b: this.b.map((b) => Array.from(b)) };
  }

  /** 같은 모양의 다른 망에 가중치를 복사 (DQN 목표망) */
  copyFrom(o: MLP): void {
    this.W.forEach((w, l) => w.set(o.W[l]));
    this.b.forEach((b, l) => b.set(o.b[l]));
  }

  static fromJSON(j: MlpJson): MLP {
    const m = new MLP(j.sizes, undefined, 1, j.act ?? 'tanh');
    j.W.forEach((w, l) => m.W[l].set(w));
    j.b.forEach((b, l) => m.b[l].set(b));
    return m;
  }
}

export class Adam {
  private m: Float64Array[];
  private v: Float64Array[];
  private t = 0;

  constructor(
    private params: Float64Array[],
    public lr = 3e-4,
    private b1 = 0.9,
    private b2 = 0.999,
    private eps = 1e-8,
  ) {
    this.m = params.map((p) => new Float64Array(p.length));
    this.v = params.map((p) => new Float64Array(p.length));
  }

  /** grads 는 params 와 같은 순서·모양. maxNorm 을 넘으면 전체 기울기를 줄인다 */
  step(grads: Float64Array[], maxNorm = Infinity): number {
    let sq = 0;
    for (const g of grads) for (let i = 0; i < g.length; i++) sq += g[i] * g[i];
    const norm = Math.sqrt(sq);
    const scale = norm > maxNorm ? maxNorm / norm : 1;
    this.t++;
    const c1 = 1 - this.b1 ** this.t;
    const c2 = 1 - this.b2 ** this.t;
    this.params.forEach((p, k) => {
      const g = grads[k];
      const m = this.m[k];
      const v = this.v[k];
      for (let i = 0; i < p.length; i++) {
        const gi = g[i] * scale;
        m[i] = this.b1 * m[i] + (1 - this.b1) * gi;
        v[i] = this.b2 * v[i] + (1 - this.b2) * gi * gi;
        p[i] -= (this.lr * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + this.eps);
      }
    });
    return norm;
  }
}

export function softmax(logits: ArrayLike<number>): Float64Array {
  let mx = -Infinity;
  for (let i = 0; i < logits.length; i++) mx = Math.max(mx, logits[i]);
  const p = new Float64Array(logits.length);
  let s = 0;
  for (let i = 0; i < logits.length; i++) s += p[i] = Math.exp(logits[i] - mx);
  for (let i = 0; i < p.length; i++) p[i] /= s;
  return p;
}
