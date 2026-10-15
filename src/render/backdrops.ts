// 배경 그림. 직접 그린 원본이며 게임 상태와 무관한 장식이다 (프레임 번호로만 움직인다).

import { WORLD_H as H, WORLD_W as W } from '../engine/types';
import { hash } from './costumes';

type Ctx = CanvasRenderingContext2D;

const vgrad = (ctx: Ctx, top: string, bottom: string) => {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
};

const cloud = (ctx: Ctx, x: number, y: number, s: number, alpha: number) => {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, 12 * s, 0, Math.PI * 2);
  ctx.arc(x + 14 * s, y - 6 * s, 15 * s, 0, Math.PI * 2);
  ctx.arc(x + 30 * s, y, 11 * s, 0, Math.PI * 2);
  ctx.rect(x, y, 30 * s, 10 * s);
  ctx.fill();
};

/** x 를 화면 폭 + 여유 안에서 왼쪽으로 흐르게 */
const drift = (base: number, t: number, speed: number, span = W + 120) => ((((base - t * speed) % span) + span) % span) - 60;

const stars = (ctx: Ctx, t: number, n: number, maxY: number) => {
  for (let i = 0; i < n; i++) {
    const a = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.03 + i * 1.7));
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    const r = hash(i + 50) < 0.15 ? 1.4 : 0.8;
    ctx.fillRect(hash(i) * W, hash(i + 100) * maxY, r, r);
  }
};

const BACKDROPS: Record<string, (ctx: Ctx, t: number) => void> = {
  sky(ctx, t) {
    vgrad(ctx, '#6cc3ff', '#d9f2ff');
    for (let i = 0; i < 5; i++) cloud(ctx, drift(i * 110 + hash(i) * 60, t, 0.25 + i * 0.05), 30 + hash(i + 9) * 120, 0.8 + hash(i + 3) * 0.6, 0.85);
    ctx.fillStyle = '#a6e3a1';
    ctx.beginPath();
    ctx.ellipse(80, H + 30, 160, 70, 0, 0, Math.PI * 2);
    ctx.ellipse(330, H + 40, 180, 80, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  desert(ctx, t) {
    vgrad(ctx, '#ffcf99', '#fff3dc');
    const sun = ctx.createRadialGradient(330, 70, 10, 330, 70, 60);
    sun.addColorStop(0, 'rgba(255,190,90,1)');
    sun.addColorStop(0.45, 'rgba(255,200,110,0.9)');
    sun.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(250, 0, 150, 150);
    for (let i = 0; i < 3; i++) cloud(ctx, drift(i * 160 + 40, t, 0.3), 40 + i * 25, 0.7, 0.7);
    // 멀리 있는 모래 언덕 (천천히 흐른다)
    ctx.fillStyle = '#f2c48a';
    const off = (t * 0.6) % 200;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = -off; x <= W + 200; x += 200) {
      ctx.quadraticCurveTo(x + 50, 205, x + 100, 238);
      ctx.quadraticCurveTo(x + 150, 255, x + 200, 230);
    }
    ctx.lineTo(W, H);
    ctx.fill();
  },
  space(ctx, t) {
    vgrad(ctx, '#0a0f2c', '#2a1452');
    stars(ctx, t, 90, H);
    ctx.fillStyle = 'rgba(140,100,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(120, 200, 160, 50, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // 고리 행성
    const g = ctx.createRadialGradient(325, 60, 4, 335, 70, 26);
    g.addColorStop(0, '#ffb3c7');
    g.addColorStop(1, '#b0418f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(335, 70, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,240,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(335, 70, 40, 9, -0.35, 0, Math.PI * 2);
    ctx.stroke();
  },
  night(ctx, t) {
    vgrad(ctx, '#0e1d45', '#3b5487');
    stars(ctx, t, 60, 180);
    ctx.fillStyle = '#fff6d5';
    ctx.beginPath();
    ctx.arc(60, 55, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0e1d45';
    ctx.beginPath();
    ctx.arc(68, 50, 17, 0, Math.PI * 2);
    ctx.fill();
    // 도시 실루엣
    for (let i = 0; i < 14; i++) {
      const bw = 22 + hash(i) * 18;
      const bh = 40 + hash(i + 20) * 80;
      const x = i * 30 - 5;
      ctx.fillStyle = '#1a2547';
      ctx.fillRect(x, H - bh, bw, bh);
      ctx.fillStyle = 'rgba(255,220,120,0.55)';
      for (let k = 0; k < 6; k++) if (hash(i * 10 + k) > 0.55) ctx.fillRect(x + 4 + (k % 2) * 9, H - bh + 8 + Math.floor(k / 2) * 14, 4, 5);
    }
  },
  road(ctx) {
    // 위·아래 풀밭, 가운데 8차선 (차선 가운데 y = 50 + 28i, 닭 길 건너기 예제와 맞춘다)
    ctx.fillStyle = '#7bc96f';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#4a4f5a';
    ctx.fillRect(0, 36, W, 224);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(0, 36, W, 2);
    ctx.fillRect(0, 258, W, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let k = 1; k < 8; k++) for (let x = 6; x < W; x += 28) ctx.fillRect(x, 36 + 28 * k - 1, 14, 2);
    ctx.fillStyle = '#5fae55';
    for (let i = 0; i < 24; i++) ctx.fillRect(hash(i) * W, hash(i + 40) < 0.5 ? 6 + hash(i + 9) * 22 : 266 + hash(i + 9) * 28, 3, 3);
  },
  arcade(ctx) {
    vgrad(ctx, '#0d1020', '#1a1236');
    ctx.strokeStyle = 'rgba(124,108,242,0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  },
};

/** 배경 그림이 없으면(none·알 수 없는 이름) false — 단색을 쓴다 */
export function drawBackdrop(ctx: Ctx, name: string, t: number): boolean {
  const f = BACKDROPS[name];
  if (!f) return false;
  f(ctx, t);
  return true;
}
