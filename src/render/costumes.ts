// 모양(코스튬) 그리기. 모두 이 파일에서 직접 그린 원본 그림이다 (외부 이미지·원작 게임 그래픽 없음).
// 그림은 객체의 사각형(AABB) 안팎에 맞춰 그릴 뿐, 충돌 판정은 항상 사각형 그대로다.

import type { GameObject } from '../engine/types';

type Ctx = CanvasRenderingContext2D;

export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** 색을 밝게(f>0) 또는 어둡게(f<0). f 는 -1..1 */
export function shade(hex: string, f: number): string {
  let m = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1];
  const s = /^#?([0-9a-f]{3})$/i.exec(hex)?.[1];
  if (!m && s) m = s.split('').map((c) => c + c).join('');
  if (!m) return hex;
  const n = parseInt(m, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f)));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

/** 고정된 의사 난수 (그림 장식 위치용. 엔진 RNG 와 무관) */
export const hash = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const circle = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
};
const ellipse = (ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) => {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, Math.PI * 2);
};
const eye = (ctx: Ctx, x: number, y: number, r: number, look = 0.3) => {
  ctx.fillStyle = '#fff';
  circle(ctx, x, y, r);
  ctx.fill();
  ctx.fillStyle = '#1d1b2f';
  circle(ctx, x + r * look, y, r * 0.55);
  ctx.fill();
  ctx.fillStyle = '#fff';
  circle(ctx, x + r * look + r * 0.2, y - r * 0.2, r * 0.18);
  ctx.fill();
};

type Draw = (ctx: Ctx, o: GameObject, t: number, L: number, T: number, W: number, H: number) => void;

const box: Draw = (ctx, o, _t, L, T, W, H) => {
  const r = Math.min(4, W / 4, H / 4);
  ctx.fillStyle = shade(o.color, -0.25);
  rr(ctx, L, T, W, H, r);
  ctx.fill();
  ctx.fillStyle = o.color;
  rr(ctx, L, T, W, H - Math.min(3, H * 0.2), r);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  rr(ctx, L + 2, T + 1.5, Math.max(0, W - 4), Math.min(2, H * 0.15), 1);
  ctx.fill();
};

const dino: Draw = (ctx, o, t, L, T, W, H) => {
  const g = '#4fbf68';
  const dark = '#2f8f4a';
  const run = o.onGround && Math.floor(t / 5) % 2 === 0;
  ctx.lineWidth = 1;
  // 꼬리
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(L + W * 0.15, T + H * 0.42);
  ctx.lineTo(L - W * 0.25, T + H * 0.62);
  ctx.lineTo(L + W * 0.2, T + H * 0.72);
  ctx.closePath();
  ctx.fill();
  // 다리
  ctx.fillStyle = dark;
  rr(ctx, L + W * 0.18, T + H * 0.72, W * 0.22, H * (run ? 0.22 : 0.28), 2);
  ctx.fill();
  rr(ctx, L + W * 0.52, T + H * 0.72, W * 0.22, H * (run ? 0.28 : 0.22), 2);
  ctx.fill();
  // 몸통
  ctx.fillStyle = g;
  rr(ctx, L + W * 0.05, T + H * 0.34, W * 0.78, H * 0.46, W * 0.25);
  ctx.fill();
  ctx.fillStyle = '#bff0c8';
  ellipse(ctx, L + W * 0.5, T + H * 0.6, W * 0.22, H * 0.13);
  ctx.fill();
  // 등 가시
  ctx.fillStyle = '#ffb547';
  for (let i = 0; i < 3; i++) {
    const x = L + W * (0.12 + i * 0.16);
    ctx.beginPath();
    ctx.moveTo(x, T + H * 0.38);
    ctx.lineTo(x + W * 0.07, T + H * 0.28);
    ctx.lineTo(x + W * 0.14, T + H * 0.38);
    ctx.fill();
  }
  // 머리
  ctx.fillStyle = g;
  rr(ctx, L + W * 0.42, T, W * 0.66, H * 0.4, W * 0.2);
  ctx.fill();
  eye(ctx, L + W * 0.8, T + H * 0.14, Math.max(1.5, W * 0.11));
  ctx.fillStyle = '#ff8fa3';
  circle(ctx, L + W * 0.66, T + H * 0.27, W * 0.07);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.beginPath();
  ctx.moveTo(L + W * 0.85, T + H * 0.3);
  ctx.lineTo(L + W * 1.02, T + H * 0.3);
  ctx.stroke();
  // 팔
  ctx.fillStyle = dark;
  rr(ctx, L + W * 0.68, T + H * 0.46, W * 0.2, H * 0.07, 1.5);
  ctx.fill();
};

const duck: Draw = (ctx, o, t, _L, _T, W, H) => {
  const tilt = Math.max(-0.45, Math.min(0.6, o.vy * 0.06));
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(tilt);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#d99a00';
  // 몸
  ctx.fillStyle = '#ffd23f';
  ellipse(ctx, -W * 0.02, H * 0.08, W * 0.52, H * 0.4);
  ctx.fill();
  ctx.stroke();
  // 머리
  circle(ctx, W * 0.22, -H * 0.22, W * 0.3);
  ctx.fill();
  ctx.stroke();
  // 부리
  ctx.fillStyle = '#ff8c1a';
  ctx.beginPath();
  ctx.moveTo(W * 0.44, -H * 0.24);
  ctx.quadraticCurveTo(W * 0.82, -H * 0.16, W * 0.44, -H * 0.04);
  ctx.closePath();
  ctx.fill();
  eye(ctx, W * 0.3, -H * 0.3, Math.max(1.5, W * 0.1), 0.35);
  ctx.fillStyle = 'rgba(255,120,150,0.6)';
  circle(ctx, W * 0.14, -H * 0.1, W * 0.07);
  ctx.fill();
  // 날개: 위로 날 때 빨리 퍼덕인다
  const flap = Math.sin(t * (o.vy < 0 ? 0.9 : 0.35)) * 0.6;
  ctx.fillStyle = '#ffb81f';
  ellipse(ctx, -W * 0.12, H * 0.1, W * 0.3, H * 0.17, -0.3 + flap);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

const ship: Draw = (ctx, _o, t, L, T, W, H) => {
  const cx = L + W / 2;
  // 불꽃
  const f = 0.35 + (t % 4) * 0.06;
  const grad = ctx.createLinearGradient(0, T + H * 0.8, 0, T + H * (0.8 + f));
  grad.addColorStop(0, '#ffe066');
  grad.addColorStop(1, 'rgba(255,90,40,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.18, T + H * 0.8);
  ctx.lineTo(cx, T + H * (0.8 + f));
  ctx.lineTo(cx + W * 0.18, T + H * 0.8);
  ctx.fill();
  // 날개
  ctx.fillStyle = '#ff5a6e';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * W * 0.18, T + H * 0.45);
    ctx.lineTo(cx + s * W * 0.5, T + H * 0.85);
    ctx.lineTo(cx + s * W * 0.18, T + H * 0.8);
    ctx.fill();
  }
  // 몸체
  ctx.fillStyle = '#eef1f8';
  ctx.strokeStyle = '#8f98b3';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, T);
  ctx.quadraticCurveTo(cx + W * 0.32, T + H * 0.3, cx + W * 0.22, T + H * 0.85);
  ctx.lineTo(cx - W * 0.22, T + H * 0.85);
  ctx.quadraticCurveTo(cx - W * 0.32, T + H * 0.3, cx, T);
  ctx.fill();
  ctx.stroke();
  // 창문
  ctx.fillStyle = '#5ad1ff';
  circle(ctx, cx, T + H * 0.4, W * 0.12);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  circle(ctx, cx - W * 0.04, T + H * 0.37, W * 0.04);
  ctx.fill();
};

const slime: Draw = (ctx, o, t, L, T, W, H) => {
  const sq = Math.sin(t * 0.2) * 0.06;
  const top = T + H * (0.1 + sq);
  ctx.fillStyle = o.color === '#888888' ? '#5fd068' : o.color;
  ctx.beginPath();
  ctx.moveTo(L, T + H);
  ctx.bezierCurveTo(L - W * 0.05, top, L + W * 1.05, top, L + W, T + H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ellipse(ctx, L + W * 0.32, T + H * 0.42, W * 0.1, H * 0.07, -0.5);
  ctx.fill();
  eye(ctx, L + W * 0.38, T + H * 0.6, W * 0.1, 0.2);
  eye(ctx, L + W * 0.64, T + H * 0.6, W * 0.1, 0.2);
};

const alien: Draw = (ctx, o, t, L, T, W, H) => {
  const body = o.color === '#888888' ? '#9b5de5' : o.color;
  const step = Math.floor(t / 15) % 2;
  ctx.fillStyle = shade(body, -0.25);
  // 다리 (번갈아 움직인다)
  for (let i = 0; i < 3; i++) {
    const x = L + W * (0.2 + i * 0.3);
    rr(ctx, x - W * 0.06, T + H * 0.62, W * 0.12, H * (step === i % 2 ? 0.38 : 0.28), 2);
    ctx.fill();
  }
  // 더듬이
  ctx.strokeStyle = shade(body, -0.25);
  ctx.lineWidth = 1.2;
  for (const s2 of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(L + W / 2 + s2 * W * 0.15, T + H * 0.25);
    ctx.lineTo(L + W / 2 + s2 * W * 0.3, T + H * 0.02);
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    circle(ctx, L + W / 2 + s2 * W * 0.3, T + H * 0.04, W * 0.07);
    ctx.fill();
  }
  // 둥근 몸
  ctx.fillStyle = body;
  ellipse(ctx, L + W / 2, T + H * 0.45, W * 0.48, H * 0.3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ellipse(ctx, L + W * 0.38, T + H * 0.33, W * 0.14, H * 0.08, -0.4);
  ctx.fill();
  eye(ctx, L + W * 0.36, T + H * 0.46, W * 0.11, 0);
  eye(ctx, L + W * 0.64, T + H * 0.46, W * 0.11, 0);
};

const chicken: Draw = (ctx, _o, t, L, T, W, H) => {
  const cx = L + W / 2;
  // 발 (걷는 모양)
  ctx.strokeStyle = '#ff8c1a';
  ctx.lineWidth = 1.5;
  const step = Math.floor(t / 6) % 2 ? 1 : -1;
  for (const s2 of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s2 * W * 0.15, T + H * 0.8);
    ctx.lineTo(cx + s2 * W * 0.15 + step * s2 * 1.5, T + H);
    ctx.stroke();
  }
  // 몸
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#d9d4cc';
  ctx.lineWidth = 1;
  ellipse(ctx, cx, T + H * 0.55, W * 0.42, H * 0.32);
  ctx.fill();
  ctx.stroke();
  // 볏
  ctx.fillStyle = '#ff4d4d';
  for (let i = -1; i <= 1; i++) {
    circle(ctx, cx + i * W * 0.1, T + H * 0.12 - (i === 0 ? H * 0.04 : 0), W * 0.1);
    ctx.fill();
  }
  // 머리
  ctx.fillStyle = '#ffffff';
  circle(ctx, cx, T + H * 0.3, W * 0.28);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffb000';
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.08, T + H * 0.36);
  ctx.lineTo(cx + W * 0.08, T + H * 0.36);
  ctx.lineTo(cx, T + H * 0.48);
  ctx.fill();
  ctx.fillStyle = '#1d1b2f';
  circle(ctx, cx - W * 0.11, T + H * 0.27, W * 0.05);
  circle(ctx, cx + W * 0.11, T + H * 0.27, W * 0.05);
  ctx.fill();
};

const car: Draw = (ctx, o, _t, L, T, W, H) => {
  const dir = o.vx < 0 ? -1 : 1;
  ctx.save();
  // 왼쪽으로 가는 차는 좌우를 뒤집어 그린다
  ctx.translate(o.x, o.y);
  ctx.scale(dir, 1);
  ctx.translate(-o.x, -o.y);
  ctx.fillStyle = '#1d1b2f';
  circle(ctx, L + W * 0.25, T + H * 0.85, H * 0.18);
  ctx.fill();
  circle(ctx, L + W * 0.75, T + H * 0.85, H * 0.18);
  ctx.fill();
  ctx.fillStyle = o.color;
  rr(ctx, L, T + H * 0.38, W, H * 0.45, H * 0.15);
  ctx.fill();
  rr(ctx, L + W * 0.2, T + H * 0.05, W * 0.55, H * 0.42, H * 0.15);
  ctx.fill();
  ctx.fillStyle = '#bfe6ff';
  rr(ctx, L + W * 0.27, T + H * 0.13, W * 0.18, H * 0.27, 2);
  ctx.fill();
  rr(ctx, L + W * 0.5, T + H * 0.13, W * 0.18, H * 0.27, 2);
  ctx.fill();
  ctx.fillStyle = '#ffe066';
  rr(ctx, L + W - 3, T + H * 0.45, 3, H * 0.15, 1);
  ctx.fill();
  ctx.restore();
};

const cactus: Draw = (ctx, _o, _t, L, T, W, H) => {
  const g = '#3fae5a';
  const d = '#2a8443';
  ctx.fillStyle = g;
  rr(ctx, L + W * 0.3, T, W * 0.4, H, W * 0.2);
  ctx.fill();
  // 팔
  rr(ctx, L, T + H * 0.3, W * 0.22, H * 0.3, W * 0.11);
  ctx.fill();
  rr(ctx, L, T + H * 0.52, W * 0.4, H * 0.1, H * 0.05);
  ctx.fill();
  rr(ctx, L + W * 0.78, T + H * 0.2, W * 0.22, H * 0.28, W * 0.11);
  ctx.fill();
  rr(ctx, L + W * 0.6, T + H * 0.4, W * 0.4, H * 0.1, H * 0.05);
  ctx.fill();
  ctx.strokeStyle = d;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(L + W * 0.5, T + H * 0.1);
  ctx.lineTo(L + W * 0.5, T + H * 0.95);
  ctx.stroke();
  ctx.fillStyle = '#ff7ab6';
  circle(ctx, L + W * 0.5, T + 1, W * 0.13);
  ctx.fill();
};

const pipe: Draw = (ctx, o, _t, L, T, W, H) => {
  const grad = ctx.createLinearGradient(L, 0, L + W, 0);
  grad.addColorStop(0, '#2f8f2f');
  grad.addColorStop(0.35, '#8ee86e');
  grad.addColorStop(1, '#2a7a2a');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#1d5e1d';
  ctx.lineWidth = 1.5;
  ctx.fillRect(L + 2, T, W - 4, H);
  ctx.strokeRect(L + 2, T, W - 4, H);
  // 입구: 화면 가운데 쪽 끝에 넓은 테두리
  const capH = Math.min(14, H);
  const capY = o.y < 150 ? T + H - capH : T;
  ctx.fillRect(L - 2, capY, W + 4, capH);
  ctx.strokeRect(L - 2, capY, W + 4, capH);
};

const meteor: Draw = (ctx, o, t, _L, _T, W, H) => {
  const r = Math.min(W, H) / 2;
  const sp = Math.hypot(o.vx, o.vy) || 1;
  const ux = -o.vx / sp;
  const uy = -o.vy / sp;
  // 꼬리 (움직이는 반대 방향)
  const len = r * (2.2 + (t % 6) * 0.08);
  const grad = ctx.createLinearGradient(o.x, o.y, o.x + ux * len, o.y + uy * len);
  grad.addColorStop(0, 'rgba(255,170,60,0.9)');
  grad.addColorStop(1, 'rgba(255,80,40,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(o.x - uy * r * 0.9, o.y + ux * r * 0.9);
  ctx.lineTo(o.x + ux * len, o.y + uy * len);
  ctx.lineTo(o.x + uy * r * 0.9, o.y - ux * r * 0.9);
  ctx.fill();
  // 돌
  ctx.fillStyle = '#8b6b4a';
  ctx.strokeStyle = '#5a422c';
  ctx.lineWidth = 1;
  circle(ctx, o.x, o.y, r);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#6e5238';
  circle(ctx, o.x - r * 0.3, o.y - r * 0.2, r * 0.25);
  ctx.fill();
  circle(ctx, o.x + r * 0.35, o.y + r * 0.3, r * 0.18);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  circle(ctx, o.x - r * 0.35, o.y - r * 0.45, r * 0.2);
  ctx.fill();
};

const paddle: Draw = (ctx, o, _t, L, T, W, H) => {
  // 가로(블록깨기)·세로(핑퐁) 모두: 짧은 쪽으로 빛이 지나가는 둥근 막대
  const vertical = H > W;
  const grad = vertical ? ctx.createLinearGradient(L, 0, L + W, 0) : ctx.createLinearGradient(0, T, 0, T + H);
  grad.addColorStop(0, shade(o.color, 0.45));
  grad.addColorStop(0.5, o.color);
  grad.addColorStop(1, shade(o.color, -0.35));
  ctx.fillStyle = grad;
  const r = Math.min(W, H) / 2;
  rr(ctx, L, T, W, H, r);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  if (vertical) rr(ctx, L + 1.5, T + r, Math.max(1, W * 0.18), H - 2 * r, 1);
  else rr(ctx, L + r, T + 1.5, W - 2 * r, Math.max(1, H * 0.18), 1);
  ctx.fill();
};

const ball: Draw = (ctx, o, _t, _L, _T, W, H) => {
  const r = Math.min(W, H) / 2;
  const grad = ctx.createRadialGradient(o.x - r * 0.35, o.y - r * 0.35, r * 0.1, o.x, o.y, r);
  grad.addColorStop(0, shade(o.color, 0.6));
  grad.addColorStop(0.6, o.color);
  grad.addColorStop(1, shade(o.color, -0.4));
  ctx.fillStyle = grad;
  circle(ctx, o.x, o.y, r);
  ctx.fill();
};

const brick: Draw = (ctx, o, _t, L, T, W, H) => {
  const x = L + 0.5;
  const y = T + 0.5;
  const w = W - 1;
  const h = H - 1;
  ctx.fillStyle = shade(o.color, -0.3);
  rr(ctx, x, y, w, h, 2);
  ctx.fill();
  ctx.fillStyle = o.color;
  rr(ctx, x, y, w, h - 2.5, 2);
  ctx.fill();
  ctx.fillStyle = shade(o.color, 0.35);
  rr(ctx, x + 2, y + 1.5, w - 4, 2, 1);
  ctx.fill();
};

const groundDraw =
  (scroll: number): Draw =>
  (ctx, _o, t, L, T, W, H) => {
    const grass = Math.min(7, H * 0.4);
    ctx.save();
    ctx.beginPath();
    ctx.rect(L, T, W, H);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, T, 0, T + H);
    grad.addColorStop(0, '#c28a55');
    grad.addColorStop(1, '#8e5f37');
    ctx.fillStyle = grad;
    ctx.fillRect(L, T, W, H);
    // 자갈 (흐르는 땅이면 왼쪽으로 지나간다)
    const off = (t * scroll) % 40;
    ctx.fillStyle = 'rgba(80,50,25,0.45)';
    for (let x = L - 40 - off; x < L + W + 40; x += 40) {
      const i = Math.round((x + off) / 40);
      circle(ctx, x + hash(i) * 30, T + grass + 2 + hash(i + 7) * Math.max(1, H - grass - 4), 1.2 + hash(i + 3) * 1.5);
      ctx.fill();
    }
    ctx.fillStyle = '#66bb44';
    ctx.fillRect(L, T, W, grass);
    ctx.fillStyle = '#4e9a33';
    ctx.fillRect(L, T + grass - 1.5, W, 1.5);
    ctx.fillStyle = '#7fd35a';
    for (let x = L - 20 - ((t * scroll) % 20); x < L + W + 20; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, T + 1);
      ctx.lineTo(x + 3, T - 3);
      ctx.lineTo(x + 6, T + 1);
      ctx.fill();
    }
    ctx.restore();
  };

const star: Draw = (ctx, _o, t, _L, _T, W, H) => {
  const o = _o;
  const R = Math.min(W, H) / 2;
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(Math.sin(t * 0.05) * 0.25);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? R * 0.45 : R;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#e09a00';
  ctx.lineWidth = 1;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

const coin: Draw = (ctx, o, t, _L, _T, W, H) => {
  const rx = (W / 2) * Math.max(0.15, Math.abs(Math.cos(t * 0.08)));
  ctx.fillStyle = '#f5b700';
  ellipse(ctx, o.x, o.y, rx, H / 2);
  ctx.fill();
  ctx.fillStyle = '#ffd95e';
  ellipse(ctx, o.x, o.y, rx * 0.7, H * 0.35);
  ctx.fill();
};

/** 도로 한 줄 (끝없는 길 건너기). 가운데 점선은 객체 x 와 상관없이 화면에 고정 */
const roadStrip: Draw = (ctx, _o, _t, L, T, W, H) => {
  ctx.fillStyle = '#4a4a5e';
  ctx.fillRect(L, T, W, H);
  ctx.fillStyle = '#5d5d74';
  ctx.fillRect(L, T, W, 2);
  ctx.fillStyle = '#3a3a4c';
  ctx.fillRect(L, T + H - 2, W, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  for (let x = L + 6; x < L + W; x += 32) ctx.fillRect(x, T + H / 2 - 1, 14, 2);
};

/** 풀밭 한 줄. 색은 객체 색을 쓴다 */
const grassStrip: Draw = (ctx, o, _t, L, T, W, H) => {
  ctx.fillStyle = o.color;
  ctx.fillRect(L, T, W, H);
  ctx.fillStyle = shade(o.color, -0.18);
  for (let i = 0; i < W / 22; i++) {
    const x = L + i * 22 + hash(i * 3 + Math.round(T)) * 14;
    const y = T + 4 + hash(i * 5 + 1) * Math.max(1, H - 10);
    ctx.fillRect(x, y, 2, 4);
    ctx.fillRect(x + 3, y + 1, 2, 3);
  }
};

const DRAW: Record<string, Draw> = {
  box,
  dino,
  duck,
  ship,
  slime,
  alien,
  chicken,
  car,
  cactus,
  pipe,
  meteor,
  paddle,
  ball,
  brick,
  ground: groundDraw(0),
  groundRun: groundDraw(5),
  star,
  coin,
  road: roadStrip,
  grass: grassStrip,
  hidden: () => {},
};

export function drawCostume(ctx: Ctx, name: string | undefined, o: GameObject, t: number): void {
  const L = o.x - o.w / 2;
  const T = o.y - o.h / 2;
  (DRAW[name ?? 'box'] ?? box)(ctx, o, t, L, T, o.w, o.h);
}
