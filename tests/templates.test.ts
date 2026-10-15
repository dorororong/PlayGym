import { describe, expect, it } from 'vitest';
import { projectFromBlocksJson } from '../src/blocks/headless';
import { createEnv } from '../src/engine/env';
import { Rng } from '../src/engine/rng';
import type { Project } from '../src/engine/types';
import { jsTemplates } from '../src/templates/js';
import { TEMPLATE_SOURCES } from '../src/templates/sources';
import { TEMPLATES } from '../src/templates';
import { rollout } from './helpers';

const jsonTemplates = TEMPLATES as Record<string, Project>;

describe('예제', () => {
  for (const name of Object.keys(TEMPLATE_SOURCES) as (keyof typeof TEMPLATE_SOURCES)[]) {
    describe(name, () => {
      const json = jsonTemplates[name];
      const js = (jsTemplates as Record<string, Project>)[name];

      it('저장된 JSON 이 블록 소스와 일치 (어긋나면 npm run templates)', () => {
        const fresh = projectFromBlocksJson(TEMPLATE_SOURCES[name]());
        expect(json.generatedCode).toBe(fresh.generatedCode);
        expect(json.settings).toEqual(fresh.settings);
        expect(projectFromBlocksJson(json.blocksJson).generatedCode).toBe(json.generatedCode);
      });

      it.runIf(!!js)('설정이 JS 버전과 같다', () => {
        expect(json.settings).toEqual(js.settings);
      });

      it.runIf(!!js)('JS 버전과 블록 버전이 같은 시드·행동 열에서 같은 관찰을 낸다', () => {
        const a = createEnv(js);
        const b = createEnv(json);
        expect(b.observationSpace).toEqual(a.observationSpace);
        expect(b.actionSpace).toEqual(a.actionSpace);
        for (const seed of [1, 2, 3]) expect(rollout(b, seed, 1500)).toEqual(rollout(a, seed, 1500));
      });

      it('createEnv(templateJson) 으로 랜덤 행동 100 에피소드가 예외 없이 끝난다', () => {
        const env = createEnv(json);
        const rng = new Rng(2026);
        for (let ep = 0; ep < 100; ep++) {
          env.reset(ep);
          let r;
          do r = env.step(rng.int(0, env.actionSpace.n - 1));
          while (!r.terminated && !r.truncated);
          expect(r.info.events.filter((e) => e.type === 'error')).toEqual([]);
          expect(r.info.frame).toBeLessThanOrEqual(env.maxSteps);
        }
      });
    });
  }
});
