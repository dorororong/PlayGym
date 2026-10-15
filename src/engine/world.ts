// 월드 상태와 step 루프. 실행 순서는 명세 4.4절을 그대로 따른다 (tests/world.test.ts 가 고정).

import { applyDestroyOffscreen, applyGravity, applyScreenBounds, applySolids } from './behaviors';
import { integrate, overlaps } from './physics';
import { Rng } from './rng';
import type { SensorDesc } from './sensors';
import {
  MAX_OBJECTS,
  type ActionName,
  type GameEvent,
  type GameObject,
  type TagBehaviors,
  type WorldState,
} from './types';

type Fn = () => void;
type CollideFn = (self: GameObject, other: GameObject) => void;

/** 학생 코드(핸들러)에서 난 예외. 마지막으로 실행 중이던 블록 id 를 들고 있다 */
export class ScriptError extends Error {
  constructor(
    message: string,
    readonly blockId: string | null,
  ) {
    super(message);
  }
}

export const LOOP_LIMIT = 10000;

export class World implements WorldState {
  frame = 0;
  score = 0;
  vars: Record<string, unknown> = {};
  gameOver = false;
  objects: GameObject[] = [];
  behaviors: Record<string, TagBehaviors> = {};
  costumes: Record<string, string> = {};

  readonly rng: Rng;
  events: GameEvent[] = [];
  sensors: SensorDesc[] = [];
  /** setup: 생성 코드 최상위 실행 중 (핸들러 등록 가능) */
  phase: 'setup' | 'run' = 'setup';

  readonly startHandlers: Fn[] = [];
  readonly tickHandlers: Fn[] = [];
  readonly intervalHandlers: { n: number; fn: Fn }[] = [];
  readonly actionHandlers = new Map<ActionName, Fn[]>();
  readonly collideHandlers: { a: string; b: string; fn: CollideFn }[] = [];

  /** 이번 step 에 생성 요청된 객체. step 끝(11번)에 들어간다 */
  private pending: GameObject[] = [];
  private nextId = 1;
  private warnedLimit = false;
  /** 이번 step 에 보상 블록으로 준 보상의 합 */
  rewardAcc = 0;
  currentBlock: string | null = null;
  loopCount = 0;

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  /** onStart 실행. 여기서 만든 객체는 reset 직후 바로 존재한다 */
  start(): void {
    this.phase = 'run';
    for (const fn of this.startHandlers) this.call(fn);
    this.flush();
  }

  step(action: ActionName): void {
    // 1. 프레임 증가, 이벤트 초기화. onGround 는 7번까지 이전 step 값이 그대로 남아 읽기용이 된다
    this.frame += 1;
    this.events = [];
    this.rewardAcc = 0;
    this.warnedLimit = false;
    // 2~4. 핸들러
    for (const fn of this.actionHandlers.get(action) ?? []) this.call(fn);
    for (const fn of this.tickHandlers) this.call(fn);
    for (const { n, fn } of this.intervalHandlers) if (this.frame % n === 0) this.call(fn);
    // 5~8. 물리
    const live = this.objects.filter((o) => o.alive);
    applyGravity(live, this.behaviors);
    integrate(live);
    for (const o of live) o.onGround = false;
    applySolids(live, this.behaviors);
    applyScreenBounds(live, this.behaviors);
    // 9. 충돌 이벤트: 겹쳐 있는 동안 매 step
    for (const { a, b, fn } of this.collideHandlers) {
      const as = this.objects.filter((o) => o.alive && o.tag === a);
      const bs = this.objects.filter((o) => o.alive && o.tag === b);
      for (const A of as) {
        for (const B of bs) {
          if (A === B || !A.alive || !B.alive || !overlaps(A, B)) continue;
          this.events.push({ type: 'collide', a, b, selfId: A.id, otherId: B.id, frame: this.frame });
          this.call(fn, A, B);
        }
      }
    }
    // 10. 화면 밖 삭제
    applyDestroyOffscreen(live, this.behaviors);
    // 11. 삭제 표시 제거, 생성 요청 추가
    this.flush();
  }

  private flush(): void {
    if (this.objects.some((o) => !o.alive)) this.objects = this.objects.filter((o) => o.alive);
    if (this.pending.length) {
      for (const o of this.pending) this.objects.push(o);
      this.pending = [];
    }
  }

  call(fn: (...args: never[]) => void, ...args: unknown[]): void {
    this.loopCount = 0;
    this.currentBlock = null;
    try {
      (fn as (...a: unknown[]) => void)(...args);
    } catch (e) {
      if (e instanceof ScriptError) throw e;
      throw new ScriptError(e instanceof Error ? e.message : String(e), this.currentBlock);
    }
  }

  spawn(o: Omit<GameObject, 'id' | 'onGround' | 'alive'>): void {
    let count = this.pending.length;
    for (const x of this.objects) if (x.alive) count++;
    if (count >= MAX_OBJECTS) {
      if (!this.warnedLimit) this.warn(`객체가 ${MAX_OBJECTS}개를 넘어서 '${o.tag}' 만들기를 무시했어요`);
      this.warnedLimit = true;
      return;
    }
    const obj: GameObject = { ...o, id: this.nextId++, onGround: false, alive: true };
    this.pending.push(obj);
  }

  setScore(v: number): void {
    if (v === this.score) return;
    const delta = v - this.score;
    this.score = v;
    this.events.push({ type: 'score', delta, score: v, frame: this.frame });
  }

  giveReward(v: number): void {
    if (v === 0) return;
    this.rewardAcc += v;
    this.events.push({ type: 'reward', value: v, frame: this.frame });
  }

  endGame(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.events.push({ type: 'gameOver', frame: this.frame });
  }

  warn(message: string): void {
    this.events.push({ type: 'warn', message, frame: this.frame });
  }
}
