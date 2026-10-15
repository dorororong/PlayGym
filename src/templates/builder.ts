// 템플릿용 Blockly 직렬화 JSON 빌더. 블록 id 를 고정해서 저장된 generatedCode 의
// api.$b('id') 가 블록과 항상 맞게 한다. scripts/build-templates.ts 가 JSON 을 만든다.

import { TAG_TYPE } from '../blocks/definitions';
import type { ActionName } from '../engine/types';

type Json = Record<string, unknown>;
export type Value = number | Json; // 숫자면 math_number 그림자 블록, 아니면 블록

export class TemplateBuilder {
  private n = 0;
  private y = 20;
  private variables: { name: string; id: string; type: string }[] = [];
  private tops: Json[] = [];

  constructor(private prefix: string) {
    for (const t of ['player', 'obstacle', 'ground']) this.tagId(t);
  }

  private id(): string {
    return `${this.prefix}_${++this.n}`;
  }

  private varId(name: string, type: string): string {
    let v = this.variables.find((x) => x.name === name && x.type === type);
    if (!v) this.variables.push((v = { name, id: `${this.prefix}_${type || 'var'}_${name}`, type }));
    return v.id;
  }

  tagId(name: string) {
    return this.varId(name, TAG_TYPE);
  }

  private tagF = (name: string) => ({ id: this.tagId(name) });
  private varF = (name: string) => ({ id: this.varId(name, '') });

  block(type: string, fields: Json = {}, inputs: Json = {}): Json {
    return { type, id: this.id(), fields, inputs };
  }

  value(v: Value): Json {
    return typeof v === 'number' ? { shadow: { type: 'math_number', id: this.id(), fields: { NUM: v } } } : { block: v };
  }

  /** 문장 블록 배열을 next 로 이어 첫 블록을 돌려준다 */
  chain(stmts: Json[]): Json | undefined {
    for (let i = stmts.length - 2; i >= 0; i--) stmts[i].next = { block: stmts[i + 1] };
    return stmts[0];
  }

  private hat(type: string, fields: Json, stmts: Json[], inputName = 'DO') {
    const b = this.block(type, fields);
    const first = this.chain(stmts);
    if (first) (b.inputs as Json)[inputName] = { block: first };
    b.x = 20;
    b.y = this.y;
    // 실제 높이와 무관하게 순서만 지키면 된다 (getTopBlocks(true) 가 y 순으로 정렬). 화면 배치는 UI 가 정리한다
    this.y += 100;
    this.tops.push(b);
  }

  // 설정
  settings(actions: ActionName[], maxSteps: number, bg: string, backdrop = 'none', scoreReward = true) {
    const on = (a: ActionName) => (actions.includes(a) ? 'TRUE' : 'FALSE');
    this.hat(
      'pg_settings',
      { LEFT: on('left'), RIGHT: on('right'), UP: on('up'), DOWN: on('down'), A: on('a'), B: on('b'), MAXSTEPS: maxSteps, SCORE_REWARD: scoreReward ? 'TRUE' : 'FALSE', BACKDROP: backdrop, BG: bg },
      [],
    );
  }
  observe(sensors: Json[]) {
    this.hat('pg_observe', {}, sensors, 'SENSORS');
  }

  // 이벤트
  onStart(s: Json[]) { this.hat('pg_on_start', {}, s); }
  onTick(s: Json[]) { this.hat('pg_on_tick', {}, s); }
  onInterval(n: number, s: Json[]) { this.hat('pg_on_interval', { N: n }, s); }
  onAction(a: ActionName, s: Json[]) { this.hat('pg_on_action', { ACTION: a }, s); }
  onCollide(a: string, b: string, s: Json[]) { this.hat('pg_on_collide', { A: this.tagF(a), B: this.tagF(b) }, s); }

  // 객체
  create(tag: string, x: Value, y: Value, w: Value, h: Value, color: string | Json, vx: Value, vy: Value) {
    const v = (k: Value) => this.value(k);
    const c = typeof color === 'string' ? { shadow: this.colour(color) } : { block: color };
    return this.block('pg_create', { TAG: this.tagF(tag) }, { X: v(x), Y: v(y), W: v(w), H: v(h), COLOR: c, VX: v(vx), VY: v(vy) });
  }
  colour(c: string) { return this.block('pg_colour', { C: c }); }
  rainbow(n: Value) { return this.block('pg_rainbow', {}, { N: this.value(n) }); }
  costume(tag: string, name: string) { return this.block('pg_set_costume', { TAG: this.tagF(tag), COSTUME: name }); }
  destroy(t: Json) { return this.block('pg_destroy', {}, { T: { block: t } }); }
  setBehavior(tag: string, kind: string, param = 0.5) {
    return this.block('pg_set_behavior', { TAG: this.tagF(tag), KIND: kind, PARAM: param });
  }

  // 움직임
  setVel(t: Json, axis: 'x' | 'y', v: Value) { return this.block('pg_set_vel', { AXIS: axis }, { T: { block: t }, V: this.value(v) }); }
  move(t: Json, axis: 'x' | 'y', d: Value) { return this.block('pg_move', { AXIS: axis }, { T: { block: t }, D: this.value(d) }); }
  setPos(t: Json, x: Value, y: Value) { return this.block('pg_set_pos', {}, { T: { block: t }, X: this.value(x), Y: this.value(y) }); }
  bounce() { return this.block('pg_bounce'); }

  // 게임
  addScore(n: Value) { return this.block('pg_add_score', {}, { N: this.value(n) }); }
  reward(n: Value) { return this.block('pg_reward', {}, { N: this.value(n) }); }
  gameOver() { return this.block('pg_game_over'); }

  // 값
  tag(name: string) { return this.block('pg_tag', { TAG: this.tagF(name) }); }
  self() { return this.block('pg_self'); }
  first(tag: string) { return this.block('pg_first', { TAG: this.tagF(tag) }); }
  /** 삼각함수 (Blockly 는 각도를 도 단위로 받는다) */
  trig(op: 'SIN' | 'COS', deg: Value) { return this.block('math_trig', { OP: op }, { NUM: this.value(deg) }); }
  other() { return this.block('pg_other'); }
  get(t: Json, prop: string) { return this.block('pg_get', { PROP: prop }, { T: { block: t } }); }
  onGround(t: Json) { return this.block('pg_on_ground', {}, { T: { block: t } }); }
  count(tag: string) { return this.block('pg_count', { TAG: this.tagF(tag) }); }
  randInt(a: Value, b: Value) { return this.block('math_random_int', {}, { FROM: this.value(a), TO: this.value(b) }); }
  getVar(name: string) { return this.block('variables_get', { VAR: this.varF(name) }); }
  setVar(name: string, v: Value) { return this.block('variables_set', { VAR: this.varF(name) }, { VALUE: this.value(v) }); }
  math(op: 'ADD' | 'MINUS' | 'MULTIPLY' | 'DIVIDE', a: Value, b: Value) {
    return this.block('math_arithmetic', { OP: op }, { A: this.value(a), B: this.value(b) });
  }
  compare(op: 'EQ' | 'NEQ' | 'LT' | 'LTE' | 'GT' | 'GTE', a: Value, b: Value) {
    return this.block('logic_compare', { OP: op }, { A: this.value(a), B: this.value(b) });
  }
  or(a: Json, b: Json) { return this.block('logic_operation', { OP: 'OR' }, { A: { block: a }, B: { block: b } }); }
  and(a: Json, b: Json) { return this.block('logic_operation', { OP: 'AND' }, { A: { block: a }, B: { block: b } }); }
  mod(a: Value, b: Value) { return this.block('math_modulo', {}, { DIVIDEND: this.value(a), DIVISOR: this.value(b) }); }
  frame() { return this.block('pg_frame'); }
  score() { return this.block('pg_score'); }
  if(cond: Json, then: Json[]) {
    const b = this.block('controls_if', {}, { IF0: { block: cond } });
    const first = this.chain(then);
    if (first) (b.inputs as Json).DO0 = { block: first };
    return b;
  }
  for(name: string, from: Value, to: Value, by: Value, s: Json[]) {
    const b = this.block('controls_for', { VAR: this.varF(name) }, { FROM: this.value(from), TO: this.value(to), BY: this.value(by) });
    const first = this.chain(s);
    if (first) (b.inputs as Json).DO = { block: first };
    return b;
  }

  // 센서
  sPosition(subject: string) { return this.block('pg_s_position', { SUBJECT: this.tagF(subject) }); }
  sVelocity(subject: string) { return this.block('pg_s_velocity', { SUBJECT: this.tagF(subject) }); }
  sNearest(subject: string, target: string, dir: string) {
    return this.block('pg_s_nearest', { SUBJECT: this.tagF(subject), TARGET: this.tagF(target), DIR: dir });
  }
  sOnGround(subject: string) { return this.block('pg_s_on_ground', { SUBJECT: this.tagF(subject) }); }
  sNearestK(k: number, subject: string, target: string, dir: string) {
    return this.block('pg_s_nearest_k', { K: k, SUBJECT: this.tagF(subject), TARGET: this.tagF(target), DIR: dir });
  }
  sCount(target: string, max: number) { return this.block('pg_s_count', { TARGET: this.tagF(target), MAX: max }); }
  sGrid(subject: string, rows: number, cols: number, cell: number, target: string) {
    return this.block('pg_s_grid', { SUBJECT: this.tagF(subject), ROWS: rows, COLS: cols, CELL: cell, TARGET: this.tagF(target) });
  }
  sScore(min: number, max: number) { return this.block('pg_s_score', { MIN: min, MAX: max }); }
  sProp(subject: string, prop: string, min: number, max: number) {
    return this.block('pg_s_prop', { SUBJECT: this.tagF(subject), PROP: prop, MIN: min, MAX: max });
  }
  sVariable(name: string, min: number, max: number) { return this.block('pg_s_variable', { VAR: this.varF(name), MIN: min, MAX: max }); }
  sLidar(subject: string, rays: number, start: number, end: number, maxDist: number, target: string, bounds: boolean) {
    return this.block('pg_s_lidar', {
      SUBJECT: this.tagF(subject),
      RAYS: rays,
      START: start,
      END: end,
      MAXDIST: maxDist,
      TARGET: this.tagF(target),
      BOUNDS: bounds ? 'TRUE' : 'FALSE',
    });
  }

  build(): Json {
    return { blocks: { languageVersion: 0, blocks: this.tops }, variables: this.variables };
  }
}
