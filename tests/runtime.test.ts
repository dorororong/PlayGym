import { describe, expect, it } from 'vitest';
import { createEnv } from '../src/engine/env';
import { projectFromBlocksJson } from '../src/blocks/headless';
import { TemplateBuilder } from '../src/templates/builder';
import { envFromCode } from './helpers';

describe('런타임 안전장치', () => {
  it('반복이 핸들러 1회당 10,000번을 넘으면 오류로 terminated, 블록 id 를 기록', () => {
    const t = new TemplateBuilder('loop');
    t.onTick([t.for('i', 1, 20000, 1, [t.addScore(1)])]);
    const env = createEnv(projectFromBlocksJson(t.build()));
    env.reset(0);
    const r = env.step(0);
    expect(r.terminated).toBe(true);
    const err = r.info.events.find((e) => e.type === 'error');
    expect(err?.type === 'error' && err.message).toMatch(/10,000/);
    expect(err?.type === 'error' && err.blockId).toMatch(/^loop_/);
  });

  it('10,000번 이하 반복은 허용', () => {
    const t = new TemplateBuilder('ok');
    t.onTick([t.for('i', 1, 10000, 1, [])]);
    const env = createEnv(projectFromBlocksJson(t.build()));
    env.reset(0);
    expect(env.step(0).terminated).toBe(false);
  });

  it('핸들러 예외 → events 에 기록하고 terminated, 이후 step 은 진행하지 않음', () => {
    const env = envFromCode(`api.onTick(() => { if (api.frame() === 3) null.x; });`);
    env.reset(0);
    env.step(0);
    env.step(0);
    const r = env.step(0);
    expect(r.terminated).toBe(true);
    expect(r.info.events.some((e) => e.type === 'error')).toBe(true);
    const after = env.step(0);
    expect(after.terminated).toBe(true);
    expect(after.info.frame).toBe(3);
  });

  it('블록 코드의 예외는 마지막으로 실행한 블록 id 를 가리킨다', () => {
    const t = new TemplateBuilder('err');
    t.onTick([t.addScore(1), t.gameOver()]);
    const p = projectFromBlocksJson(t.build());
    const id = /api\.\$b\('([^']+)'\);\n\s*api\.gameOver\(\);/.exec(p.generatedCode)?.[1];
    expect(id).toBeTruthy();
    const env = createEnv({ ...p, generatedCode: p.generatedCode.replace('api.gameOver();', 'null.x;') });
    env.reset(0);
    const err = env.step(0).info.events.find((e) => e.type === 'error');
    expect(err?.type === 'error' && err.blockId).toBe(id);
  });

  it('onStart 예외도 reset 에서 기록된다', () => {
    const env = envFromCode(`api.onStart(() => { throw new Error('boom'); });`);
    const r = env.reset(0);
    expect(r.info.events).toEqual([expect.objectContaining({ type: 'error', message: 'boom' })]);
    expect(env.step(0).terminated).toBe(true);
  });

  it('문법 오류는 createEnv 에서 한국어 메시지로', () => {
    expect(() => envFromCode('api.onTick(() => {')).toThrow(/코드를 만들 수 없어요/);
  });

  it('이벤트 등록은 최상위에서만 (핸들러 안 등록은 경고 후 무시)', () => {
    const env = envFromCode(`api.onStart(() => { api.onTick(() => api.addScore(1)); });`);
    const r = env.reset(0);
    expect(r.info.events.some((e) => e.type === 'warn')).toBe(true);
    expect(env.step(0).info.score).toBe(0);
  });

  it('난수 블록은 엔진 RNG 를 쓴다', () => {
    const t = new TemplateBuilder('rnd');
    t.onTick([t.setVar('r', t.randInt(1, 6))]);
    const p = projectFromBlocksJson(t.build());
    expect(p.generatedCode).toContain('api.randInt(1, 6)');
    expect(p.generatedCode).not.toContain('Math.random');
  });

  it('떠 있는(이벤트에 안 붙은) 블록은 실행하지 않는다', () => {
    const t = new TemplateBuilder('loose');
    const json = t.build() as { blocks: { blocks: object[] } };
    json.blocks.blocks.push(t.gameOver());
    const env = createEnv(projectFromBlocksJson(json));
    env.reset(0);
    expect(env.step(0).terminated).toBe(false);
  });
});
