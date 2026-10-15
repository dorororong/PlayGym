// 닭 길 건너기의 "정답에 가까운" 정책: 차의 미래 위치를 계산해 위 칸이 안전할 때만 올라간다.
// 학습된 AI 가 얼마나 잘했는지 비교할 상한으로 쓴다 (학습과는 상관없이 월드 상태를 직접 본다).
// 실행: npx tsx scripts/freeway-oracle.ts <예제 이름 또는 project.json> [안전 확인 프레임 수=6]

import { readFileSync } from 'node:fs';
import { createEnv } from '../src/engine/env';
import type { Project } from '../src/engine/types';
import { loadTemplate } from './templates';

const name = process.argv[2] ?? 'freeway';
const margin = Number(process.argv[3] ?? 6);
const project = (loadTemplate(name) ?? JSON.parse(readFileSync(name, 'utf8'))) as Project;
const env = createEnv(project);
const W = 400;

/** 차(가로 30)가 t 프레임 뒤 [x0, x1] 과 겹치는지 (화면 이어지기 고려) */
const hits = (cx: number, vx: number, t: number, x0: number, x1: number) => {
  const x = (((cx + vx * t) % W) + W) % W;
  return [-W, 0, W].some((dx) => x + dx + 15 > x0 && x + dx - 15 < x1);
};
const cars = () => env.getWorld().objects.filter((o) => o.tag !== 'player');
const me = () => env.getWorld().objects.find((o) => o.tag === 'player')!;

/** 앞으로 k 프레임 동안 계속 위로 가도 안 치이는지 */
function upIsSafe(): boolean {
  const p = me();
  for (let k = 1; k <= margin; k++) {
    const y = p.y - 3 * k;
    for (const c of cars()) if (Math.abs(c.y - y) < 17 && hits(c.x, c.vx, k, p.x - 9, p.x + 9)) return false;
  }
  return true;
}
/** 가만히 있어도 곧 치이는지 */
function stayIsHit(): boolean {
  const p = me();
  for (const c of cars()) for (let k = 1; k <= 4; k++) if (Math.abs(c.y - p.y) < 17 && hits(c.x, c.vx, k, p.x - 9, p.x + 9)) return true;
  return false;
}

const names = env.actionSpace.names;
const scores: number[] = [];
for (const seed of [1, 2, 3, 4, 5]) {
  env.reset(seed);
  let r;
  do {
    const a = upIsSafe() ? 'up' : stayIsHit() ? 'down' : 'none';
    r = env.step(names.indexOf(a));
  } while (!r.terminated && !r.truncated);
  scores.push(r.info.score);
}
console.log(`${name} 정답 정책 (확인 ${margin}프레임): ${scores.join(', ')} → 평균 ${(scores.reduce((a, b) => a + b) / scores.length).toFixed(1)}`);
