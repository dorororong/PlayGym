// 📍 위치 고르기: 블록의 📍 를 누르고 게임 화면을 누르면 x, y 가 들어간다 (MakeCode 의 위치 고르기처럼,
// 다만 작은 그림 대신 바로 옆의 실제 게임 화면을 쓴다). 눈 블록은 두 번 누른다: 자리 → 바라볼 곳(방향·거리).
// 게임 화면 위에 마우스를 올리면 언제나 좌표가 보인다.

import type * as BlocklyTypes from 'blockly/core';
import { Blockly } from '../blocks/blockly';
import { WORLD_H, WORLD_W } from '../engine/types';
import { ko } from '../i18n/ko';
import { el } from './dom';

export interface PickerHooks {
  /** 태그의 첫 객체 (붙은 눈의 기준, 위치 블록의 미리보기 크기) */
  findObject(tag: string): { x: number; y: number; w: number; h: number } | null;
  log(text: string): void;
}

const SVG = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};
const round = (v: number) => Math.round(v);

export class Picker {
  private coord = el('div', { className: 'coord-readout' });
  private active: (() => void) | null = null;

  constructor(
    private screen: HTMLElement,
    private canvas: HTMLCanvasElement,
    private hooks: PickerHooks,
  ) {
    this.coord.hidden = true;
    screen.append(this.coord);
    screen.addEventListener('mousemove', (e) => {
      if (this.active) return;
      const p = this.toWorld(e);
      this.coord.hidden = !p;
      if (p) this.coord.textContent = `x ${round(p.x)} · y ${round(p.y)}`;
    });
    screen.addEventListener('mouseleave', () => (this.coord.hidden = true));
  }

  /** 화면 좌표 → 월드 좌표 (캔버스 밖이면 null) */
  private toWorld(e: MouseEvent): { x: number; y: number } | null {
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * WORLD_W;
    const y = ((e.clientY - r.top) / r.height) * WORLD_H;
    return x < 0 || y < 0 || x > WORLD_W || y > WORLD_H ? null : { x, y };
  }

  cancel(): void {
    this.active?.();
  }

  start(block: BlocklyTypes.Block): void {
    this.cancel();
    const t = ko.picker;
    const isEye = block.type === 'pg_s_eye' || block.type === 'pg_s_eye_on';
    // 붙은 눈: x, y 는 기준 객체에서 옮긴 만큼
    let base: { x: number; y: number } | null = null;
    if (block.type === 'pg_s_eye_on') {
      const tag = block.getField('BASE')?.getText() ?? '';
      base = this.hooks.findObject(tag);
      if (!base) {
        this.hooks.log(t.noBase(tag));
        return;
      }
    }
    // 미리보기 상자 크기
    const numIn = (name: string) => {
      const c = block.getInputTargetBlock(name);
      return c?.type === 'math_number' ? Number(c.getFieldValue('NUM')) : null;
    };
    let gw = 16;
    let gh = 16;
    if (block.type === 'pg_create') {
      gw = numIn('W') ?? 20;
      gh = numIn('H') ?? 20;
    } else if (block.type === 'pg_set_pos') {
      const tb = block.getInputTargetBlock('T');
      const o = tb?.type === 'pg_tag' ? this.hooks.findObject(tb.getField('TAG')?.getText() ?? '') : null;
      if (o) [gw, gh] = [o.w, o.h];
    }

    // 덮개: viewBox 가 월드 좌표라 확대와 상관없이 그대로 그린다
    const layer = svg('svg', { class: 'pick-layer', viewBox: `0 0 ${WORLD_W} ${WORLD_H}`, preserveAspectRatio: 'none' });
    for (let x = 50; x < WORLD_W; x += 50) layer.append(svg('line', { x1: x, y1: 0, x2: x, y2: WORLD_H, class: 'pk-grid' }));
    for (let y = 50; y < WORLD_H; y += 50) layer.append(svg('line', { x1: 0, y1: y, x2: WORLD_W, y2: y, class: 'pk-grid' }));
    const hLine = svg('line', { x1: 0, x2: WORLD_W, class: 'pk-cross' });
    const vLine = svg('line', { y1: 0, y2: WORLD_H, class: 'pk-cross' });
    const ghost = svg('rect', { class: 'pk-ghost', width: gw, height: gh });
    const look = svg('line', { class: 'pk-look' });
    const eye = svg('circle', { class: 'pk-eye', r: 4 });
    const text = svg('text', { class: 'pk-text' });
    if (isEye) ghost.setAttribute('display', 'none');
    look.setAttribute('display', 'none');
    eye.setAttribute('display', 'none');
    layer.append(hLine, vLine, ghost, look, eye, text);
    const banner = el('div', { className: 'pick-banner', textContent: isEye ? t.eyeStep1 : t.place });
    this.screen.append(layer, banner);
    this.screen.classList.add('picking');

    let step = 1;
    let p1 = { x: 0, y: 0 };
    const clampW = (p: { x: number; y: number }) => ({ x: Math.max(0, Math.min(WORLD_W, p.x)), y: Math.max(0, Math.min(WORLD_H, p.y)) });
    const at = (e: MouseEvent) => {
      const r = this.canvas.getBoundingClientRect();
      return clampW({ x: ((e.clientX - r.left) / r.width) * WORLD_W, y: ((e.clientY - r.top) / r.height) * WORLD_H });
    };
    const lookOf = (p: { x: number; y: number }) => {
      const deg = ((round((Math.atan2(-(p.y - p1.y), p.x - p1.x) * 180) / Math.PI) % 360) + 360) % 360;
      return { deg, dist: Math.max(10, round(Math.hypot(p.x - p1.x, p.y - p1.y))) };
    };

    const move = (e: MouseEvent) => {
      const p = at(e);
      hLine.setAttribute('y1', String(p.y));
      hLine.setAttribute('y2', String(p.y));
      vLine.setAttribute('x1', String(p.x));
      vLine.setAttribute('x2', String(p.x));
      ghost.setAttribute('x', String(p.x - gw / 2));
      ghost.setAttribute('y', String(p.y - gh / 2));
      let label = `x ${round(p.x)}, y ${round(p.y)}`;
      if (step === 2) {
        look.setAttribute('x2', String(p.x));
        look.setAttribute('y2', String(p.y));
        const l = lookOf(p);
        label = `${l.deg}° · ${t.dist} ${l.dist}`;
      }
      text.textContent = label;
      text.setAttribute('x', String(Math.min(p.x + 8, WORLD_W - 70)));
      text.setAttribute('y', String(Math.max(p.y - 8, 14)));
    };

    const setNum = (input: string, v: number) => {
      const c = block.getInputTargetBlock(input);
      if (c?.type !== 'math_number') return false;
      c.setFieldValue(String(v), 'NUM');
      return true;
    };
    const apply = (fn: () => void) => {
      Blockly.Events.setGroup(true);
      try {
        fn();
      } finally {
        Blockly.Events.setGroup(false);
      }
    };

    const click = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const p = at(e);
      if (!isEye) {
        let ok = true;
        apply(() => {
          ok = setNum('X', round(p.x)) && ok;
          ok = setNum('Y', round(p.y)) && ok;
        });
        this.hooks.log(ok ? t.done(round(p.x), round(p.y)) : t.notNumber);
        finish();
        return;
      }
      if (step === 1) {
        p1 = p;
        step = 2;
        banner.textContent = t.eyeStep2;
        for (const [k, v] of [['x1', p.x], ['y1', p.y], ['x2', p.x], ['y2', p.y]] as const) look.setAttribute(k, String(v));
        look.removeAttribute('display');
        eye.setAttribute('cx', String(p.x));
        eye.setAttribute('cy', String(p.y));
        eye.removeAttribute('display');
        return;
      }
      const l = lookOf(p);
      const x = round(base ? p1.x - base.x : p1.x);
      const y = round(base ? p1.y - base.y : p1.y);
      apply(() => {
        block.setFieldValue(x, 'X');
        block.setFieldValue(y, 'Y');
        block.setFieldValue(l.deg, 'DEG');
        block.setFieldValue(l.dist, 'MAXDIST');
      });
      this.hooks.log(t.eyeDone(x, y, l.deg, l.dist));
      finish();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    const outside = (e: PointerEvent) => {
      if (!layer.contains(e.target as Node)) finish();
    };
    const finish = () => {
      layer.remove();
      banner.remove();
      this.screen.classList.remove('picking');
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', outside, true);
      this.active = null;
    };
    layer.addEventListener('mousemove', move);
    layer.addEventListener('click', click);
    layer.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      finish();
    });
    document.addEventListener('keydown', key, true);
    // 📍 를 누른 바로 그 동작에 닫히지 않게 다음 차례부터
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    this.coord.hidden = true;
    this.active = finish;
  }
}
