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

export class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** 컨테이너 크기에 맞춰 400×300 비율을 유지하며 확대 */
  fit(container: HTMLElement): void {
    const r = container.getBoundingClientRect();
    // 테두리 장식(약 6px) 만큼 여유를 둔다
    const scale = Math.max(0.5, Math.min((r.width - 16) / WORLD_W, (r.height - 16) / WORLD_H));
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${Math.floor(WORLD_W * scale)}px`;
    this.canvas.style.height = `${Math.floor(WORLD_H * scale)}px`;
    this.canvas.width = Math.floor(WORLD_W * scale * dpr);
    this.canvas.height = Math.floor(WORLD_H * scale * dpr);
  }

  draw(world: Readonly<WorldState>, opt: RenderOptions): void {
    const { ctx, canvas } = this;
    ctx.setTransform(canvas.width / WORLD_W, 0, 0, canvas.height / WORLD_H, 0, 0);
    if (!drawBackdrop(ctx, opt.backdrop, world.frame)) {
      ctx.fillStyle = opt.background;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    for (const o of world.objects) {
      if (!o.alive) continue;
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
      if (world.behaviors[o.tag]?.wrap) {
        const dx = o.x - o.w / 2 < 0 ? WORLD_W : o.x + o.w / 2 > WORLD_W ? -WORLD_W : 0;
        const dy = o.y - o.h / 2 < 0 ? WORLD_H : o.y + o.h / 2 > WORLD_H ? -WORLD_H : 0;
        if (dx) paint({ ...o, x: o.x + dx });
        if (dy) paint({ ...o, y: o.y + dy });
      }
    }

    if (opt.overlay) {
      this.drawHitboxes(world);
      this.drawOverlay(opt.overlay);
    }
  }

  /** 엔진이 실제로 쓰는 충돌 사각형. 그림이 어떻든 판정은 이 사각형이다 */
  private drawHitboxes(world: Readonly<WorldState>): void {
    const { ctx } = this;
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
    const { ctx } = this;
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
