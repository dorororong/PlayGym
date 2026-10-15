// 블록깨기 관찰 실험: 남은 벽돌을 보여 주면 더 잘 깨는가 → experiments/breakout/<이름>.json
//   none   : 예제 그대로 (패들 위치, 공 위치·속도)
//   grid5  : + 화면 전체 5×8 격자 센서로 벽돌 (한 칸 = 벽돌 두 줄)
//   grid15 : + 화면 전체 15×8 격자 센서로 벽돌 (한 칸 = 벽돌 하나)
//   near   : + 패들 위 가장 가까운 벽돌 2개의 위치 (입력 4개)
// 실행: npx tsx scripts/breakout-variants.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { projectFromBlocksJson } from '../src/blocks/headless';
import { TEMPLATE_TRAINING, breakoutBlocks } from '../src/templates/sources';

mkdirSync('experiments/breakout', { recursive: true });
for (const bricks of ['none', 'grid5', 'grid15', 'near'] as const) {
  const p = { ...projectFromBlocksJson(breakoutBlocks({ bricks })), training: TEMPLATE_TRAINING.breakout };
  writeFileSync(`experiments/breakout/${bricks}.json`, JSON.stringify(p));
  console.log(bricks);
}
