import { describe, expect, it } from 'vitest';
import { actionNames } from '../src/engine/env';
import { assignKey, keyLabel, keyLookup, normalizeKeymap } from '../src/ui/keys';
import { envFromCode } from './helpers';

describe('A/B 버튼 행동', () => {
  it('표 순서 뒤에 a, b 가 붙는다', () => {
    expect(actionNames(['b', 'up', 'a'])).toEqual(['none', 'up', 'a', 'b']);
  });
  it('행동 a/b 핸들러가 불린다', () => {
    const env = envFromCode(`api.onAction('a', () => api.addScore(1)); api.onAction('b', () => api.addScore(10));`, {
      actions: ['none', 'a', 'b'],
    });
    env.reset(0);
    expect(env.actionSpace.names).toEqual(['none', 'a', 'b']);
    expect(env.step(1).reward).toBe(1);
    expect(env.step(2).reward).toBe(10);
  });
});

describe('키 매핑', () => {
  it('기본값: 화살표 + A 버튼(A, Space) + B 버튼(S)', () => {
    const m = keyLookup(normalizeKeymap());
    expect([m.get('ArrowLeft'), m.get('KeyA'), m.get('Space'), m.get('KeyS')]).toEqual(['left', 'a', 'a', 'b']);
  });
  it('한 키는 한 행동에만: 덮어쓴 매핑이 기본값의 같은 키를 가져간다', () => {
    const km = normalizeKeymap({ up: ['ArrowUp', 'Space'] });
    expect(km.up).toEqual(['ArrowUp', 'Space']);
    expect(km.a).toEqual(['KeyA']);
  });
  it('키를 다른 행동에 붙이면 원래 행동에서 빠진다', () => {
    const km = assignKey(normalizeKeymap(), 'up', 'KeyS');
    expect(km.up).toContain('KeyS');
    expect(km.b).toEqual([]);
  });
  it('키 이름 표시', () => {
    expect([keyLabel('ArrowUp'), keyLabel('KeyW'), keyLabel('Space'), keyLabel('Digit3')]).toEqual(['↑', 'W', 'Space', '3']);
  });
});
