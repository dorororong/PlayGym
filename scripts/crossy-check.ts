// 끝없는 길 건너기 점검: 간단한 정책들의 점수와 객체 수 (학습 전 기준선)
// 실행: npx tsx scripts/crossy-check.ts [판 수=20]
import { createEnv } from '../src/engine/env';
import { TEMPLATES } from '../src/templates';

const env = createEnv(TEMPLATES.crossy);
const names = env.actionSpace.names;
const A = (n: string) => names.indexOf(n as never);
const n = Number(process.argv[2] ?? 20);

const policies: Record<string, (rng: () => number) => number> = {
  random: (r) => Math.floor(r() * names.length),
  alwaysUp: () => A('up'),
  upOrWait: (r) => (r() < 0.6 ? A('up') : A('none')),
};

for (const [name, pol] of Object.entries(policies)) {
  let sum = 0;
  let maxObj = 0;
  let frames = 0;
  for (let ep = 0; ep < n; ep++) {
    let s = ep * 7919 + 1;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    env.reset(ep);
    let r;
    do {
      r = env.step(pol(rng));
      maxObj = Math.max(maxObj, env.getWorld().objects.filter((o) => o.alive).length);
    } while (!r.terminated && !r.truncated);
    sum += r.info.score;
    frames += r.info.frame;
  }
  console.log(`${name.padEnd(9)} 평균 점수 ${(sum / n).toFixed(1)}  평균 프레임 ${(frames / n).toFixed(0)}  최대 객체 ${maxObj}`);
}
