// 픽셀 그림 한 장을 고치는 편집기 (MakeCode 이미지 편집기처럼): 연필·지우개·채우기·스포이트, 16색, 되돌리기·뒤집기.
// 모양 탭(assetPanel)이 그림 목록과 이름을 관리하고, 이 편집기는 고르고 있는 그림 한 장만 다룬다.

import { ko } from '../i18n/ko';
import { COSTUMES } from '../render/catalog';
import { PALETTE, TRANSPARENT, type PixelArt } from '../render/pixelArt';
import { artCanvas, rasterizeCostume } from '../render/pixelDraw';
import { el } from './dom';

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker';
const SIZES = [8, 16, 24, 32];

export interface PixelCanvasHooks {
  get(): PixelArt;
  /** 칠하기 한 번이 끝날 때마다 (마우스를 뗄 때) */
  set(a: PixelArt): void;
}

export class PixelCanvas {
  private tool: Tool = 'pencil';
  private color = 4;
  private undo: string[] = [];
  private canvas = el('canvas', { className: 'px-canvas', width: 384, height: 384 });
  private ctx = this.canvas.getContext('2d')!;
  private tools = el('div', { className: 'px-tools' });
  private preview = el('canvas', { className: 'px-preview', width: 96, height: 96 });
  private sizeSel = el('select');
  /** 칠하는 중인 그림 (마우스를 떼면 hooks.set 으로 넘긴다) */
  private art: PixelArt;
  private last: [number, number] | null = null;

  constructor(
    root: HTMLElement,
    private hooks: PixelCanvasHooks,
  ) {
    this.art = structuredClone(hooks.get());
    this.bindCanvas();
    this.sizeSel.addEventListener('change', () => this.resize(Number(this.sizeSel.value)));
    root.replaceChildren(
      el('div', { className: 'px-center' }, this.canvas, el('label', { className: 'px-size' }, `${ko.paint.size} `, this.sizeSel)),
      this.tools,
    );
    this.renderTools();
    this.draw();
  }

  /** 다른 그림을 고르면 */
  load(): void {
    this.art = structuredClone(this.hooks.get());
    this.undo = [];
    this.renderTools();
    this.draw();
  }

  private commit(): void {
    this.hooks.set(structuredClone(this.art));
    this.drawPreview();
  }

  private cell(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const n = Math.max(this.art.w, this.art.h);
    const cs = r.width / n;
    return [Math.floor((e.clientX - r.left) / cs), Math.floor((e.clientY - r.top) / cs)];
  }

  private setPixel(x: number, y: number, ch: string): void {
    const a = this.art;
    if (x < 0 || y < 0 || x >= a.w || y >= a.h) return;
    const i = y * a.w + x;
    if (a.data[i] !== ch) a.data = a.data.slice(0, i) + ch + a.data.slice(i + 1);
  }

  /** 두 칸 사이를 빈틈없이 잇는다 (마우스를 빨리 움직여도 선이 끊기지 않게) */
  private line(x0: number, y0: number, x1: number, y1: number, ch: string): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.setPixel(x0, y0, ch);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  private flood(x0: number, y0: number, ch: string): void {
    const a = this.art;
    if (x0 < 0 || y0 < 0 || x0 >= a.w || y0 >= a.h) return;
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
  }

  private bindCanvas(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const [x, y] = this.cell(e);
      if (this.tool === 'picker') {
        const ch = this.art.data[y * this.art.w + x];
        if (ch && ch !== TRANSPARENT) this.color = parseInt(ch, 16);
        this.tool = 'pencil';
        this.renderTools();
        return;
      }
      this.undo.push(this.art.data);
      if (this.undo.length > 50) this.undo.shift();
      if (this.tool === 'fill') {
        this.flood(x, y, this.color.toString(16));
        this.draw();
        this.commit();
        return;
      }
      c.setPointerCapture(e.pointerId);
      this.last = [x, y];
      this.setPixel(x, y, this.ink());
      this.draw();
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.last) return;
      const [x, y] = this.cell(e);
      this.line(this.last[0], this.last[1], x, y, this.ink());
      this.last = [x, y];
      this.draw();
    });
    const end = () => {
      if (!this.last) return;
      this.last = null;
      this.commit();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  private ink(): string {
    return this.tool === 'eraser' ? TRANSPARENT : this.color.toString(16);
  }

  private resize(n: number): void {
    const a = this.art;
    this.undo = [];
    // 왼쪽 위 기준으로 자르거나 투명하게 늘린다
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) d += x < a.w && y < a.h ? a.data[y * a.w + x] : TRANSPARENT;
    this.art = { w: n, h: n, data: d };
    this.draw();
    this.commit();
  }

  private draw(): void {
    const a = this.art;
    const ctx = this.ctx;
    const V = this.canvas.width;
    ctx.clearRect(0, 0, V, V);
    const cs = V / Math.max(a.w, a.h);
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
  }

  private drawPreview(): void {
    const p = this.preview.getContext('2d')!;
    p.clearRect(0, 0, 96, 96);
    const a = this.art;
    p.imageSmoothingEnabled = false;
    const s = Math.floor(96 / Math.max(a.w, a.h));
    p.drawImage(artCanvas(a), (96 - a.w * s) / 2, (96 - a.h * s) / 2, a.w * s, a.h * s);
  }

  private renderTools(): void {
    const t = ko.paint;
    const toolBtn = (k: Tool, icon: string, label: string) => {
      const b = el('button', { className: `px-tool${this.tool === k ? ' on' : ''}`, title: label, textContent: icon });
      b.addEventListener('click', () => {
        this.tool = k;
        this.renderTools();
      });
      return b;
    };
    const swatches = PALETTE.map((hex, i) => {
      const b = el('button', { className: `px-sw${this.color === i && this.tool !== 'eraser' ? ' on' : ''}`, title: hex });
      b.style.background = hex;
      b.addEventListener('click', () => {
        this.color = i;
        if (this.tool === 'eraser' || this.tool === 'picker') this.tool = 'pencil';
        this.renderTools();
      });
      return b;
    });
    const action = (label: string, fn: () => void) => {
      const b = el('button', { className: 'px-act', textContent: label });
      b.addEventListener('click', () => {
        this.undo.push(this.art.data);
        fn();
        this.draw();
        this.commit();
      });
      return b;
    };
    const undoBtn = el('button', { className: 'px-act', textContent: `↶ ${t.undo}` });
    undoBtn.addEventListener('click', () => {
      const prev = this.undo.pop();
      if (prev === undefined) return;
      this.art.data = prev;
      this.draw();
      this.commit();
    });
    const from = el('select', { className: 'px-from' });
    from.append(el('option', { value: '', textContent: `🎨 ${t.fromNone}` }));
    for (const [k, v] of Object.entries(COSTUMES)) if (k !== 'hidden') from.append(el('option', { value: k, textContent: v }));
    from.addEventListener('change', () => {
      if (!from.value) return;
      this.undo.push(this.art.data);
      this.art.data = rasterizeCostume(from.value, this.art.w, this.art.h).data;
      from.value = '';
      this.draw();
      this.commit();
    });
    this.sizeSel.replaceChildren(...SIZES.map((s) => el('option', { value: String(s), textContent: `${s}×${s}`, selected: this.art.w === s })));
    this.tools.replaceChildren(
      el(
        'div',
        { className: 'px-row' },
        toolBtn('pencil', '✏️', t.pencil),
        toolBtn('eraser', '🧽', t.eraser),
        toolBtn('fill', '🪣', t.fill),
        toolBtn('picker', '💧', t.picker),
      ),
      el('div', { className: 'px-pal' }, ...swatches),
      undoBtn,
      action(`↔ ${t.flipH}`, () => {
        const a = this.art;
        let d = '';
        for (let y = 0; y < a.h; y++) d += a.data.slice(y * a.w, (y + 1) * a.w).split('').reverse().join('');
        a.data = d;
      }),
      action(`↕ ${t.flipV}`, () => {
        const a = this.art;
        let d = '';
        for (let y = a.h - 1; y >= 0; y--) d += a.data.slice(y * a.w, (y + 1) * a.w);
        a.data = d;
      }),
      action(`🗑 ${t.clear}`, () => (this.art.data = TRANSPARENT.repeat(this.art.w * this.art.h))),
      from,
      el('div', { className: 'px-h', textContent: t.preview }),
      this.preview,
    );
    this.drawPreview();
  }
}
