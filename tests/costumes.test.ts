import { describe, expect, it } from 'vitest';
import { projectFromBlocksJson } from '../src/blocks/headless';
import { createEnv } from '../src/engine/env';
import { blankArt, isPixelArt } from '../src/render/pixelArt';
import { TemplateBuilder } from '../src/templates/builder';
import { envFromCode, find } from './helpers';

describe('모양 (그리기 전용)', () => {
  it('모양·무지개 색은 물리·관찰에 영향이 없다', () => {
    const code = (extra: string) => `api.sensors([api.sensor.position('p')]);
      api.onStart(() => { api.create({tag:'p', x:10, y:10, vx:1, vy:2, color: api.rainbow(2)}); api.setBehavior('p','gravity'); ${extra} });`;
    const a = envFromCode(code(''));
    const b = envFromCode(code(`api.setCostume('p', 'duck');`));
    a.reset(1);
    b.reset(1);
    for (let i = 0; i < 50; i++) expect(b.step(0).obs).toEqual(a.step(0).obs);
    expect(b.getWorld().costumes).toEqual({ p: 'duck' });
    expect(find(b, 'p')[0].color).toBe('#ffd23f');
  });

  it('무지개 색은 번호를 7로 돌린다 (음수 포함)', () => {
    const env = envFromCode(`api.onStart(() => { api.vars.c = [api.rainbow(0), api.rainbow(7), api.rainbow(-1)]; });`);
    env.reset(0);
    const c = env.getWorld().vars.c as string[];
    expect(c[0]).toBe(c[1]);
    expect(c[2]).toBe('#ff5fa2');
  });

  it('사용자 그림 이름을 모양 블록이 고를 수 있고 코드에 그대로 들어간다', () => {
    const t = new TemplateBuilder('px');
    t.onStart([t.costume('player', 'px:내오리')]);
    const art = { 내오리: blankArt(8, 8) };
    const p = projectFromBlocksJson(t.build(), art);
    expect(p.generatedCode).toContain(`api.setCostume('player', 'px:내오리')`);
    const env = createEnv(p);
    env.reset(0);
    expect(env.getWorld().costumes.player).toBe('px:내오리');
  });

  it('픽셀 그림 형식 검사', () => {
    expect(isPixelArt(blankArt(16, 16))).toBe(true);
    expect(isPixelArt({ w: 2, h: 2, data: '0f.a' })).toBe(true);
    expect(isPixelArt({ w: 2, h: 2, data: '0f.' })).toBe(false);
    expect(isPixelArt({ w: 2, h: 2, data: '0fz.' })).toBe(false);
    expect(isPixelArt({ w: 100, h: 1, data: '.'.repeat(100) })).toBe(false);
  });
});
