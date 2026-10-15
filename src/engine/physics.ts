// AABB 물리: 겹침, 최소 침투 축 밀어내기, 튕기기.

import type { GameObject } from './types';

/** 두 AABB 의 x, y 겹침 길이. 둘 다 0 보다 커야 겹친 것이다 */
export function overlapXY(a: GameObject, b: GameObject): [number, number] {
  const ox = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
  const oy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
  return [ox, oy];
}

export function overlaps(a: GameObject, b: GameObject): boolean {
  const [ox, oy] = overlapXY(a, b);
  return ox > 0 && oy > 0;
}

export function integrate(objects: GameObject[]): void {
  for (const o of objects) {
    o.x += o.vx;
    o.y += o.vy;
  }
}

/**
 * solid 객체 s 가 비-solid 객체 o 를 최소 침투 축으로 밀어낸다. 그 축 속도는 0.
 * 위로 밀려나면 onGround = true. 같은 길이면 y 축(착지)을 고른다.
 */
export function pushOut(o: GameObject, s: GameObject): void {
  const [ox, oy] = overlapXY(o, s);
  if (ox <= 0 || oy <= 0) return;
  if (ox < oy) {
    o.x += o.x < s.x ? -ox : ox;
    o.vx = 0;
  } else {
    if (o.y < s.y) {
      o.y -= oy;
      o.onGround = true;
    } else {
      o.y += oy;
    }
    o.vy = 0;
  }
}

/**
 * self 를 other 에 튕긴다: 최소 침투 축의 속도를 other 에서 멀어지는 방향으로 뒤집고,
 * 겹치지 않는 위치까지 밀어낸다. 방향을 부호가 아니라 "멀어지는 쪽"으로 정해서
 * 한 step 에 두 객체에 동시에 닿아도 두 번 뒤집혀 원래대로 돌아가지 않는다.
 */
export function bounce(self: GameObject, other: GameObject): void {
  const [ox, oy] = overlapXY(self, other);
  if (ox <= 0 || oy <= 0) return;
  if (ox < oy) {
    const left = self.x < other.x;
    self.vx = left ? -Math.abs(self.vx) : Math.abs(self.vx);
    self.x = left ? other.x - (other.w + self.w) / 2 : other.x + (other.w + self.w) / 2;
  } else {
    const above = self.y < other.y;
    self.vy = above ? -Math.abs(self.vy) : Math.abs(self.vy);
    self.y = above ? other.y - (other.h + self.h) / 2 : other.y + (other.h + self.h) / 2;
  }
}
