// 오리 사격장 기준선: 가만히 계속 쏘기 vs 정답 정책(총알이 닿을 때 오리 위치를 계산해서 맞을 때만 쏘기)
// 실행: npx tsx scripts/ducks-oracle.ts [예제 또는 project.json] [판 수=10]
import { readFileSync } from 'node:fs';
import { createEnv } from '../src/engine/env';
import type { Project } from '../src/engine/types';
import { TEMPLATES, type TemplateKey } from '../src/templates';

const arg = process.argv[2] ?? 'ducks';
const proj: Project = arg.endsWith('.json') ? JSON.parse(readFileSync(arg, 'utf8')) : TEMPLATES[arg as TemplateKey];
const env = createEnv(proj);
const N = Number(process.argv[3] ?? 10);
const names = env.actionSpace.names;
const A = (n: string) => names.indexOf(n as never);

function willHit(): boolean {
  const w = env.getWorld();
  const gun = w.objects.find((o) => o.alive && o.tag === 'gun')!;
  for (const d of w.objects) {
    if (!d.alive || d.tag !== 'duck') continue;
    const t = (262 - d.y) / 16;
    const fx = (((d.x + d.vx * t) % 400) + 400) % 400;
    const dx = Math.min(Math.abs(fx - gun.x), 400 - Math.abs(fx - gun.x));
    if (dx < d.w / 2 + 1) return true;
  }
  return false;
}

const policies: Record<string, () => number> = {
  alwaysShoot: () => A('a'),
  oracleStay: () => (willHit() ? A('a') : A('none')),
};
for (const [name, pol] of Object.entries(policies)) {
  let sum = 0;
  for (let ep = 0; ep < N; ep++) {
    env.reset(ep);
    let r;
    do r = env.step(pol());
    while (!r.terminated && !r.truncated);
    sum += r.info.score;
  }
  console.log(`${name.padEnd(12)} 평균 ${(sum / N).toFixed(1)}`);
}
