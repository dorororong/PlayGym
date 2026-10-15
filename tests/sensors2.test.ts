import { describe, expect, it } from 'vitest';
import { projectFromBlocksJson } from '../src/blocks/headless';
import { createEnv } from '../src/engine/env';
import { TemplateBuilder } from '../src/templates/builder';
import { envFromCode, find } from './helpers';

describe('화면 반대편으로 이어지기 (seamless)', () => {
  it('중심이 화면 밖으로 나가면 반대쪽으로 옮겨진다 (속도는 그대로)', () => {
    const env = envFromCode(`api.onStart(() => {
      api.create({tag:'a', x:398, y:150, vx:5}); api.create({tag:'a', x:100, y:2, vy:-5}); api.setBehavior('a','wrap');
    });`);
    env.reset(0);
    env.step(0);
    const [a, b] = find(env, 'a');
    expect([a.x, a.vx]).toEqual([3, 5]);
    expect([b.y, b.vy]).toEqual([297, -5]);
  });

  it("'좌우만 이어지기'는 위아래로는 이어지지 않는다 (끝없는 길 건너기의 차)", () => {
    const env = envFromCode(`api.onStart(() => {
      api.create({tag:'a', x:398, y:150, vx:5}); api.create({tag:'a', x:100, y:298, vy:5}); api.setBehavior('a','wrap','x');
    });`);
    env.reset(0);
    env.step(0);
    const [a, b] = find(env, 'a');
    expect(a.x).toBe(3);
    expect(b.y).toBe(303);
  });
});

describe('가장 먼저 만든 객체', () => {
  it('가장 오래된 것 하나만 지운다 (뱀 꼬리)', () => {
    const env = envFromCode(`
      api.onStart(() => { for (let i = 0; i < 3; i++) api.create({tag:'body', x: 10 + i * 20, y: 50}); });
      api.onTick(() => { if (api.count('body') === 3) api.destroy(api.first('body')); });`);
    env.reset(0);
    env.step(0);
    expect(find(env, 'body').map((o) => o.x)).toEqual([30, 50]);
  });

  it('없으면 아무것도 하지 않는다', () => {
    const env = envFromCode(`api.onTick(() => { api.destroy(api.first('none')); api.move(api.first('none'), 'x', 5); });`);
    env.reset(0);
    expect(env.step(0).info.events.filter((e) => e.type === 'error')).toEqual([]);
  });
});

describe('추가 센서', () => {
  const code = `
    api.sensors([
      api.sensor.nearestK('p', 'o', 2, 'all'),
      api.sensor.count('o', 4),
      api.sensor.grid('p', 'o', 2, 2, 20),
      api.sensor.score(0, 10),
      api.sensor.prop('p', 'w', 0, 40),
    ]);
    api.onStart(() => {
      api.create({tag:'p', x:200, y:150, w:10, h:10});
      api.create({tag:'o', x:240, y:150, w:4, h:4});   /* 40 px */
      api.create({tag:'o', x:190, y:140, w:4, h:4});   /* 14 px, 격자 왼쪽 위 칸 */
      api.create({tag:'o', x:200, y:290, w:4, h:4});   /* 140 px */
      api.setScore(5);
    });`;
  it('이름표와 값', () => {
    const env = envFromCode(code);
    const r = env.reset(0);
    expect(env.observationSpace.labels).toEqual([
      'p→o#1.dx', 'p→o#1.dy', 'p→o#2.dx', 'p→o#2.dy', 'count(o)', 'grid0[0,0]', 'grid0[0,1]', 'grid0[1,0]', 'grid0[1,1]', 'score', 'p.w',
    ]);
    expect(r.obs).toEqual([-10 / 400, -10 / 300, 40 / 400, 0, 0.75, 1, 0, 0, 0, 0.5, 0.25]);
    expect(env.observationSpace.low.slice(0, 4)).toEqual([-1, -1, -1, -1]);
  });
  it('가까운 대상이 K 개보다 적으면 (1, 1) 로 채운다', () => {
    const env = envFromCode(`api.sensors([api.sensor.nearestK('p','o',3)]); api.onStart(() => { api.create({tag:'p'}); api.create({tag:'o', x:210, y:150}); });`);
    expect(env.reset(0).obs.slice(2)).toEqual([1, 1, 1, 1]);
  });
  it('화면 전체 격자 (칸 크기 0)', () => {
    const env = envFromCode(`api.sensors([api.sensor.grid('p','o',3,4,0)]); api.onStart(() => { api.create({tag:'o', x:350, y:250, w:10, h:10}); });`);
    const obs = env.reset(0).obs;
    expect(obs).toHaveLength(12);
    expect(obs.indexOf(1)).toBe(2 * 4 + 3);
    expect(obs.filter((v) => v === 1)).toHaveLength(1);
  });
  it('새 센서 블록이 같은 코드를 만든다', () => {
    const t = new TemplateBuilder('s2');
    t.observe([t.sNearestK(2, 'player', 'obstacle', 'all'), t.sCount('obstacle', 4), t.sGrid('player', 2, 2, 20, 'obstacle'), t.sScore(0, 10), t.sProp('player', 'w', 0, 40)]);
    const p = projectFromBlocksJson(t.build());
    expect(p.generatedCode).toContain("api.sensor.nearestK('player', 'obstacle', 2, 'all')");
    expect(p.generatedCode).toContain("api.sensor.grid('player', 'obstacle', 2, 2, 20)");
    expect(createEnv(p).observationSpace.shape).toEqual([4 + 1 + 4 + 1 + 1]);
  });
});
