// headless 성능 측정: 객체 50개 + 라이다 16광선 기준 초당 step 수 (목표 5,000 이상).
// 실행: npm run bench

import { createEnv, type Env } from '../src/engine/env';
import { Rng } from '../src/engine/rng';
import type { Project } from '../src/engine/types';
import { jsTemplates } from '../src/templates/js';

const benchProject: Project = {
  version: 1,
  blocksJson: {},
  settings: { actions: ['none', 'left', 'right', 'up', 'down'], maxSteps: 1_000_000, background: '#000', backdrop: 'none' },
  generatedCode: `
api.sensors([
  api.sensor.position('player'),
  api.sensor.velocity('player'),
  api.sensor.nearest('player', 'ball', 'all'),
  api.sensor.lidar('player', 16, 0, 337.5, 300, 'ball', true),
]);
api.onStart(() => {
  api.create({ tag: 'player', x: 200, y: 150, w: 20, h: 20 });
  api.setBehavior('player', 'stayInScreen');
  api.setBehavior('ball', 'bounceWalls', 'all');
  for (let i = 0; i < 49; i++) {
    api.create({ tag: 'ball', x: api.randInt(10, 390), y: api.randInt(10, 290), w: 10, h: 10,
                 vx: api.randInt(-3, 3), vy: api.randInt(-3, 3) });
  }
});
api.onAction('left', () => api.move('player', 'x', -4));
api.onAction('right', () => api.move('player', 'x', 4));
api.onAction('up', () => api.move('player', 'y', -4));
api.onAction('down', () => api.move('player', 'y', 4));
api.onCollide('ball', 'ball', (self, other) => api.bounce(self, other));
api.onCollide('player', 'ball', () => api.addScore(-1));
`,
};

function bench(name: string, env: Env, steps: number): number {
  const rng = new Rng(1);
  env.reset(0);
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) {
    const r = env.step(rng.int(0, env.actionSpace.n - 1));
    if (r.terminated || r.truncated) env.reset(i);
  }
  const sps = steps / ((performance.now() - t0) / 1000);
  console.log(`${name.padEnd(28)} ${Math.round(sps).toLocaleString().padStart(10)} step/s  (객체 ${env.getWorld().objects.length}개, 관찰 ${env.observationSpace.shape[0]})`);
  return sps;
}

const main = bench('객체 50 + 라이다 16 (목표)', createEnv(benchProject), 50_000);
for (const [name, p] of Object.entries(jsTemplates)) bench(name, createEnv(p), 50_000);
console.log(main >= 5000 ? '✔ 목표 5,000 step/s 달성' : '✘ 목표 미달');
process.exitCode = main >= 5000 ? 0 : 1;
