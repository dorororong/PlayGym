// 1단계: 블록 없이 엔진 API 만으로 손으로 쓴 4개 게임.
// 블록 템플릿(src/templates/*.json)과 같은 시드·행동 열에서 같은 관찰을 내야 한다 (tests/templates.test.ts).

import type { Project, Settings } from '../../engine/types';

const js = (settings: Settings, code: string): Project => ({ version: 1, blocksJson: {}, generatedCode: code, settings });

export const dinoJs = js(
  { actions: ['none', 'up'], maxSteps: 3000, background: '#f7f7f2', backdrop: 'desert' },
  `
api.sensors([
  api.sensor.nearest('player', 'obstacle', 'right'),
  api.sensor.onGround('player'),
]);
api.onStart(() => {
  api.create({ tag: 'ground', x: 200, y: 290, w: 400, h: 20, color: '#555555', vx: 0, vy: 0 });
  api.create({ tag: 'player', x: 60, y: 250, w: 20, h: 30, color: '#22bb77', vx: 0, vy: 0 });
  api.setBehavior('player', 'gravity', 0.8);
  api.setBehavior('ground', 'solid');
  api.setBehavior('obstacle', 'destroyOffscreen');
  api.setCostume('player', 'dino');
  api.setCostume('obstacle', 'cactus');
  api.setCostume('ground', 'groundRun');
});
api.onTick(() => {
  api.addScore(1);
});
api.onInterval(60, () => {
  api.create({ tag: 'obstacle', x: 410, y: 265, w: 15, h: 30, color: '#cc3333', vx: -5, vy: 0 });
});
api.onAction('up', () => {
  if (api.onGround('player')) {
    api.setVel('player', 'y', -12);
  }
});
api.onCollide('player', 'obstacle', (self, other) => {
  api.gameOver();
});
`,
);

export const flappyJs = js(
  { actions: ['none', 'up'], maxSteps: 3000, background: '#bfe6ff', backdrop: 'sky' },
  `
api.sensors([
  api.sensor.position('player'),
  api.sensor.velocity('player'),
  api.sensor.lidar('player', 9, -60, 60, 200, 'obstacle', true),
]);
api.onStart(() => {
  api.create({ tag: 'player', x: 80, y: 150, w: 20, h: 20, color: '#f5c518', vx: 0, vy: 0 });
  api.setBehavior('player', 'gravity', 0.5);
  api.setBehavior('obstacle', 'destroyOffscreen');
  api.setCostume('player', 'duck');
  api.setCostume('obstacle', 'pipe');
  api.setCostume('gate', 'hidden');
});
api.onTick(() => {
  api.reward(0.1);
  if (api.get('player', 'y') < 0 || api.get('player', 'y') > 300) {
    api.reward(-1);
    api.gameOver();
  }
});
api.onInterval(90, () => {
  api.vars['gap'] = api.randInt(80, 220);
  api.create({ tag: 'obstacle', x: 425, y: (api.vars['gap'] - 50) / 2, w: 50, h: api.vars['gap'] - 50, color: '#2e8b3e', vx: -2, vy: 0 });
  api.create({ tag: 'obstacle', x: 425, y: (api.vars['gap'] + 350) / 2, w: 50, h: 250 - api.vars['gap'], color: '#2e8b3e', vx: -2, vy: 0 });
  api.create({ tag: 'gate', x: 425, y: api.vars['gap'], w: 4, h: 100, color: '#ffffff', vx: -2, vy: 0 });
});
api.onAction('up', () => {
  api.setVel('player', 'y', -7);
});
api.onCollide('player', 'obstacle', (self, other) => {
  api.reward(-1);
  api.gameOver();
});
api.onCollide('player', 'gate', (self, other) => {
  api.addScore(1);
  api.destroy(other);
});
`,
);

export const breakoutJs = js(
  { actions: ['none', 'left', 'right'], maxSteps: 3000, background: '#1d2330', backdrop: 'arcade' },
  `
api.sensors([
  api.sensor.position('paddle'),
  api.sensor.position('ball'),
  api.sensor.velocity('ball'),
]);
api.onStart(() => {
  api.create({ tag: 'paddle', x: 200, y: 280, w: 60, h: 10, color: '#4a90d9', vx: 0, vy: 0 });
  api.create({ tag: 'ball', x: 200, y: 200, w: 8, h: 8, color: '#ffffff', vx: 1, vy: 4 });
  for (api.vars['row'] = 0; api.vars['row'] <= 3; api.vars['row'] += 1) {
    for (api.vars['col'] = 0; api.vars['col'] <= 7; api.vars['col'] += 1) {
      api.create({ tag: 'brick', x: 25 + api.vars['col'] * 50, y: 30 + api.vars['row'] * 20, w: 46, h: 16, color: api.rainbow(api.vars['row']), vx: 0, vy: 0 });
    }
  }
  api.setBehavior('paddle', 'stayInScreen');
  api.setBehavior('ball', 'bounceWalls', 'noBottom');
  api.setCostume('paddle', 'paddle');
  api.setCostume('ball', 'ball');
  api.setCostume('brick', 'brick');
});
api.onTick(() => {
  if (api.get('ball', 'y') > 300 || api.count('brick') == 0) {
    api.gameOver();
  }
});
api.onAction('none', () => {
  api.setVel('paddle', 'x', 0);
});
api.onAction('left', () => {
  api.setVel('paddle', 'x', -6);
});
api.onAction('right', () => {
  api.setVel('paddle', 'x', 6);
});
api.onCollide('ball', 'brick', (self, other) => {
  api.destroy(other);
  api.bounce(self, other);
  api.addScore(1);
});
api.onCollide('ball', 'paddle', (self, other) => {
  api.bounce(self, other);
  api.setVel(self, 'x', (api.get(self, 'x') - api.get(other, 'x')) * 0.15);
});
`,
);

// 운석이 네 방향(위·아래·왼쪽·오른쪽)에서 날아온다
export const dodgeJs = js(
  { actions: ['none', 'left', 'right', 'up', 'down'], maxSteps: 3000, background: '#20202a', backdrop: 'space' },
  `
api.sensors([
  api.sensor.position('player'),
  api.sensor.lidar('player', 16, 0, 337.5, 160, 'obstacle', false),
]);
api.onStart(() => {
  api.create({ tag: 'player', x: 200, y: 150, w: 22, h: 22, color: '#5ad1ff', vx: 0, vy: 0 });
  api.setBehavior('player', 'stayInScreen');
  api.setBehavior('obstacle', 'destroyOffscreen');
  api.setCostume('player', 'ship');
  api.setCostume('obstacle', 'meteor');
});
api.onTick(() => {
  api.addScore(1);
});
api.onInterval(12, () => {
  api.vars['side'] = api.randInt(0, 3);
  api.vars['speed'] = api.randInt(2, 4);
  if (api.vars['side'] == 0) {
    api.create({ tag: 'obstacle', x: api.randInt(20, 380), y: -9, w: 18, h: 18, color: '#8b5a2b', vx: api.randInt(-1, 1), vy: api.vars['speed'] });
  }
  if (api.vars['side'] == 1) {
    api.create({ tag: 'obstacle', x: api.randInt(20, 380), y: 309, w: 18, h: 18, color: '#8b5a2b', vx: api.randInt(-1, 1), vy: 0 - api.vars['speed'] });
  }
  if (api.vars['side'] == 2) {
    api.create({ tag: 'obstacle', x: -9, y: api.randInt(20, 280), w: 18, h: 18, color: '#8b5a2b', vx: api.vars['speed'], vy: api.randInt(-1, 1) });
  }
  if (api.vars['side'] == 3) {
    api.create({ tag: 'obstacle', x: 409, y: api.randInt(20, 280), w: 18, h: 18, color: '#8b5a2b', vx: 0 - api.vars['speed'], vy: api.randInt(-1, 1) });
  }
});
api.onAction('left', () => {
  api.move('player', 'x', -4);
});
api.onAction('right', () => {
  api.move('player', 'x', 4);
});
api.onAction('up', () => {
  api.move('player', 'y', -4);
});
api.onAction('down', () => {
  api.move('player', 'y', 4);
});
api.onCollide('player', 'obstacle', (self, other) => {
  api.gameOver();
});
`,
);

export const jsTemplates = { dino: dinoJs, flappy: flappyJs, breakout: breakoutJs, dodge: dodgeJs };
