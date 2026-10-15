import { describe, expect, it } from 'vitest';
import { MAX_OBJECTS } from '../src/engine/types';
import { envFromCode, find } from './helpers';

const log = `api.vars.log = api.vars.log || []; api.vars.log.push`;

describe('step 실행 순서 (명세 4.4)', () => {
  it('행동 → 매 프레임 → N 프레임 핸들러 순으로 실행', () => {
    const env = envFromCode(`
      api.onInterval(1, () => { ${log}('interval'); });
      api.onTick(() => { ${log}('tick'); });
      api.onAction('up', () => { ${log}('action'); });`);
    env.reset(0);
    env.step(3);
    expect(env.getWorld().vars.log).toEqual(['action', 'tick', 'interval']);
  });

  it('핸들러는 적분 전 위치를, 충돌 핸들러는 밀어내기·경계 처리 후 위치를 본다', () => {
    const env = envFromCode(`
      api.onStart(() => {
        api.create({tag:'g', x:200, y:290, w:400, h:20});
        api.create({tag:'p', x:100, y:265, w:20, h:30, vy:0});
        api.create({tag:'s', x:100, y:265, w:4, h:4});
        api.setBehavior('p','gravity',2); api.setBehavior('g','solid');
      });
      api.onTick(() => { ${log}(['tick', api.get('p','y'), api.get('p','vy')]); });
      api.onCollide('p', 's', () => { ${log}(['collide', api.get('p','y'), api.get('p','vy')]); });`);
    env.reset(0);
    env.step(0);
    // tick: 적분 전 (y=265, vy=0) / collide: 중력→적분(267)→밀어내기(265, vy=0) 후
    expect(env.getWorld().vars.log).toEqual([['tick', 265, 0], ['collide', 265, 0]]);
  });

  it('행동 핸들러의 onGround 는 이전 step 값', () => {
    const env = envFromCode(`
      api.onStart(() => {
        api.create({tag:'g', x:200, y:290, w:400, h:20});
        api.create({tag:'p', x:100, y:260, w:20, h:30});
        api.setBehavior('p','gravity',1); api.setBehavior('g','solid');
      });
      api.onAction('up', () => { ${log}(api.onGround('p')); });`);
    env.reset(0);
    const seen: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      env.step(3);
      seen.push(find(env, 'p')[0].onGround);
    }
    const log2 = env.getWorld().vars.log as boolean[];
    expect(log2[0]).toBe(false); // reset 직후에는 아직 땅 위가 아님
    for (let i = 1; i < 8; i++) expect(log2[i]).toBe(seen[i - 1]);
    expect(seen.at(-1)).toBe(true);
  });

  it('충돌 이벤트는 겹쳐 있는 동안 매 step, (self=A, other=B) 로 호출', () => {
    const env = envFromCode(`
      api.onStart(() => { api.create({tag:'a', x:100, y:100}); api.create({tag:'b', x:105, y:100}); });
      api.onCollide('a', 'b', (self, other) => { ${log}([self.tag, other.tag]); });`);
    env.reset(0);
    const r = env.step(0);
    env.step(0);
    expect(env.getWorld().vars.log).toEqual([['a', 'b'], ['a', 'b']]);
    expect(r.info.events.filter((e) => e.type === 'collide')).toHaveLength(1);
  });
});

describe('생성·삭제 지연 처리', () => {
  it('onStart 에서 만든 객체는 reset 직후 존재', () => {
    const env = envFromCode(`api.onStart(() => { api.create({tag:'p'}); });`);
    env.reset(0);
    expect(find(env, 'p')).toHaveLength(1);
  });

  it('핸들러에서 만든 객체는 step 끝에 들어가 다음 step 부터 물리·충돌에 참여', () => {
    const env = envFromCode(`
      api.onStart(() => { api.create({tag:'a', x:100, y:100}); });
      api.onAction('up', () => { api.create({tag:'b', x:100, y:100, vx:1}); ${log}(['count', api.count('b')]); });
      api.onCollide('a', 'b', () => { ${log}(['hit', api.frame()]); });`);
    env.reset(0);
    env.step(3);
    const b = find(env, 'b')[0];
    expect(b.x).toBe(100); // 생성된 step 에는 적분되지 않음
    env.step(0);
    expect(find(env, 'b')[0].x).toBe(101);
    expect(env.getWorld().vars.log).toEqual([['count', 0], ['hit', 2]]);
  });

  it('삭제는 표시만 하고 step 끝에 제거, 표시된 객체는 이후 충돌·물리에서 빠짐', () => {
    const env = envFromCode(`
      api.onStart(() => { api.create({tag:'a', x:100, y:100}); api.create({tag:'b', x:100, y:100, vx:5}); });
      api.onTick(() => { if (api.frame() === 1) { api.destroy('b'); ${log}(['count', api.count('b')]); } });
      api.onCollide('a', 'b', () => { ${log}('hit'); });`);
    env.reset(0);
    env.step(0);
    expect(env.getWorld().vars.log).toEqual([['count', 0]]);
    expect(find(env, 'b')).toHaveLength(0);
  });

  it('충돌 핸들러 안에서 삭제한 상대에 대해서도 튕기기는 동작', () => {
    const env = envFromCode(`
      api.onStart(() => { api.create({tag:'ball', x:100, y:110, w:8, h:8, vy:-4}); api.create({tag:'brick', x:100, y:100, w:40, h:10}); });
      api.onCollide('ball', 'brick', (self, other) => { api.destroy(other); api.bounce(self, other); });`);
    env.reset(0);
    env.step(0);
    expect(find(env, 'brick')).toHaveLength(0);
    expect(find(env, 'ball')[0].vy).toBe(4);
  });

  it(`객체 수 상한 ${MAX_OBJECTS}개: 초과 생성은 무시하고 경고`, () => {
    const env = envFromCode(`api.onStart(() => { for (let i = 0; i < 400; i++) api.create({tag:'o'}); });`);
    const r = env.reset(0);
    expect(find(env, 'o')).toHaveLength(MAX_OBJECTS);
    expect(r.info.events.filter((e) => e.type === 'warn')).toHaveLength(1);
  });

  it('id 는 생성 순서대로 증가', () => {
    const env = envFromCode(`api.onStart(() => { api.create({tag:'a'}); api.create({tag:'b'}); });
      api.onTick(() => { api.create({tag:'c'}); });`);
    env.reset(0);
    env.step(0);
    expect(env.getWorld().objects.map((o) => o.id)).toEqual([1, 2, 3]);
  });
});

describe('값/명령 대상 규칙', () => {
  it('명령은 태그의 모든 객체, 값은 id 가 가장 작은 객체', () => {
    const env = envFromCode(`
      api.onStart(() => { api.create({tag:'o', x:10}); api.create({tag:'o', x:20}); });
      api.onTick(() => { api.move('o', 'x', 1); api.vars.first = api.get('o', 'x'); api.vars.none = api.get('zzz', 'x'); });`);
    env.reset(0);
    env.step(0);
    expect(find(env, 'o').map((o) => o.x)).toEqual([11, 21]);
    expect(env.getWorld().vars.first).toBe(11);
    expect(env.getWorld().vars.none).toBe(0);
  });
  it('충돌 이벤트 밖의 자신/상대는 무시된다', () => {
    const env = envFromCode(`api.onStart(() => { api.create({tag:'o'}); });
      api.onTick(() => { api.destroy(self); api.bounce(self, other); });`);
    env.reset(0);
    const r = env.step(0);
    expect(r.terminated).toBe(false);
    expect(find(env, 'o')).toHaveLength(1);
  });
});
