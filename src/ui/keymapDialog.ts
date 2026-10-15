// 키 설정 창: 행동마다 키를 추가·삭제한다. 한 키는 한 행동에만 붙는다.

import { ALL_ACTIONS, type ActionName, type Keymap } from '../engine/types';
import { ko } from '../i18n/ko';
import { el } from './dom';
import { DEFAULT_KEYMAP, assignKey, keyLabel, normalizeKeymap } from './keys';

export const ACTION_ICONS: Record<ActionName, string> = { none: '·', left: '⬅️', right: '➡️', up: '⬆️', down: '⬇️', a: '🅰️', b: '🅱️' };

/**
 * 창을 열고, 바뀔 때마다 onChange 로 새 매핑을 알린다.
 * enabled: 이 프로젝트에서 쓰는 행동 (나머지는 흐리게 표시)
 */
export function openKeymapDialog(
  dialog: HTMLDialogElement,
  initial: Keymap,
  enabled: readonly ActionName[],
  onChange: (km: Keymap) => void,
): void {
  let km = normalizeKeymap(initial);
  let listening: ActionName | null = null;

  const capture = (e: KeyboardEvent) => {
    if (!listening) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code !== 'Escape') {
      km = assignKey(km, listening, e.code);
      onChange(km);
    }
    listening = null;
    render();
  };

  const render = () => {
    const rows = ALL_ACTIONS.filter((a) => a !== 'none').map((a) => {
      const keys = el(
        'div',
        { className: 'km-keys' },
        ...(km[a] ?? []).map((code) => {
          const del = el('button', { textContent: '×', title: '지우기' });
          del.addEventListener('click', () => {
            km = { ...km, [a]: (km[a] ?? []).filter((k) => k !== code) };
            onChange(km);
            render();
          });
          return el('span', { className: 'km-key' }, keyLabel(code), del);
        }),
      );
      const add = el('button', {
        className: `km-add${listening === a ? ' listening' : ''}`,
        textContent: listening === a ? ko.keymap.press : ko.keymap.add,
      });
      add.addEventListener('click', () => {
        listening = listening === a ? null : a;
        render();
      });
      keys.append(add);
      const used = enabled.includes(a);
      return el(
        'div',
        { className: `km-row${used ? '' : ' unused'}` },
        el('div', { className: 'what' }, `${ACTION_ICONS[a]} ${ko.actions[a]}`, ...(used ? [] : [el('small', { textContent: ko.keymap.unused })])),
        keys,
      );
    });
    const reset = el('button', { className: 'btn ghost', textContent: ko.keymap.reset });
    reset.addEventListener('click', () => {
      km = normalizeKeymap(DEFAULT_KEYMAP);
      onChange(km);
      render();
    });
    const close = el('button', { className: 'btn play', textContent: ko.keymap.close });
    close.addEventListener('click', () => dialog.close());
    dialog.replaceChildren(
      el('h2', { textContent: ko.keymap.title }),
      el('div', { className: 'help', textContent: ko.keymap.help }),
      ...rows,
      el('div', { className: 'km-foot' }, reset, close),
    );
  };

  window.addEventListener('keydown', capture, true);
  dialog.addEventListener('close', () => window.removeEventListener('keydown', capture, true), { once: true });
  render();
  dialog.showModal();
}
