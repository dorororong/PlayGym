// 블록 → 엔진 API 호출 JS 코드 생성기. 커스텀 블록 하나는 API 호출 하나가 된다.

import type * as BlocklyTypes from 'blockly/core';
import { Blockly, javascriptGenerator as gen, Order } from './blockly';
import { ALL_ACTIONS, DEFAULT_SETTINGS, type ActionName, type Project, type Settings } from '../engine/types';
import { HAT_TYPES, registerBlocks } from './definitions';

type B = BlocklyTypes.Block;

const q = (s: string) => gen.quote_(s);
const text = (b: B, name: string) => b.getField(name)?.getText() ?? '';
const val = (b: B, name: string, d = '0') => gen.valueToCode(b, name, Order.NONE) || d;
const tgt = (b: B) => gen.valueToCode(b, 'T', Order.NONE) || 'null';
const body = (b: B) => gen.statementToCode(b, 'DO');
const n = (b: B, name: string) => String(Number(b.getFieldValue(name)) || 0);

const SENSOR_GEN: Record<string, (b: B) => string> = {
  pg_s_position: (b) => `api.sensor.position(${q(text(b, 'SUBJECT'))})`,
  pg_s_velocity: (b) => `api.sensor.velocity(${q(text(b, 'SUBJECT'))})`,
  pg_s_nearest: (b) => `api.sensor.nearest(${q(text(b, 'SUBJECT'))}, ${q(text(b, 'TARGET'))}, ${q(b.getFieldValue('DIR'))})`,
  pg_s_distance: (b) => `api.sensor.distance(${q(text(b, 'SUBJECT'))}, ${q(text(b, 'TARGET'))})`,
  pg_s_lidar: (b) =>
    `api.sensor.lidar(${q(text(b, 'SUBJECT'))}, ${n(b, 'RAYS')}, ${n(b, 'START')}, ${n(b, 'END')}, ${n(b, 'MAXDIST')}, ${q(
      text(b, 'TARGET'),
    )}, ${b.getFieldValue('BOUNDS') === 'TRUE'})`,
  pg_s_on_ground: (b) => `api.sensor.onGround(${q(text(b, 'SUBJECT'))})`,
  pg_s_variable: (b) => `api.sensor.variable(${q(text(b, 'VAR'))}, ${n(b, 'MIN')}, ${n(b, 'MAX')})`,
  pg_s_nearest_k: (b) =>
    `api.sensor.nearestK(${q(text(b, 'SUBJECT'))}, ${q(text(b, 'TARGET'))}, ${n(b, 'K')}, ${q(b.getFieldValue('DIR'))})`,
  pg_s_count: (b) => `api.sensor.count(${q(text(b, 'TARGET'))}, ${n(b, 'MAX')})`,
  pg_s_grid: (b) =>
    `api.sensor.grid(${q(text(b, 'SUBJECT'))}, ${q(text(b, 'TARGET'))}, ${n(b, 'ROWS')}, ${n(b, 'COLS')}, ${n(b, 'CELL')})`,
  pg_s_score: (b) => `api.sensor.score(${n(b, 'MIN')}, ${n(b, 'MAX')})`,
  pg_s_prop: (b) => `api.sensor.prop(${q(text(b, 'SUBJECT'))}, ${q(b.getFieldValue('PROP'))}, ${n(b, 'MIN')}, ${n(b, 'MAX')})`,
};

let installed = false;

export function installGenerators(): void {
  if (installed) return;
  installed = true;
  registerBlocks();

  // 문장마다 현재 블록 id 를 남겨 오류를 블록으로 역추적하고, 반복 본문마다 횟수를 센다
  gen.STATEMENT_PREFIX = 'api.$b(%1);\n';
  gen.INFINITE_LOOP_TRAP = 'api.$loop();\n';
  gen.addReservedWords('api,self,other');

  const f = gen.forBlock;

  // 설정 (환경 설정은 코드가 아니라 Project.settings 로 간다)
  f['pg_settings'] = () => '';
  f['pg_observe'] = (b) => {
    // 센서가 아닌 블록이 끼어 있어도 배열 문법이 깨지지 않게 센서만 골라 쓴다
    const items: string[] = [];
    for (let c = b.getInputTargetBlock('SENSORS'); c; c = c.getNextBlock()) {
      const g = SENSOR_GEN[c.type];
      if (g && c.isEnabled()) items.push(`  ${g(c)},\n`);
    }
    return `api.sensors([\n${items.join('')}]);\n`;
  };
  for (const t of Object.keys(SENSOR_GEN)) f[t] = () => '';

  // 이벤트
  f['pg_on_start'] = (b) => `api.onStart(() => {\n${body(b)}});\n`;
  f['pg_on_tick'] = (b) => `api.onTick(() => {\n${body(b)}});\n`;
  f['pg_on_interval'] = (b) => `api.onInterval(${n(b, 'N')}, () => {\n${body(b)}});\n`;
  f['pg_on_action'] = (b) => `api.onAction(${q(b.getFieldValue('ACTION'))}, () => {\n${body(b)}});\n`;
  f['pg_on_collide'] = (b) =>
    `api.onCollide(${q(text(b, 'A'))}, ${q(text(b, 'B'))}, (self, other) => {\n${body(b)}});\n`;

  // 객체
  f['pg_create'] = (b) =>
    `api.create({ tag: ${q(text(b, 'TAG'))}, x: ${val(b, 'X')}, y: ${val(b, 'Y')}, w: ${val(b, 'W', '20')}, h: ${val(
      b,
      'H',
      '20',
    )}, color: ${val(b, 'COLOR', "'#888888'")}, vx: ${val(b, 'VX')}, vy: ${val(b, 'VY')} });\n`;
  f['pg_destroy'] = (b) => `api.destroy(${tgt(b)});\n`;
  f['pg_set_behavior'] = (b) => {
    const kind: string = b.getFieldValue('KIND');
    const tag = q(text(b, 'TAG'));
    if (kind === 'gravity') return `api.setBehavior(${tag}, 'gravity', ${n(b, 'PARAM')});\n`;
    if (kind.startsWith('bounceWalls_')) return `api.setBehavior(${tag}, 'bounceWalls', ${q(kind.slice(12))});\n`;
    return `api.setBehavior(${tag}, ${q(kind)});\n`;
  };
  f['pg_set_costume'] = (b) => `api.setCostume(${q(text(b, 'TAG'))}, ${q(b.getFieldValue('COSTUME'))});
`;
  f['pg_colour'] = (b) => [q(b.getFieldValue('C')), Order.ATOMIC];
  f['pg_rainbow'] = (b) => [`api.rainbow(${val(b, 'N')})`, Order.FUNCTION_CALL];
  f['pg_clear_behavior'] = (b) => `api.clearBehavior(${q(text(b, 'TAG'))}, ${q(b.getFieldValue('KIND'))});\n`;

  // 움직임
  f['pg_set_pos'] = (b) => `api.setPos(${tgt(b)}, ${val(b, 'X')}, ${val(b, 'Y')});\n`;
  f['pg_move'] = (b) => `api.move(${tgt(b)}, ${q(b.getFieldValue('AXIS'))}, ${val(b, 'D')});\n`;
  f['pg_set_vel'] = (b) => `api.setVel(${tgt(b)}, ${q(b.getFieldValue('AXIS'))}, ${val(b, 'V')});\n`;
  f['pg_change_vel'] = (b) => `api.changeVel(${tgt(b)}, ${q(b.getFieldValue('AXIS'))}, ${val(b, 'DV')});\n`;
  f['pg_bounce'] = () => `api.bounce(self, other);\n`;

  // 게임
  f['pg_add_score'] = (b) => `api.addScore(${val(b, 'N')});\n`;
  f['pg_reward'] = (b) => `api.reward(${val(b, 'N')});\n`;
  f['pg_set_score'] = (b) => `api.setScore(${val(b, 'N')});\n`;
  f['pg_game_over'] = () => `api.gameOver();\n`;

  // 값
  f['pg_self'] = () => ['self', Order.ATOMIC];
  f['pg_other'] = () => ['other', Order.ATOMIC];
  f['pg_tag'] = (b) => [q(text(b, 'TAG')), Order.ATOMIC];
  f['pg_get'] = (b) => [`api.get(${tgt(b)}, ${q(b.getFieldValue('PROP'))})`, Order.FUNCTION_CALL];
  f['pg_on_ground'] = (b) => [`api.onGround(${tgt(b)})`, Order.FUNCTION_CALL];
  f['pg_count'] = (b) => [`api.count(${q(text(b, 'TAG'))})`, Order.FUNCTION_CALL];
  f['pg_score'] = () => ['api.score()', Order.FUNCTION_CALL];
  f['pg_frame'] = () => ['api.frame()', Order.FUNCTION_CALL];

  // 난수: 엔진 RNG 사용
  f['math_random_int'] = (b) => [`api.randInt(${val(b, 'FROM')}, ${val(b, 'TO')})`, Order.FUNCTION_CALL];
  f['math_random_float'] = () => ['api.random()', Order.FUNCTION_CALL];

  // 변수: 모두 api.vars 에 저장해 변수 센서가 읽을 수 있게 한다
  const v = (b: B) => `api.vars[${q(text(b, 'VAR'))}]`;
  f['variables_get'] = (b) => [v(b), Order.MEMBER];
  f['variables_set'] = (b) => `${v(b)} = ${gen.valueToCode(b, 'VALUE', Order.ASSIGNMENT) || '0'};\n`;
  f['math_change'] = (b) => `${v(b)} = (Number(${v(b)}) || 0) + ${gen.valueToCode(b, 'DELTA', Order.ADDITION) || '0'};\n`;
  f['controls_for'] = (b) => {
    const x = v(b);
    const from = gen.valueToCode(b, 'FROM', Order.ASSIGNMENT) || '0';
    const to = gen.valueToCode(b, 'TO', Order.ASSIGNMENT) || '0';
    const by = gen.valueToCode(b, 'BY', Order.ASSIGNMENT) || '1';
    const branch = gen.addLoopTrap(gen.statementToCode(b, 'DO'), b);
    return (
      `{\n  const $a = ${from}, $z = ${to}, $s = ($a <= $z ? 1 : -1) * (Math.abs(${by}) || 1);\n` +
      `  for (${x} = $a; $s > 0 ? ${x} <= $z : ${x} >= $z; ${x} += $s) {\n${gen.prefixLines(branch, '  ')}  }\n}\n`
    );
  };
}

/** 최상위 이벤트(모자) 블록만 코드로 만든다. 떠 있는 블록은 실행하지 않는다 */
export function generateCode(ws: BlocklyTypes.Workspace): string {
  installGenerators();
  gen.init(ws);
  let code = '';
  for (const b of ws.getTopBlocks(true)) {
    if (!HAT_TYPES.includes(b.type) || !b.isEnabled()) continue;
    const c = gen.blockToCode(b, true);
    code += typeof c === 'string' ? c : c[0];
  }
  // Blockly 는 모든 변수를 var 로 선언하는데 api.vars 를 쓰므로 필요 없다
  delete (gen as unknown as { definitions_: Record<string, string> }).definitions_['variables'];
  return gen.finish(code);
}

export function readSettings(ws: BlocklyTypes.Workspace): Settings {
  const b = ws.getTopBlocks(true).find((x) => x.type === 'pg_settings' && x.isEnabled());
  if (!b) return { ...DEFAULT_SETTINGS };
  const checked: Record<string, string> = { left: 'LEFT', right: 'RIGHT', up: 'UP', down: 'DOWN', a: 'A', b: 'B' };
  const actions = ALL_ACTIONS.filter((a) => a === 'none' || b.getFieldValue(checked[a]) === 'TRUE') as ActionName[];
  return {
    actions,
    maxSteps: Math.max(1, Math.round(Number(b.getFieldValue('MAXSTEPS')) || DEFAULT_SETTINGS.maxSteps)),
    background: b.getFieldValue('BG') || DEFAULT_SETTINGS.background,
    backdrop: b.getFieldValue('BACKDROP') || DEFAULT_SETTINGS.backdrop,
    scoreReward: b.getFieldValue('SCORE_REWARD') !== 'FALSE',
  };
}

export function projectFromWorkspace(ws: BlocklyTypes.Workspace): Project {
  return {
    version: 1,
    blocksJson: Blockly.serialization.workspaces.save(ws),
    generatedCode: generateCode(ws),
    settings: readSettings(ws),
  };
}
