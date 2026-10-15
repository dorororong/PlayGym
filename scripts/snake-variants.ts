// 뱀 게임 학습 실험용 변형 → experiments/snake/<이름>.json
//   base   : 예제 그대로 (먹이 +1, 100칸 못 먹으면 끝)
//   closer : + 먹이에 가까워지면 +0.1, 멀어지면 -0.15
// 실행: npx tsx scripts/snake-variants.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { projectFromBlocksJson } from '../src/blocks/headless';
import { snakeBlocks } from '../src/templates/sources';

mkdirSync('experiments/snake', { recursive: true });
for (const [name, opt] of Object.entries({ base: {}, closer: { closer: true } })) {
  const p = { ...projectFromBlocksJson(snakeBlocks(opt)), training: { steps: 1_500_000, frameSkip: 6 } };
  writeFileSync(`experiments/snake/${name}.json`, JSON.stringify(p));
  console.log(name);
}
