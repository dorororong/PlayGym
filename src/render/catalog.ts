// 모양·배경 그림 목록 (이름과 블록에 보이는 라벨). DOM 의존 없음 — 블록 정의(Node)도 쓴다.
// 그림은 모두 src/render/costumes.ts · backdrops.ts 에서 코드로 직접 그린 것이다 (외부 이미지 없음).

export const COSTUMES = {
  box: '⬛ 색 사각형',
  dino: '🦖 공룡',
  duck: '🦆 오리',
  ship: '🚀 우주선',
  slime: '🟢 슬라임',
  alien: '👾 외계인',
  chicken: '🐔 닭',
  car: '🚗 자동차',
  cactus: '🌵 선인장',
  pipe: '🟩 파이프',
  meteor: '☄️ 운석',
  paddle: '🏓 패들',
  ball: '⚪ 공',
  brick: '🧱 벽돌',
  ground: '🟫 땅',
  groundRun: '🟫 흐르는 땅',
  star: '⭐ 별',
  coin: '🪙 동전',
  hidden: '👻 안 보임',
} as const;
export type CostumeName = keyof typeof COSTUMES;

export const BACKDROPS = {
  none: '단색',
  sky: '☁️ 하늘',
  desert: '🏜️ 사막',
  space: '🌌 우주',
  night: '🌙 밤',
  arcade: '🕹️ 오락실',
  road: '🛣️ 도로',
} as const;
export type BackdropName = keyof typeof BACKDROPS;
