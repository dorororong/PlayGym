import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEnv } from '../src/engine/env';
import { jsTemplates } from '../src/templates/js';
import { rollout } from './helpers';

const bits = (rows: number[][]) => {
  const f = new Float64Array(rows.flat());
  return Array.from(new Uint32Array(f.buffer));
};

describe('결정론', () => {
  for (const [name, project] of Object.entries(jsTemplates)) {
    it(`${name}: 같은 시드 + 같은 무작위 행동 1,000 step → 관찰이 비트 단위로 동일`, () => {
      const a = rollout(createEnv(project), 42, 1000);
      const b = rollout(createEnv(project), 42, 1000);
      expect(bits(a)).toEqual(bits(b));
    });
  }
  it('같은 env 에서 reset(seed) 을 다시 해도 동일', () => {
    const env = createEnv(jsTemplates.dodge);
    expect(bits(rollout(env, 7, 500))).toEqual(bits(rollout(env, 7, 500)));
  });
  it('시드가 다르면 무작위 게임은 달라진다', () => {
    expect(bits(rollout(createEnv(jsTemplates.dodge), 1, 300))).not.toEqual(bits(rollout(createEnv(jsTemplates.dodge), 2, 300)));
  });
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('엔진·런타임 정적 검사', () => {
  const files = [...sources('src/engine'), ...sources('src/runtime')];
  it('Math.random 을 쓰지 않는다', () => {
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/Math\.random/);
  });
  it('DOM 에 의존하지 않는다 (document/window/canvas 없음, DOM 쪽 모듈 import 없음)', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\b(document|window|HTMLElement|CanvasRenderingContext2D|requestAnimationFrame)\b/);
      expect(src, f).not.toMatch(/from '\.\.\/(render|ui|blocks)\//);
    }
  });
});
