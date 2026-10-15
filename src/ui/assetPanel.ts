// 모양(에셋) 탭: 이 게임에서 쓸 모양을 갤러리에서 골라 활성화하고, 내 그림을 그리고, 태그에 입힌다.
// 활성화한 모양만 블록의 "모양" 목록에 나온다 (목록이 너무 길지 않게).

import type { GameObject } from '../engine/types';
import { ko } from '../i18n/ko';
import { COSTUMES } from '../render/catalog';
import { drawCostume } from '../render/costumes';
import { CUSTOM_PREFIX, blankArt, type PixelArt } from '../render/pixelArt';
import { drawArt } from '../render/pixelDraw';
import { el } from './dom';
import { PixelCanvas } from './pixelCanvas';

export interface AssetHooks {
  costumes(): Record<string, PixelArt>;
  setCostumes(c: Record<string, PixelArt>): void;
  /** 활성화한 모양 키 ('dino', 'px:그림1' …) */
  active(): string[];
  setActive(list: string[]): void;
  /** 모양 키 → 그 모양을 입은 태그들 (블록에서 읽음) */
  usage(): Map<string, string[]>;
  tags(): string[];
  applyToTag(key: string, tag: string): void;
  renameDrawing(from: string, to: string): void;
}

const NAME_RE = /^[\p{L}\p{N}_]{1,20}$/u;

/** 모양 미리보기 (기본 모양은 코드로 그리고, 내 그림은 픽셀 그대로) */
function preview(key: string, arts: Record<string, PixelArt>, size = 56): HTMLCanvasElement {
  const c = el('canvas', { className: 'as-prev', width: size * 2, height: size * 2 });
  const ctx = c.getContext('2d')!;
  ctx.scale(2, 2);
  const o: GameObject = { id: 0, tag: '', x: size / 2, y: size / 2, w: size * 0.7, h: size * 0.7, vx: 1, vy: 0, color: '#4a90d9', onGround: true, alive: true };
  if (key.startsWith(CUSTOM_PREFIX)) {
    const a = arts[key.slice(CUSTOM_PREFIX.length)];
    if (a) drawArt(ctx, a, o);
  } else drawCostume(ctx, key, o, 0);
  return c;
}

export class AssetPanel {
  private selected: string | null = null;
  private left = el('div', { className: 'as-left' });
  private right = el('div', { className: 'as-right' });

  constructor(
    root: HTMLElement,
    private hooks: AssetHooks,
  ) {
    // 그림을 고르면 편집기가 위에, 모양 목록은 아래에
    root.replaceChildren(this.right, this.left);
  }

  /** 그림 하나를 골라 오른쪽 편집기에 연다 */
  edit(name: string | null): void {
    this.selected = name;
    this.render();
  }

  /** 새 그림을 만들어 바로 연다 */
  newDrawing(): void {
    const arts = { ...this.hooks.costumes() };
    let i = Object.keys(arts).length + 1;
    while (arts[`그림${i}`]) i++;
    const name = `그림${i}`;
    arts[name] = blankArt(16, 16);
    this.hooks.setCostumes(arts);
    this.hooks.setActive([...this.hooks.active(), CUSTOM_PREFIX + name]);
    this.edit(name);
  }

  render(): void {
    this.renderList();
    this.renderEditor();
  }

  /** 왼쪽: 쓰는 모양 · 더할 수 있는 모양 */
  private renderList(): void {
    const a = ko.assets;
    const arts = this.hooks.costumes();
    const active = this.hooks.active();
    const usage = this.hooks.usage();
    const tags = this.hooks.tags();
    const label = (key: string) => (key.startsWith(CUSTOM_PREFIX) ? `🖌️ ${key.slice(CUSTOM_PREFIX.length)}` : COSTUMES[key as keyof typeof COSTUMES] ?? key);

    // ── 이 게임에서 쓰는 모양 ──
    const cards = active.map((key) => {
      const used = usage.get(key) ?? [];
      const isArt = key.startsWith(CUSTOM_PREFIX);
      const apply = el('select', { className: 'as-apply', title: a.applyHint });
      apply.append(el('option', { value: '', textContent: a.apply }), ...tags.map((t) => el('option', { value: t, textContent: t })));
      apply.addEventListener('change', () => {
        if (apply.value) this.hooks.applyToTag(key, apply.value);
      });
      const remove = el('button', { className: 'as-x', textContent: '✕', title: used.length ? a.inUse(used.join(', ')) : a.remove, disabled: used.length > 0 || key === 'box' });
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hooks.setActive(active.filter((k) => k !== key));
        this.renderList();
      });
      const card = el(
        'div',
        { className: `as-card${isArt && this.selected === key.slice(CUSTOM_PREFIX.length) ? ' on' : ''}${isArt ? ' art' : ''}` },
        remove,
        preview(key, arts),
        el('div', { className: 'as-name', textContent: label(key) }),
        el('div', { className: 'as-used' }, ...(used.length ? used.map((t) => el('span', { textContent: t })) : [el('small', { textContent: a.unused })])),
        apply,
      );
      if (isArt) card.addEventListener('click', (e) => !(e.target instanceof HTMLSelectElement) && this.edit(key.slice(CUSTOM_PREFIX.length)));
      return card;
    });

    // ── 모양 더하기: 기본 모양 갤러리 ──
    const gallery = Object.keys(COSTUMES)
      .filter((k) => k !== 'hidden' && !active.includes(k))
      .map((key) => {
        const b = el('button', { className: 'as-add', title: a.activate }, preview(key, arts, 44), el('span', { textContent: label(key) }));
        b.addEventListener('click', () => {
          this.hooks.setActive([...active, key]);
          this.renderList();
        });
        return b;
      });
    // 내 그림 중 비활성인 것
    const myInactive = Object.keys(arts)
      .filter((n) => !active.includes(CUSTOM_PREFIX + n))
      .map((n) => {
        const b = el('button', { className: 'as-add', title: a.activate }, preview(CUSTOM_PREFIX + n, arts, 44), el('span', { textContent: `🖌️ ${n}` }));
        b.addEventListener('click', () => {
          this.hooks.setActive([...active, CUSTOM_PREFIX + n]);
          this.renderList();
        });
        return b;
      });
    const draw = el('button', { className: 'btn play', innerHTML: `<span class="i">✏️</span>${a.newDrawing}` });
    draw.addEventListener('click', () => this.newDrawing());

    this.left.replaceChildren(
      el('div', { className: 'as-head' }, el('h3', { textContent: `🎨 ${a.title}` }), draw),
      el('div', { className: 'as-help', textContent: `${a.help} ${a.editHint}` }),
      el('div', { className: 'as-grid' }, ...cards),
      el('h3', { className: 'as-sub', textContent: `➕ ${a.more}` }),
      el('div', { className: 'as-help', textContent: a.moreHelp }),
      el('div', { className: 'as-gallery' }, ...myInactive, ...gallery),
    );
  }

  private renderEditor(): void {
    const a = ko.assets;
    const p = ko.paint;
    const name = this.selected;
    const arts = this.hooks.costumes();
    if (!name || !arts[name]) {
      this.right.replaceChildren();
      return;
    }
    const input = el('input', { className: 'as-rename', value: name, maxLength: 20, title: p.name });
    const msg = el('span', { className: 'px-msg' });
    input.addEventListener('change', () => {
      const nv = input.value.trim();
      if (nv === name) return;
      if (!NAME_RE.test(nv)) return void (msg.textContent = p.badName);
      if (this.hooks.costumes()[nv]) return void (msg.textContent = p.dupName);
      this.hooks.renameDrawing(name, nv);
      this.edit(nv);
    });
    const del = el('button', { className: 'px-act danger', textContent: `🗑 ${p.del}` });
    del.addEventListener('click', () => {
      if (!confirm(p.confirmDel(name))) return;
      const c = { ...this.hooks.costumes() };
      delete c[name];
      this.hooks.setCostumes(c);
      this.hooks.setActive(this.hooks.active().filter((k) => k !== CUSTOM_PREFIX + name));
      this.edit(null);
    });
    const body = el('div', { className: 'as-editor' });
    const close = el('button', { className: 'px-act', textContent: `✓ ${a.doneEditing}` });
    close.addEventListener('click', () => this.edit(null));
    this.right.replaceChildren(
      el('div', { className: 'as-edit-head' }, el('b', { textContent: '🖌️' }), input, del, msg, el('span', { className: 'spacer' }), close),
      el('div', { className: 'as-help', textContent: p.help }),
      body,
    );
    new PixelCanvas(body, {
      get: () => this.hooks.costumes()[name] ?? blankArt(),
      set: (art) => {
        this.hooks.setCostumes({ ...this.hooks.costumes(), [name]: art });
        this.renderList(); // 왼쪽 미리보기도 갱신 (편집기는 그대로)
      },
    });
  }
}
