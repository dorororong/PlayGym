// 끌어서 크기를 바꾸는 선: 블록 화면 | 게임 화면 (세로 선), 게임 화면 / 아래 패널 (가로 선).
// 위치는 이 브라우저에만 기억한다 (게임 파일에는 넣지 않는다). 선을 두 번 누르면 처음대로.

import { $ } from './dom';

const PREFIX = 'playgym.';

export function loadPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, value);
  } catch {
    /* 저장이 막힌 브라우저: 이번에만 적용 */
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 블록 화면이 차지하는 비율 (0~1) */
function applyColumns(f: number | null): void {
  $('#app').style.gridTemplateColumns = f === null ? '' : `minmax(0, ${f}fr) 14px minmax(0, ${1 - f}fr)`;
}

/** 아래 패널이 오른쪽 열에서 차지하는 비율 (0~1) */
function applyRows(f: number | null): void {
  $('#side').style.gridTemplateRows = f === null ? '' : `minmax(0, 1fr) 14px minmax(120px, ${(f * 100).toFixed(2)}%)`;
}

function drag(handle: HTMLElement, rows: boolean, onMove: (e: PointerEvent) => void, onReset: () => void): void {
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('drag');
    document.body.classList.add('dragging');
    document.body.classList.toggle('rows', rows);
    const move = (ev: PointerEvent) => onMove(ev);
    const up = () => {
      handle.classList.remove('drag');
      document.body.classList.remove('dragging', 'rows');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('dblclick', onReset);
}

export function initSplitters(): void {
  const cols = Number(loadPref('split.cols', ''));
  if (cols > 0 && cols < 1) applyColumns(cols);
  const rows = Number(loadPref('split.rows', ''));
  if (rows > 0 && rows < 1) applyRows(rows);

  drag(
    $('#split-v'),
    false,
    (e) => {
      const r = $('#app').getBoundingClientRect();
      const pad = 14; // #app 의 좌우 여백
      const inner = r.width - pad * 2 - 14;
      // 블록 화면 최소 340px, 게임 쪽 최소 380px
      const left = clamp(e.clientX - r.left - pad - 7, 340, inner - 380);
      const f = left / inner;
      applyColumns(f);
      savePref('split.cols', f.toFixed(4));
    },
    () => {
      applyColumns(null);
      savePref('split.cols', null);
    },
  );

  drag(
    $('#split-h'),
    true,
    (e) => {
      const r = $('#side').getBoundingClientRect();
      // 게임 카드 최소 260px, 아래 패널 최소 120px
      const bottom = clamp(r.bottom - e.clientY - 7, 120, r.height - 14 - 260);
      const f = bottom / r.height;
      applyRows(f);
      savePref('split.rows', f.toFixed(4));
    },
    () => {
      applyRows(null);
      savePref('split.rows', null);
    },
  );
}
