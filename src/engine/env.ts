// Gymnasium 스타일 reset/step 환경. Node 에서 DOM 없이 돈다.

import { compile, type Program } from '../runtime/compile';
import { createApi } from './api';
import { Rng } from './rng';
import { computeObservation, describeSensors, type DebugShape } from './sensors';
import { ALL_ACTIONS, DEFAULT_SETTINGS, type ActionName, type GameEvent, type Project, type WorldState } from './types';
import { ScriptError, World } from './world';

export interface StepInfo {
  score: number;
  frame: number;
  events: GameEvent[];
}

export interface StepResult {
  obs: number[];
  reward: number;
  terminated: boolean;
  truncated: boolean;
  info: StepInfo;
}

export interface Env {
  actionSpace: { n: number; names: ActionName[] };
  observationSpace: { shape: [number]; labels: string[]; low: number[]; high: number[] };
  reset(seed?: number): { obs: number[]; info: StepInfo };
  step(action: number): StepResult;
  getWorld(): Readonly<WorldState>;
  /** 렌더러 오버레이용. 현재 월드로 센서를 다시 계산해 도형을 돌려준다 */
  getDebugShapes(): DebugShape[];
  readonly seed: number;
  readonly maxSteps: number;
  readonly background: string;
  readonly backdrop: string;
}

/** 행동 인덱스는 명세 표 순서에서 체크된 것만 남긴 순서. none 은 항상 포함 */
export function actionNames(actions: readonly string[]): ActionName[] {
  return ALL_ACTIONS.filter((a) => a === 'none' || actions.includes(a));
}

export function createEnv(project: Project): Env {
  const settings = { ...DEFAULT_SETTINGS, ...project.settings };
  const names = actionNames(settings.actions);
  const scoreReward = settings.scoreReward !== false;
  const maxSteps = Math.max(1, Math.round(Number(settings.maxSteps) || DEFAULT_SETTINGS.maxSteps));
  const program: Program = compile(project.generatedCode);
  // reset(seed) 에 시드를 주지 않으면 이 수열에서 꺼낸다 (전역 난수는 쓰지 않는다)
  const seedSeq = new Rng(0x5eed);

  let world: World;
  let obs: number[] = [];
  let done = false;
  let terminatedAt = false; // done 일 때 terminated 였는지 (아니면 truncated)
  let seed = 0;

  const error = (e: unknown): GameEvent => ({
    type: 'error',
    message: e instanceof Error ? e.message : String(e),
    blockId: e instanceof ScriptError ? e.blockId : null,
    frame: world?.frame ?? 0,
  });

  const info = (): StepInfo => ({ score: world.score, frame: world.frame, events: world.events });

  function reset(s?: number) {
    seed = s === undefined ? Math.floor(seedSeq.next() * 2 ** 31) : s >>> 0;
    world = new World(seed);
    done = false;
    terminatedAt = false;
    try {
      program(createApi(world));
      world.start();
    } catch (e) {
      world.events.push(error(e));
      done = true;
      terminatedAt = true;
    }
    obs = computeObservation(world, world.sensors);
    return { obs, info: info() };
  }

  // 관찰 공간은 센서 선언으로 정해진다. 한 번 실행해 확정한다
  reset(0);
  const space = describeSensors(world!.sensors);

  return {
    actionSpace: { n: names.length, names },
    observationSpace: { shape: [space.labels.length], ...space },
    get seed() {
      return seed;
    },
    maxSteps,
    background: settings.background,
    backdrop: settings.backdrop,
    reset,
    step(action: number): StepResult {
      if (!Number.isInteger(action) || action < 0 || action >= names.length) {
        throw new RangeError(`행동 인덱스 ${action} 는 0..${names.length - 1} 범위여야 합니다`);
      }
      if (done) {
        return { obs, reward: 0, terminated: terminatedAt, truncated: !terminatedAt, info: { ...info(), events: [] } };
      }
      const before = world.score;
      let failed = false;
      try {
        world.step(names[action]);
      } catch (e) {
        world.events.push(error(e));
        failed = true;
      }
      obs = computeObservation(world, world.sensors);
      const terminated = world.gameOver || failed;
      const truncated = !terminated && world.frame >= maxSteps;
      done = terminated || truncated;
      terminatedAt = terminated;
      return { obs, reward: (scoreReward ? world.score - before : 0) + world.rewardAcc, terminated, truncated, info: info() };
    },
    getWorld: () => world,
    getDebugShapes() {
      const shapes: DebugShape[] = [];
      computeObservation(world, world.sensors, shapes);
      return shapes;
    },
  };
}
