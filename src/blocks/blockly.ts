// Blockly 가져오기 한 곳. Node 에서는 Blockly 가 CJS(UMD) 로 들어와 모든 것이 default 아래에
// 있으므로 브라우저(ESM)와 Node 양쪽에서 같은 모양이 되게 풀어 준다.

import * as BlocklyNs from 'blockly/core';
import * as JsNs from 'blockly/javascript';
import * as KoNs from 'blockly/msg/ko';
import 'blockly/blocks';

const unwrap = <T>(ns: T): T => {
  const d = (ns as { default?: T }).default;
  return d && typeof d === 'object' ? d : ns;
};

export const Blockly = unwrap(BlocklyNs);
export const javascriptGenerator = unwrap(JsNs).javascriptGenerator;
export const Order = unwrap(JsNs).Order;
export const KoMsg = unwrap(KoNs) as unknown as Record<string, string>;
export type { Block, BlockSvg, Workspace, WorkspaceSvg } from 'blockly/core';
