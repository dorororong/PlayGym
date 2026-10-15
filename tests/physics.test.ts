import { describe, expect, it } from 'vitest';
import { bounce, overlapXY, overlaps, pushOut } from '../src/engine/physics';
import { envFromCode, find, obj } from './helpers';

describe('AABB 겹침', () => {
  it('겹침 길이가 둘 다 0보다 커야 겹친 것', () => {
    const a = obj({ x: 0, y: 0, w: 10, h: 10 });
    expect(overlaps(a, obj({ x: 9, y: 0 }))).toBe(true);
    expect(overlaps(a, obj({ x: 10, y: 0 }))).toBe(false); // 맞닿음은 겹침 아님
    expect(overlaps(a, obj({ x: 5, y: 10 }))).toBe(false);
    expect(overlapXY(a, obj({ x: 6, y: 8 }))).toEqual([4, 2]);
  });
});

describe('solid 밀어내기', () => {
  it('최소 침투 축(y)으로 위로 밀고 vy=0, onGround=true', () => {
    const o = obj({ x: 0, y: -3, vy: 3, vx: 2 });
    const s = obj({ x: 0, y: 5, w: 100, h: 10 });
    pushOut(o, s);
    expect(o.y).toBe(-5);
    expect(o.vy).toBe(0);
    expect(o.vx).toBe(2);
    expect(o.onGround).toBe(true);
    expect(overlaps(o, s)).toBe(false);
  });
  it('최소 침투 축(x)으로 옆으로 밀면 vx=0, onGround 는 그대로', () => {
    const o = obj({ x: -8, y: 0, vx: 3, vy: 1 });
    const s = obj({ x: 0, y: 0, w: 10, h: 100 });
    pushOut(o, s);
    expect(o.x).toBe(-10);
    expect(o.vx).toBe(0);
    expect(o.vy).toBe(1);
    expect(o.onGround).toBe(false);
  });
  it('아래에서 밀려나면 onGround 아님', () => {
    const o = obj({ x: 0, y: 12, vy: -3 });
    const s = obj({ x: 0, y: 5, w: 100, h: 10 });
    pushOut(o, s);
    expect(o.y).toBe(15);
    expect(o.onGround).toBe(false);
  });
});

describe('튕기기', () => {
  it('최소 침투 축 속도를 뒤집고 겹치지 않게 밀어낸다', () => {
    const ball = obj({ x: 0, y: 7, w: 8, h: 8, vx: 2, vy: 4 });
    const paddle = obj({ x: 0, y: 15, w: 60, h: 10 });
    bounce(ball, paddle);
    expect(ball.vy).toBe(-4);
    expect(ball.vx).toBe(2);
    expect(overlaps(ball, paddle)).toBe(false);
  });
  it('옆면에 맞으면 vx 를 뒤집는다', () => {
    const ball = obj({ x: -8, y: 0, w: 8, h: 8, vx: 3, vy: 1 });
    const wall = obj({ x: 0, y: 0, w: 10, h: 100 });
    bounce(ball, wall);
    expect(ball.vx).toBe(-3);
    expect(overlaps(ball, wall)).toBe(false);
  });
  it('한 step 에 두 번 불려도 떨지 않는다 (멀어지는 방향 고정)', () => {
    const ball = obj({ x: 0, y: 7, w: 8, h: 8, vy: 4 });
    const p = obj({ x: 0, y: 15, w: 60, h: 10 });
    bounce(ball, p);
    ball.y += 1; // 다시 살짝 겹침
    bounce(ball, p);
    expect(ball.vy).toBe(-4);
  });
});

describe('Behavior 5종', () => {
  it('중력: 매 step vy += g', () => {
    const env = envFromCode(`api.onStart(() => { api.create({tag:'p', x:200, y:100}); api.setBehavior('p','gravity',0.5); });`);
    env.reset(0);
    env.step(0);
    env.step(0);
    const [p] = find(env, 'p');
    expect(p.vy).toBe(1);
    expect(p.y).toBe(101.5);
  });
  it('중력 기본값 0.5', () => {
    const env = envFromCode(`api.onStart(() => { api.create({tag:'p'}); api.setBehavior('p','gravity'); });`);
    env.reset(0);
    env.step(0);
    expect(find(env, 'p')[0].vy).toBe(0.5);
  });
  it('단단함: 바닥에 서고 onGround, solid 끼리는 밀지 않음', () => {
    const env = envFromCode(`api.onStart(() => {
      api.create({tag:'g', x:200, y:290, w:400, h:20});
      api.create({tag:'g', x:200, y:285, w:20, h:20});
      api.create({tag:'p', x:100, y:200, w:20, h:20});
      api.setBehavior('p','gravity',1); api.setBehavior('g','solid');
    });`);
    env.reset(0);
    for (let i = 0; i < 60; i++) env.step(0);
    const [p] = find(env, 'p');
    expect(p.y).toBe(270);
    expect(p.vy).toBe(0);
    expect(p.onGround).toBe(true);
    expect(find(env, 'g')[1].y).toBe(285); // solid 끼리 겹쳐도 그대로
  });
  it('화면 안에 머물기: 경계에 고정, 바닥이면 onGround', () => {
    const env = envFromCode(`api.onStart(() => {
      api.create({tag:'p', x:5, y:295, w:20, h:20, vx:-3, vy:3}); api.setBehavior('p','stayInScreen');
    });`);
    env.reset(0);
    env.step(0);
    const [p] = find(env, 'p');
    expect([p.x, p.y, p.vx, p.vy, p.onGround]).toEqual([10, 290, 0, 0, true]);
  });
  it('벽 튕기기: 모든 벽 / 바닥 제외', () => {
    const env = envFromCode(`api.onStart(() => {
      api.create({tag:'a', x:396, y:296, w:8, h:8, vx:3, vy:3}); api.setBehavior('a','bounceWalls','all');
      api.create({tag:'b', x:200, y:296, w:8, h:8, vx:0, vy:3}); api.setBehavior('b','bounceWalls','noBottom');
    });`);
    env.reset(0);
    env.step(0);
    const [a] = find(env, 'a');
    const [b] = find(env, 'b');
    expect([a.x, a.y, a.vx, a.vy]).toEqual([396, 296, -3, -3]);
    expect([b.y, b.vy]).toEqual([299, 3]);
  });
  it('화면 밖이면 삭제: 완전히 나가야 삭제', () => {
    const env = envFromCode(`api.onStart(() => {
      api.create({tag:'o', x:-4, y:100, w:10, h:10, vx:-1}); api.setBehavior('o','destroyOffscreen');
    });`);
    env.reset(0);
    env.step(0); // x=-5: 오른쪽 끝 0 → 아직 걸침
    expect(find(env, 'o')).toHaveLength(1);
    env.step(0); // x=-6: 완전히 밖
    expect(find(env, 'o')).toHaveLength(0);
  });
  it('Behavior 해제와, 나중에 생성된 객체에도 적용', () => {
    const env = envFromCode(`
      api.onStart(() => { api.setBehavior('p','gravity',1); });
      api.onInterval(2, () => { api.create({tag:'p', x:100, y:100}); });
      api.onAction('up', () => { api.clearBehavior('p','gravity'); });`);
    env.reset(0);
    env.step(0);
    env.step(0); // frame 2 에 생성
    env.step(0); // frame 3: 중력 1
    expect(find(env, 'p')[0].vy).toBe(1);
    env.step(3); // up → 해제
    expect(find(env, 'p')[0].vy).toBe(1);
  });
});
