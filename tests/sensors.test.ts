import { describe, expect, it } from 'vitest';
import { castRay } from '../src/engine/sensors';
import { jsTemplates } from '../src/templates/js';
import { createEnv } from '../src/engine/env';
import { envFromCode, obj, rollout } from './helpers';

const lidarEnv = (objects: string, lidar: string) =>
  envFromCode(`api.sensors([api.sensor.lidar(${lidar})]); api.onStart(() => { ${objects} });`);

describe('라이다 레이캐스트', () => {
  it('정면 사각형까지 거리 (가장 가까운 면)', () => {
    const env = lidarEnv(
      `api.create({tag:'p', x:100, y:150, w:10, h:10}); api.create({tag:'o', x:200, y:150, w:20, h:40});`,
      `'p', 1, 0, 0, 200, 'o', false`,
    );
    // 원점 x=100 → 사각형 왼쪽 면 x=190 : 90/200
    expect(env.reset(0).obs).toEqual([0.45]);
  });
  it('맞지 않는 광선은 1', () => {
    const env = lidarEnv(
      `api.create({tag:'p', x:100, y:150}); api.create({tag:'o', x:200, y:150});`,
      `'p', 3, 90, 270, 200, 'o', false`,
    );
    const obs = env.reset(0).obs;
    expect(obs).toHaveLength(3);
    expect(obs.every((v) => v === 1)).toBe(true);
  });
  it('최대 거리 밖이면 1', () => {
    const env = lidarEnv(`api.create({tag:'p', x:0, y:150}); api.create({tag:'o', x:390, y:150});`, `'p', 1, 0, 0, 100, 'o', false`);
    expect(env.reset(0).obs).toEqual([1]);
  });
  it('주체 자신은 제외 (같은 태그를 탐지해도)', () => {
    const env = lidarEnv(
      `api.create({tag:'p', x:100, y:150, w:10, h:10}); api.create({tag:'p', x:150, y:150, w:10, h:10});`,
      `'p', 1, 0, 0, 100, 'p', false`,
    );
    expect(env.reset(0).obs).toEqual([0.45]);
  });
  it('각도 방향: 90° = 화면 위쪽, 0° = 오른쪽, 180° = 왼쪽, 270° = 아래', () => {
    const env = lidarEnv(
      `api.create({tag:'p', x:200, y:150, w:2, h:2});
       api.create({tag:'o', x:200, y:100, w:10, h:10});  // 위: 거리 45
       api.create({tag:'o', x:300, y:150, w:10, h:10}); /* 오른쪽: 95 */
       api.create({tag:'o', x:130, y:150, w:10, h:10}); /* 왼쪽: 65 */
       api.create({tag:'o', x:200, y:180, w:10, h:10}); /* 아래: 25 */`,
      `'p', 4, 0, 270, 100, 'o', false`,
    );
    const obs = env.reset(0).obs.map((v) => +v.toFixed(6));
    expect(obs).toEqual([0.95, 0.45, 0.65, 0.25]);
  });
  it('화면 경계 감지', () => {
    const on = lidarEnv(`api.create({tag:'p', x:50, y:150});`, `'p', 2, 180, 90, 300, 'o', true`);
    expect(on.reset(0).obs.map((v) => +v.toFixed(6))).toEqual([+(50 / 300).toFixed(6), 0.5]);
    const off = lidarEnv(`api.create({tag:'p', x:50, y:150});`, `'p', 2, 180, 90, 300, 'o', false`);
    expect(off.reset(0).obs).toEqual([1, 1]);
  });
  it('원점이 상자 안이면 0', () => {
    expect(castRay(0, 0, 1, 0, 100, [obj({ x: 0, y: 0, w: 10, h: 10 })], false)).toBe(0);
  });
  it('N 개 광선은 시작~끝 각도를 양 끝 포함해 균등 배치', () => {
    const env = envFromCode(`api.sensors([api.sensor.lidar('p', 3, 0, 180, 100, 'o', false)]); api.onStart(() => { api.create({tag:'p', x:200, y:150}); });`);
    env.reset(0);
    const rays = env.getDebugShapes().filter((s) => s.type === 'ray');
    expect(rays.map((r) => [Math.round(r.x1 - r.x0), Math.round(r.y1 - r.y0)])).toEqual([[100, 0], [0, -100], [-100, 0]]);
  });
});

describe('센서 7종', () => {
  it('위치/속도/가장 가까운 대상/거리/땅 위/변수', () => {
    const env = envFromCode(`
      api.sensors([
        api.sensor.position('p'), api.sensor.velocity('p'),
        api.sensor.nearest('p', 'o', 'right'), api.sensor.nearest('p', 'o', 'left'),
        api.sensor.distance('p', 'o'), api.sensor.onGround('p'), api.sensor.variable('hp', 0, 10),
      ]);
      api.onStart(() => {
        api.create({tag:'p', x:100, y:150, vx:10, vy:-40});
        api.create({tag:'o', x:400, y:0}); api.create({tag:'o', x:130, y:190});
        api.vars.hp = 5;
      });`);
    const r = env.reset(0);
    expect(env.observationSpace.labels).toEqual([
      'p.x', 'p.y', 'p.vx', 'p.vy', 'p→o.dx', 'p→o.dy', 'p→o.dx', 'p→o.dy', 'p↔o.d', 'p.onGround', 'var.hp',
    ]);
    expect(r.obs).toEqual([0.25, 0.5, 0.5, -1, 30 / 400, 40 / 300, 1, 1, 50 / 500, 0, 0.5]);
  });
  it('주체가 없으면 기본값 (거리류는 1)', () => {
    const env = envFromCode(`api.sensors([api.sensor.position('p'), api.sensor.nearest('p','o'), api.sensor.lidar('p', 2, 0, 90, 100, 'o')]);`);
    expect(env.reset(0).obs).toEqual([0, 0, 1, 1, 1, 1]);
  });
  it('벡터 길이는 reset 시점에 확정', () => {
    const env = envFromCode(`api.sensors([api.sensor.lidar('p', 16, 0, 360, 100, 'o', true)]);`);
    expect(env.observationSpace.shape).toEqual([16]);
    expect(env.reset(1).obs).toHaveLength(16);
  });
});

describe('정규화 범위', () => {
  for (const [name, project] of Object.entries(jsTemplates)) {
    it(`${name}: 모든 원소가 low ≤ v ≤ high`, () => {
      const env = createEnv(project);
      const { low, high, shape } = env.observationSpace;
      for (const obs of rollout(env, 3, 2000)) {
        expect(obs).toHaveLength(shape[0]);
        obs.forEach((v, i) => {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(low[i]);
          expect(v).toBeLessThanOrEqual(high[i]);
        });
      }
    });
  }
  it('범위 밖 값은 잘라낸다', () => {
    const env = envFromCode(`api.sensors([api.sensor.velocity('p'), api.sensor.variable('v', 0, 10)]);
      api.onStart(() => { api.create({tag:'p', vx: 999, vy: -999}); api.vars.v = 50; });`);
    expect(env.reset(0).obs).toEqual([1, -1, 1]);
  });
});
