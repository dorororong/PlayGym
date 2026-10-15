// "이 게임의 보상 규칙" 요약: 블록을 읽어 AI 가 언제 얼마의 보상을 받는지 문장으로 만든다.

import type * as BlocklyTypes from 'blockly/core';
import { ko } from '../i18n/ko';
import { readSettings } from './generators';

/** 모자 블록의 첫 줄 글자 (예: "player 가 obstacle 에 닿았을 때") */
function hatText(b: BlocklyTypes.Block): string {
  return b.inputList[0].fieldRow
    .map((f) => f.getText())
    .filter((t) => t.trim())
    .join(' ');
}

export function describeRewards(ws: BlocklyTypes.Workspace): string[] {
  const r = ko.reward;
  const scoreOn = readSettings(ws).scoreReward !== false;
  const lines = [scoreOn ? r.score : r.scoreOff];
  const blocks = ws.getBlocksByType('pg_reward', false).filter((b) => b.isEnabled());
  for (const b of blocks) {
    const root = b.getRootBlock();
    if (root === b) continue; // 이벤트에 안 붙은 블록은 실행되지 않는다
    let cond = false;
    for (let p = b.getSurroundParent(); p && p !== root; p = p.getSurroundParent()) if (p.type.startsWith('controls_')) cond = true;
    const amount = b.getInputTargetBlock('N')?.toString() ?? '0';
    lines.push(r.when(hatText(root), amount, cond));
  }
  if (!blocks.length) lines.push(scoreOn ? r.none : r.noneAtAll);
  return lines;
}
