// 픽셀 그림을 캔버스로: 그리기 캐시, 기본 모양을 픽셀 그림으로 바꾸기.

import type { GameObject } from '../engine/types';
import { drawCostume } from './costumes';
import { PALETTE, TRANSPARENT, type PixelArt } from './pixelArt';

const RGB = PALETTE.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
const cache = new Map<string, HTMLCanvasElement>();

/** 그림 한 장을 실제 픽셀 크기의 캔버스로 (같은 그림이면 재사용) */
export function artCanvas(a: PixelArt): HTMLCanvasElement {
  const key = `${a.w}x${a.h}:${a.data}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = a.w;
  c.height = a.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(a.w, a.h);
  for (let i = 0; i < a.data.length; i++) {
    const ch = a.data[i];
    if (ch === TRANSPARENT) continue;
    const [r, g, b] = RGB[parseInt(ch, 16)];
    img.data.set([r, g, b, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  if (cache.size > 200) cache.clear();
  cache.set(key, c);
  return c;
}

/** 객체 사각형에 맞춰 늘려 그린다 (픽셀이 흐려지지 않게) */
export function drawArt(ctx: CanvasRenderingContext2D, a: PixelArt, o: GameObject): void {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(artCanvas(a), o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
}

/** 기본(코드로 그린) 모양을 w×h 픽셀 그림으로 바꾼다. 편집기의 "기본 모양에서 시작" */
export function rasterizeCostume(name: string, w: number, h: number, color = '#e63946'): PixelArt {
  const scale = 4;
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  const o: GameObject = { id: 0, tag: '', x: w / 2, y: h / 2, w, h, vx: 0, vy: 0, color, onGround: true, alive: true };
  drawCostume(ctx, name, o, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  let data = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 칸 가운데 픽셀의 색을 가장 가까운 팔레트 색으로
      const i = ((y * scale + scale / 2) * c.width + x * scale + scale / 2) * 4;
      if (px[i + 3] < 110) {
        data += TRANSPARENT;
        continue;
      }
      let best = 0;
      let bd = Infinity;
      RGB.forEach(([r, g, b], k) => {
        const d = (r - px[i]) ** 2 * 0.3 + (g - px[i + 1]) ** 2 * 0.59 + (b - px[i + 2]) ** 2 * 0.11;
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      data += best.toString(16);
    }
  }
  return { w, h, data };
}
