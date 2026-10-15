// Canvas 2D 렌더러. env.getWorld() 를 읽어 그리기만 한다 (엔진 상태를 바꾸지 않는다).

import type { DebugShape } from '../engine/sensors';
import { WORLD_H, WORLD_W, type GameObject, type WorldState } from '../engine/types';
import { drawBackdrop } from './backdrops';
import { drawCostume } from './costumes';
import { CUSTOM_PREFIX, customCostumes } from './pixelArt';
import { drawArt } from './pixelDraw';

export interface RenderOptions {
  background: string;
  backdrop: string;
  /** AI 시야: 센서 도형. null 이면 끄기 (켜면 충돌 사각형도 함께 그린다) */
  overlay: DebugShape[] | null;
}

/** 레트로 화면의 픽셀 수. 월드 좌표(400×300)는 그대로이고, 그리는 해상도만 낮춘다 */
export const RETRO_W = 200;
export const RETRO_H = 150;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private octx: CanvasRenderingContext2D;
  private cssW = WORLD_W;
  private cssH = WORLD_H;
  private overlayDrawn = false;
  /** true 면 200×150 픽셀로 그려서 크게 확대 (아케이드 느낌). false 면 화면 해상도 그대로 */
  retro = true;

  /** canvas: 게임 그림. overlay: AI 시야(센서·충돌 사각형)는 레트로일 때도 선명하게 따로 그린다 */
  constructor(
    private canvas: HTMLCanvasElement,
    private overlay: HTMLCanvasElement,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.octx = overlay.getContext('2d')!;
  }

  /** 컨테이너를 꽉 채우도록 4:3 비율을 유지하며 확대 */
  fit(container: HTMLElement): void {
    const r = container.getBoundingClientRect();
    // 테두리 장식(약 6px) 만큼 여유를 둔다
    const scale = Math.max(0.5, Math.min((r.width - 14) / WORLD_W, (r.height - 14) / WORLD_H));
    this.cssW = Math.floor(WORLD_W * scale);
    this.cssH = Math.floor(WORLD_H * scale);
    for (const c of [this.canvas, this.overlay]) {
      c.style.width = `${this.cssW}px`;
      c.style.height = `${this.cssH}px`;
    }
    this.applyResolution();
  }

  setRetro(on: boolean): void {
    this.retro = on;
    this.applyResolution();
  }

  private applyResolution(): void {
    const dpr = window.devicePixelRatio || 1;
    const set = (c: HTMLCanvasElement, w: number, h: number) => {
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
    };
    if (this.retro) set(this.canvas, RETRO_W, RETRO_H);
    else set(this.canvas, Math.floor(this.cssW * dpr), Math.floor(this.cssH * dpr));
    this.canvas.classList.toggle('retro', this.retro);
    set(this.overlay, Math.floor(this.cssW * dpr), Math.floor(this.cssH * dpr));
    this.overlayDrawn = true; // 크기를 바꾸면 지워진다 → 다음 draw 에서 다시
  }

  draw(world: Readonly<WorldState>, opt: RenderOptions): void {
    const { ctx, canvas } = this;
    ctx.setTransform(canvas.width / WORLD_W, 0, 0, canvas.height / WORLD_H, 0, 0);
    ctx.imageSmoothingEnabled = !this.retro;
    if (!drawBackdrop(ctx, opt.backdrop, world.frame)) {
      ctx.fillStyle = opt.background;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    for (const o of this.layered(world)) {
      const name = world.costumes[o.tag];
      const art = name?.startsWith(CUSTOM_PREFIX) ? customCostumes()[name.slice(CUSTOM_PREFIX.length)] : undefined;
      const paint = (obj: GameObject) => {
        ctx.save();
        if (art) drawArt(ctx, art, obj);
        else drawCostume(ctx, name, obj, world.frame);
        ctx.restore();
      };
      paint(o);
      // 화면 반대편으로 이어지는 객체는 경계에 걸치면 반대쪽에도 그린다 (seamless)
      const wrapMode = world.behaviors[o.tag]?.wrap;
      if (wrapMode) {
        const dx = o.x - o.w / 2 < 0 ? WORLD_W : o.x + o.w / 2 > WORLD_W ? -WORLD_W : 0;
        const dy = wrapMode === 'x' ? 0 : o.y - o.h / 2 < 0 ? WORLD_H : o.y + o.h / 2 > WORLD_H ? -WORLD_H : 0;
        if (dx) paint({ ...o, x: o.x + dx });
        if (dy) paint({ ...o, y: o.y + dy });
      }
    }

    const o = this.octx;
    if (opt.overlay) {
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.clearRect(0, 0, this.overlay.width, this.overlay.height);
      o.setTransform(this.overlay.width / WORLD_W, 0, 0, this.overlay.height / WORLD_H, 0, 0);
      this.drawHitboxes(world);
      this.drawOverlay(opt.overlay);
      this.overlayDrawn = true;
    } else if (this.overlayDrawn) {
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.clearRect(0, 0, this.overlay.width, this.overlay.height);
      this.overlayDrawn = false;
    }
  }

  /**
   * 그리는 순서: 태그가 처음 나타난 순서대로 겹친다 (먼저 만든 태그가 아래).
   * 그래서 나중에 새로 만든 길(도로)이 처음부터 있던 닭을 가리지 않는다.
   */
  private tagOrder = new Map<string, number>();
  private lastFrame = -1;

  private layered(world: Readonly<WorldState>): GameObject[] {
    if (world.frame < this.lastFrame || world.frame === 0) this.tagOrder.clear();
    this.lastFrame = world.frame;
    const live = world.objects.filter((o) => o.alive);
    for (const o of live) if (!this.tagOrder.has(o.tag)) this.tagOrder.set(o.tag, this.tagOrder.size);
    // 정렬은 안정적이라 같은 태그끼리는 만든 순서가 유지된다
    return live.sort((a, b) => this.tagOrder.get(a.tag)! - this.tagOrder.get(b.tag)!);
  }

  /** 엔진이 실제로 쓰는 충돌 사각형. 그림이 어떻든 판정은 이 사각형이다 */
  private drawHitboxes(world: Readonly<WorldState>): void {
    const ctx = this.octx;
    ctx.save();
    ctx.lineWidth = 0.75;
    ctx.setLineDash([2, 2]);
    for (const o of world.objects) {
      if (!o.alive) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineDashOffset = 2;
      ctx.strokeRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
      ctx.lineDashOffset = 0;
    }
    ctx.restore();
  }

  private drawOverlay(shapes: DebugShape[]): void {
    const ctx = this.octx;
    ctx.save();
    ctx.lineWidth = 1;
    for (const s of shapes) {
      if (s.type === 'ray') {
        // 가까울수록 진한 색
        const a = s.hit ? 0.35 + 0.65 * (1 - s.t) : 0.25;
        ctx.strokeStyle = s.hit ? `rgba(255,60,120,${a})` : `rgba(255,170,0,${a})`;
        ctx.beginPath();
        ctx.moveTo(s.x0, s.y0);
        ctx.lineTo(s.x1, s.y1);
        ctx.stroke();
        if (s.hit) {
          ctx.fillStyle = `rgba(255,40,100,${a})`;
          ctx.beginPath();
          ctx.arc(s.x1, s.y1, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (s.type === 'cell') {
        // 격자 센서: 대상이 있는 칸은 채우고, 칸 경계는 옅게
        ctx.fillStyle = s.on ? 'rgba(255,60,120,0.28)' : 'rgba(0,0,0,0)';
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = 'rgba(0,160,255,0.35)';
        ctx.strokeRect(s.x, s.y, s.w, s.h);
      } else {
        ctx.strokeStyle = 'rgba(0,160,255,0.9)';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(s.x0, s.y0);
        ctx.lineTo(s.x1, s.y1);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }
}
