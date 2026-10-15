// PlayGym 커스텀 블록 정의 (명세 8장). Node(headless)와 브라우저 양쪽에서 쓴다.

import { Blockly, KoMsg } from './blockly';
import type * as BlocklyTypes from 'blockly/core';
import { ko } from '../i18n/ko';
import { BACKDROPS, COSTUMES } from '../render/catalog';
import { CUSTOM_PREFIX, customCostumes, isActiveAsset } from '../render/pixelArt';

export const TAG_TYPE = 'Tag';
export const DEFAULT_TAGS = ['player', 'obstacle', 'ground'];

/** 카테고리 색. PlayGym 고유 팔레트 (다른 블록 코딩 도구의 색 구성을 따르지 않는다) */
export const HUE = {
  settings: '#5b6cff',
  events: '#ff7a59',
  objects: '#14a89a',
  motion: '#2b8fe0',
  game: '#e64980',
  values: '#22a06b',
  sensors: '#f08c00',
  tags: '#8b5cf6',
  decor: '#d6409f',
  variables: '#c2410c',
  logic: '#0e9fb8',
  math: '#5f9e0a',
  loops: '#b8860b',
};

/** 이벤트(모자) 블록. 코드 생성은 이것들의 최상위 인스턴스에서만 한다 */
export const HAT_TYPES = ['pg_settings', 'pg_observe', 'pg_on_start', 'pg_on_tick', 'pg_on_interval', 'pg_on_action', 'pg_on_collide'];
export const SINGLETON_TYPES = { pg_settings: ko.blocks.settings, pg_observe: ko.blocks.observe } as const;

export const COLOURS = [
  '#22bb77', '#2e8b3e', '#5ad1ff', '#4a90d9', '#3355cc', '#8e44ad',
  '#cc3333', '#ff6b6b', '#e07a5f', '#f39c12', '#f5c518', '#ffe66d',
  '#ffffff', '#cccccc', '#888888', '#555555', '#222222', '#000000',
  '#f7f7f2', '#f4f4f4', '#bfe6ff', '#1d2330', '#20202a', '#8b5a2b',
  // 무지개 색 블록과 같은 색
  '#ff4d4d', '#ff9f1a', '#ffd23f', '#4cd964', '#3fa9f5', '#7c5cff', '#ff5fa2',
];

const tagField = (name: string, def: string) => ({
  type: 'field_variable',
  name,
  variable: def,
  variableTypes: [TAG_TYPE],
  defaultType: TAG_TYPE,
});
// 색 선택: DOM 이 필요한 색상 필드 대신 색 견본 그림 드롭다운 (Node headless 에서도 동작)
const swatch = (c: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect x="0.5" y="0.5" width="15" height="15" rx="3" fill="${c}" stroke="#0006"/></svg>`,
  )}`;
const colourField = (name: string, colour: string) => ({
  type: 'field_dropdown',
  name,
  options: [colour, ...COLOURS.filter((c) => c !== colour)].map((c) => [{ src: swatch(c), width: 16, height: 16, alt: c }, c]),
});
const num = (name: string) => ({ type: 'input_value', name, check: 'Number' });
const target = (name = 'T') => ({ type: 'input_value', name, check: 'Target' });
const dropdown = (name: string, options: Record<string, string>) => ({
  type: 'field_dropdown',
  name,
  options: Object.entries(options).map(([k, v]) => [v, k]),
});
const axis = (name = 'AXIS') => ({ type: 'field_dropdown', name, options: [['x', 'x'], ['y', 'y']] });
const ACTION_OPTIONS = ko.actions;
const BEHAVIOR_SET_OPTIONS = {
  gravity: ko.behaviors.gravity,
  solid: ko.behaviors.solid,
  stayInScreen: ko.behaviors.stayInScreen,
  bounceWalls_all: ko.behaviors.bounceWalls_all,
  bounceWalls_noBottom: ko.behaviors.bounceWalls_noBottom,
  destroyOffscreen: ko.behaviors.destroyOffscreen,
  wrap: ko.behaviors.wrap,
};
const BEHAVIOR_CLEAR_OPTIONS = {
  gravity: ko.behaviors.gravity,
  solid: ko.behaviors.solid,
  stayInScreen: ko.behaviors.stayInScreen,
  bounceWalls: ko.behaviors.bounceWalls,
  destroyOffscreen: ko.behaviors.destroyOffscreen,
  wrap: ko.behaviors.wrap,
};

const hat = (type: string, message0: string, args0: object[] = []) => ({
  type,
  message0,
  args0,
  message1: '%1',
  args1: [{ type: 'input_statement', name: 'DO' }],
  colour: HUE.events,
});
const cmd = (type: string, message0: string, args0: object[], colour: string, extra: object = {}) => ({
  type,
  message0,
  args0,
  previousStatement: null,
  nextStatement: null,
  inputsInline: true,
  colour,
  ...extra,
});
const sensor = (type: string, message0: string, args0: object[]) => ({
  type,
  message0,
  args0,
  previousStatement: 'Sensor',
  nextStatement: 'Sensor',
  colour: HUE.sensors,
  extensions: ['pg_sensor_only'],
});

export const BLOCK_DEFS = [
  // 설정
  {
    type: 'pg_settings',
    message0: ko.blocks.settings,
    message1: `${ko.blocks.settingsMoves} ← %1 → %2 ↑ %3 ↓ %4`,
    args1: [
      { type: 'field_checkbox', name: 'LEFT', checked: false },
      { type: 'field_checkbox', name: 'RIGHT', checked: false },
      { type: 'field_checkbox', name: 'UP', checked: true },
      { type: 'field_checkbox', name: 'DOWN', checked: false },
    ],
    message2: `${ko.blocks.settingsButtons} A %1 B %2`,
    args2: [
      { type: 'field_checkbox', name: 'A', checked: false },
      { type: 'field_checkbox', name: 'B', checked: false },
    ],
    message3: `${ko.blocks.settingsMaxSteps} %1 ${ko.blocks.settingsScoreReward} %2`,
    args3: [{ type: 'field_number', name: 'MAXSTEPS', value: 3000, min: 1, precision: 1 }, { type: 'field_checkbox', name: 'SCORE_REWARD', checked: true }],
    message4: `${ko.blocks.settingsBackdrop} %1 ${ko.blocks.settingsBg} %2`,
    args4: [dropdown('BACKDROP', BACKDROPS), colourField('BG', '#f4f4f4')],
    colour: HUE.settings,
  },
  {
    type: 'pg_observe',
    message0: ko.blocks.observe,
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'SENSORS', check: 'Sensor' }],
    colour: HUE.settings,
  },
  // 이벤트
  hat('pg_on_start', ko.blocks.onStart),
  hat('pg_on_tick', ko.blocks.onTick),
  hat('pg_on_interval', ko.blocks.onInterval, [{ type: 'field_number', name: 'N', value: 60, min: 1, precision: 1 }]),
  hat('pg_on_action', ko.blocks.onAction, [dropdown('ACTION', ACTION_OPTIONS)]),
  hat('pg_on_collide', ko.blocks.onCollide, [tagField('A', 'player'), tagField('B', 'obstacle')]),
  // 객체
  cmd('pg_create', ko.blocks.create, [tagField('TAG', 'obstacle')], HUE.objects, {
    message1: `x %1 y %2 ${ko.props.w} %3 ${ko.props.h} %4`,
    args1: [num('X'), num('Y'), num('W'), num('H')],
    message2: `색 %1 ${ko.props.vx} %2 ${ko.props.vy} %3`,
    args2: [{ type: 'input_value', name: 'COLOR', check: 'Colour' }, num('VX'), num('VY')],
  }),
  cmd('pg_destroy', ko.blocks.destroy, [target()], HUE.objects),
  cmd('pg_set_behavior', ko.blocks.setBehavior, [tagField('TAG', 'player'), dropdown('KIND', BEHAVIOR_SET_OPTIONS)], HUE.objects, {
    message1: `${ko.blocks.gravityParam} %1`,
    args1: [{ type: 'field_number', name: 'PARAM', value: 0.5 }],
    extensions: ['pg_behavior_param'],
  }),
  cmd('pg_clear_behavior', ko.blocks.clearBehavior, [tagField('TAG', 'player'), dropdown('KIND', BEHAVIOR_CLEAR_OPTIONS)], HUE.objects),
  // 꾸미기 (그리기 전용)
  cmd('pg_set_costume', ko.blocks.setCostume, [tagField('TAG', 'player'), dropdown('COSTUME', COSTUMES)], HUE.decor, { extensions: ['pg_costume_dynamic'] }),
  { type: 'pg_colour', message0: '%1', args0: [colourField('C', '#cc3333')], output: 'Colour', colour: HUE.decor },
  { type: 'pg_rainbow', message0: ko.blocks.rainbow, args0: [num('N')], inputsInline: true, output: 'Colour', colour: HUE.decor },
  // 움직임
  cmd('pg_set_pos', ko.blocks.setPos, [target(), num('X'), num('Y')], HUE.motion),
  cmd('pg_move', ko.blocks.move, [target(), axis(), num('D')], HUE.motion),
  cmd('pg_set_vel', ko.blocks.setVel, [target(), axis(), num('V')], HUE.motion),
  cmd('pg_change_vel', ko.blocks.changeVel, [target(), axis(), num('DV')], HUE.motion),
  cmd('pg_bounce', ko.blocks.bounce, [], HUE.motion, { extensions: ['pg_collide_only'] }),
  // 게임
  cmd('pg_add_score', ko.blocks.addScore, [num('N')], HUE.game),
  cmd('pg_reward', ko.blocks.reward, [num('N')], HUE.game),
  cmd('pg_set_score', ko.blocks.setScore, [num('N')], HUE.game),
  cmd('pg_game_over', ko.blocks.gameOver, [], HUE.game),
  // 값
  { type: 'pg_self', message0: ko.blocks.self, output: 'Target', colour: HUE.values, extensions: ['pg_collide_only'] },
  { type: 'pg_other', message0: ko.blocks.other, output: 'Target', colour: HUE.values, extensions: ['pg_collide_only'] },
  { type: 'pg_tag', message0: ko.blocks.tag, args0: [tagField('TAG', 'player')], output: 'Target', colour: HUE.tags },
  {
    type: 'pg_get',
    message0: ko.blocks.get,
    args0: [target(), dropdown('PROP', ko.props)],
    inputsInline: true,
    output: 'Number',
    colour: HUE.values,
  },
  { type: 'pg_on_ground', message0: ko.blocks.onGround, args0: [target()], inputsInline: true, output: 'Boolean', colour: HUE.values },
  { type: 'pg_count', message0: ko.blocks.count, args0: [tagField('TAG', 'obstacle')], output: 'Number', colour: HUE.values },
  { type: 'pg_score', message0: ko.blocks.score, output: 'Number', colour: HUE.values },
  { type: 'pg_frame', message0: ko.blocks.frame, output: 'Number', colour: HUE.values },
  // 센서
  sensor('pg_s_position', ko.blocks.sPosition, [tagField('SUBJECT', 'player')]),
  sensor('pg_s_velocity', ko.blocks.sVelocity, [tagField('SUBJECT', 'player')]),
  sensor('pg_s_nearest', ko.blocks.sNearest, [tagField('SUBJECT', 'player'), tagField('TARGET', 'obstacle'), dropdown('DIR', ko.dirs)]),
  sensor('pg_s_distance', ko.blocks.sDistance, [tagField('SUBJECT', 'player'), tagField('TARGET', 'obstacle')]),
  sensor('pg_s_lidar', ko.blocks.sLidar, [
    tagField('SUBJECT', 'player'),
    { type: 'field_number', name: 'RAYS', value: 7, min: 1, max: 32, precision: 1 },
    { type: 'field_number', name: 'START', value: 0 },
    { type: 'field_number', name: 'END', value: 180 },
    { type: 'field_number', name: 'MAXDIST', value: 200, min: 1 },
    tagField('TARGET', 'obstacle'),
    { type: 'field_checkbox', name: 'BOUNDS', checked: false },
  ]),
  sensor('pg_s_on_ground', ko.blocks.sOnGround, [tagField('SUBJECT', 'player')]),
  sensor('pg_s_nearest_k', ko.blocks.sNearestK, [
    { type: 'field_number', name: 'K', value: 3, min: 1, max: 8, precision: 1 },
    tagField('SUBJECT', 'player'),
    tagField('TARGET', 'obstacle'),
    dropdown('DIR', ko.dirs),
  ]),
  sensor('pg_s_count', ko.blocks.sCount, [tagField('TARGET', 'obstacle'), { type: 'field_number', name: 'MAX', value: 10, min: 1 }]),
  sensor('pg_s_grid', ko.blocks.sGrid, [
    tagField('SUBJECT', 'player'),
    { type: 'field_number', name: 'ROWS', value: 5, min: 1, max: 16, precision: 1 },
    { type: 'field_number', name: 'COLS', value: 5, min: 1, max: 16, precision: 1 },
    { type: 'field_number', name: 'CELL', value: 30, min: 0 },
    tagField('TARGET', 'obstacle'),
  ]),
  sensor('pg_s_score', ko.blocks.sScore, [{ type: 'field_number', name: 'MIN', value: 0 }, { type: 'field_number', name: 'MAX', value: 100 }]),
  sensor('pg_s_prop', ko.blocks.sProp, [
    tagField('SUBJECT', 'player'),
    dropdown('PROP', ko.props),
    { type: 'field_number', name: 'MIN', value: 0 },
    { type: 'field_number', name: 'MAX', value: 400 },
  ]),
  sensor('pg_s_variable', ko.blocks.sVariable, [
    { type: 'field_variable', name: 'VAR', variable: null },
    { type: 'field_number', name: 'MIN', value: 0 },
    { type: 'field_number', name: 'MAX', value: 100 },
  ]),
];

function rootType(block: BlocklyTypes.Block): string | undefined {
  return block.getRootBlock()?.type;
}

let registered = false;

/** 블록·필드·확장·한국어 메시지 등록. 여러 번 불러도 한 번만 등록된다 */
export function registerBlocks(): void {
  if (registered) return;
  registered = true;
  Blockly.setLocale(KoMsg);

  // 자신/상대/튕기기: 충돌 이벤트 밖이면 경고 (실행 시에는 api 가 무시한다)
  Blockly.Extensions.register('pg_collide_only', function (this: BlocklyTypes.Block) {
    this.setOnChange(function (this: BlocklyTypes.Block, e: BlocklyTypes.Events.Abstract) {
      if (e.isUiEvent || this.isInFlyout) return;
      const root = rootType(this);
      this.setWarningText(root === 'pg_on_collide' || root === this.type ? null : ko.warn.collideOnly);
    });
  });
  Blockly.Extensions.register('pg_sensor_only', function (this: BlocklyTypes.Block) {
    this.setOnChange(function (this: BlocklyTypes.Block, e: BlocklyTypes.Events.Abstract) {
      if (e.isUiEvent || this.isInFlyout) return;
      this.setWarningText(rootType(this) === 'pg_observe' ? null : ko.warn.sensorOnly);
    });
  });
  // Behavior 설정: 중력일 때만 "세기" 칸을 보인다
  Blockly.Extensions.register('pg_behavior_param', function (this: BlocklyTypes.Block) {
    const block = this;
    const kind = block.getField('KIND') as BlocklyTypes.FieldDropdown;
    const sync = (v: string) => {
      const input = block.inputList.find((i) => i.fieldRow.some((f) => f.name === 'PARAM'));
      if (input && input.isVisible() !== (v === 'gravity')) {
        input.setVisible(v === 'gravity');
        if (block instanceof Blockly.BlockSvg && block.rendered) block.queueRender();
      }
    };
    kind.setValidator((v: string) => {
      sync(v);
      return v;
    });
    sync(kind.getValue() ?? 'gravity');
  });

  // 모양 드롭다운: 기본 모양 + 사용자가 그린 그림 (그림 목록이 바뀌면 다음에 열 때 반영)
  Blockly.Extensions.register('pg_costume_dynamic', function (this: BlocklyTypes.Block) {
    const input = this.inputList.find((i) => i.fieldRow.some((f) => f.name === 'COSTUME'))!;
    const idx = input.fieldRow.findIndex((f) => f.name === 'COSTUME');
    input.removeField('COSTUME');
    // 모양 탭에서 활성화한 것만 (지금 고른 값은 항상 남긴다)
    const field = new Blockly.FieldDropdown(function (this: BlocklyTypes.FieldDropdown) {
      const cur = this?.getValue?.();
      const opts: [string, string][] = [
        ...Object.entries(COSTUMES)
          .filter(([k]) => k === 'box' || k === cur || isActiveAsset(k))
          .map(([k, v]) => [v, k] as [string, string]),
        ...Object.keys(customCostumes())
          .filter((n) => CUSTOM_PREFIX + n === cur || isActiveAsset(CUSTOM_PREFIX + n))
          .map((n) => [`🖌️ ${n}`, `${CUSTOM_PREFIX}${n}`] as [string, string]),
      ];
      return opts;
    });
    input.insertFieldAt(idx, field, 'COSTUME');
  });

  Blockly.common.defineBlocksWithJsonArray(BLOCK_DEFS);
}

/** 기본 태그를 워크스페이스에 등록한다 */
export function ensureDefaultTags(ws: BlocklyTypes.Workspace): void {
  const map = ws.getVariableMap();
  for (const t of DEFAULT_TAGS) if (!map.getVariable(t, TAG_TYPE)) map.createVariable(t, TAG_TYPE);
}
