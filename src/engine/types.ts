// 엔진 공통 타입. DOM 의존 금지.

export const WORLD_W = 400;
export const WORLD_H = 300;
export const MAX_OBJECTS = 300;

/** 명세 5장 표 순서 + A/B 버튼. 행동 인덱스는 이 순서에서 체크된 것만 남긴 순서다. */
export const ALL_ACTIONS = ['none', 'left', 'right', 'up', 'down', 'a', 'b'] as const;
export type ActionName = (typeof ALL_ACTIONS)[number];

/** 사람 플레이용 키 매핑: 행동 → KeyboardEvent.code 목록. 엔진은 쓰지 않는다 */
export type Keymap = Partial<Record<ActionName, string[]>>;

export interface GameObject {
  id: number;
  tag: string;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  color: string;
  onGround: boolean;
  alive: boolean;
}

export type BehaviorKind = 'gravity' | 'solid' | 'stayInScreen' | 'bounceWalls' | 'destroyOffscreen' | 'wrap';
export type BounceMode = 'all' | 'noBottom';
/** gravity → g, bounceWalls → 모드, 나머지 → 매개변수 없음(true) */
export type BehaviorParam = number | BounceMode | true;
export type TagBehaviors = Partial<Record<BehaviorKind, BehaviorParam>>;

export type GameEvent =
  | { type: 'score'; delta: number; score: number; frame: number }
  | { type: 'gameOver'; frame: number }
  | { type: 'reward'; value: number; frame: number }
  | { type: 'collide'; a: string; b: string; selfId: number; otherId: number; frame: number }
  | { type: 'warn'; message: string; frame: number }
  | { type: 'error'; message: string; blockId: string | null; frame: number };

export interface WorldState {
  frame: number;
  score: number;
  vars: Record<string, unknown>;
  gameOver: boolean;
  objects: GameObject[];
  behaviors: Record<string, TagBehaviors>;
  /** 태그 → 모양 이름. 그리기 전용이며 물리·관찰과 무관하다 */
  costumes: Record<string, string>;
}

export interface Settings {
  actions: ActionName[];
  maxSteps: number;
  background: string;
  /** 배경 그림 이름 ('none' 이면 단색 background). 그리기 전용 */
  backdrop: string;
  /** 점수 변화를 AI 보상에 넣을지 (끄면 "AI 에게 보상 주기" 블록만 보상이 된다). 기본 true */
  scoreReward?: boolean;
}

export interface Project {
  version: 1;
  blocksJson: object;
  generatedCode: string;
  settings: Settings;
  /** 사람 플레이 키 매핑 (없으면 기본값). RL 환경과는 무관하다 */
  keymap?: Keymap;
  /** 학습 설계 (src/rl/config.ts 의 LearnConfig 일부. 없는 값은 기본값) */
  training?: Record<string, unknown>;
  /** 학습된 AI (src/rl/agent.ts 의 AgentJson) */
  model?: unknown;
  /** 사용자가 그린 픽셀 그림 (이름 → src/render/pixelArt.ts 의 PixelArt). 그리기 전용 */
  costumes?: Record<string, unknown>;
  /** 모양 탭에서 활성화한 모양 키 (블록의 모양 목록에 나오는 것) */
  assets?: string[];
  /** 마지막 학습 기록: 학습 곡선과 체크포인트 녹화 (src/ui/trainPanel.ts 의 TrainingRun) */
  trainingRun?: unknown;
}

export const DEFAULT_SETTINGS: Settings = { actions: ['none'], maxSteps: 3000, background: '#f4f4f4', backdrop: 'none' };

/** 무지개 색 블록이 돌려주는 색 (블록깨기 줄 색 등) */
export const RAINBOW = ['#ff4d4d', '#ff9f1a', '#ffd23f', '#4cd964', '#3fa9f5', '#7c5cff', '#ff5fa2'];
