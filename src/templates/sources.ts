// 4개 스타터 템플릿의 블록 버전. src/templates/js 의 손으로 쓴 JS 와 같은 게임이다.
// `npm run templates` 가 이것으로 src/templates/*.json 을 만든다.

import type { Keymap } from '../engine/types';
import type { LearnConfig } from '../rl/config';
import { TemplateBuilder, type Value } from './builder';

export function dinoBlocks() {
  const t = new TemplateBuilder('dino');
  t.settings(['none', 'up'], 3000, '#f7f7f2', 'desert');
  t.observe([t.sNearest('player', 'obstacle', 'right'), t.sOnGround('player')]);
  t.onStart([
    t.create('ground', 200, 290, 400, 20, '#555555', 0, 0),
    t.create('player', 60, 250, 20, 30, '#22bb77', 0, 0),
    t.setBehavior('player', 'gravity', 0.8),
    t.setBehavior('ground', 'solid'),
    t.setBehavior('obstacle', 'destroyOffscreen'),
    t.costume('player', 'dino'),
    t.costume('obstacle', 'cactus'),
    t.costume('ground', 'groundRun'),
  ]);
  t.onTick([t.addScore(1)]);
  t.onInterval(60, [t.create('obstacle', 410, 265, 15, 30, '#cc3333', -5, 0)]);
  t.onAction('up', [t.if(t.onGround(t.tag('player')), [t.setVel(t.tag('player'), 'y', -12)])]);
  t.onCollide('player', 'obstacle', [t.gameOver()]);
  return t.build();
}

export function flappyBlocks() {
  const t = new TemplateBuilder('flappy');
  const py = () => t.get(t.tag('player'), 'y');
  t.settings(['none', 'up'], 3000, '#bfe6ff', 'sky');
  t.observe([t.sPosition('player'), t.sVelocity('player'), t.sLidar('player', 9, -60, 60, 200, 'obstacle', true)]);
  t.onStart([
    t.create('player', 80, 150, 20, 20, '#f5c518', 0, 0),
    t.setBehavior('player', 'gravity', 0.5),
    t.setBehavior('obstacle', 'destroyOffscreen'),
    t.costume('player', 'duck'),
    t.costume('obstacle', 'pipe'),
    t.costume('gate', 'hidden'),
  ]);
  // 살아 있는 동안 조금씩 보상, 부딪히면 벌점 (점수와 따로 정한 강화학습 보상)
  t.onTick([t.reward(0.1), t.if(t.or(t.compare('LT', py(), 0), t.compare('GT', py(), 300)), [t.reward(-1), t.gameOver()])]);
  t.onInterval(90, [
    t.setVar('gap', t.randInt(80, 220)),
    t.create('obstacle', 425, t.math('DIVIDE', t.math('MINUS', t.getVar('gap'), 50), 2), 50, t.math('MINUS', t.getVar('gap'), 50), '#2e8b3e', -2, 0),
    t.create('obstacle', 425, t.math('DIVIDE', t.math('ADD', t.getVar('gap'), 350), 2), 50, t.math('MINUS', 250, t.getVar('gap')), '#2e8b3e', -2, 0),
    // 파이프 사이 틈에 보이지 않는 통과 지점 (지나가면 점수, 화면 밖 삭제는 걸지 않는다: 생길 때 화면 밖이라 바로 지워진다)
    t.create('gate', 425, t.getVar('gap'), 4, 100, '#ffffff', -2, 0),
  ]);
  t.onAction('up', [t.setVel(t.tag('player'), 'y', -7)]);
  t.onCollide('player', 'obstacle', [t.reward(-1), t.gameOver()]);
  t.onCollide('player', 'gate', [t.addScore(1), t.destroy(t.other())]);
  return t.build();
}

export function breakoutBlocks() {
  const t = new TemplateBuilder('breakout');
  t.settings(['none', 'left', 'right'], 3000, '#1d2330', 'arcade');
  t.observe([t.sPosition('paddle'), t.sPosition('ball'), t.sVelocity('ball')]);
  t.onStart([
    t.create('paddle', 200, 280, 60, 10, '#4a90d9', 0, 0),
    t.create('ball', 200, 200, 8, 8, '#ffffff', 1, 4),
    t.for('row', 0, 3, 1, [
      t.for('col', 0, 7, 1, [
        t.create(
          'brick',
          t.math('ADD', 25, t.math('MULTIPLY', t.getVar('col'), 50)),
          t.math('ADD', 30, t.math('MULTIPLY', t.getVar('row'), 20)),
          46,
          16,
          t.rainbow(t.getVar('row')),
          0,
          0,
        ),
      ]),
    ]),
    t.setBehavior('paddle', 'stayInScreen'),
    t.setBehavior('ball', 'bounceWalls_noBottom'),
    t.costume('paddle', 'paddle'),
    t.costume('ball', 'ball'),
    t.costume('brick', 'brick'),
  ]);
  t.onTick([t.if(t.or(t.compare('GT', t.get(t.tag('ball'), 'y'), 300), t.compare('EQ', t.count('brick'), 0)), [t.gameOver()])]);
  t.onAction('none', [t.setVel(t.tag('paddle'), 'x', 0)]);
  t.onAction('left', [t.setVel(t.tag('paddle'), 'x', -6)]);
  t.onAction('right', [t.setVel(t.tag('paddle'), 'x', 6)]);
  t.onCollide('ball', 'brick', [t.destroy(t.other()), t.bounce(), t.addScore(1)]);
  t.onCollide('ball', 'paddle', [
    t.bounce(),
    t.setVel(t.self(), 'x', t.math('MULTIPLY', t.math('MINUS', t.get(t.self(), 'x'), t.get(t.other(), 'x')), 0.15)),
  ]);
  return t.build();
}

/** 장애물 피하기: 운석이 네 방향(위·아래·왼쪽·오른쪽)에서 날아온다 */
export function dodgeBlocks() {
  const t = new TemplateBuilder('dodge');
  const side = (n: number) => t.compare('EQ', t.getVar('side'), n);
  const speed = () => t.getVar('speed');
  const minus = () => t.math('MINUS', 0, t.getVar('speed'));
  const rock = '#8b5a2b';
  t.settings(['none', 'left', 'right', 'up', 'down'], 3000, '#20202a', 'space');
  t.observe([t.sPosition('player'), t.sLidar('player', 16, 0, 337.5, 160, 'obstacle', false)]);
  t.onStart([
    t.create('player', 200, 150, 22, 22, '#5ad1ff', 0, 0),
    t.setBehavior('player', 'stayInScreen'),
    t.setBehavior('obstacle', 'destroyOffscreen'),
    t.costume('player', 'ship'),
    t.costume('obstacle', 'meteor'),
  ]);
  t.onTick([t.addScore(1)]);
  t.onInterval(12, [
    t.setVar('side', t.randInt(0, 3)),
    t.setVar('speed', t.randInt(2, 4)),
    t.if(side(0), [t.create('obstacle', t.randInt(20, 380), -9, 18, 18, rock, t.randInt(-1, 1), speed())]),
    t.if(side(1), [t.create('obstacle', t.randInt(20, 380), 309, 18, 18, rock, t.randInt(-1, 1), minus())]),
    t.if(side(2), [t.create('obstacle', -9, t.randInt(20, 280), 18, 18, rock, speed(), t.randInt(-1, 1))]),
    t.if(side(3), [t.create('obstacle', 409, t.randInt(20, 280), 18, 18, rock, minus(), t.randInt(-1, 1))]),
  ]);
  t.onAction('left', [t.move(t.tag('player'), 'x', -4)]);
  t.onAction('right', [t.move(t.tag('player'), 'x', 4)]);
  t.onAction('up', [t.move(t.tag('player'), 'y', -4)]);
  t.onAction('down', [t.move(t.tag('player'), 'y', 4)]);
  t.onCollide('player', 'obstacle', [t.gameOver()]);
  return t.build();
}

// ─────────────── Atari 스타일 (조금 더 복잡한 게임) ───────────────
// 원작의 이름·그래픽은 쓰지 않고 규칙의 뼈대만 빌려 블록으로 다시 만들었다.

/** 우주 침략자: 외계인 무리가 좌우로 오가며 내려온다. A 버튼으로 한 발씩 쏜다 */
export function invadersBlocks() {
  const t = new TemplateBuilder('invaders');
  const alienTag = () => t.tag('alien');
  t.settings(['none', 'left', 'right', 'a'], 3000, '#1d2330', 'space');
  t.observe([
    t.sPosition('player'),
    t.sNearestK(3, 'player', 'alien', 'all'),
    t.sNearestK(2, 'player', 'bomb', 'up'),
    t.sCount('bullet', 1),
    t.sCount('alien', 18),
  ]);
  t.onStart([
    t.create('player', 200, 280, 24, 16, '#5ad1ff', 0, 0),
    // 보이지 않는 벽(좌우)과 바닥선: 외계인 무리가 닿으면 방향을 바꾸거나 게임이 끝난다
    t.create('wall', -5, 150, 10, 300, '#ffffff', 0, 0),
    t.create('wall', 405, 150, 10, 300, '#ffffff', 0, 0),
    t.create('floor', 200, 266, 400, 4, '#ffffff', 0, 0),
    t.setVar('dir', 1),
    t.setVar('turned', 0),
    t.for('row', 0, 2, 1, [
      t.for('col', 0, 5, 1, [
        t.create('alien', t.math('ADD', 80, t.math('MULTIPLY', t.getVar('col'), 44)), t.math('ADD', 40, t.math('MULTIPLY', t.getVar('row'), 30)), 22, 16, t.rainbow(t.math('ADD', t.getVar('row'), 4)), 1, 0),
      ]),
    ]),
    t.setBehavior('player', 'stayInScreen'),
    t.setBehavior('bullet', 'destroyOffscreen'),
    t.setBehavior('bomb', 'destroyOffscreen'),
    t.costume('player', 'ship'),
    t.costume('alien', 'alien'),
    t.costume('wall', 'hidden'),
    t.costume('floor', 'hidden'),
  ]);
  t.onTick([t.if(t.compare('EQ', t.count('alien'), 0), [t.gameOver()])]);
  // 무리가 벽에 닿으면 방향을 바꾸고 한 칸 내려온다 (여러 마리가 동시에 닿아도 한 번만)
  t.onCollide('alien', 'wall', [
    t.if(t.compare('GT', t.math('MINUS', t.frame(), t.getVar('turned')), 10), [
      t.setVar('dir', t.math('MINUS', 0, t.getVar('dir'))),
      t.setVar('turned', t.frame()),
      t.setVel(alienTag(), 'x', t.math('MULTIPLY', t.getVar('dir'), t.math('ADD', 1, t.math('DIVIDE', t.math('MINUS', 18, t.count('alien')), 9)))),
      t.move(alienTag(), 'y', 8),
    ]),
  ]);
  t.onInterval(45, [
    t.if(t.compare('GT', t.count('alien'), 0), [
      t.create('bomb', t.randInt(20, 380), t.math('ADD', t.get(alienTag(), 'y'), 50), 4, 8, '#ff4d4d', 0, 3),
    ]),
  ]);
  t.onAction('none', [t.setVel(t.tag('player'), 'x', 0)]);
  t.onAction('left', [t.setVel(t.tag('player'), 'x', -4)]);
  t.onAction('right', [t.setVel(t.tag('player'), 'x', 4)]);
  t.onAction('a', [
    t.if(t.compare('EQ', t.count('bullet'), 0), [t.create('bullet', t.get(t.tag('player'), 'x'), 268, 4, 10, '#ffd23f', 0, -8)]),
  ]);
  t.onCollide('bullet', 'alien', [t.destroy(t.self()), t.destroy(t.other()), t.addScore(1)]);
  t.onCollide('bomb', 'player', [t.reward(-1), t.gameOver()]);
  t.onCollide('alien', 'floor', [t.reward(-1), t.gameOver()]);
  return t.build();
}

/** 핑퐁: 컴퓨터와 공 주고받기. 먼저 5점을 내면 끝 */
export function pongBlocks() {
  const t = new TemplateBuilder('pong');
  const ball = () => t.tag('ball');
  const cpu = () => t.tag('cpu');
  const serve = () => [
    t.setPos(ball(), 200, 150),
    t.setVel(ball(), 'x', t.math('MINUS', t.math('MULTIPLY', t.randInt(0, 1), 8), 4)),
    t.setVel(ball(), 'y', t.randInt(-3, 3)),
  ];
  const hit = () => [t.bounce(), t.setVel(t.self(), 'y', t.math('MULTIPLY', t.math('MINUS', t.get(t.self(), 'y'), t.get(t.other(), 'y')), 0.15))];
  t.settings(['none', 'up', 'down'], 3000, '#1d2330', 'arcade');
  t.observe([t.sPosition('player'), t.sPosition('ball'), t.sVelocity('ball'), t.sProp('cpu', 'y', 0, 300)]);
  t.onStart([
    t.create('player', 385, 150, 8, 50, '#5ad1ff', 0, 0),
    t.create('cpu', 15, 150, 8, 50, '#ff6b6b', 0, 0),
    t.create('ball', 200, 150, 8, 8, '#ffffff', 0, 0),
    t.create('edge', 200, -5, 400, 10, '#ffffff', 0, 0),
    t.create('edge', 200, 305, 400, 10, '#ffffff', 0, 0),
    t.setVar('cpuScore', 0),
    t.setBehavior('player', 'stayInScreen'),
    t.setBehavior('cpu', 'stayInScreen'),
    t.costume('player', 'paddle'),
    t.costume('cpu', 'paddle'),
    t.costume('ball', 'ball'),
    t.costume('edge', 'hidden'),
  ]);
  t.onTick([
    // 컴퓨터는 공이 자기 쪽으로 올 때만 따라가고, 사람보다 느리다 (이길 수 있게)
    t.setVel(cpu(), 'y', 0),
    t.if(t.and(t.compare('LT', t.get(ball(), 'vx'), 0), t.compare('LT', t.get(cpu(), 'y'), t.math('MINUS', t.get(ball(), 'y'), 6))), [t.setVel(cpu(), 'y', 2.5)]),
    t.if(t.and(t.compare('LT', t.get(ball(), 'vx'), 0), t.compare('GT', t.get(cpu(), 'y'), t.math('ADD', t.get(ball(), 'y'), 6))), [t.setVel(cpu(), 'y', -2.5)]),
    // 처음 프레임에 공을 던진다
    t.if(t.compare('EQ', t.frame(), 1), serve()),
    // 공이 왼쪽으로 나가면 내 점수, 오른쪽으로 나가면 컴퓨터 점수
    t.if(t.compare('LT', t.get(ball(), 'x'), 0), [t.addScore(1), ...serve()]),
    t.if(t.compare('GT', t.get(ball(), 'x'), 400), [t.setVar('cpuScore', t.math('ADD', t.getVar('cpuScore'), 1)), t.reward(-1), ...serve()]),
    t.if(t.or(t.compare('GTE', t.getVar('cpuScore'), 5), t.compare('GTE', t.score(), 5)), [t.gameOver()]),
  ]);
  t.onAction('none', [t.setVel(t.tag('player'), 'y', 0)]);
  t.onAction('up', [t.setVel(t.tag('player'), 'y', -5)]);
  t.onAction('down', [t.setVel(t.tag('player'), 'y', 5)]);
  t.onCollide('ball', 'player', hit());
  t.onCollide('ball', 'cpu', hit());
  t.onCollide('ball', 'edge', [t.bounce()]);
  return t.build();
}

/**
 * 닭 길 건너기 (Freeway 형). 8차선 도로를 건너면 1점. 차는 화면 반대편으로 이어진다 (seamless).
 *  - 보통: 치이면 한 칸 밀려난다.
 *  - 어려움(hard): 치이면 출발점으로 (Frogger 식). 차를 방향별 태그(carL·carR)로 나눠 AI 가 차의 방향을 본다.
 * 보상은 "올라간 만큼" (잠재함수 기반): 밀려나거나 출발점으로 돌아가면 잃은 높이만큼 깎인다.
 * 치일 때 따로 벌점을 주면 AI 가 "아예 안 건너기" 를 배워 버린다 (experiments/freeway, experiments/atari).
 */
function freewayGame(hard: boolean) {
  const t = new TemplateBuilder(hard ? 'freewayHard' : 'freeway');
  const lane = () => t.getVar('lane');
  const py = () => t.get(t.tag('player'), 'y');
  const carTags = hard ? ['carL', 'carR'] : ['car'];
  t.settings(['none', 'up', 'down'], 2000, '#2e8b3e', 'road');
  t.observe([t.sProp('player', 'y', 0, 300), ...carTags.map((c) => t.sGrid('player', 5, 9, 28, c))]);
  // 차선마다 방향이 번갈아 바뀌고(짝수 ←, 홀수 →) 빠르기가 다르다
  const vx = () => t.math('MULTIPLY', t.math('MINUS', t.math('MULTIPLY', t.mod(lane(), 2), 2), 1), t.math('ADD', 1, t.math('MULTIPLY', t.mod(lane(), 3), 0.75)));
  const car = (tag: string) =>
    t.create(tag, t.math('ADD', t.math('MULTIPLY', t.getVar('k'), 200), t.randInt(0, 150)), t.math('ADD', 50, t.math('MULTIPLY', lane(), 28)), 30, 16, t.rainbow(lane()), vx(), 0);
  t.onStart([
    t.create('player', 200, 285, 18, 18, '#ffffff', 0, 0),
    t.setVar('prevY', 285),
    t.for('lane', 0, 7, 1, [
      t.for('k', 0, 1, 1, hard ? [t.if(t.compare('EQ', t.mod(lane(), 2), 0), [car('carL')]), t.if(t.compare('EQ', t.mod(lane(), 2), 1), [car('carR')])] : [car('car')]),
    ]),
    ...carTags.flatMap((c) => [t.setBehavior(c, 'wrap'), t.costume(c, 'car')]),
    t.setBehavior('player', 'stayInScreen'),
    t.costume('player', 'chicken'),
  ]);
  t.onTick([
    // 올라간 만큼 보상 (한 번 건너면 약 +1). 내려가면 그만큼 마이너스
    t.reward(t.math('MULTIPLY', t.math('MINUS', t.getVar('prevY'), py()), 0.004)),
    t.setVar('prevY', py()),
    t.if(t.compare('LT', py(), 30), [t.addScore(1), t.setPos(t.tag('player'), 200, 285), t.setVar('prevY', 285)]),
  ]);
  t.onAction('up', [t.move(t.tag('player'), 'y', -3)]);
  t.onAction('down', [t.move(t.tag('player'), 'y', 3)]);
  for (const c of carTags) t.onCollide('player', c, [hard ? t.setPos(t.self(), 200, 285) : t.move(t.self(), 'y', 28)]);
  return t.build();
}

/**
 * 끝없는 길 건너기 (Crossy Road 식): 위로 가면 화면이 따라 올라가고 새 길이 계속 생긴다.
 * 상하좌우로 움직이고, 차에 치이면 끝. 점수 = 가장 멀리 간 줄 수 (점수 = 보상).
 * 화면을 올리는 방법: 닭이 화면 가운데보다 위로 가면 모든 것을 그만큼 아래로 민다.
 */
export function crossyBlocks() {
  const t = new TemplateBuilder('crossy');
  const LANE = 30;
  const TOP = 170; // 닭이 이보다 위로 가면 화면이 따라 올라간다
  const py = () => t.get(t.tag('player'), 'y');
  const v = (n: string) => t.getVar(n);
  t.settings(['none', 'up', 'down', 'left', 'right'], 3000, '#2e8b3e', 'none');
  t.observe([t.sProp('player', 'x', 0, 400), t.sProp('player', 'y', 0, 300), t.sGrid('player', 5, 9, LANE, 'carL'), t.sGrid('player', 5, 9, LANE, 'carR')]);
  // 새 줄 하나: 30% 풀밭, 70% 도로. 도로는 방향(←/→)과 빠르기를 정하고 차 1~3대. 멀리 갈수록 빨라진다
  const cars = (tag: string, sign: number, y: () => Record<string, unknown>) =>
    t.for('k', 1, t.randInt(1, 3), 1, [
      t.create(tag, t.math('ADD', t.math('MULTIPLY', v('k'), 130), t.randInt(0, 60)), y(), 34, 18, t.rainbow(t.randInt(0, 6)), t.math('MULTIPLY', v('spd'), sign), 0),
    ]);
  const lane = (y: () => Record<string, unknown>) => [
    t.setVar('kind', t.randInt(1, 10)),
    t.if(t.compare('LTE', v('kind'), 3), [t.create('grass', 200, y(), 400, LANE, '#22bb77', 0, 0)]),
    t.if(t.compare('GT', v('kind'), 3), [
      t.create('road', 200, y(), 400, LANE, '#555555', 0, 0),
      t.setVar('spd', t.math('ADD', t.math('ADD', 1, t.math('MULTIPLY', t.randInt(0, 10), 0.15)), t.math('MULTIPLY', t.score(), 0.02))),
      t.setVar('dir', t.randInt(0, 1)),
      t.if(t.compare('EQ', v('dir'), 0), [cars('carL', -1, y)]),
      t.if(t.compare('EQ', v('dir'), 1), [cars('carR', 1, y)]),
    ]),
  ];
  const rowY = () => t.math('MINUS', 285, t.math('MULTIPLY', v('row'), LANE));
  t.onStart([
    // 처음 두 줄은 풀밭 (출발 지점)
    t.for('row', 0, 9, 1, [t.if(t.compare('LT', v('row'), 2), [t.create('grass', 200, rowY(), 400, LANE, '#22bb77', 0, 0)]), t.if(t.compare('GTE', v('row'), 2), lane(rowY))]),
    t.setVar('topY', 15),
    t.setVar('scrolled', 0),
    t.create('player', 200, 285, 18, 18, '#ffffff', 0, 0),
    // 화면 아래로 빠진 줄과 차를 치우는 보이지 않는 바닥
    t.create('sweeper', 200, 340, 600, 20, '#000000', 0, 0),
    t.setBehavior('player', 'stayInScreen'),
    t.setBehavior('carL', 'wrap_x'),
    t.setBehavior('carR', 'wrap_x'),
    t.costume('player', 'chicken'),
    t.costume('carL', 'car'),
    t.costume('carR', 'car'),
    t.costume('road', 'road'),
    t.costume('grass', 'grass'),
    t.costume('sweeper', 'hidden'),
  ]);
  const shift = () => t.getVar('d');
  t.onTick([
    // 화면 따라 올라가기: 닭이 TOP 보다 위면 모두 그만큼 아래로
    t.if(t.compare('LT', py(), TOP), [
      t.setVar('d', t.math('MINUS', TOP, py())),
      ...['player', 'road', 'grass', 'carL', 'carR'].map((tag) => t.move(t.tag(tag), 'y', shift())),
      t.setVar('topY', t.math('ADD', v('topY'), shift())),
      t.setVar('scrolled', t.math('ADD', v('scrolled'), shift())),
    ]),
    // 맨 위 줄이 내려와 빈틈이 생기면 그 위에 새 줄
    t.if(t.compare('GT', v('topY'), LANE / 2), [t.setVar('topY', t.math('MINUS', v('topY'), LANE)), ...lane(() => v('topY'))]),
    // 가장 멀리 간 줄 수가 점수
    t.if(t.compare('GTE', t.math('ADD', v('scrolled'), t.math('MINUS', 285, py())), t.math('MULTIPLY', t.math('ADD', t.score(), 1), LANE)), [t.addScore(1)]),
  ]);
  t.onAction('up', [t.move(t.tag('player'), 'y', -3)]);
  t.onAction('down', [t.move(t.tag('player'), 'y', 3)]);
  t.onAction('left', [t.move(t.tag('player'), 'x', -3)]);
  t.onAction('right', [t.move(t.tag('player'), 'x', 3)]);
  t.onCollide('player', 'carL', [t.gameOver()]);
  t.onCollide('player', 'carR', [t.gameOver()]);
  for (const tag of ['road', 'grass', 'carL', 'carR']) t.onCollide(tag, 'sweeper', [t.destroy(t.self())]);
  return t.build();
}

/**
 * 막대 세우기 (CartPole): 강화학습의 "Hello World". 수레를 좌우로 밀어 막대가 쓰러지지 않게 한다.
 * 물리는 Gymnasium CartPole-v1 과 같은 식 (1프레임 = 0.02초). 버틴 프레임 수가 점수 (최대 500).
 */
export function cartpoleBlocks() {
  const t = new TemplateBuilder('cartpole');
  const v = (n: string) => t.getVar(n);
  const add = (a: Value, b: Value) => t.math('ADD', a, b);
  const sub = (a: Value, b: Value) => t.math('MINUS', a, b);
  const mul = (a: Value, b: Value) => t.math('MULTIPLY', a, b);
  const div = (a: Value, b: Value) => t.math('DIVIDE', a, b);
  const DEG = 57.29578; // 라디안 → 도 (sin·cos 블록은 도 단위)
  const SCALE = 80; // 1m = 80px
  const CART_Y = 220;
  const small = () => mul(t.randInt(-50, 50), 0.001); // -0.05 ~ 0.05
  t.settings(['none', 'left', 'right'], 500, '#bfe6ff', 'sky');
  t.observe([t.sVariable('x', -2.4, 2.4), t.sVariable('xdot', -3, 3), t.sVariable('theta', -0.21, 0.21), t.sVariable('thetadot', -3.5, 3.5)]);
  t.onStart([
    t.create('track', 200, CART_Y + 16, 400, 6, '#555555', 0, 0),
    t.setVar('x', small()),
    t.setVar('xdot', small()),
    t.setVar('theta', small()),
    t.setVar('thetadot', small()),
    t.setVar('force', 0),
    t.create('cart', add(200, mul(v('x'), SCALE)), CART_Y, 50, 26, '#3355cc', 0, 0),
    t.costume('track', 'box'),
    t.costume('cart', 'box'),
    t.costume('pole', 'box'),
  ]);
  t.onAction('none', [t.setVar('force', 0)]);
  t.onAction('left', [t.setVar('force', -10)]);
  t.onAction('right', [t.setVar('force', 10)]);
  t.onTick([
    // 막대 물리 (질량: 수레 1kg, 막대 0.1kg, 막대 반 길이 0.5m, 중력 9.8)
    t.setVar('s', t.trig('SIN', mul(v('theta'), DEG))),
    t.setVar('c', t.trig('COS', mul(v('theta'), DEG))),
    t.setVar('temp', div(add(v('force'), mul(mul(0.05, mul(v('thetadot'), v('thetadot'))), v('s'))), 1.1)),
    t.setVar('tacc', div(sub(mul(9.8, v('s')), mul(v('c'), v('temp'))), mul(0.5, sub(1.3333, div(mul(0.1, mul(v('c'), v('c'))), 1.1))))),
    t.setVar('xacc', sub(v('temp'), div(mul(mul(0.05, v('tacc')), v('c')), 1.1))),
    t.setVar('x', add(v('x'), mul(0.02, v('xdot')))),
    t.setVar('xdot', add(v('xdot'), mul(0.02, v('xacc')))),
    t.setVar('theta', add(v('theta'), mul(0.02, v('thetadot')))),
    t.setVar('thetadot', add(v('thetadot'), mul(0.02, v('tacc')))),
    // 그리기: 수레를 옮기고, 막대는 작은 네모 8개로 다시 그린다
    t.setPos(t.tag('cart'), add(200, mul(v('x'), SCALE)), CART_Y),
    t.destroy(t.tag('pole')),
    t.for('i', 1, 8, 1, [
      t.create('pole', add(add(200, mul(v('x'), SCALE)), mul(t.trig('SIN', mul(v('theta'), DEG)), mul(v('i'), 10))), sub(CART_Y - 10, mul(t.trig('COS', mul(v('theta'), DEG)), mul(v('i'), 10))), 7, 9, '#f39c12', 0, 0),
    ]),
    t.addScore(1),
    // 막대가 12° 넘게 기울거나 수레가 화면 끝(±2.4m)을 넘으면 끝
    t.if(t.or(t.or(t.compare('GT', v('theta'), 0.2095), t.compare('LT', v('theta'), -0.2095)), t.or(t.compare('GT', v('x'), 2.4), t.compare('LT', v('x'), -2.4))), [t.gameOver()]),
  ]);
  return t.build();
}

/**
 * 뱀 게임 (Snake): 6프레임마다 한 칸 움직인다. 먹이를 먹으면 길어지고, 벽이나 자기 몸에 닿으면 끝.
 * 몸 = 지나온 칸마다 만든 "body". 먹지 않았으면 가장 먼저 만든 body(꼬리)를 지운다.
 * 100칸을 가는 동안 못 먹으면 배고파서 끝 — 없으면 AI 가 "빙빙 돌며 버티기"를 배운다.
 */
export function snakeBlocks(opt: { closer?: boolean } = {}) {
  const t = new TemplateBuilder('snake');
  const v = (n: string) => t.getVar(n);
  const C = 20; // 한 칸
  const hx = () => t.get(t.tag('head'), 'x');
  const hy = () => t.get(t.tag('head'), 'y');
  const food = () => t.create('food', t.math('ADD', 10, t.math('MULTIPLY', t.randInt(0, 19), C)), t.math('ADD', 10, t.math('MULTIPLY', t.randInt(0, 14), C)), 14, 14, '#f5c518', 0, 0);
  t.settings(['none', 'up', 'down', 'left', 'right'], 3000, '#1d2330', 'none');
  t.observe([
    t.sNearest('head', 'food', 'all'),
    t.sLidar('head', 4, 0, 270, 60, 'body', true),
    t.sVariable('dx', -1, 1),
    t.sVariable('dy', -1, 1),
  ]);
  t.onStart([
    // 꼬리부터 만든다 (가장 먼저 만든 body = 꼬리)
    t.for('i', 0, 2, 1, [t.create('body', t.math('ADD', 150, t.math('MULTIPLY', v('i'), C)), 150, 18, 18, '#22bb77', 0, 0)]),
    t.create('head', 210, 150, 18, 18, '#4cd964', 0, 0),
    food(),
    t.setVar('dx', 1),
    t.setVar('dy', 0),
    t.setVar('ndx', 1),
    t.setVar('ndy', 0),
    t.setVar('ate', 0),
    t.setVar('hunger', 0),
    t.costume('head', 'slime'),
    t.costume('body', 'box'),
    t.costume('food', 'coin'),
  ]);
  // 반대로 바로 돌 수는 없다 (지금 가로로 가고 있을 때만 위·아래로)
  t.onAction('up', [t.if(t.compare('EQ', v('dy'), 0), [t.setVar('ndx', 0), t.setVar('ndy', -1)])]);
  t.onAction('down', [t.if(t.compare('EQ', v('dy'), 0), [t.setVar('ndx', 0), t.setVar('ndy', 1)])]);
  t.onAction('left', [t.if(t.compare('EQ', v('dx'), 0), [t.setVar('ndx', -1), t.setVar('ndy', 0)])]);
  t.onAction('right', [t.if(t.compare('EQ', v('dx'), 0), [t.setVar('ndx', 1), t.setVar('ndy', 0)])]);
  // closer: 먹이에 가까워지면 +0.1, 멀어지면 -0.15 (거리² 비교, 칸 단위)
  const d2 = () =>
    t.math(
      'ADD',
      t.math('MULTIPLY', t.math('DIVIDE', t.math('MINUS', hx(), t.get(t.tag('food'), 'x')), C), t.math('DIVIDE', t.math('MINUS', hx(), t.get(t.tag('food'), 'x')), C)),
      t.math('MULTIPLY', t.math('DIVIDE', t.math('MINUS', hy(), t.get(t.tag('food'), 'y')), C), t.math('DIVIDE', t.math('MINUS', hy(), t.get(t.tag('food'), 'y')), C)),
    );
  const closer = opt.closer
    ? [
        t.setVar('dist', d2()),
        t.if(t.compare('LT', v('dist'), v('prevDist')), [t.reward(0.1)]),
        t.if(t.compare('GT', v('dist'), v('prevDist')), [t.reward(-0.15)]),
        t.setVar('prevDist', v('dist')),
      ]
    : [];
  t.onInterval(6, [
    ...(opt.closer ? [t.setVar('prevDist', d2())] : []),
    t.setVar('dx', v('ndx')),
    t.setVar('dy', v('ndy')),
    t.create('body', hx(), hy(), 18, 18, '#22bb77', 0, 0),
    t.move(t.tag('head'), 'x', t.math('MULTIPLY', v('dx'), C)),
    t.move(t.tag('head'), 'y', t.math('MULTIPLY', v('dy'), C)),
    t.if(t.compare('EQ', v('ate'), 0), [t.destroy(t.first('body'))]),
    t.setVar('ate', 0),
    t.setVar('hunger', t.math('ADD', v('hunger'), 1)),
    ...closer,
    t.if(t.compare('GT', v('hunger'), 100), [t.gameOver()]),
    t.if(t.or(t.or(t.compare('LT', hx(), 0), t.compare('GT', hx(), 400)), t.or(t.compare('LT', hy(), 0), t.compare('GT', hy(), 300))), [t.gameOver()]),
  ]);
  t.onCollide('head', 'food', [t.destroy(t.other()), t.setVar('ate', 1), t.setVar('hunger', 0), t.addScore(1), food()]);
  t.onCollide('head', 'body', [t.gameOver()]);
  return t.build();
}

export const freewayBlocks = () => freewayGame(false);
export const freewayHardBlocks = () => freewayGame(true);

export const TEMPLATE_SOURCES = {
  dino: dinoBlocks,
  flappy: flappyBlocks,
  breakout: breakoutBlocks,
  dodge: dodgeBlocks,
  invaders: invadersBlocks,
  pong: pongBlocks,
  crossy: crossyBlocks,
  cartpole: cartpoleBlocks,
  snake: () => snakeBlocks(),
  freeway: freewayBlocks,
  freewayHard: freewayHardBlocks,
};

/**
 * 템플릿별 학습 설정. 실험(experiments/)으로 정했다:
 * 공룡은 4프레임 유지라야 "기다렸다 점프"를 찾고, 점핑덕은 날갯짓이 섬세해야 해서 2프레임이 낫다.
 */
export const TEMPLATE_TRAINING: Record<keyof typeof TEMPLATE_SOURCES, Partial<LearnConfig>> = {
  dino: { steps: 300_000, frameSkip: 4 },
  flappy: { steps: 1_500_000, frameSkip: 2 },
  breakout: { steps: 1_500_000, frameSkip: 4 },
  dodge: { steps: 1_500_000, frameSkip: 4 },
  // Atari 스타일은 실험에서 DQN 이 더 나았다 (experiments/atari: 우주 침략자 DQN 16.9 / PPO 11.2, 핑퐁 DQN 1.5~3.1 / PPO 0.6~1.3)
  invaders: { algo: 'dqn', steps: 3_000_000, frameSkip: 4, lr: 5e-4, network: { hidden: [64, 64], activation: 'relu' } },
  pong: { algo: 'dqn', steps: 1_500_000, frameSkip: 4, lr: 5e-4, network: { hidden: [64, 64], activation: 'relu' } },
  crossy: { steps: 1_500_000, frameSkip: 4 },
  cartpole: { steps: 300_000, frameSkip: 1 },
  // 6프레임마다 한 칸 → 한 칸에 한 번 고른다. DQN 14~18개 / PPO 5.7개 (experiments/classics)
  snake: { algo: 'dqn', steps: 1_500_000, frameSkip: 6, lr: 5e-4, network: { hidden: [64, 64], activation: 'relu' } },
  freeway: { steps: 1_500_000, frameSkip: 4 },
  // 피하기를 배우려면 오래 걸린다 (experiments/freeway: 항상 위로 3.2, 정답 정책 9.0).
  // PPO 300만 5.6~5.7 (213초) ≈ DQN 300만 5.3 (565초) → 빠른 PPO. 이어서 학습하면 6.2~6.4 까지 오른다
  freewayHard: { steps: 3_000_000, frameSkip: 4 },
};

/** 템플릿별 사람 플레이 키 (기본 매핑 위에 덮어씀) */
const jumpKeys: Keymap = { up: ['ArrowUp', 'Space', 'KeyW'] };
const sideKeys: Keymap = { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'] };
const wasdKeys: Keymap = { ...sideKeys, up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'] };
export const TEMPLATE_KEYMAPS: Record<keyof typeof TEMPLATE_SOURCES, Keymap> = {
  dino: jumpKeys,
  flappy: jumpKeys,
  breakout: sideKeys,
  dodge: wasdKeys,
  invaders: { ...sideKeys, a: ['Space', 'KeyJ'] },
  pong: { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'] },
  crossy: wasdKeys,
  cartpole: sideKeys,
  snake: wasdKeys,
  freeway: { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'] },
  freewayHard: { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'] },
};
