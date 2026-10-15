// 태그 단위 Behavior. 객체가 아니라 태그에 설정되며 이후 생성될 객체에도 적용된다.

import { pushOut } from './physics';
import { WORLD_H, WORLD_W, type BehaviorKind, type BounceMode, type GameObject, type TagBehaviors } from './types';

export const BEHAVIOR_KINDS: BehaviorKind[] = ['gravity', 'solid', 'stayInScreen', 'bounceWalls', 'destroyOffscreen', 'wrap'];
export const DEFAULT_GRAVITY = 0.5;

type BehaviorMap = Record<string, TagBehaviors>;

export function applyGravity(objects: GameObject[], beh: BehaviorMap): void {
  for (const o of objects) {
    const g = beh[o.tag]?.gravity;
    if (typeof g === 'number') o.vy += g;
  }
}

export function applySolids(objects: GameObject[], beh: BehaviorMap): void {
  const solids: GameObject[] = [];
  const others: GameObject[] = [];
  for (const o of objects) (beh[o.tag]?.solid ? solids : others).push(o);
  if (solids.length === 0) return;
  for (const o of others) for (const s of solids) pushOut(o, s);
}

export function applyScreenBounds(objects: GameObject[], beh: BehaviorMap): void {
  for (const o of objects) {
    const b = beh[o.tag];
    if (!b) continue;
    if (b.wrap) wrap(o);
    if (b.stayInScreen) stayIn(o);
    if (b.bounceWalls) bounceWalls(o, b.bounceWalls as BounceMode);
  }
}

/** 화면 반대편으로 이어지기 (seamless): 중심이 화면 밖으로 나가면 반대쪽 끝으로 옮긴다 */
function wrap(o: GameObject): void {
  if (o.x < 0) o.x += WORLD_W;
  else if (o.x >= WORLD_W) o.x -= WORLD_W;
  if (o.y < 0) o.y += WORLD_H;
  else if (o.y >= WORLD_H) o.y -= WORLD_H;
}

function stayIn(o: GameObject): void {
  const hw = o.w / 2;
  const hh = o.h / 2;
  if (o.x - hw < 0) { o.x = hw; o.vx = 0; }
  else if (o.x + hw > WORLD_W) { o.x = WORLD_W - hw; o.vx = 0; }
  if (o.y - hh < 0) { o.y = hh; o.vy = 0; }
  else if (o.y + hh > WORLD_H) { o.y = WORLD_H - hh; o.vy = 0; o.onGround = true; }
}

function bounceWalls(o: GameObject, mode: BounceMode): void {
  const hw = o.w / 2;
  const hh = o.h / 2;
  if (o.x - hw < 0) { o.x = hw; o.vx = Math.abs(o.vx); }
  else if (o.x + hw > WORLD_W) { o.x = WORLD_W - hw; o.vx = -Math.abs(o.vx); }
  if (o.y - hh < 0) { o.y = hh; o.vy = Math.abs(o.vy); }
  else if (mode === 'all' && o.y + hh > WORLD_H) { o.y = WORLD_H - hh; o.vy = -Math.abs(o.vy); }
}

export function isOffscreen(o: GameObject): boolean {
  return o.x + o.w / 2 < 0 || o.x - o.w / 2 > WORLD_W || o.y + o.h / 2 < 0 || o.y - o.h / 2 > WORLD_H;
}

export function applyDestroyOffscreen(objects: GameObject[], beh: BehaviorMap): void {
  for (const o of objects) if (beh[o.tag]?.destroyOffscreen && isOffscreen(o)) o.alive = false;
}
