// 브라우저용 Blockly 워크스페이스: 툴박스, 태그 카테고리, 테마.

import type * as BlocklyTypes from 'blockly/core';
import { ko } from '../i18n/ko';
import { Blockly } from './blockly';
import { HUE, TAG_TYPE, ensureDefaultTags } from './definitions';
import { installGenerators } from './generators';

const num = (v: number) => ({ shadow: { type: 'math_number', fields: { NUM: v } } });
const colour = (c: string) => ({ shadow: { type: 'pg_colour', fields: { C: c } } });
const tagT = { T: { block: { type: 'pg_tag' } } };
const b = (type: string, inputs?: object) => ({ kind: 'block', type, ...(inputs ? { inputs } : {}) });
const cat = (name: string, colour: string, contents: object[]) => ({ kind: 'category', name, colour, contents });
const c = ko.category;

export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    cat(`⚙️ ${c.settings}`, HUE.settings, [b('pg_settings'), b('pg_observe')]),
    cat(`⚡ ${c.events}`, HUE.events, [b('pg_on_start'), b('pg_on_tick'), b('pg_on_interval'), b('pg_on_action'), b('pg_on_collide')]),
    cat(`📦 ${c.objects}`, HUE.objects, [
      b('pg_create', { X: num(200), Y: num(150), W: num(20), H: num(20), COLOR: colour('#cc3333'), VX: num(0), VY: num(0) }),
      b('pg_destroy', tagT),
      b('pg_set_behavior'),
      b('pg_clear_behavior'),
    ]),
    cat(`🎨 ${c.decor}`, HUE.decor, [
      { kind: 'button', text: `🖌️ ${ko.paint.open}`, callbackkey: 'PG_PAINT' },
      b('pg_set_costume'),
      b('pg_colour'),
      b('pg_rainbow', { N: num(0) }),
    ]),
    cat(`🏃 ${c.motion}`, HUE.motion, [
      b('pg_set_pos', { ...tagT, X: num(200), Y: num(150) }),
      b('pg_move', { ...tagT, D: num(5) }),
      b('pg_set_vel', { ...tagT, V: num(0) }),
      b('pg_change_vel', { ...tagT, DV: num(1) }),
      b('pg_bounce'),
    ]),
    cat(`🏆 ${c.game}`, HUE.game, [b('pg_add_score', { N: num(1) }), b('pg_set_score', { N: num(0) }), b('pg_game_over'), b('pg_reward', { N: num(1) })]),
    cat(`🔢 ${c.values}`, HUE.values, [
      b('pg_self'),
      b('pg_other'),
      b('pg_first'),
      b('pg_get', tagT),
      b('pg_on_ground', tagT),
      b('pg_count'),
      b('pg_score'),
      b('pg_frame'),
      b('math_random_int', { FROM: num(1), TO: num(10) }),
      b('math_random_float'),
    ]),
    cat(`📡 ${c.sensors}`, HUE.sensors, [
      b('pg_s_position'),
      b('pg_s_velocity'),
      b('pg_s_nearest'),
      b('pg_s_distance'),
      b('pg_s_lidar'),
      b('pg_s_on_ground'),
      b('pg_s_nearest_k'),
      b('pg_s_count'),
      b('pg_s_grid'),
      b('pg_s_score'),
      b('pg_s_prop'),
      b('pg_s_variable'),
    ]),
    { kind: 'category', name: `🏷️ ${c.tags}`, colour: HUE.tags, custom: 'PG_TAGS' },
    { kind: 'category', name: `📝 ${c.variables}`, colour: HUE.variables, custom: 'VARIABLE' },
    cat(`🔀 ${c.logic}`, HUE.logic, [b('controls_if'), b('logic_compare'), b('logic_operation'), b('logic_negate'), b('logic_boolean')]),
    cat(`➗ ${c.math}`, HUE.math, [
      b('math_number'),
      b('math_arithmetic', { A: num(1), B: num(1) }),
      b('math_modulo', { DIVIDEND: num(10), DIVISOR: num(3) }),
      b('math_trig', { NUM: num(45) }),
      b('math_random_int', { FROM: num(1), TO: num(10) }),
      b('math_random_float'),
    ]),
    cat(`🔁 ${c.loops}`, HUE.loops, [
      b('controls_repeat_ext', { TIMES: num(10) }),
      b('controls_for', { FROM: num(1), TO: num(10), BY: num(1) }),
    ]),
  ],
};

const style = (colourPrimary: string) => ({ colourPrimary });

export function createWorkspace(el: HTMLElement): BlocklyTypes.WorkspaceSvg {
  installGenerators();
  const theme = Blockly.Theme.defineTheme('playgym', {
    name: 'playgym',
    base: Blockly.Themes.Classic,
    startHats: true,
    fontStyle: { family: "Pretendard, 'Malgun Gothic', system-ui, sans-serif", weight: '600', size: 12 },
    // Blockly 기본 블록(논리·수학·반복·변수)도 같은 색 계열로
    blockStyles: {
      logic_blocks: style(HUE.logic),
      math_blocks: style(HUE.math),
      loop_blocks: style(HUE.loops),
      variable_blocks: style(HUE.variables),
    },
    componentStyles: {
      workspaceBackgroundColour: '#fbfaff',
      toolboxBackgroundColour: '#ffffff',
      toolboxForegroundColour: '#3b3760',
      flyoutBackgroundColour: '#f1edff',
      flyoutForegroundColour: '#3b3760',
      flyoutOpacity: 0.97,
      scrollbarColour: '#cfc6f5',
      scrollbarOpacity: 0.8,
      insertionMarkerColour: '#7c6cf2',
    },
  });
  const ws = Blockly.inject(el, {
    toolbox: TOOLBOX,
    theme,
    renderer: 'zelos', // 스크래치처럼 둥근 블록
    trashcan: true,
    sounds: false,
    zoom: { controls: true, wheel: true, startScale: 0.75, minScale: 0.3, maxScale: 1.5 },
    move: { scrollbars: true, drag: true, wheel: false },
    grid: { spacing: 28, length: 3, colour: '#e9e4fb', snap: true },
  });

  ws.registerToolboxCategoryCallback('PG_TAGS', (w) => {
    const tags = w
      .getVariableMap()
      .getVariablesOfType(TAG_TYPE)
      .map((v) => v.getName())
      .sort();
    return [
      { kind: 'button', text: `＋ ${ko.blocks.createTag}`, callbackkey: 'PG_CREATE_TAG' },
      ...tags.map((name) => ({ kind: 'block', type: 'pg_tag', fields: { TAG: { name, type: TAG_TYPE } } })),
    ];
  });
  ws.registerButtonCallback('PG_CREATE_TAG', (button) => {
    Blockly.Variables.createVariableButtonHandler(button.getTargetWorkspace(), undefined, TAG_TYPE);
  });
  // 카테고리 왼쪽 색 막대를 둥근 색 점으로 (CSS 가 --cat 을 쓴다)
  for (const row of el.querySelectorAll<HTMLElement>('.blocklyToolboxCategory')) {
    row.style.setProperty('--cat', row.style.borderLeftColor);
    row.style.borderLeft = 'none';
  }
  ensureDefaultTags(ws);
  return ws;
}
