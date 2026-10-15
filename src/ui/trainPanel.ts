// "AI 학습" 패널: 학습 설계 요약, Web Worker 학습, 진행·학습 곡선, 체크포인트 다시 보기, 실시간 보기.

import type { Project } from '../engine/types';
import { ko } from '../i18n/ko';
import type { AgentJson } from '../rl/agent';
import { describeConfig, type LearnConfig } from '../rl/config';
import type { Checkpoint, FromWorker, ToWorker } from '../rl/worker';
import { el } from './dom';

/** 한 번의 학습 기록. 게임과 함께 저장되어 나중에도 그래프와 체크포인트를 다시 볼 수 있다 */
export interface TrainingRun {
  summary: string;
  /** 학습할 때의 게임 코드 지문. 블록이 바뀌면 녹화를 똑같이 재현할 수 없다 */
  codeHash: string;
  baseline: number | null;
  curve: { steps: number; score: number }[];
  checkpoints: Checkpoint[];
  total: number;
  seconds: number;
  finished: boolean;
  result?: number;
}

export interface TrainHooks {
  project(): Project;
  config(): LearnConfig;
  /** "이 게임의 보상 규칙" 문장들 */
  rewardRules(): string[];
  codeHash(): string;
  /** 학습 중 스냅샷(final=false) 또는 학습 끝(final=true) */
  onAgent(a: AgentJson, final: boolean): void;
  onRun(run: TrainingRun): void;
  onTrainingChange(training: boolean): void;
  openDesign(): void;
  /** 지금 AI 에서 이어서 학습할 수 있으면 null, 아니면 이유. 이어서 할 AI 도 함께 */
  resumeFrom(): { agent: AgentJson | null; why: string | null };
  /** 체크포인트 하나(번호) 또는 전부 이어서 다시 보기 */
  replay(index: number | 'all'): void;
  setLive(on: boolean): void;
}

const fmt = (n: number) => n.toLocaleString('ko-KR');
export const shortNum = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}백만` : n >= 1e4 ? `${+(n / 1e4).toFixed(1)}만` : fmt(Math.round(n)));

export class TrainPanel {
  private worker: Worker | null = null;
  private run: TrainingRun | null = null;
  private stale = false;
  private live = false;
  private playing: number | 'all' | null = null;
  private els = {} as {
    summary: HTMLElement;
    start: HTMLButtonElement;
    resume: HTMLButtonElement;
    bar: HTMLElement;
    stat: HTMLElement;
    result: HTMLElement;
    chart: HTMLCanvasElement;
    tip: HTMLElement;
    cps: HTMLElement;
    live: HTMLInputElement;
    rules: HTMLElement;
  };

  constructor(
    private root: HTMLElement,
    private hooks: TrainHooks,
  ) {
    this.build();
  }

  get training(): boolean {
    return this.worker !== null;
  }

  private build(): void {
    const t = ko.train;
    const design = el('button', { className: 'btn ghost', textContent: t.design });
    design.addEventListener('click', () => {
      design.blur();
      this.hooks.openDesign();
    });
    const start = el('button', { className: 'btn big play' });
    start.addEventListener('click', () => {
      start.blur();
      if (this.training) this.stop();
      else this.start(false);
    });
    const resume = el('button', { className: 'btn big brain' });
    resume.addEventListener('click', () => {
      resume.blur();
      this.start(true);
    });
    const live = el('input', { type: 'checkbox' });
    live.addEventListener('change', () => {
      this.live = live.checked;
      this.hooks.setLive(this.live);
    });
    const chart = el('canvas', { className: 'train-chart' });
    const tip = el('div', { className: 'chart-tip' });
    chart.addEventListener('mousemove', (e) => this.hover(e));
    chart.addEventListener('mouseleave', () => {
      tip.style.display = 'none';
      this.drawChart();
    });
    this.els = {
      summary: el('div', { className: 'train-summary' }),
      start,
      resume,
      bar: el('i'),
      stat: el('div', { className: 'train-stat' }),
      result: el('div', { className: 'train-result' }),
      chart,
      tip,
      cps: el('div', { className: 'cp-strip' }),
      live,
      rules: el('div', { className: 'reward-rules', title: ko.reward.rulesHint }),
    };
    this.root.append(
      el('div', { className: 'train-row' }, this.els.summary, el('span', { className: 'spacer' }), design, resume, start),
      this.els.rules,
      el('div', { className: 'train-bar' }, this.els.bar),
      this.els.stat,
      el(
        'div',
        { className: 'train-body' },
        el('div', { className: 'chart-wrap' }, chart, tip),
        el(
          'div',
          { className: 'cp-box' },
          el('div', { className: 'cp-head' }, el('b', { textContent: `🎬 ${ko.watch.checkpoints}`, title: ko.watch.cpHint })),
          this.els.cps,
          el('label', { className: 'switch', title: ko.watch.liveHint }, live, el('span', { className: 'track' }), ko.watch.live),
        ),
      ),
      this.els.result,
    );
    this.sync();
  }

  /** 게임을 바꾸거나 불러올 때: 저장된 학습 기록을 보여 준다 */
  setRun(run: TrainingRun | null): void {
    this.run = run;
    this.refresh();
  }

  /** 설계·블록이 바뀌었을 때 요약과 녹화 사용 가능 여부를 다시 계산 */
  refresh(): void {
    this.stale = !!this.run && this.run.codeHash !== this.hooks.codeHash();
    this.sync();
    this.renderCheckpoints();
    this.drawChart();
  }

  setModelStatus(state: 'none' | 'ok' | 'stale', steps = 0): void {
    if (this.training) return;
    const t = ko.train;
    this.els.result.textContent = state === 'ok' ? t.modelOk(shortNum(steps)) : state === 'stale' ? t.modelStale : t.modelNone;
    this.els.result.className = `train-result ${state}`;
  }

  setPlaying(p: number | 'all' | null): void {
    this.playing = p;
    this.renderCheckpoints();
  }

  private sync(): void {
    const t = ko.train;
    const rules = this.hooks.rewardRules();
    this.els.rules.replaceChildren(el('b', { textContent: `🎁 ${ko.reward.rules}` }), ...rules.map((r) => el('div', { textContent: r })));
    const cfg = this.hooks.config();
    this.els.summary.textContent = `${describeConfig(cfg)} · ${shortNum(cfg.steps)} ${t.framesUnit}`;
    const r = this.hooks.resumeFrom();
    const canResume = !!r.agent && !r.why;
    this.els.start.innerHTML = this.training ? `<span class="i">⏹</span>${t.stop}` : `<span class="i">🧠</span>${canResume ? ko.resume.fresh : t.start}`;
    this.els.start.className = `btn big ${this.training ? 'ghost' : canResume ? 'ghost' : 'play'}`;
    this.els.resume.innerHTML = `<span class="i">⏩</span>${ko.resume.btn}`;
    this.els.resume.hidden = this.training || !r.agent;
    this.els.resume.disabled = !canResume;
    this.els.resume.title = r.why ?? ko.resume.hint;
    this.els.live.disabled = !this.training && !this.live;
  }

  /** resume: 지금 AI 에서 이어서 학습 (학습 기록도 이어 붙인다) */
  start(resume = false): void {
    if (this.worker) return;
    const project = this.hooks.project();
    const config = structuredClone(this.hooks.config());
    if (config.seed === null) config.seed = Math.floor(Date.now() % 100000);
    const from = resume ? this.hooks.resumeFrom() : null;
    if (resume && (!from?.agent || from.why)) return;
    const keep = resume && this.run && this.run.codeHash === this.hooks.codeHash();
    this.run = keep
      ? { ...this.run!, summary: `${this.run!.summary} → ${describeConfig(config)}`, finished: false }
      : {
          summary: describeConfig(config),
          codeHash: this.hooks.codeHash(),
          baseline: null,
          curve: [],
          checkpoints: [],
          total: (from?.agent?.steps ?? 0) + config.steps,
          seconds: 0,
          finished: false,
        };
    this.stale = false;
    this.worker = new Worker(new URL('../rl/worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
    this.worker.onerror = (e) => this.finish(`${ko.train.error}: ${e.message}`, 'stale');
    // 학습된 AI·녹화 같은 큰 필드는 빼고 보낸다
    const { model: _m, trainingRun: _r, ...lean } = project;
    const msg: ToWorker = { type: 'start', project: lean, config, ...(from?.agent ? { resume: from.agent } : {}) };
    this.worker.postMessage(msg);
    this.els.stat.textContent = ko.train.preparing;
    this.els.result.textContent = '';
    this.hooks.onTrainingChange(true);
    this.sync();
    this.renderCheckpoints();
    this.drawChart();
  }

  stop(): void {
    this.worker?.postMessage({ type: 'stop' } satisfies ToWorker);
  }

  /** 블록이 바뀌는 등으로 학습을 바로 끊는다 */
  abort(reason: string): void {
    if (!this.worker) return;
    this.finish(reason, 'stale');
  }

  private finish(text: string, cls = ''): void {
    this.worker?.terminate();
    this.worker = null;
    this.els.result.textContent = text;
    this.els.result.className = `train-result ${cls}`;
    if (this.live) {
      this.live = false;
      this.els.live.checked = false;
      this.hooks.setLive(false);
    }
    this.hooks.onTrainingChange(false);
    this.sync();
  }

  private onMessage(m: FromWorker): void {
    const t = ko.train;
    const run = this.run!;
    if (m.type === 'baseline') {
      run.baseline = m.random.meanScore;
    } else if (m.type === 'progress') {
      const s = m.stats;
      run.total = m.total;
      this.els.bar.style.width = `${Math.min(1, (s.steps - m.start) / Math.max(1, m.total - m.start)) * 100}%`;
      const sps = (s.steps - m.start) / Math.max(0.001, m.seconds);
      const left = Math.max(0, (m.total - s.steps) / sps);
      if (s.meanScore !== null) run.curve.push({ steps: s.steps, score: s.meanScore });
      if (run.curve.length > 800) run.curve = run.curve.filter((_, i) => i % 2 === 0);
      run.seconds = m.seconds;
      const extra =
        'epsilon' in s.info
          ? ` · <span title="${t.epsHint}">ε ${s.info.epsilon.toFixed(2)}</span>`
          : 'explore' in s.info
            ? ` · <span title="${t.exploreHint}">${t.explore} <b>${Math.round(s.info.explore * 100)}%</b></span>`
            : '';
      const states = 'states' in s.info ? ` · 표 ${fmt(s.info.states)}칸` : '';
      this.els.stat.innerHTML =
        `<b>${shortNum(s.steps)}</b> / ${shortNum(m.total)} ${t.framesUnit} · ` +
        `${t.played} <b>${fmt(s.episodes)}</b>${t.games} · ` +
        `${t.avgScore} <b>${s.meanScore?.toFixed(1) ?? '-'}</b>${extra}${states} · ` +
        `${fmt(Math.round(sps))} ${t.perSec} · ${t.left} ${left > 90 ? `${Math.ceil(left / 60)}분` : `${Math.ceil(left)}초`}`;
      this.drawChart();
    } else if (m.type === 'snapshot') {
      this.hooks.onAgent(m.agent, false);
    } else if (m.type === 'checkpoint') {
      run.checkpoints.push({ ...m.cp, index: run.checkpoints.length });
      this.renderCheckpoints();
      this.hooks.onRun(run);
    } else if (m.type === 'done') {
      run.finished = !m.stopped;
      run.result = m.result.meanScore;
      this.hooks.onAgent(m.agent, true);
      this.hooks.onRun(run);
      const base = run.baseline ?? 0;
      this.finish(`${m.stopped ? t.stopped : t.finished} (${Math.round(m.seconds)}초) — ${t.compare(base.toFixed(1), m.result.meanScore.toFixed(1))}`, 'ok');
    } else if (m.type === 'error') {
      this.finish(`${t.error}: ${m.message}`, 'stale');
    }
  }

  private renderCheckpoints(): void {
    const w = ko.watch;
    const cps = this.run?.checkpoints ?? [];
    if (!cps.length || this.stale) {
      this.els.cps.replaceChildren(el('div', { className: 'cp-empty', textContent: this.stale && cps.length ? w.staleCp : w.noCp }));
      return;
    }
    const chips = cps.map((cp, i) => {
      const pct = Math.round((cp.steps / Math.max(1, this.run!.total)) * 100);
      const b = el(
        'button',
        { className: `cp-chip${this.playing === i ? ' on' : ''}`, title: `${shortNum(cp.steps)} 프레임 학습 시점 · 점수 ${cp.score}` },
        el('small', { textContent: `${pct}%` }),
        el('b', { textContent: String(cp.score) }),
      );
      b.addEventListener('click', () => this.hooks.replay(i));
      return b;
    });
    const all = el('button', { className: `btn ghost cp-all${this.playing === 'all' ? ' on' : ''}`, textContent: w.playAll });
    all.addEventListener('click', () => this.hooks.replay('all'));
    this.els.cps.replaceChildren(el('div', { className: 'cp-chips' }, ...chips), all);
  }

  // ───────────── 학습 곡선 ─────────────

  private scales() {
    const c = this.els.chart;
    const W = c.clientWidth || 300;
    const H = c.clientHeight || 110;
    const pad = { l: 34, r: 10, t: 10, b: 18 };
    const pts = this.run?.curve ?? [];
    const maxX = Math.max(this.run?.total ?? 1, 1);
    const maxY = Math.max(1, this.run?.baseline ?? 0, ...pts.map((p) => p.score)) * 1.1;
    return { W, H, pad, maxY, x: (v: number) => pad.l + (v / maxX) * (W - pad.l - pad.r), y: (v: number) => H - pad.b - (v / maxY) * (H - pad.t - pad.b) };
  }

  drawChart(hoverIdx = -1): void {
    const c = this.els.chart;
    if (!c.isConnected || c.clientWidth === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const { W, H, pad, maxY, x, y } = this.scales();
    if (c.width !== Math.round(W * dpr)) c.width = Math.round(W * dpr);
    if (c.height !== Math.round(H * dpr)) c.height = Math.round(H * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = '10px Pretendard, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#ece8fb';
    ctx.fillStyle = '#8b87a8';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const v = (maxY / 1.1) * (i / 3);
      ctx.beginPath();
      ctx.moveTo(pad.l, y(v));
      ctx.lineTo(W - pad.r, y(v));
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(v >= 100 ? v.toFixed(0) : v.toFixed(1), pad.l - 5, y(v));
    }
    ctx.textAlign = 'left';
    ctx.fillText(ko.train.chartX, pad.l, H - 7);
    const pts = this.run?.curve ?? [];
    if (!pts.length && this.run?.baseline == null) {
      ctx.textAlign = 'center';
      ctx.fillText(ko.train.chartEmpty, W / 2, H / 2);
      return;
    }
    // 체크포인트 위치 (세로 눈금)
    ctx.strokeStyle = '#efe6ff';
    for (const cp of this.run?.checkpoints ?? []) {
      ctx.beginPath();
      ctx.moveTo(x(cp.steps), pad.t);
      ctx.lineTo(x(cp.steps), H - pad.b);
      ctx.stroke();
    }
    if (this.run?.baseline != null) {
      const by = y(this.run.baseline);
      ctx.strokeStyle = '#8b87a8';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, by);
      ctx.lineTo(W - pad.r, by);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#8b87a8';
      ctx.fillText(ko.train.randomLine, W - pad.r, by - 8);
    }
    if (pts.length) {
      ctx.strokeStyle = '#6c5ce7';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(x(p.steps), y(p.score)) : ctx.moveTo(x(p.steps), y(p.score))));
      ctx.stroke();
      const last = pts[pts.length - 1];
      ctx.fillStyle = '#2d2a4a';
      ctx.textAlign = 'left';
      ctx.fillText(`${ko.train.aiLine} ${last.score.toFixed(1)}`, Math.min(x(last.steps) + 6, W - 64), Math.max(pad.t + 4, y(last.score) - 10));
    }
    if (hoverIdx >= 0) {
      const p = pts[hoverIdx];
      ctx.strokeStyle = '#c9c2f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x(p.steps), pad.t);
      ctx.lineTo(x(p.steps), H - pad.b);
      ctx.stroke();
      ctx.fillStyle = '#6c5ce7';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x(p.steps), y(p.score), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private hover(e: MouseEvent): void {
    const pts = this.run?.curve ?? [];
    if (!pts.length) return;
    const r = this.els.chart.getBoundingClientRect();
    const { x } = this.scales();
    const mx = e.clientX - r.left;
    let best = 0;
    pts.forEach((p, i) => {
      if (Math.abs(x(p.steps) - mx) < Math.abs(x(pts[best].steps) - mx)) best = i;
    });
    const p = pts[best];
    this.drawChart(best);
    const tip = this.els.tip;
    tip.style.display = 'block';
    tip.innerHTML = `<b>${p.score.toFixed(1)}</b> ${ko.train.avgScore}<br><span>${shortNum(p.steps)} ${ko.train.framesUnit}</span>`;
    tip.style.left = `${Math.min(r.width - 110, Math.max(0, x(p.steps) + 10))}px`;
    tip.style.top = '6px';
  }
}
