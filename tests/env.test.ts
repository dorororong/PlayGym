import { describe, expect, it } from 'vitest';
import { actionNames, createEnv, type StepResult } from '../src/engine/env';
import { jsTemplates } from '../src/templates/js';
import { envFromCode } from './helpers';

describe('환경 인터페이스', () => {
  it('행동 공간: none 항상 포함, 표 순서에서 체크된 것만', () => {
    expect(actionNames(['up'])).toEqual(['none', 'up']);
    expect(actionNames(['down', 'left', 'none'])).toEqual(['none', 'left', 'down']);
    expect(createEnv(jsTemplates.breakout).actionSpace).toEqual({ n: 3, names: ['none', 'left', 'right'] });
    expect(createEnv(jsTemplates.dino).actionSpace.n).toBe(2);
  });

  it('관찰 공간: 이름표·low·high·shape', () => {
    const s = createEnv(jsTemplates.flappy).observationSpace;
    expect(s.shape).toEqual([13]);
    expect(s.labels.slice(0, 5)).toEqual(['player.x', 'player.y', 'player.vx', 'player.vy', 'lidar0[0]']);
    expect(s.low.slice(0, 4)).toEqual([0, 0, -1, -1]);
    expect(s.high.every((h) => h === 1)).toBe(true);
  });

  it('보상 = 이번 step 점수 변화량, events 에 기록', () => {
    const env = envFromCode(`api.onAction('up', () => api.addScore(3)); api.onAction('down', () => api.setScore(1));`);
    env.reset(0);
    const r = env.step(3);
    expect(r.reward).toBe(3);
    expect(r.info.events).toEqual([{ type: 'score', delta: 3, score: 3, frame: 1 }]);
    expect(env.step(4).reward).toBe(-2);
    expect(env.step(0).reward).toBe(0);
  });

  it('게임 끝내기 → terminated, frame >= maxSteps → truncated', () => {
    const over = envFromCode(`api.onTick(() => { if (api.frame() === 5) api.gameOver(); });`);
    over.reset(0);
    let r: StepResult | undefined;
    for (let i = 0; i < 5; i++) r = over.step(0);
    expect(r).toMatchObject({ terminated: true, truncated: false });
    expect(r!.info.events.some((e) => e.type === 'gameOver')).toBe(true);

    const long = envFromCode(``, { maxSteps: 10 });
    long.reset(0);
    for (let i = 0; i < 9; i++) expect(long.step(0).truncated).toBe(false);
    expect(long.step(0)).toMatchObject({ terminated: false, truncated: true });
    expect(long.step(0)).toMatchObject({ terminated: false, truncated: true, reward: 0 });
  });

  it('잘못된 행동 인덱스는 RangeError', () => {
    const env = createEnv(jsTemplates.dino);
    env.reset(0);
    expect(() => env.step(2)).toThrow(RangeError);
  });

  it('reset() 에 시드를 안 주면 결정론적 시드 수열을 쓴다', () => {
    const c = createEnv(jsTemplates.dodge);
    const d = createEnv(jsTemplates.dodge);
    c.reset();
    d.reset();
    expect(c.seed).toBe(d.seed);
    c.reset();
    expect(c.seed).not.toBe(d.seed);
  });

  it('reset 은 이전 에피소드 상태를 남기지 않는다', () => {
    const env = createEnv(jsTemplates.dino);
    env.reset(0);
    for (let i = 0; i < 50; i++) env.step(1);
    const r = env.reset(0);
    expect(r.info).toMatchObject({ score: 0, frame: 0 });
    expect(env.getWorld().objects.map((o) => o.tag)).toEqual(['ground', 'player']);
  });
});
