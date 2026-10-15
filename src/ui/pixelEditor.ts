// 픽셀 그림 편집기 (MakeCode 이미지 편집기처럼): 내 그림 목록, 연필·지우개·채우기·스포이트, 16색 팔레트.

import { ko } from '../i18n/ko';
import { COSTUMES } from '../render/catalog';
import { PALETTE, TRANSPARENT, blankArt, type PixelArt } from '../render/pixelArt';
import { artCanvas, rasterizeCostume } from '../render/pixelDraw';
import { el } from './dom';

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker';
const SIZES = [8, 16, 24, 32];
const NAME_RE = /^[\p{L}\p{N}_]{1,20}$/u;

export interface PaintHooks {
  /** 그림 목록이 바뀔 때마다 (한 번 칠하기가 끝날 때 등) */
  onChange(costumes: Record<string, PixelArt>): void;
  onRename(oldName: string, newName: string): void;
}

export function openPixelEditor(dialog: HTMLDialogElement, initial: Record<string, PixelArt>, hooks: PaintHooks): void {
  const t = ko.paint;
  const arts: Record<string, PixelArt> = structuredClone(initial);
  let current: string | null = Object.keys(arts)[0] ?? null;
  let tool: Tool = 'pencil';
  let color = 4;
  const undo: string[] = [];
  const VIEW = 384;

  const canvas = el('canvas', { className: 'px-canvas', width: VIEW, height: VIEW });
  const ctx = canvas.getContext('2d')!;
  const list = el('div', { className: 'px-list' });
  const tools = el('div', { className: 'px-tools' });
  const footer = el('div', { className: 'px-meta' });
  const preview = el('canvas', { className: 'px-preview', width: 96, height: 96 });

  const art = () => (current ? arts[current] : null);
  const commit = () => {
    hooks.onChange(structuredClone(arts));
    renderList();
    drawPreview();
  };

  // ── 그리기 ──
  const drawCanvas = () => {
    const a = art();
    ctx.clearRect(0, 0, VIEW, VIEW);
    if (!a) return;
    const cs = VIEW / Math.max(a.w, a.h);
    // 투명 칸은 체크무늬
    for (let y = 0; y < a.h; y++)
      for (let x = 0; x < a.w; x++) {
        const ch = a.data[y * a.w + x];
        ctx.fillStyle = ch === TRANSPARENT ? ((x + y) % 2 ? '#eeeaf9' : '#f8f6ff') : PALETTE[parseInt(ch, 16)];
        ctx.fillRect(x * cs, y * cs, cs, cs);
      }
    ctx.strokeStyle = 'rgba(80,60,160,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= Math.max(a.w, a.h); i++) {
      ctx.beginPath();
      ctx.moveTo(i * cs + 0.5, 0);
      ctx.lineTo(i * cs + 0.5, a.h * cs);
      ctx.moveTo(0, i * cs + 0.5);
      ctx.lineTo(a.w * cs, i * cs + 0.5);
      ctx.stroke();
    }
  };
  const drawPreview = () => {
    const p = preview.getContext('2d')!;
    p.clearRect(0, 0, 96, 96);
    const a = art();
    if (!a) return;
    p.imageSmoothingEnabled = false;
    const s = Math.floor(96 / Math.max(a.w, a.h));
    p.drawImage(artCanvas(a), (96 - a.w * s) / 2, (96 - a.h * s) / 2, a.w * s, a.h * s);
  };

  const setPixel = (a: PixelArt, x: number, y: number, ch: string) => {
    const i = y * a.w + x;
    a.data = a.data.slice(0, i) + ch + a.data.slice(i + 1);
  };
  const flood = (a: PixelArt, x0: number, y0: number, ch: string) => {
    const target = a.data[y0 * a.w + x0];
    if (target === ch) return;
    const cells = a.data.split('');
    const stack = [[x0, y0]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= a.w || y >= a.h || cells[y * a.w + x] !== target) continue;
      cells[y * a.w + x] = ch;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    a.data = cells.join('');
  };
  const cellAt = (e: PointerEvent): [number, number] | null => {
    const a = art();
    if (!a) return null;
    const r = canvas.getBoundingClientRect();
    const cs = r.width / Math.max(a.w, a.h);
    const x = Math.floor((e.clientX - r.left) / cs);
    const y = Math.floor((e.clientY - r.top) / cs);
    return x >= 0 && y >= 0 && x < a.w && y < a.h ? [x, y] : null;
  };
  const apply = (e: PointerEvent) => {
    const a = art();
    const c = cellAt(e);
    if (!a || !c) return;
    const [x, y] = c;
    if (tool === 'picker') {
      const ch = a.data[y * a.w + x];
      if (ch !== TRANSPARENT) color = parseInt(ch, 16);
      tool = 'pencil';
      renderTools();
      return;
    }
    if (tool === 'fill') flood(a, x, y, color.toString(16));
    else setPixel(a, x, y, tool === 'eraser' ? TRANSPARENT : color.toString(16));
    drawCanvas();
  };
  let painting = false;
  canvas.addEventListener('pointerdown', (e) => {
    const a = art();
    if (!a) return;
    undo.push(a.data);
    if (undo.length > 50) undo.shift();
    painting = tool === 'pencil' || tool === 'eraser';
    canvas.setPointerCapture(e.pointerId);
    apply(e);
    if (!painting) commit();
  });
  canvas.addEventListener('pointermove', (e) => painting && apply(e));
  canvas.addEventListener('pointerup', () => {
    if (painting) commit();
    painting = false;
  });

  // ── 목록 ──
  const renderList = () => {
    const items = Object.keys(arts).map((name) => {
      const thumb = el('canvas', { width: 32, height: 32 });
      const tc = thumb.getContext('2d')!;
      tc.imageSmoothingEnabled = false;
      const a = arts[name];
      const s = 32 / Math.max(a.w, a.h);
      tc.drawImage(artCanvas(a), 0, 0, a.w * s, a.h * s);
      const b = el('button', { className: `px-item${name === current ? ' on' : ''}` }, thumb, el('span', { textContent: name }));
      b.addEventListener('click', () => {
        current = name;
        undo.length = 0;
        renderAll();
      });
      return b;
    });
    const add = el('button', { className: 'km-add', textContent: t.add });
    add.addEventListener('click', () => {
      let i = Object.keys(arts).length + 1;
      while (arts[`그림${i}`]) i++;
      current = `그림${i}`;
      arts[current] = blankArt(16, 16);
      undo.length = 0;
      commit();
      renderAll();
    });
    list.replaceChildren(el('div', { className: 'px-h', textContent: t.mine }), ...(items.length ? items : [el('div', { className: 'px-empty', textContent: t.none })]), add);
  };

  // ── 도구 ──
  const renderTools = () => {
    const toolBtn = (k: Tool, icon: string, label: string) => {
      const b = el('button', { className: `px-tool${tool === k ? ' on' : ''}`, title: label, textContent: icon });
      b.addEventListener('click', () => {
        tool = k;
        renderTools();
      });
      return b;
    };
    const swatches = PALETTE.map((hex, i) => {
      const b = el('button', { className: `px-sw${color === i && tool !== 'eraser' ? ' on' : ''}`, title: hex });
      b.style.background = hex;
      b.addEventListener('click', () => {
        color = i;
        if (tool === 'eraser' || tool === 'picker') tool = 'pencil';
        renderTools();
      });
      return b;
    });
    const action = (icon: string, label: string, fn: (a: PixelArt) => void) => {
      const b = el('button', { className: 'px-act', title: label, textContent: `${icon} ${label}` });
      b.addEventListener('click', () => {
        const a = art();
        if (!a) return;
        undo.push(a.data);
        fn(a);
        drawCanvas();
        commit();
      });
      return b;
    };
    const undoBtn = el('button', { className: 'px-act', textContent: `↶ ${t.undo}` });
    undoBtn.addEventListener('click', () => {
      const a = art();
      const prev = undo.pop();
      if (a && prev !== undefined) {
        a.data = prev;
        drawCanvas();
        commit();
      }
    });
    const from = el('select', { className: 'px-from' });
    from.append(el('option', { value: '', textContent: `🎨 ${t.fromNone}` }));
    for (const [k, v] of Object.entries(COSTUMES)) if (k !== 'hidden') from.append(el('option', { value: k, textContent: v }));
    from.addEventListener('change', () => {
      const a = art();
      if (a && from.value) {
        undo.push(a.data);
        a.data = rasterizeCostume(from.value, a.w, a.h).data;
        drawCanvas();
        commit();
      }
      from.value = '';
    });
    tools.replaceChildren(
      el('div', { className: 'px-row' }, toolBtn('pencil', '✏️', t.pencil), toolBtn('eraser', '🧽', t.eraser), toolBtn('fill', '🪣', t.fill), toolBtn('picker', '💧', t.picker)),
      el('div', { className: 'px-pal' }, ...swatches),
      undoBtn,
      action('↔', t.flipH, (a) => {
        let d = '';
        for (let y = 0; y < a.h; y++) d += a.data.slice(y * a.w, (y + 1) * a.w).split('').reverse().join('');
        a.data = d;
      }),
      action('↕', t.flipV, (a) => {
        let d = '';
        for (let y = a.h - 1; y >= 0; y--) d += a.data.slice(y * a.w, (y + 1) * a.w);
        a.data = d;
      }),
      action('🗑', t.clear, (a) => (a.data = TRANSPARENT.repeat(a.w * a.h))),
      from,
      el('div', { className: 'px-h', textContent: t.preview }),
      preview,
    );
    drawPreview();
  };

  // ── 이름·크기·삭제 ──
  const renderMeta = () => {
    const a = art();
    if (!a || !current) {
      footer.replaceChildren();
      return;
    }
    const name = el('input', { value: current, maxLength: 20 });
    const msg = el('span', { className: 'px-msg' });
    name.addEventListener('change', () => {
      const nv = name.value.trim();
      if (nv === current) return;
      if (!NAME_RE.test(nv)) return void (msg.textContent = t.badName);
      if (arts[nv]) return void (msg.textContent = t.dupName);
      msg.textContent = '';
      arts[nv] = arts[current!];
      delete arts[current!];
      hooks.onRename(current!, nv);
      current = nv;
      commit();
    });
    const size = el('select');
    for (const s of SIZES) size.append(el('option', { value: String(s), textContent: `${s}×${s}`, selected: a.w === s }));
    size.addEventListener('change', () => {
      const n = Number(size.value);
      undo.length = 0;
      // 왼쪽 위 기준으로 자르거나 투명하게 늘린다
      let d = '';
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) d += x < a.w && y < a.h ? a.data[y * a.w + x] : TRANSPARENT;
      arts[current!] = { w: n, h: n, data: d };
      drawCanvas();
      commit();
    });
    const del = el('button', { className: 'px-act danger', textContent: `🗑 ${t.del}` });
    del.addEventListener('click', () => {
      if (!confirm(t.confirmDel(current!))) return;
      delete arts[current!];
      current = Object.keys(arts)[0] ?? null;
      commit();
      renderAll();
    });
    footer.replaceChildren(el('label', {}, `${t.name} `, name), el('label', {}, `${t.size} `, size), del, msg);
  };

  const renderAll = () => {
    renderList();
    renderTools();
    renderMeta();
    drawCanvas();
  };

  const close = el('button', { className: 'btn play', textContent: t.close });
  close.addEventListener('click', () => dialog.close());
  dialog.classList.add('px-dialog');
  dialog.replaceChildren(
    el('h2', { textContent: t.title }),
    el('div', { className: 'help', textContent: t.help }),
    el('div', { className: 'px-body' }, list, el('div', { className: 'px-center' }, canvas, footer), tools),
    el('div', { className: 'km-foot' }, el('span'), close),
  );
  dialog.addEventListener('close', () => dialog.classList.remove('px-dialog'), { once: true });
  renderAll();
  dialog.showModal();
}
