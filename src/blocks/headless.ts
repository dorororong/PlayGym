// Node(headless)에서 블록 JSON → Project. 템플릿 빌드와 테스트가 쓴다.

import { Blockly } from './blockly';
import type { Project } from '../engine/types';
import { setCustomCostumes, type PixelArt } from '../render/pixelArt';
import { ensureDefaultTags } from './definitions';
import { installGenerators, projectFromWorkspace } from './generators';

/** costumes: 사용자 그림 목록 (모양 블록이 그 이름을 고를 수 있도록 먼저 등록한다) */
export function projectFromBlocksJson(blocksJson: object, costumes?: Record<string, PixelArt>): Project {
  installGenerators();
  setCustomCostumes(costumes);
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(blocksJson, ws);
    ensureDefaultTags(ws);
    return projectFromWorkspace(ws);
  } finally {
    ws.dispose();
  }
}
