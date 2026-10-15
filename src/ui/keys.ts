// 사람 플레이 키 매핑. 프로젝트마다 저장되며 키 설정 창에서 바꿀 수 있다. DOM 의존 없음.

import { ALL_ACTIONS, type ActionName, type Keymap } from '../engine/types';

export const DEFAULT_KEYMAP: Required<Omit<Keymap, 'none'>> = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  a: ['KeyA', 'Space'],
  b: ['KeyS'],
};

/** 저장된 매핑을 기본값 위에 덮어쓴다. 한 키는 한 행동에만 (나중 것이 이긴다) */
export function normalizeKeymap(km?: Keymap): Keymap {
  const out: Keymap = {};
  const used = new Set<string>();
  for (const a of ALL_ACTIONS) {
    if (a === 'none') continue;
    const keys = (km?.[a] ?? DEFAULT_KEYMAP[a]).filter((k) => typeof k === 'string' && !used.has(k));
    keys.forEach((k) => used.add(k));
    out[a] = keys;
  }
  return out;
}

/** KeyboardEvent.code → 행동 */
export function keyLookup(km: Keymap): Map<string, ActionName> {
  const m = new Map<string, ActionName>();
  for (const [a, keys] of Object.entries(km)) for (const k of keys ?? []) m.set(k, a as ActionName);
  return m;
}

/** 키 하나를 행동에 붙인다. 다른 행동에 있던 같은 키는 뗀다 */
export function assignKey(km: Keymap, action: ActionName, code: string): Keymap {
  const out: Keymap = {};
  for (const [a, keys] of Object.entries(km)) out[a as ActionName] = (keys ?? []).filter((k) => k !== code);
  out[action] = [...(out[action] ?? []), code];
  return out;
}

const NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Space: 'Space',
  Enter: 'Enter',
  ShiftLeft: 'Shift',
  ShiftRight: '오른쪽 Shift',
  ControlLeft: 'Ctrl',
  ControlRight: '오른쪽 Ctrl',
  AltLeft: 'Alt',
  Tab: 'Tab',
};

export function keyLabel(code: string): string {
  if (NAMES[code]) return NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `숫자패드 ${code.slice(6)}`;
  return code;
}
