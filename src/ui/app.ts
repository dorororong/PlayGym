// 화면 구성과 실행 흐름: 내 게임 ↔ 블록 편집기 ↔ 컴파일 ↔ 환경 ↔ 캔버스·관찰·학습·로그.

import type * as BlocklyTypes from 'blockly/core';
import { Blockly } from '../blocks/blockly';
import { SINGLETON_TYPES, ensureDefaultTags } from '../blocks/definitions';
import { projectFromWorkspace } from '../blocks/generators';
import { createWorkspace } from '../blocks/toolbox';
import { createEnv, type Env, type StepResult } from '../engine/env';
import { Rng } from '../engine/rng';
import type { ActionName, GameEvent, Keymap, Project } from '../engine/types';
import { ko } from '../i18n/ko';
import { CUSTOM_PREFIX, costumesUsedIn, isPixelArt, setActiveAssets, setCustomCostumes, type PixelArt } from '../render/pixelArt';
import { describeRewards } from '../blocks/rewards';
import { AssetPanel } from './assetPanel';
import { Renderer } from '../render/renderer';
import { initSplitters, loadPref, savePref } from './splitters';
import { Agent, PLAY_TEMPERATURE, type AgentJson } from '../rl/agent';
import { resolveConfig, type LearnConfig } from '../rl/config';
import { canResume } from '../rl/trainer';
import { TEMPLATES, type TemplateKey } from '../templates';
import { TemplateBuilder } from '../templates/builder';
import { openDesignDialog } from './designDialog';
import { $, el } from './dom';
import { keyLabel, keyLookup, normalizeKeymap } from './keys';
import { ACTION_ICONS, openKeymapDialog } from './keymapDialog';
import { currentId, getGame, listGames, migrateLegacy, newId, putGame, setCurrentId, thumbnail, type StoredGame } from './library';
import { openLibraryDialog } from './libraryDialog';
import { TrainPanel, shortNum, type TrainingRun } from './trainPanel';

const STEP_HZ = 60;
const MAX_LOG = 200;
const SPEEDS = [
  { v: 0.25, label: '🐢', title: `${ko.ui.slow} (0.25×)` },
  { v: 1, label: '1×', title: `${ko.ui.normal} (1×)` },
  { v: 4, label: '4×', title: '4배속' },
  { v: 16, label: '16×', title: '16배속' },
  { v: 64, label: '🐇', title: `${ko.ui.fast} (64×)` },
];
const LOG_ICON: Record<string, string> = { score: '⭐', reward: '🎁', gameOver: '💥', warn: '⚠️', error: '🐞', info: '💡' };

/** human 사람, random 무작위, trained 학습된 AI, watch 학습 중 실시간 보기, replay 체크포인트 다시 보기 */
type Mode = 'human' | 'random' | 'trained' | 'watch' | 'replay';
type Done = 'terminated' | 'truncated' | 'error' | null;
interface LogRow {
  kind: GameEvent['type'] | 'info';
  frame: number;
  text: string;
}

/** 게임 코드 지문 (FNV-1a). 체크포인트 녹화가 지금 블록과 같은 게임인지 확인한다 */
function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

function blankProject(): Project {
  const t = new TemplateBuilder('blank');
  t.settings(['none', 'left', 'right', 'up'], 3000, '#f4f4f4', 'sky');
  t.observe([t.sPosition('player')]);
  t.onStart([t.create('player', 200, 260, 24, 24, '#22bb77', 0, 0), t.setBehavior('player', 'stayInScreen'), t.costume('player', 'slime')]);
  t.onAction('left', [t.move(t.tag('player'), 'x', -4)]);
  t.onAction('right', [t.move(t.tag('player'), 'x', 4)]);
  return { version: 1, blocksJson: t.build(), generatedCode: '', settings: { actions: ['none'], maxSteps: 3000, background: '#f4f4f4', backdrop: 'sky' } };
}

export class App {
  private ws!: BlocklyTypes.WorkspaceSvg;
  private renderer = new Renderer($<HTMLCanvasElement>('#game'), $<HTMLCanvasElement>('#game-ov'));
  private env: Env | null = null;
  private compileError: string | null = null;
  private keymap: Keymap = normalizeKeymap();
  private keys = keyLookup(this.keymap);
  private loading = false;
  /** 지금 열린 게임 (내 게임 저장소의 한 항목). ephemeral 이면 저장하지 않는다 (개발용 데모) */
  private game: Omit<StoredGame, 'project'> = { id: '', name: '', created: 0, updated: 0 };
  private ephemeral = false;
  private saveTimer = 0;

  private running = false;
  private started = false;
  private mode: Mode = 'human';
  private done: Done = null;
  private lastError = '';
  private speed = 1;
  private acc = 0;
  private lastTime = 0;
  private overlay = true;
  private seed = 0;
  private agentRng = new Rng(0);
  private pressed: ActionName[] = [];
  private lastAction: ActionName = 'none';
  private obs: number[] = [];

  private log: LogRow[] = [];
  private logDirty = true;
  private obsDirty = true;
  private obsCells: { val: HTMLElement; bar: HTMLElement; signed: boolean }[] = [];
  private padKeys = new Map<ActionName, HTMLElement>();
  private rebuildTimer = 0;
  private training: LearnConfig = resolveConfig(undefined);
  private model: Agent | null = null;
  private run_: TrainingRun | null = null;
  /** 학습된 AI 가 같은 행동을 몇 프레임 더 유지할지 (frame skip) */
  private hold = 0;
  /** 실시간 보기: 몇 번째 판인지 */
  private watchEp = 0;
  /** 다시 보기: 남은 체크포인트 번호들과 지금 보고 있는 녹화 */
  private replayQueue: number[] = [];
  private replayCp = -1;
  private replayPos = 0;
  private replayPause = 0;
  private trainPanel!: TrainPanel;
  private costumes: Record<string, PixelArt> = {};
  /** 모양 탭에서 활성화한 모양 (블록 목록에 나오는 것) */
  private assets: string[] = ['box'];
  private assetPanel!: AssetPanel;
  /** 이번 판에 받은 보상 합과 방금 받은 보상 */
  private epReward = 0;
  private lastReward = 0;
  private uiKey = '';
  private ui = {} as {
    name: HTMLInputElement;
    saved: HTMLElement;
    score: HTMLElement;
    frame: HTMLElement;
    seed: HTMLInputElement;
    reward: HTMLElement;
    play: HTMLButtonElement;
    random: HTMLButtonElement;
    trained: HTMLButtonElement;
    speed: HTMLButtonElement[];
    seg: HTMLElement;
    seedPill: HTMLElement;
    meta: HTMLElement | null;
    badge: HTMLElement;
  };

  async start(): Promise<void> {
    this.buildChrome();
    this.buildTabs();
    this.ws = createWorkspace($('#blockly'));
    this.ws.addChangeListener((e) => this.onWorkspaceChange(e));
    this.ws.registerButtonCallback('PG_PAINT', () => this.showAssets(true));
    this.buildEditorTabs();
    this.bindKeyboard();
    const resize = () => {
      this.renderer.fit($('#stage'));
      Blockly.svgResize(this.ws);
      this.trainPanel.drawChart();
    };
    window.addEventListener('resize', resize);
    new ResizeObserver(resize).observe($('#stage'));
    initSplitters();
    resize();
    requestAnimationFrame((t) => this.frame(t));

    // 마지막에 열었던 게임 → 예전 버전 작업 → 가장 최근 게임 → 공룡 예제로 새로 만들기
    await migrateLegacy();
    const id = currentId();
    const g = (id && (await getGame(id))) || (await listGames())[0];
    if (g) this.openGame(g, false);
    else await this.createGame('dino');
  }

  // ───────────── 화면 뼈대 ─────────────

  private button(label: string, cls: string, fn: () => void, title = ''): HTMLButtonElement {
    const b = el('button', { className: `btn ${cls}`, title });
    b.innerHTML = label;
    b.addEventListener('click', () => {
      fn();
      b.blur(); // Space 가 버튼을 다시 누르지 않게
    });
    return b;
  }

  private buildChrome(): void {
    $('#tagline').textContent = ko.ui.tagline;
    const L = ko.library;

    // 게임 이름 · 내 게임 · 새 게임
    this.ui.name = el('input', { className: 'game-name', title: L.nameHint, maxLength: 40 });
    this.ui.name.addEventListener('change', () => {
      this.game.name = this.ui.name.value.trim() || L.blankName;
      this.ui.name.value = this.game.name;
      this.autosave();
    });
    this.ui.saved = el('span', { className: 'saved' });
    $('#game-bar').append(
      this.button(`<span class="i">📁</span>${L.open}`, 'ghost', () => this.openLibrary()),
      el('span', { className: 'game-title' }, el('span', { className: 'game-icon' }), this.ui.name, this.ui.saved),
      this.button(`<span class="i">＋</span>${L.newGame}`, 'ghost', () => this.openLibrary()),
    );

    $('#file-actions').append(
      this.button(`<span class="i">🎨</span>${ko.assets.tab}`, 'ghost', () => this.showAssets(false)),
      this.button(`<span class="i">⌨️</span>${ko.ui.keys}`, 'ghost', () => this.openKeys()),
    );

    // 게임 머리: 점수·프레임·AI 시야·시드
    this.ui.score = el('b', { className: 'fixed w-score', textContent: '0' });
    this.ui.frame = el('b', { className: 'fixed w-frame', textContent: '0' });
    // 켜고 끄는 작은 버튼 (스위치보다 자리를 덜 차지한다)
    const toggle = (label: string, title: string, on: boolean, fn: (on: boolean) => void) => {
      const b = el('button', { className: 'tog', innerHTML: label, title });
      const set = (v: boolean) => {
        b.classList.toggle('on', v);
        b.setAttribute('aria-pressed', String(v));
      };
      set(on);
      b.addEventListener('click', () => {
        const v = !b.classList.contains('on');
        set(v);
        fn(v);
      });
      return b;
    };
    const overlay = toggle(`👀 ${ko.ui.aiViewShort}`, '센서가 무엇을 보고 있는지, 실제 충돌 사각형이 어디인지 화면에 그려요', true, (v) => (this.overlay = v));
    this.ui.seed = el('input', { type: 'number', value: '0', min: '0', step: '1' });
    this.ui.seed.addEventListener('change', () => {
      this.seed = Math.max(0, Math.floor(Number(this.ui.seed.value) || 0));
      this.ui.seed.value = String(this.seed);
      this.resetEpisode();
    });
    this.ui.reward = el('b', { className: 'fixed w-reward', textContent: '0' });
    const retroOn = loadPref('retro', '1') === '1';
    this.renderer.setRetro(retroOn);
    const retro = toggle(`🕹️ ${ko.ui.retro}`, ko.ui.retroHint, retroOn, (v) => {
      this.renderer.setRetro(v);
      savePref('retro', v ? '1' : '0');
    });
    // 한 줄: 점수·보상·프레임 | 레트로·AI 시야
    $('#game-head').append(
      el('span', { className: 'pill score' }, `⭐ ${ko.ui.score}`, this.ui.score),
      el('span', { className: 'pill reward', title: ko.reward.pillHint }, `🎁 ${ko.reward.pill}`, this.ui.reward),
      el('span', { className: 'pill', title: ko.ui.frame }, '⏱️', this.ui.frame),
      el('span', { className: 'spacer' }),
      retro,
      overlay,
    );
    this.ui.badge = el('div', { className: 'mode-badge' });
    $('#screen').append(this.ui.badge);

    // 조작 버튼
    this.ui.play = this.button('', 'big play', () => (this.running && this.mode === 'human' ? this.pause() : this.run('human')), ko.ui.playHint);
    this.ui.random = this.button('', 'big ai', () => (this.running && this.mode === 'random' ? this.pause() : this.run('random')), ko.ui.randomHint);
    this.ui.trained = this.button('', 'big brain', () => (this.running && this.mode === 'trained' ? this.pause() : this.run('trained')), ko.ui.trainedHint);
    const seg = (this.ui.seg = el('div', { className: 'seg', title: '속도 (다시 보기·실시간 보기는 빠르게 보면 편해요)' }));
    this.ui.speed = SPEEDS.map(({ v, label, title }) => {
      const b = el('button', { textContent: label, title });
      b.addEventListener('click', () => this.setSpeed(v));
      b.classList.toggle('on', v === 1);
      seg.append(b);
      return b;
    });
    $('#controls').append(
      this.ui.play,
      this.ui.random,
      this.ui.trained,
      this.button(`<span class="i">↺</span>`, 'ghost icon', () => this.resetEpisode(), ko.ui.restart),
      this.button(`<span class="i">⏭</span>`, 'ghost icon', () => this.stepOnce(), `${ko.ui.step} (한 프레임만 진행)`),
      el('span', { className: 'spacer' }),
      seg,
    );
    this.ui.seedPill = el('span', { className: 'pill seed', title: ko.ui.seedHint }, `🌱 ${ko.ui.seed}`, this.ui.seed);
  }

  private setSpeed(v: number): void {
    this.speed = v;
    this.ui.speed.forEach((x, i) => x.classList.toggle('on', SPEEDS[i].v === v));
  }

  private syncButtons(): void {
    const on = (m: Mode) => this.running && this.mode === m;
    this.ui.play.innerHTML = on('human') ? `<span class="i">⏸</span>${ko.ui.pause}` : `<span class="i">▶</span>${ko.ui.play}`;
    this.ui.random.innerHTML = on('random') ? `<span class="i">⏸</span>${ko.ui.pause}` : `<span class="i">🎲</span>${ko.ui.randomAi}`;
    this.ui.trained.innerHTML = on('trained') ? `<span class="i">⏸</span>${ko.ui.pause}` : `<span class="i">🧠</span>${ko.ui.trainedAi}`;
    // "멈춤" 으로 바뀌어도 버튼 폭이 줄지 않게 (폭이 바뀌면 줄바꿈 → 게임 화면 크기가 출렁인다)
    for (const b of [this.ui.play, this.ui.random, this.ui.trained]) {
      const w = b.offsetWidth;
      if (w > (Number(b.dataset.minw) || 0)) {
        b.dataset.minw = String(w);
        b.style.minWidth = `${w}px`;
      }
    }
    this.ui.play.disabled = this.ui.random.disabled = !this.env;
    this.ui.trained.disabled = !this.modelUsable();
  }

  /** 이 프로젝트의 행동마다 키 안내 칩 (누르면 불이 들어온다) */
  private buildPad(): void {
    const pad = $('#pad');
    this.padKeys.clear();
    pad.replaceChildren(el('span', { className: 'title', textContent: `🎮 ${ko.ui.controls}` }));
    const names = this.env?.actionSpace.names.filter((a) => a !== 'none') ?? [];
    for (const a of names) {
      const keys = this.keymap[a] ?? [];
      const caps = keys.length
        ? keys.map((k) => el('span', { className: 'cap', textContent: keyLabel(k) }))
        : [el('span', { className: 'cap', textContent: '—', title: ko.ui.noKey })];
      const chip = el('span', { className: 'key' }, ...caps, el('span', { className: 'what', textContent: ko.actions[a] }));
      this.padKeys.set(a, chip);
      pad.append(chip);
    }
    const edit = el('button', { className: 'linkbtn', textContent: `⌨️ ${ko.ui.editKeys}` });
    edit.addEventListener('click', () => this.openKeys());
    pad.append(edit, el('span', { className: 'spacer' }), this.ui.seedPill);
  }

  // ───────────── 블록 / 모양 탭 ─────────────

  private buildEditorTabs(): void {
    const tabs = $('#editor-tabs');
    const mk = (label: string, fn: () => void) => {
      const b = el('button', { className: 'tab', textContent: label });
      b.addEventListener('click', fn);
      return b;
    };
    tabs.append(mk(`🧩 ${ko.assets.blocksTab}`, () => this.showBlocks()), mk(`🎨 ${ko.assets.tab}`, () => this.showAssets(false)));
    tabs.children[0].classList.add('on');
    this.assetPanel = new AssetPanel($('#assets'), {
      costumes: () => this.costumes,
      setCostumes: (c) => {
        this.costumes = c;
        setCustomCostumes(c);
        this.autosave();
      },
      active: () => this.assets,
      setActive: (list) => this.setAssets(list),
      usage: () => this.costumeUsage(),
      tags: () =>
        this.ws
          .getVariableMap()
          .getVariablesOfType('Tag')
          .map((v) => v.getName())
          .sort(),
      applyToTag: (key, tag) => this.applyCostume(key, tag),
      renameDrawing: (from, to) => {
        const c = { ...this.costumes, [to]: this.costumes[from] };
        delete c[from];
        this.costumes = c;
        setCustomCostumes(c);
        this.setAssets(this.assets.map((k) => (k === CUSTOM_PREFIX + from ? CUSTOM_PREFIX + to : k)));
        // 그 그림을 쓰던 모양 블록도 새 이름으로
        for (const b of this.ws.getBlocksByType('pg_set_costume', false)) {
          if (b.getFieldValue('COSTUME') === CUSTOM_PREFIX + from) setCostumeField(b, CUSTOM_PREFIX + to);
        }
      },
    });
  }

  private showBlocks(): void {
    $('#assets').hidden = true;
    $('#blockly').hidden = false;
    [...$('#editor-tabs').children].forEach((x, i) => x.classList.toggle('on', i === 0));
    Blockly.svgResize(this.ws);
  }

  /** 모양 탭 열기. draw 면 새 그림을 바로 만든다 */
  private showAssets(draw: boolean): void {
    $('#assets').hidden = false;
    $('#blockly').hidden = true;
    [...$('#editor-tabs').children].forEach((x, i) => x.classList.toggle('on', i === 1));
    if (draw) this.assetPanel.newDrawing();
    else this.assetPanel.render();
  }

  /** 블록에서 쓰는 모양은 항상 활성 상태로 둔다 */
  private setAssets(list: string[]): void {
    const used = this.ws ? [...this.costumeUsage().keys()] : [];
    this.assets = [...new Set(['box', ...list, ...used])].filter((k) => !k.startsWith(CUSTOM_PREFIX) || this.costumes[k.slice(CUSTOM_PREFIX.length)]);
    setActiveAssets(this.assets);
    this.autosave();
  }

  /** 모양 키 → 그 모양을 입은 태그들 */
  private costumeUsage(): Map<string, string[]> {
    const m = new Map<string, string[]>();
    for (const b of this.ws.getBlocksByType('pg_set_costume', false)) {
      if (!b.isEnabled()) continue;
      const key = b.getFieldValue('COSTUME');
      const tag = b.getField('TAG')?.getText() ?? '';
      m.set(key, [...new Set([...(m.get(key) ?? []), tag])]);
    }
    return m;
  }

  /** 모양 탭의 "태그에 입히기": 그 태그의 모양 블록을 바꾸거나, "게임 시작할 때" 끝에 새로 넣는다 */
  private applyCostume(key: string, tag: string): void {
    if (!this.assets.includes(key)) this.setAssets([...this.assets, key]);
    const existing = this.ws.getBlocksByType('pg_set_costume', false).find((b) => b.getField('TAG')?.getText() === tag);
    if (existing) setCostumeField(existing, key);
    else {
      const v = this.ws.getVariableMap().getVariable(tag, 'Tag');
      let start = this.ws.getTopBlocks(true).find((b) => b.type === 'pg_on_start');
      if (!start) start = Blockly.serialization.blocks.append({ type: 'pg_on_start', x: 20, y: 20 }, this.ws) as BlocklyTypes.BlockSvg;
      const nb = Blockly.serialization.blocks.append({ type: 'pg_set_costume', fields: { TAG: { id: v?.getId() }, COSTUME: key } }, this.ws);
      let last = start.getInputTargetBlock('DO');
      while (last?.getNextBlock()) last = last.getNextBlock();
      if (last) last.nextConnection!.connect(nb.previousConnection!);
      else start.getInput('DO')!.connection!.connect(nb.previousConnection!);
    }
    this.addLog({ kind: 'info', frame: 0, text: ko.assets.applied(key.startsWith(CUSTOM_PREFIX) ? key.slice(CUSTOM_PREFIX.length) : key, tag) });
    this.assetPanel.render();
  }

  private openKeys(): void {
    this.pause();
    openKeymapDialog($<HTMLDialogElement>('#keymap-dialog'), this.keymap, this.env?.actionSpace.names ?? [], (km) => {
      this.keymap = km;
      this.keys = keyLookup(km);
      this.pressed = [];
      this.buildPad();
      this.autosave();
    });
  }

  private openDesign(): void {
    const base = (TEMPLATES as Record<string, Project>)[this.game.from ?? '']?.training as Partial<LearnConfig> | undefined;
    openDesignDialog(
      $<HTMLDialogElement>('#design-dialog'),
      this.training,
      { nObs: this.env?.observationSpace.shape[0] ?? 0, nAct: this.env?.actionSpace.n ?? 1, base },
      (c) => {
        this.training = c;
        this.trainPanel.refresh();
        this.autosave();
      },
    );
  }

  /** 아래 카드: "AI가 보는 값" / "AI 학습" / "일어난 일" 탭 */
  private buildTabs(): void {
    const panels = { obs: $('#obs-panel'), train: $('#train-panel'), log: $('#log-panel') };
    const tabs = $('#tabs');
    const mk = (key: keyof typeof panels, label: string) => {
      const b = el('button', { className: 'tab', textContent: label });
      b.addEventListener('click', () => {
        for (const [k2, p] of Object.entries(panels)) p.hidden = k2 !== key;
        for (const x of tabs.children) x.classList.toggle('on', x === b);
        if (key === 'train') this.trainPanel.drawChart();
      });
      return b;
    };
    const first = mk('obs', `🤖 ${ko.panel.obs}`);
    first.classList.add('on');
    tabs.append(first, mk('train', `🧠 ${ko.train.tab}`), mk('log', `📜 ${ko.panel.log}`));
    this.trainPanel = new TrainPanel(panels.train, {
      project: () => this.currentProject(),
      config: () => this.training,
      rewardRules: () => (this.ws ? describeRewards(this.ws) : []),
      codeHash: () => this.codeHash(),
      onAgent: (a, final) => this.setAgent(a, final),
      onRun: (r) => {
        this.run_ = r;
        this.autosave();
      },
      onTrainingChange: () => this.syncButtons(),
      openDesign: () => this.openDesign(),
      resumeFrom: () => {
        if (!this.model || !this.env) return { agent: null, why: null };
        return { agent: this.model.toJSON(), why: canResume(this.model, this.training, this.env) };
      },
      replay: (i) => this.startReplay(i),
      setLive: (on) => (on ? this.startWatch() : this.mode === 'watch' && this.pause()),
    });
  }

  private setAgent(j: AgentJson, final: boolean): void {
    try {
      this.model = Agent.fromJSON(j);
    } catch {
      return;
    }
    if (final) this.autosave();
    this.syncModel();
  }

  /** 학습된 AI 가 지금 블록(관찰·행동)과 맞는지 */
  private modelUsable(): boolean {
    return !!(this.model && this.env && this.model.fits(this.env));
  }

  private syncModel(): void {
    if (!this.trainPanel) return;
    this.trainPanel.setModelStatus(!this.model ? 'none' : this.modelUsable() ? 'ok' : 'stale', this.model?.steps ?? 0);
    this.trainPanel.refresh();
    if (this.ui.play) this.syncButtons();
  }

  private codeHash(): string {
    const p = this.currentProject();
    return hashText(p.generatedCode + JSON.stringify(p.settings));
  }

  // ───────────── 내 게임 ─────────────

  private openLibrary(): void {
    this.pause();
    this.flushSave();
    void openLibraryDialog($<HTMLDialogElement>('#library-dialog'), {
      currentId: this.game.id,
      open: (g) => this.openGame(g, false),
      create: (key) => void this.createGame(key),
      importFile: (f) => void this.importFile(f),
      exportGame: (g) => this.exportGame(g),
    });
  }

  private openGame(g: StoredGame, tidy: boolean): void {
    if (this.trainPanel.training) this.trainPanel.abort(ko.train.aborted);
    const { project, ...meta } = g;
    this.game = meta;
    this.ephemeral = false;
    setCurrentId(g.id);
    this.ui.name.value = g.name;
    $('.game-icon').textContent = ko.templateIcons[g.from ?? ''] ?? '🎮';
    this.log = [];
    this.loadProject(project, tidy);
    this.run_ = (project.trainingRun as TrainingRun | undefined) ?? null;
    this.trainPanel.setRun(this.run_);
  }

  private async createGame(from: TemplateKey | null): Promise<void> {
    const project = from ? structuredClone(TEMPLATES[from]) : blankProject();
    const now = Date.now();
    const g: StoredGame = {
      id: newId(),
      name: from ? ko.library.newName(ko.templates[from]) : ko.library.blankName,
      created: now,
      updated: now,
      ...(from ? { from } : {}),
      project,
    };
    await putGame(g);
    this.openGame(g, true);
    this.addLog({ kind: 'info', frame: 0, text: ko.log.template(g.name) });
  }

  private async importFile(f: File): Promise<void> {
    try {
      const p = JSON.parse(await f.text()) as Project;
      if (p?.version !== 1 || typeof p.blocksJson !== 'object') throw new Error();
      const now = Date.now();
      const g: StoredGame = { id: newId(), name: f.name.replace(/\.json$/i, ''), created: now, updated: now, project: p };
      await putGame(g);
      this.openGame(g, false);
      this.addLog({ kind: 'info', frame: 0, text: ko.log.loaded(f.name) });
    } catch {
      this.addLog({ kind: 'error', frame: 0, text: ko.log.badFile });
    }
  }

  private exportGame(g: StoredGame): void {
    const project = g.id === this.game.id ? this.currentProject() : g.project;
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `${g.name || 'playgym'}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /** 바뀔 때마다 조금 기다렸다가 내 게임 저장소에 저장한다 */
  private autosave(): void {
    if (this.ephemeral || !this.game.id) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.flushSave(), 500);
  }

  private flushSave(): void {
    clearTimeout(this.saveTimer);
    if (this.ephemeral || !this.game.id || !this.ws) return;
    this.game.updated = Date.now();
    const g: StoredGame = { ...this.game, thumb: thumbnail($<HTMLCanvasElement>('#game')) ?? this.game.thumb, project: this.currentProject() };
    this.game.thumb = g.thumb;
    void putGame(g).then(
      () => (this.ui.saved.textContent = `✓ ${ko.library.saved}`),
      () => (this.ui.saved.textContent = '⚠ 저장 실패'),
    );
  }

  // ───────────── 프로젝트 / 컴파일 ─────────────

  private loadProject(p: Project, tidy: boolean): void {
    this.pause();
    this.loading = true;
    // 모양 블록이 사용자 그림·활성 모양을 고를 수 있도록 블록보다 먼저 등록한다
    this.costumes = {};
    for (const [k2, v] of Object.entries(p.costumes ?? {})) if (isPixelArt(v)) this.costumes[k2] = v;
    setCustomCostumes(this.costumes);
    const savedAssets = Array.isArray(p.assets) ? p.assets.filter((x): x is string => typeof x === 'string') : Object.keys(this.costumes).map((n) => CUSTOM_PREFIX + n);
    this.assets = [...new Set(['box', ...savedAssets, ...costumesUsedIn(p.blocksJson)])];
    setActiveAssets(this.assets);
    Blockly.Events.disable();
    try {
      this.ws.clear();
      Blockly.serialization.workspaces.load(p.blocksJson, this.ws);
      ensureDefaultTags(this.ws);
      if (tidy) this.ws.cleanUp();
    } finally {
      Blockly.Events.enable();
    }
    this.ws.scroll(30, 20);
    this.keymap = normalizeKeymap(p.keymap);
    this.keys = keyLookup(this.keymap);
    this.training = resolveConfig(p.training);
    try {
      this.model = p.model ? Agent.fromJSON(p.model as AgentJson) : null;
    } catch {
      this.model = null;
    }
    this.enforceSingletons();
    this.rebuild();
    // 불러오기 직후 뒤늦게 오는 변경 이벤트는 사용자의 수정이 아니다
    setTimeout(() => (this.loading = false), 400);
  }

  private onWorkspaceChange(e: BlocklyTypes.Events.Abstract): void {
    if (e.isUiEvent) return;
    if (!this.loading && this.trainPanel?.training) {
      this.trainPanel.abort(ko.train.aborted);
      this.addLog({ kind: 'warn', frame: 0, text: ko.train.aborted });
    }
    this.enforceSingletons();
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => {
      if (this.ws.isDragging()) return this.onWorkspaceChange(e);
      // 블록이 바뀌면 멈춘 상태에서 다시 컴파일한다
      const wasStarted = this.started;
      this.rebuild();
      if (wasStarted && !this.loading) this.addLog({ kind: 'info', frame: 0, text: ko.log.recompiled });
    }, 300);
  }

  /** 환경 설정·관찰 설정 블록은 하나만: 나중에 생긴 것은 비활성화하고 경고 */
  private enforceSingletons(): void {
    for (const [type, name] of Object.entries(SINGLETON_TYPES)) {
      const list = this.ws.getBlocksByType(type, false);
      const keeper = list.find((b) => !b.hasDisabledReason('pg_singleton')) ?? list[0];
      for (const b of list) {
        const dup = b !== keeper;
        if (b.hasDisabledReason('pg_singleton') !== dup) b.setDisabledReason(dup, 'pg_singleton');
        b.setWarningText(dup ? ko.warn.single(name) : null, 'pg_singleton');
      }
    }
  }

  private currentProject(): Project {
    return {
      ...projectFromWorkspace(this.ws),
      keymap: this.keymap,
      training: this.training as unknown as Record<string, unknown>,
      model: this.model?.toJSON(),
      costumes: this.costumes,
      assets: this.assets,
      trainingRun: this.run_ ?? undefined,
    };
  }

  private rebuild(): void {
    this.pause();
    const project = this.currentProject();
    try {
      this.env = createEnv(project);
      this.compileError = null;
    } catch (e) {
      this.env = null;
      this.compileError = e instanceof Error ? e.message : String(e);
      this.addLog({ kind: 'error', frame: 0, text: ko.log.error(this.compileError) });
    }
    this.mode = 'human';
    this.resetEpisode();
    this.buildPad();
    this.syncModel();
    this.trainPanel.refresh();
    if (!$('#assets').hidden) this.assetPanel.render();
    if (!this.loading) this.autosave();
  }

  /** 개발용: 예제를 열고(저장하지 않음) 랜덤 AI 로 n 프레임 진행한 뒤 멈춘다 */
  demo(key: string, n: number): void {
    if (key in TEMPLATES) {
      this.game = { id: '', name: ko.templates[key], created: 0, updated: 0, from: key };
      this.ephemeral = true;
      this.ui.name.value = this.game.name;
      this.loadProject(TEMPLATES[key as TemplateKey], true);
    }
    this.run('random');
    for (let i = 0; i < n && !this.done; i++) this.tick();
    this.pause();
  }

  // ───────────── 실행 ─────────────

  private resetEpisode(seed = this.seed): void {
    this.running = false;
    this.started = false;
    this.done = null;
    this.acc = 0;
    this.hold = 0;
    this.lastAction = 'none';
    this.ws?.highlightBlock(null);
    this.agentRng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    this.epReward = 0;
    this.lastReward = 0;
    if (this.env) {
      const r = this.env.reset(seed);
      this.obs = r.obs;
      this.handleEvents(r.info.events);
    } else {
      this.obs = [];
    }
    this.buildObsPanel();
    this.syncButtons();
  }

  private run(mode: Mode): void {
    if (!this.env) return;
    if (mode === 'trained' && !this.modelUsable()) return;
    // 끝났거나, 시작 전이거나, 모드가 바뀌면 처음부터. 멈춘 중이면 이어서
    if (this.done || !this.started || mode !== this.mode) this.resetEpisode();
    this.mode = mode;
    this.running = true;
    this.started = true;
    this.lastTime = performance.now();
    if (mode !== 'replay') this.trainPanel.setPlaying(null);
    this.syncButtons();
    $('#game').focus();
  }

  /** 학습 중 실시간 보기: 지금까지 배운 AI 가 계속 플레이하고, 판이 끝나면 바로 다음 판 */
  private startWatch(): void {
    if (!this.env) return;
    this.watchEp = 1;
    this.mode = 'watch';
    this.resetEpisode(this.seed + this.watchEp);
    this.mode = 'watch';
    this.running = true;
    this.started = true;
    this.lastTime = performance.now();
    if (this.speed < 4) this.setSpeed(4);
    this.syncButtons();
  }

  /** 체크포인트 녹화 다시 보기 (하나 또는 전부 이어서) */
  private startReplay(which: number | 'all'): void {
    const cps = this.run_?.checkpoints ?? [];
    if (!this.env || !cps.length) return;
    this.replayQueue = which === 'all' ? cps.map((_, i) => i) : [which];
    this.trainPanel.setPlaying(which);
    if (which === 'all' && this.speed < 4) this.setSpeed(4);
    this.nextReplay();
  }

  private nextReplay(): void {
    const i = this.replayQueue.shift();
    const cp = i === undefined ? undefined : this.run_?.checkpoints[i];
    if (!cp) {
      this.replayCp = -1;
      this.trainPanel.setPlaying(null);
      this.pause();
      return;
    }
    this.replayCp = i!;
    this.replayPos = 0;
    this.replayPause = 0;
    this.mode = 'replay';
    this.resetEpisode(cp.seed);
    this.mode = 'replay';
    this.running = true;
    this.started = true;
    this.lastTime = performance.now();
    this.syncButtons();
  }

  private pause(): void {
    this.running = false;
    if (this.ui.play) this.syncButtons();
  }

  private stepOnce(): void {
    if (!this.env || this.done) return;
    this.pause();
    this.started = true;
    this.tick();
  }

  private tick(): void {
    const env = this.env!;
    // 다시 보기에서 판 사이 쉬는 시간
    if (this.mode === 'replay' && this.replayPause > 0) {
      if (--this.replayPause === 0) this.nextReplay();
      return;
    }
    let a: number;
    if (this.mode === 'random' && this.running) a = this.agentRng.int(0, env.actionSpace.n - 1);
    else if (this.mode === 'replay') {
      const cp = this.run_!.checkpoints[this.replayCp];
      a = Number(cp.actions[this.replayPos++] ?? 0);
    } else if ((this.mode === 'trained' || this.mode === 'watch') && this.running && this.model && this.model.fits(env)) {
      // 학습할 때처럼 한 번 고른 행동을 frameSkip 프레임 동안 유지한다
      if (this.hold > 0) {
        a = env.actionSpace.names.indexOf(this.lastAction);
        this.hold--;
      } else {
        a = this.model.act(this.obs, this.agentRng, PLAY_TEMPERATURE);
        this.hold = this.model.frameSkip - 1;
      }
    } else a = this.humanAction();
    this.lastAction = env.actionSpace.names[a];
    const r: StepResult = env.step(a);
    this.obs = r.obs;
    this.epReward += r.reward;
    this.lastReward = r.reward;
    this.obsDirty = true;
    this.handleEvents(r.info.events);
    if (this.done !== 'error' && (r.terminated || r.truncated)) {
      if (this.mode === 'watch' && this.trainPanel.training) {
        // 실시간 보기는 끊기지 않게 바로 다음 판 (그 사이 더 배운 AI 로)
        this.watchEp++;
        this.resetEpisode(this.seed + this.watchEp);
        this.running = true;
        this.started = true;
        return;
      }
      if (this.mode === 'replay') {
        this.replayPause = this.replayQueue.length ? 45 : 0;
        if (!this.replayQueue.length) {
          this.done = r.terminated ? 'terminated' : 'truncated';
          this.trainPanel.setPlaying(null);
          this.pause();
        }
        return;
      }
      this.done = r.terminated ? 'terminated' : 'truncated';
      this.pause();
    }
  }

  /** 눌려 있는 키 중 가장 최근에 누른 것 (행동 공간에 있는 것만) */
  private humanAction(): number {
    const names = this.env!.actionSpace.names;
    for (let i = this.pressed.length - 1; i >= 0; i--) {
      const idx = names.indexOf(this.pressed[i]);
      if (idx >= 0) return idx;
    }
    return 0;
  }

  private handleEvents(events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'collide') continue;
      if (e.type === 'reward') {
        // "AI 에게 보상 주기" 블록이 준 보상. 연속되면 한 줄로 합친다
        const top = this.log[0];
        const sign = (v: number) => `${v >= 0 ? '+' : ''}${+v.toFixed(3)}`;
        const text = ko.reward.log(sign(e.value), (this.epReward + e.value).toFixed(2));
        if (top?.kind === 'reward') Object.assign(top, { frame: e.frame, text });
        else this.addLog({ kind: 'reward', frame: e.frame, text });
        this.logDirty = true;
        continue;
      }
      if (e.type === 'score') {
        const top = this.log[0];
        const text = ko.log.score(e.delta, e.score);
        // 매 프레임 점수가 바뀌는 게임에서 로그가 넘치지 않게 연속된 점수 변화는 한 줄로 합친다
        if (top?.kind === 'score') Object.assign(top, { frame: e.frame, text });
        else this.addLog({ kind: 'score', frame: e.frame, text });
        this.logDirty = true;
      } else if (e.type === 'gameOver') this.addLog({ kind: 'gameOver', frame: e.frame, text: ko.log.gameOver });
      else if (e.type === 'warn') this.addLog({ kind: 'warn', frame: e.frame, text: e.message });
      else if (e.type === 'error') {
        this.addLog({ kind: 'error', frame: e.frame, text: ko.log.error(e.message) });
        this.done = 'error';
        this.lastError = e.message;
        this.pause();
        this.showErrorBlock(e.blockId, e.message);
      }
    }
  }

  private showErrorBlock(id: string | null, message: string): void {
    const block = id ? this.ws.getBlockById(id) : null;
    if (!block) return;
    this.ws.highlightBlock(block.id);
    block.setWarningText(ko.log.error(message), 'pg_runtime');
    this.ws.centerOnBlock(block.id);
    // 다음 수정 때 경고를 지운다
    const clear = (e: BlocklyTypes.Events.Abstract) => {
      if (e.isUiEvent) return;
      block.setWarningText(null, 'pg_runtime');
      this.ws.removeChangeListener(clear);
    };
    this.ws.addChangeListener(clear);
  }

  private addLog(row: LogRow): void {
    this.log.unshift(row);
    if (this.log.length > MAX_LOG) this.log.length = MAX_LOG;
    this.logDirty = true;
  }

  // ───────────── 키보드 ─────────────

  private bindKeyboard(): void {
    const ignore = (e: KeyboardEvent) => {
      const t = e.target;
      if (document.querySelector('dialog[open]')) return true;
      return t instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || !!t.closest('.blocklyWidgetDiv'));
    };
    window.addEventListener(
      'keydown',
      (e) => {
        const a = this.keys.get(e.code);
        if (!a || ignore(e)) return;
        this.pressed = this.pressed.filter((x) => x !== a);
        this.pressed.push(a);
        if (this.running && this.mode === 'human') {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true,
    );
    window.addEventListener(
      'keyup',
      (e) => {
        const a = this.keys.get(e.code);
        // 같은 행동의 다른 키(예: ↑ 와 Space)가 아직 눌려 있을 수 있지만, 단순하게 뗀 것으로 본다
        if (a) this.pressed = this.pressed.filter((x) => x !== a);
      },
      true,
    );
    window.addEventListener('blur', () => (this.pressed = []));
    window.addEventListener('beforeunload', () => this.flushSave());
  }

  // ───────────── 그리기 ─────────────

  private frame(now: number): void {
    if (this.running && this.env) {
      this.acc += ((now - this.lastTime) / 1000) * STEP_HZ * this.speed;
      // 탭이 잠깐 숨겨졌다 돌아와도 한꺼번에 몰아서 돌지 않게 상한을 둔다
      this.acc = Math.min(this.acc, Math.max(8, this.speed * 2));
      while (this.acc >= 1 && this.running) {
        this.acc -= 1;
        this.tick();
      }
    }
    this.lastTime = now;
    this.draw();
    requestAnimationFrame((t) => this.frame(t));
  }

  private draw(): void {
    const env = this.env;
    if (env) {
      const w = env.getWorld();
      this.renderer.draw(w, { background: env.background, backdrop: env.backdrop, overlay: this.overlay ? env.getDebugShapes() : null });
      this.ui.score.textContent = String(w.score);
      this.ui.reward.textContent = `${this.epReward.toFixed(2)}${this.lastReward ? ` (${this.lastReward > 0 ? '+' : ''}${+this.lastReward.toFixed(3)})` : ''}`;
      this.ui.frame.textContent = `${w.frame} / ${env.maxSteps}`;
    }
    this.updateBadge();
    this.updateScreenOverlay();
    this.updatePad();
    if (this.obsDirty) this.updateObsPanel();
    if (this.logDirty) this.renderLog();
  }

  /** 실시간 보기·다시 보기 중임을 화면 위에 알린다 */
  private updateBadge(): void {
    const w = ko.watch;
    let text = '';
    if (this.mode === 'watch' && this.started) text = w.liveBadge(shortNum(this.model?.steps ?? 0), this.watchEp);
    else if (this.mode === 'replay' && this.replayCp >= 0) {
      const cps = this.run_?.checkpoints ?? [];
      const cp = cps[this.replayCp];
      if (cp) text = w.cpBadge(this.replayCp + 1, cps.length, shortNum(cp.steps), this.env?.getWorld().score ?? 0);
    }
    if (this.ui.badge.textContent !== text) this.ui.badge.textContent = text;
    this.ui.badge.hidden = !text;
  }

  /** 캔버스 위 안내: 시작 전 / 게임 끝 / 오류 / 멈춤. 상태가 바뀔 때만 다시 만든다 */
  private updateScreenOverlay(): void {
    const score = this.env?.getWorld().score ?? 0;
    const key = [this.env ? 'ok' : 'noenv', this.done, this.started, this.running, this.done ? score : '', this.modelUsable(), this.mode].join('|');
    if (key === this.uiKey) return;
    this.uiKey = key;
    const o = ko.overlay;
    const box = $('#screen-overlay');
    const card = (cls: string, ...kids: (Node | string)[]) => el('div', { className: `ov ${cls}` }, ...kids);
    const big = (text: string) => el('div', { className: 'big', textContent: text });
    const sub = (text: string) => el('div', { className: 'sub', textContent: text });
    const row = (...kids: Node[]) => el('div', { className: 'row' }, ...kids);
    const again = () => this.button(`<span class="i">↺</span>${o.again}`, 'big play', () => this.run(this.mode === 'replay' || this.mode === 'watch' ? 'human' : this.mode));
    if (!this.env) {
      box.replaceChildren(card('err', big(`🐞 ${o.compileError}`), el('div', { className: 'msg', textContent: this.compileError ?? '' })));
    } else if (this.done === 'error') {
      box.replaceChildren(card('err', big(`🐞 ${o.error}`), el('div', { className: 'msg', textContent: this.lastError }), sub(o.errorSub)));
    } else if (this.done === 'terminated') {
      box.replaceChildren(card('', big(`💥 ${o.terminated}`), sub(o.scoreIs(score)), row(again())));
    } else if (this.done === 'truncated') {
      box.replaceChildren(card('', big(`⏰ ${o.truncated}`), sub(`${o.truncatedSub(this.env.maxSteps)} · ${o.scoreIs(score)}`), row(again())));
    } else if (!this.started) {
      box.replaceChildren(
        card(
          '',
          sub(o.start),
          row(
            this.button(`<span class="i">▶</span>${ko.ui.play}`, 'big play', () => this.run('human')),
            this.button(`<span class="i">🎲</span>${ko.ui.randomAi}`, 'big ai', () => this.run('random')),
            ...(this.modelUsable() ? [this.button(`<span class="i">🧠</span>${ko.ui.trainedAi}`, 'big brain', () => this.run('trained'))] : []),
          ),
        ),
      );
    } else if (!this.running) {
      box.replaceChildren(el('div', { className: 'badge-paused', textContent: `⏸ ${o.paused}` }));
    } else {
      box.replaceChildren();
    }
  }

  /** 지금 들어가는 행동의 키 칩에 불을 켠다 (사람: 눌린 키, AI: 고른 행동) */
  private updatePad(): void {
    let active: ActionName = 'none';
    if (this.env && this.running) active = this.mode === 'human' ? this.env.actionSpace.names[this.humanAction()] : this.lastAction;
    for (const [a, chip] of this.padKeys) chip.classList.toggle('on', a === active);
  }

  private buildObsPanel(): void {
    const panel = $('#obs-panel');
    panel.replaceChildren(el('div', { className: 'sub-help', textContent: ko.panel.obsSub }));
    this.obsCells = [];
    this.ui.meta = null;
    const env = this.env;
    if (!env) return;
    const { labels, low } = env.observationSpace;
    this.ui.meta = el('div', { className: 'mini' });
    panel.append(this.ui.meta);
    if (labels.length === 0) panel.append(el('div', { className: 'empty', textContent: ko.panel.noSensors }));
    const grid = el('div', { className: 'obs-grid' });
    labels.forEach((label, i) => {
      const val = el('span', { className: 'obs-val' });
      const signed = low[i] < 0;
      const bar = el('i');
      grid.append(
        el(
          'div',
          { className: 'obs-row' },
          el('span', { className: 'obs-label', textContent: label, title: label }),
          val,
          el('div', { className: `obs-bar${signed ? ' signed' : ''}` }, bar),
        ),
      );
      this.obsCells.push({ val, bar, signed });
    });
    panel.append(grid);
    this.obsDirty = true;
  }

  private updateObsPanel(): void {
    this.obsDirty = false;
    const env = this.env;
    if (!env || !this.ui.meta) return;
    const m = ko.panel;
    this.ui.meta.innerHTML =
      `<span>📏 ${m.length} <b>${env.observationSpace.shape[0]}</b></span>` +
      `<span>🎮 ${m.actions} <b>${env.actionSpace.n}</b>개</span>` +
      `<span>👉 ${m.now} <b>${ACTION_ICONS[this.lastAction]} ${ko.actions[this.lastAction]}</b></span>`;
    this.obsCells.forEach((c, i) => {
      const v = this.obs[i] ?? 0;
      c.val.textContent = v.toFixed(2);
      if (c.signed) {
        const w = Math.abs(v) * 50;
        c.bar.style.left = `${v >= 0 ? 50 : 50 - w}%`;
        c.bar.style.width = `${w}%`;
        c.bar.className = v < 0 ? 'neg' : '';
      } else {
        c.bar.style.left = '0';
        c.bar.style.width = `${v * 100}%`;
      }
    });
  }

  private renderLog(): void {
    this.logDirty = false;
    $('#log-panel').replaceChildren(
      ...(this.log.length
        ? this.log.map((r) =>
            el(
              'div',
              { className: `log-row ${r.kind}` },
              el('span', { className: 'e', textContent: LOG_ICON[r.kind] ?? '•' }),
              el('span', { textContent: r.text }),
              el('span', { className: 'f', textContent: r.frame ? `#${r.frame}` : '' }),
            ),
          )
        : [el('div', { className: 'empty', textContent: ko.panel.emptyLog })]),
    );
  }
}

/**
 * 모양 블록 값 바꾸기. 드롭다운은 만들어 둔 선택지 목록(캐시)으로 값을 검사하므로,
 * 새 그림·새로 활성화한 모양을 고르려면 먼저 목록을 새로 만든다.
 */
function setCostumeField(b: BlocklyTypes.Block, key: string): void {
  (b.getField('COSTUME') as BlocklyTypes.FieldDropdown).getOptions(false);
  b.setFieldValue(key, 'COSTUME');
}
