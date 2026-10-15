// 무작위 AI 기준선: 예제를 무작위 행동으로 N 판 돌려 평균 점수·길이·최대 객체 수
// 실행: npx tsx scripts/random-baseline.ts <예제> [판 수=20]
import { createEnv } from '../src/engine/env';
import { TEMPLATES, type TemplateKey } from '../src/templates';

const name = (process.argv[2] ?? 'dino') as TemplateKey;
const n = Number(process.argv[3] ?? 20);
const env = createEnv(TEMPLATES[name]);
let sum = 0, frames = 0, maxObj = 0;
for (let ep = 0; ep < n; ep++) {
  let s = ep * 7919 + 1;
  const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  env.reset(ep);
  let r;
  do {
    r = env.step(Math.floor(rng() * env.actionSpace.n));
    maxObj = Math.max(maxObj, env.getWorld().objects.filter((o) => o.alive).length);
  } while (!r.terminated && !r.truncated);
  sum += r.info.score;
  frames += r.info.frame;
}
console.log(`${name}: 무작위 평균 점수 ${(sum / n).toFixed(1)}, 평균 ${(frames / n).toFixed(0)}프레임, 최대 객체 ${maxObj}, 관찰 ${env.observationSpace.shape[0]}개, 행동 ${env.actionSpace.names.join(',')}`);
