import { createEnv, type Env } from '../src/engine/env';
import { Rng } from '../src/engine/rng';
import type { GameObject, Settings } from '../src/engine/types';

export function envFromCode(code: string, settings: Partial<Settings> = {}): Env {
  return createEnv({
    version: 1,
    blocksJson: {},
    generatedCode: code,
    settings: { actions: ['none', 'left', 'right', 'up', 'down'], maxSteps: 3000, background: '#000', backdrop: 'none', ...settings },
  });
}

export function obj(p: Partial<GameObject>): GameObject {
  return { id: 1, tag: 't', x: 0, y: 0, w: 10, h: 10, vx: 0, vy: 0, color: '#000', onGround: false, alive: true, ...p };
}

/** 무작위 행동으로 n step. 에피소드가 끝나면 다시 reset. 관찰 열을 돌려준다 */
export function rollout(env: Env, seed: number, n: number): number[][] {
  const rng = new Rng(seed * 7919 + 1);
  const out: number[][] = [];
  let ep = 0;
  out.push(env.reset(seed).obs);
  for (let i = 0; i < n; i++) {
    const r = env.step(rng.int(0, env.actionSpace.n - 1));
    out.push(r.obs);
    if (r.terminated || r.truncated) out.push(env.reset(seed + ++ep).obs);
  }
  return out;
}

export const find = (env: Env, tag: string) => env.getWorld().objects.filter((o) => o.tag === tag);
