// 시드 기반 난수 (mulberry32). 엔진·런타임의 모든 무작위성은 이것만 쓴다.

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) 실수 */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** a 이상 b 이하 정수. a > b 면 뒤바꾼다 */
  int(a: number, b: number): number {
    let lo = Math.ceil(Math.min(a, b));
    let hi = Math.floor(Math.max(a, b));
    if (hi < lo) hi = lo;
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
}
