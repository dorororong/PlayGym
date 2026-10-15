// 관찰(센서) 선언과 계산, 라이다 레이캐스트.

import { WORLD_H, WORLD_W, type GameObject, type WorldState } from './types';

export type Direction = 'all' | 'right' | 'left' | 'up' | 'down';

export type SensorDesc =
  | { kind: 'position'; subject: string }
  | { kind: 'velocity'; subject: string }
  | { kind: 'nearest'; subject: string; target: string; dir: Direction }
  | { kind: 'distance'; subject: string; target: string }
  | {
      kind: 'lidar';
      subject: string;
      rays: number;
      startDeg: number;
      endDeg: number;
      maxDist: number;
      target: string;
      bounds: boolean;
    }
  | { kind: 'onGround'; subject: string }
  | { kind: 'variable'; name: string; min: number; max: number }
  | { kind: 'nearestK'; subject: string; target: string; k: number; dir: Direction }
  | { kind: 'count'; target: string; max: number }
  | { kind: 'grid'; subject: string; target: string; rows: number; cols: number; cell: number }
  | { kind: 'score'; min: number; max: number }
  | { kind: 'prop'; subject: string; prop: Prop; min: number; max: number };

export type Prop = 'x' | 'y' | 'vx' | 'vy' | 'w' | 'h';

/** 오버레이용 도형. headless 에서는 계산하지 않는다 */
export type DebugShape =
  | { type: 'ray'; x0: number; y0: number; x1: number; y1: number; hit: boolean; t: number }
  | { type: 'link'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'cell'; x: number; y: number; w: number; h: number; on: boolean };

export const VEL_SCALE = 20;
export const DIST_SCALE = 500;

/** 센서 디스크립터를 만드는 함수 모음 (api.sensor). 인자는 블록 값이라 숫자 보정을 한다 */
export const sensorFactory = {
  position: (subject: string): SensorDesc => ({ kind: 'position', subject }),
  velocity: (subject: string): SensorDesc => ({ kind: 'velocity', subject }),
  nearest: (subject: string, target: string, dir: Direction = 'all'): SensorDesc => ({
    kind: 'nearest',
    subject,
    target,
    dir,
  }),
  distance: (subject: string, target: string): SensorDesc => ({ kind: 'distance', subject, target }),
  lidar: (
    subject: string,
    rays: number,
    startDeg: number,
    endDeg: number,
    maxDist: number,
    target: string,
    bounds = false,
  ): SensorDesc => ({
    kind: 'lidar',
    subject,
    rays: Math.max(1, Math.min(32, Math.round(Number(rays) || 1))),
    startDeg: Number(startDeg) || 0,
    endDeg: Number(endDeg) || 0,
    maxDist: Math.max(1, Number(maxDist) || 1),
    target,
    bounds: !!bounds,
  }),
  onGround: (subject: string): SensorDesc => ({ kind: 'onGround', subject }),
  variable: (name: string, min: number, max: number): SensorDesc => ({
    kind: 'variable',
    name,
    min: Number(min) || 0,
    max: Number(max) || 0,
  }),
  /** 가까운 대상 K개의 dx, dy (가까운 순) */
  nearestK: (subject: string, target: string, k: number, dir: Direction = 'all'): SensorDesc => ({
    kind: 'nearestK',
    subject,
    target,
    k: Math.max(1, Math.min(8, Math.round(Number(k) || 1))),
    dir,
  }),
  count: (target: string, max: number): SensorDesc => ({ kind: 'count', target, max: Math.max(1, Number(max) || 1) }),
  /** 격자 센서: 칸마다 대상이 있으면 1. cell > 0 이면 주체 주변 rows×cols 칸(한 칸 cell px), 0 이면 화면 전체를 나눈다 */
  grid: (subject: string, target: string, rows: number, cols: number, cell: number): SensorDesc => ({
    kind: 'grid',
    subject,
    target,
    rows: Math.max(1, Math.min(16, Math.round(Number(rows) || 1))),
    cols: Math.max(1, Math.min(16, Math.round(Number(cols) || 1))),
    cell: Math.max(0, Number(cell) || 0),
  }),
  score: (min: number, max: number): SensorDesc => ({ kind: 'score', min: Number(min) || 0, max: Number(max) || 0 }),
  prop: (subject: string, prop: Prop, min: number, max: number): SensorDesc => ({
    kind: 'prop',
    subject,
    prop: (['x', 'y', 'vx', 'vy', 'w', 'h'] as const).includes(prop) ? prop : 'x',
    min: Number(min) || 0,
    max: Number(max) || 0,
  }),
};

export interface ObsSpace {
  labels: string[];
  low: number[];
  high: number[];
}

/** 선언 순서대로 이름표와 범위를 만든다. 길이는 여기서 확정된다 */
export function describeSensors(sensors: SensorDesc[]): ObsSpace {
  const labels: string[] = [];
  const low: number[] = [];
  const high: number[] = [];
  const add = (label: string, lo: number) => {
    labels.push(label);
    low.push(lo);
    high.push(1);
  };
  let lidarIdx = 0;
  let gridIdx = 0;
  for (const s of sensors) {
    switch (s.kind) {
      case 'position': add(`${s.subject}.x`, 0); add(`${s.subject}.y`, 0); break;
      case 'velocity': add(`${s.subject}.vx`, -1); add(`${s.subject}.vy`, -1); break;
      case 'nearest': add(`${s.subject}→${s.target}.dx`, -1); add(`${s.subject}→${s.target}.dy`, -1); break;
      case 'distance': add(`${s.subject}↔${s.target}.d`, 0); break;
      case 'lidar': {
        for (let i = 0; i < s.rays; i++) add(`lidar${lidarIdx}[${i}]`, 0);
        lidarIdx++;
        break;
      }
      case 'onGround': add(`${s.subject}.onGround`, 0); break;
      case 'variable': add(`var.${s.name}`, 0); break;
      case 'nearestK':
        for (let i = 0; i < s.k; i++) {
          add(`${s.subject}→${s.target}#${i + 1}.dx`, -1);
          add(`${s.subject}→${s.target}#${i + 1}.dy`, -1);
        }
        break;
      case 'count': add(`count(${s.target})`, 0); break;
      case 'grid': {
        for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) add(`grid${gridIdx}[${r},${c}]`, 0);
        gridIdx++;
        break;
      }
      case 'score': add('score', 0); break;
      case 'prop': add(`${s.subject}.${s.prop}`, 0); break;
    }
  }
  return { labels, low, high };
}

const clip = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : Number.isNaN(v) ? lo : v);

/** 태그의 살아 있는 객체 중 id 가 가장 작은 것. objects 는 id 오름차순이다 */
export function firstOfTag(objects: GameObject[], tag: string): GameObject | undefined {
  for (const o of objects) if (o.alive && o.tag === tag) return o;
  return undefined;
}

export function computeObservation(world: WorldState, sensors: SensorDesc[], debug?: DebugShape[]): number[] {
  const out: number[] = [];
  const objs = world.objects;
  for (const s of sensors) {
    switch (s.kind) {
      case 'position': {
        const o = firstOfTag(objs, s.subject);
        out.push(o ? clip(o.x / WORLD_W, 0, 1) : 0, o ? clip(o.y / WORLD_H, 0, 1) : 0);
        break;
      }
      case 'velocity': {
        const o = firstOfTag(objs, s.subject);
        out.push(o ? clip(o.vx / VEL_SCALE, -1, 1) : 0, o ? clip(o.vy / VEL_SCALE, -1, 1) : 0);
        break;
      }
      case 'nearest': {
        const o = firstOfTag(objs, s.subject);
        const t = o && nearestTarget(objs, o, s.target, s.dir);
        if (o && t) {
          out.push(clip((t.x - o.x) / WORLD_W, -1, 1), clip((t.y - o.y) / WORLD_H, -1, 1));
          debug?.push({ type: 'link', x0: o.x, y0: o.y, x1: t.x, y1: t.y });
        } else out.push(1, 1);
        break;
      }
      case 'distance': {
        const o = firstOfTag(objs, s.subject);
        const t = o && nearestTarget(objs, o, s.target, 'all');
        if (o && t) {
          out.push(clip(Math.hypot(t.x - o.x, t.y - o.y) / DIST_SCALE, 0, 1));
          debug?.push({ type: 'link', x0: o.x, y0: o.y, x1: t.x, y1: t.y });
        } else out.push(1);
        break;
      }
      case 'lidar': {
        const o = firstOfTag(objs, s.subject);
        if (!o) {
          for (let i = 0; i < s.rays; i++) out.push(1);
          break;
        }
        const targets = objs.filter((t) => t.alive && t.tag === s.target && t !== o);
        for (let i = 0; i < s.rays; i++) {
          const deg = s.rays === 1 ? s.startDeg : s.startDeg + ((s.endDeg - s.startDeg) * i) / (s.rays - 1);
          const rad = (deg * Math.PI) / 180;
          const dx = Math.cos(rad);
          const dy = -Math.sin(rad);
          const d = castRay(o.x, o.y, dx, dy, s.maxDist, targets, s.bounds);
          const t = d / s.maxDist;
          out.push(clip(t, 0, 1));
          debug?.push({ type: 'ray', x0: o.x, y0: o.y, x1: o.x + dx * d, y1: o.y + dy * d, hit: d < s.maxDist, t });
        }
        break;
      }
      case 'onGround': {
        const o = firstOfTag(objs, s.subject);
        out.push(o?.onGround ? 1 : 0);
        break;
      }
      case 'variable': {
        const v = Number(world.vars[s.name]) || 0;
        out.push(s.max === s.min ? 0 : clip((v - s.min) / (s.max - s.min), 0, 1));
        break;
      }
      case 'nearestK': {
        const o = firstOfTag(objs, s.subject);
        const list = o ? nearestTargets(objs, o, s.target, s.dir, s.k) : [];
        for (let i = 0; i < s.k; i++) {
          const t = list[i];
          if (o && t) {
            out.push(clip((t.x - o.x) / WORLD_W, -1, 1), clip((t.y - o.y) / WORLD_H, -1, 1));
            debug?.push({ type: 'link', x0: o.x, y0: o.y, x1: t.x, y1: t.y });
          } else out.push(1, 1);
        }
        break;
      }
      case 'count': {
        let n = 0;
        for (const t of objs) if (t.alive && t.tag === s.target) n++;
        out.push(clip(n / s.max, 0, 1));
        break;
      }
      case 'grid': {
        const cells = gridCells(objs, s, debug);
        for (const v of cells) out.push(v);
        break;
      }
      case 'score':
        out.push(s.max === s.min ? 0 : clip((world.score - s.min) / (s.max - s.min), 0, 1));
        break;
      case 'prop': {
        const o = firstOfTag(objs, s.subject);
        out.push(!o || s.max === s.min ? 0 : clip((o[s.prop] - s.min) / (s.max - s.min), 0, 1));
        break;
      }
    }
  }
  return out;
}

/** 격자 센서 값 (행 우선). 칸과 대상 사각형이 조금이라도 겹치면 1 */
function gridCells(objs: GameObject[], s: Extract<SensorDesc, { kind: 'grid' }>, debug?: DebugShape[]): number[] {
  const cells = new Array<number>(s.rows * s.cols).fill(0);
  let left = 0;
  let top = 0;
  let cw = WORLD_W / s.cols;
  let ch = WORLD_H / s.rows;
  const subj = s.cell > 0 ? firstOfTag(objs, s.subject) : undefined;
  if (s.cell > 0) {
    if (!subj) return cells;
    cw = ch = s.cell;
    left = subj.x - (s.cols * cw) / 2;
    top = subj.y - (s.rows * ch) / 2;
  }
  for (const t of objs) {
    if (!t.alive || t.tag !== s.target || t === subj) continue;
    const c0 = Math.max(0, Math.floor((t.x - t.w / 2 - left) / cw));
    const c1 = Math.min(s.cols - 1, Math.ceil((t.x + t.w / 2 - left) / cw) - 1);
    const r0 = Math.max(0, Math.floor((t.y - t.h / 2 - top) / ch));
    const r1 = Math.min(s.rows - 1, Math.ceil((t.y + t.h / 2 - top) / ch) - 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells[r * s.cols + c] = 1;
  }
  if (debug) {
    for (let r = 0; r < s.rows; r++)
      for (let c = 0; c < s.cols; c++) debug.push({ type: 'cell', x: left + c * cw, y: top + r * ch, w: cw, h: ch, on: cells[r * s.cols + c] === 1 });
  }
  return cells;
}

function passes(o: GameObject, t: GameObject, dir: Direction): boolean {
  if (dir === 'right') return t.x > o.x;
  if (dir === 'left') return t.x < o.x;
  if (dir === 'up') return t.y < o.y;
  if (dir === 'down') return t.y > o.y;
  return true;
}

function nearestTargets(objs: GameObject[], o: GameObject, tag: string, dir: Direction, k: number): GameObject[] {
  const list: { t: GameObject; d: number }[] = [];
  for (const t of objs) {
    if (!t.alive || t.tag !== tag || t === o || !passes(o, t, dir)) continue;
    list.push({ t, d: (t.x - o.x) ** 2 + (t.y - o.y) ** 2 });
  }
  list.sort((a, b) => a.d - b.d || a.t.id - b.t.id);
  return list.slice(0, k).map((x) => x.t);
}

function nearestTarget(objs: GameObject[], o: GameObject, tag: string, dir: Direction): GameObject | undefined {
  let best: GameObject | undefined;
  let bestD = Infinity;
  for (const t of objs) {
    if (!t.alive || t.tag !== tag || t === o || !passes(o, t, dir)) continue;
    const d = (t.x - o.x) ** 2 + (t.y - o.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/** 원점 (ox, oy), 단위 방향 (dx, dy) 의 광선이 처음 맞는 거리. 없으면 maxDist */
export function castRay(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  maxDist: number,
  targets: GameObject[],
  bounds: boolean,
): number {
  let best = maxDist;
  for (const t of targets) {
    const d = rayAabb(ox, oy, dx, dy, t.x - t.w / 2, t.y - t.h / 2, t.x + t.w / 2, t.y + t.h / 2);
    if (d < best) best = d;
  }
  if (bounds) {
    const EPS = 1e-12;
    if (dx > EPS) best = Math.min(best, (WORLD_W - ox) / dx);
    else if (dx < -EPS) best = Math.min(best, -ox / dx);
    if (dy > EPS) best = Math.min(best, (WORLD_H - oy) / dy);
    else if (dy < -EPS) best = Math.min(best, -oy / dy);
    if (best < 0) best = 0;
  }
  return best;
}

/** slab 방식 광선-AABB 교차. 원점이 상자 안이면 0, 맞지 않으면 Infinity */
function rayAabb(ox: number, oy: number, dx: number, dy: number, x0: number, y0: number, x1: number, y1: number): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  if (Math.abs(dx) < 1e-12) {
    if (ox < x0 || ox > x1) return Infinity;
  } else {
    let t1 = (x0 - ox) / dx;
    let t2 = (x1 - ox) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dy) < 1e-12) {
    if (oy < y0 || oy > y1) return Infinity;
  } else {
    let t1 = (y0 - oy) / dy;
    let t2 = (y1 - oy) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (tmax < 0 || tmin > tmax) return Infinity;
  return tmin < 0 ? 0 : tmin;
}
