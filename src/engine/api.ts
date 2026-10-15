// 생성 코드(블록)와 손으로 쓴 템플릿 JS 가 호출하는 API. 블록 하나 = 호출 하나.

import { BEHAVIOR_KINDS, DEFAULT_GRAVITY } from './behaviors';
import { bounce as bouncePhys } from './physics';
import { firstOfTag, sensorFactory, type SensorDesc } from './sensors';
import { ALL_ACTIONS, RAINBOW, type ActionName, type BehaviorKind, type GameObject } from './types';
import { LOOP_LIMIT, ScriptError, type World } from './world';

/** 명령/값 블록의 대상: 태그 이름, 또는 충돌 이벤트의 자신/상대 객체 */
export type Target = string | GameObject | null | undefined;
type Axis = 'x' | 'y';
type Prop = 'x' | 'y' | 'vx' | 'vy' | 'w' | 'h';

export interface CreateSpec {
  tag: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  color?: string;
  vx?: number;
  vy?: number;
}

const num = (v: unknown, d = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};

export function createApi(world: World) {
  /** 명령용: 태그면 살아 있는 모든 객체, 객체면 그 객체 하나 (이미 삭제 표시됐어도 적용) */
  const all = (t: Target): GameObject[] => {
    if (typeof t === 'string') return world.objects.filter((o) => o.alive && o.tag === t);
    return t && typeof t === 'object' ? [t] : [];
  };
  /** 값 읽기용: 태그면 id 가 가장 작은 객체 하나 */
  const one = (t: Target): GameObject | undefined => {
    if (typeof t === 'string') return firstOfTag(world.objects, t);
    return t && typeof t === 'object' ? t : undefined;
  };
  const register = (what: string, fn: () => void) => {
    if (world.phase !== 'setup') {
      world.warn(`'${what}' 이벤트는 다른 블록 안에서 등록할 수 없어요`);
      return;
    }
    fn();
  };
  const axisKey = (axis: Axis, vel: boolean) =>
    (vel ? (axis === 'y' ? 'vy' : 'vx') : axis === 'y' ? 'y' : 'x') as 'x' | 'y' | 'vx' | 'vy';

  return {
    get vars() {
      return world.vars;
    },

    // 이벤트
    onStart(fn: () => void) {
      register('게임 시작할 때', () => world.startHandlers.push(fn));
    },
    onTick(fn: () => void) {
      register('매 프레임마다', () => world.tickHandlers.push(fn));
    },
    onInterval(n: number, fn: () => void) {
      register('N 프레임마다', () => world.intervalHandlers.push({ n: Math.max(1, Math.round(num(n, 1))), fn }));
    },
    onAction(name: ActionName, fn: () => void) {
      if (!ALL_ACTIONS.includes(name)) return world.warn(`알 수 없는 행동 '${name}'`);
      register('행동을 받았을 때', () => {
        const list = world.actionHandlers.get(name) ?? [];
        list.push(fn);
        world.actionHandlers.set(name, list);
      });
    },
    onCollide(a: string, b: string, fn: (self: GameObject, other: GameObject) => void) {
      register('닿았을 때', () => world.collideHandlers.push({ a, b, fn }));
    },

    // 관찰
    sensors(list: SensorDesc[]) {
      if (world.phase !== 'setup') return world.warn('관찰 설정은 이벤트 안에서 쓸 수 없어요');
      world.sensors = list.filter(Boolean);
    },
    sensor: sensorFactory,

    // 객체
    create(spec: CreateSpec) {
      if (!spec || typeof spec.tag !== 'string' || !spec.tag) return world.warn('태그 없는 객체는 만들 수 없어요');
      world.spawn({
        tag: spec.tag,
        x: num(spec.x, 200),
        y: num(spec.y, 150),
        w: Math.max(0, num(spec.w, 20)),
        h: Math.max(0, num(spec.h, 20)),
        color: typeof spec.color === 'string' ? spec.color : '#888888',
        vx: num(spec.vx),
        vy: num(spec.vy),
      });
    },
    destroy(t: Target) {
      for (const o of all(t)) o.alive = false;
    },
    setBehavior(tag: string, kind: BehaviorKind, param?: number | string) {
      if (!BEHAVIOR_KINDS.includes(kind)) return world.warn(`알 수 없는 Behavior '${kind}'`);
      const b = (world.behaviors[tag] ??= {});
      if (kind === 'gravity') b.gravity = num(param, DEFAULT_GRAVITY);
      else if (kind === 'bounceWalls') b.bounceWalls = param === 'noBottom' ? 'noBottom' : 'all';
      else b[kind] = true;
    },
    clearBehavior(tag: string, kind: BehaviorKind) {
      const b = world.behaviors[tag];
      if (b) delete b[kind];
    },

    // 꾸미기 (그리기 전용: 물리·관찰에 영향 없음)
    setCostume(tag: string, name: string) {
      world.costumes[tag] = String(name);
    },
    rainbow(n: number): string {
      const i = Math.round(num(n));
      return RAINBOW[((i % RAINBOW.length) + RAINBOW.length) % RAINBOW.length];
    },

    // 움직임
    setPos(t: Target, x: number, y: number) {
      for (const o of all(t)) {
        o.x = num(x);
        o.y = num(y);
      }
    },
    move(t: Target, axis: Axis, d: number) {
      const k = axisKey(axis, false);
      for (const o of all(t)) o[k] += num(d);
    },
    setVel(t: Target, axis: Axis, v: number) {
      const k = axisKey(axis, true);
      for (const o of all(t)) o[k] = num(v);
    },
    changeVel(t: Target, axis: Axis, dv: number) {
      const k = axisKey(axis, true);
      for (const o of all(t)) o[k] += num(dv);
    },
    bounce(self: Target, other: Target) {
      const s = one(self);
      const o = one(other);
      if (s && o && s !== o) bouncePhys(s, o);
    },

    // 게임
    addScore(n: number) {
      world.setScore(world.score + num(n));
    },
    setScore(n: number) {
      world.setScore(num(n));
    },
    gameOver() {
      world.endGame();
    },
    /** 강화학습 보상. 이번 step 보상 = 점수 변화 + 보상 블록 합 */
    reward(n: number) {
      world.giveReward(num(n));
    },

    // 값
    get(t: Target, prop: Prop): number {
      const o = one(t);
      return o && prop in o ? (o[prop] as number) : 0;
    },
    onGround(t: Target): boolean {
      return one(t)?.onGround ?? false;
    },
    count(tag: string): number {
      let n = 0;
      for (const o of world.objects) if (o.alive && o.tag === tag) n++;
      return n;
    },
    score: () => world.score,
    frame: () => world.frame,
    randInt: (a: number, b: number) => world.rng.int(num(a), num(b)),
    random: () => world.rng.next(),

    // 런타임 훅 (생성 코드 전용): 현재 블록 표시, 반복 안전장치
    $b(id: string) {
      world.currentBlock = id;
    },
    $loop() {
      if (++world.loopCount > LOOP_LIMIT) {
        throw new ScriptError(`반복이 ${LOOP_LIMIT.toLocaleString()}번을 넘어서 멈췄어요. 반복 횟수를 줄여 주세요`, world.currentBlock);
      }
    },
  };
}

export type Api = ReturnType<typeof createApi>;
