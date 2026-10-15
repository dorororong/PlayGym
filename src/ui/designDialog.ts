// 학습 설계 창: 알고리즘, 신경망 모양, Q-table 칸 수, 하이퍼파라미터를 학습자가 직접 고른다.

import { ko } from '../i18n/ko';
import { ALGO_PRESETS, DEFAULT_CONFIG, resolveConfig, type Activation, type Algo, type LearnConfig } from '../rl/config';
import { MAX_STATES, stateCount } from '../rl/qtable';
import { el } from './dom';

const ALGOS: Algo[] = ['qtable', 'dqn', 'reinforce', 'ppo'];
const UNITS = [4, 8, 16, 32, 64, 128, 256];
const STEPS = [100_000, 300_000, 500_000, 1_000_000, 1_500_000, 3_000_000, 5_000_000];
const SKIPS = [1, 2, 3, 4, 6, 8];
const GAMMAS = [0.9, 0.95, 0.98, 0.99, 0.995];
const LRS = [1e-4, 3e-4, 5e-4, 1e-3, 3e-3, 1e-2];
const ACTS: Activation[] = ['tanh', 'relu', 'sigmoid'];

const short = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}백만` : n >= 1e4 ? `${+(n / 1e4).toFixed(1)}만` : n.toLocaleString('ko-KR'));
const big = (n: number) => (n < 1e9 ? Math.round(n).toLocaleString('ko-KR') : n.toExponential(1).replace('e+', '×10^'));

export interface DesignContext {
  /** 지금 관찰 벡터 길이와 행동 수 (신경망 입·출력 크기, Q-table 상태 수 계산용) */
  nObs: number;
  nAct: number;
  /** 예제의 원래 학습 설계 (추천값 되돌리기) */
  base?: Partial<LearnConfig>;
}

export function openDesignDialog(dialog: HTMLDialogElement, initial: LearnConfig, ctx: DesignContext, onChange: (c: LearnConfig) => void): void {
  const d = ko.design;
  let cfg = structuredClone(initial);
  let advOpen = false;
  const commit = () => {
    cfg = resolveConfig(cfg);
    onChange(structuredClone(cfg));
    render();
  };

  const select = <T extends string | number>(values: T[], cur: T, label: (v: T) => string, set: (v: T) => void) => {
    const s = el('select');
    for (const v of values.includes(cur) ? values : [...values, cur]) s.append(el('option', { value: String(v), textContent: label(v), selected: v === cur }));
    s.addEventListener('change', () => {
      const raw = s.value;
      set((typeof cur === 'number' ? Number(raw) : raw) as T);
      commit();
    });
    return s;
  };
  const row = (label: string, ...kids: (Node | string)[]) => el('label', { className: 'dz-field' }, el('span', { textContent: label }), ...kids);

  const render = () => {
    // ── 알고리즘 ──
    const algos = el(
      'div',
      { className: 'dz-algos' },
      ...ALGOS.map((a) => {
        const [name, desc] = d.algos[a];
        const card = el('button', { className: `dz-algo${cfg.algo === a ? ' on' : ''}` }, el('b', { textContent: name }), el('span', { textContent: desc }));
        card.addEventListener('click', () => {
          if (cfg.algo === a) return;
          cfg = resolveConfig({ ...cfg, algo: a, ...ALGO_PRESETS[a] });
          commit();
        });
        return card;
      }),
    );

    // ── 신경망 또는 표 ──
    let model: HTMLElement;
    if (cfg.algo === 'qtable') {
      const n = stateCount(ctx.nObs, cfg.qtable.bins);
      const bins = el('input', { type: 'range', min: '2', max: '12', step: '1', value: String(cfg.qtable.bins) });
      const binsLabel = el('b', { textContent: String(cfg.qtable.bins) });
      bins.addEventListener('input', () => (binsLabel.textContent = bins.value));
      bins.addEventListener('change', () => {
        cfg.qtable.bins = Number(bins.value);
        commit();
      });
      model = el(
        'div',
        { className: 'dz-sec' },
        el('h3', { textContent: `📋 ${d.table}` }),
        el('div', { className: 'dz-note', textContent: d.noNetwork }),
        row(d.bins, bins, binsLabel),
        el('div', { className: `dz-states${n > MAX_STATES ? ' bad' : ''}`, textContent: `${d.states(big(n))} (관찰 ${ctx.nObs}개 × 칸 ${cfg.qtable.bins}개 → ${cfg.qtable.bins}^${ctx.nObs})` }),
        ...(n > MAX_STATES ? [el('div', { className: 'dz-warn', textContent: d.tooMany })] : []),
      );
    } else {
      const chain = el('div', { className: 'dz-chain' }, el('span', { className: 'dz-node io', textContent: `${d.input} ${ctx.nObs}` }));
      cfg.network.hidden.forEach((u, i) => {
        const units = select(UNITS, u, (v) => `${v}`, (v) => (cfg.network.hidden[i] = v));
        const del = el('button', { className: 'dz-x', textContent: '×', title: '이 층 빼기' });
        del.addEventListener('click', () => {
          cfg.network.hidden.splice(i, 1);
          commit();
        });
        chain.append(el('span', { className: 'dz-arrow', textContent: '→' }), el('span', { className: 'dz-node' }, units, el('small', { textContent: cfg.network.activation }), del));
      });
      const add = el('button', { className: 'dz-add', textContent: d.addLayer });
      add.disabled = cfg.network.hidden.length >= 6;
      add.addEventListener('click', () => {
        cfg.network.hidden.push(cfg.network.hidden.at(-1) ?? 32);
        commit();
      });
      chain.append(
        el('span', { className: 'dz-arrow', textContent: '→' }),
        add,
        el('span', { className: 'dz-arrow', textContent: '→' }),
        el('span', { className: 'dz-node io', textContent: `${cfg.algo === 'dqn' ? d.outputQ : d.outputPolicy} ${ctx.nAct}` }),
      );
      const params = [ctx.nObs, ...cfg.network.hidden, ctx.nAct].reduce((acc, n, i, a) => (i ? acc + a[i - 1] * n + n : 0), 0);
      model = el(
        'div',
        { className: 'dz-sec' },
        el('h3', { textContent: `🧠 ${d.network}` }),
        chain,
        el(
          'div',
          { className: 'dz-row' },
          row(d.activation, select(ACTS, cfg.network.activation, (v) => v, (v) => (cfg.network.activation = v))),
          el('span', { className: 'dz-note', textContent: `파라미터 ${params.toLocaleString('ko-KR')}개${cfg.algo === 'ppo' ? ' (정책망·가치망 각각)' : ''}` }),
        ),
      );
    }

    // ── 공통 ──
    const seedFixed = cfg.seed !== null;
    const seedInput = el('input', { type: 'number', value: String(cfg.seed ?? 0), min: '0', step: '1', disabled: !seedFixed });
    seedInput.addEventListener('change', () => {
      cfg.seed = Math.max(0, Math.floor(Number(seedInput.value) || 0));
      commit();
    });
    const seedMode = select(['random', 'fixed'], seedFixed ? 'fixed' : 'random', (v) => (v === 'random' ? d.seedRandom : d.seedFixed), (v) => (cfg.seed = v === 'fixed' ? Number(seedInput.value) || 0 : null));
    const common = el(
      'div',
      { className: 'dz-sec' },
      el('h3', { textContent: `🎛️ ${d.common}` }),
      el(
        'div',
        { className: 'dz-grid' },
        row(d.steps, select(STEPS, cfg.steps, (v) => `${short(v)} 프레임`, (v) => (cfg.steps = v))),
        row(d.skip, select(SKIPS, cfg.frameSkip, (v) => `${v}`, (v) => (cfg.frameSkip = v))),
        row(d.gamma, select(GAMMAS, cfg.gamma, (v) => `${v}`, (v) => (cfg.gamma = v))),
        ...(cfg.algo === 'qtable' ? [] : [row(d.lr, select(LRS, cfg.lr, (v) => `${v}`, (v) => (cfg.lr = v)))]),
        row(d.seed, seedMode, seedInput),
      ),
    );

    // ── 고급 (알고리즘별) ──
    const group = cfg.algo as keyof LearnConfig;
    const sub = cfg[group] as unknown as Record<string, number | boolean>;
    const fields = Object.keys(sub).map((key) => {
      const [label, hint] = d.fields[`${cfg.algo}.${key}`] ?? [key, ''];
      const v = sub[key];
      if (typeof v === 'boolean') {
        const box = el('input', { type: 'checkbox', checked: v });
        box.addEventListener('change', () => {
          sub[key] = box.checked;
          commit();
        });
        return el('label', { className: 'dz-field', title: hint }, el('span', { textContent: key === 'double' ? 'Double DQN' : label }), box);
      }
      const input = el('input', { type: 'number', value: String(v), step: 'any' });
      input.addEventListener('change', () => {
        const n = Number(input.value);
        if (Number.isFinite(n) && n >= 0) sub[key] = n;
        commit();
      });
      return el('label', { className: 'dz-field', title: hint }, el('span', { textContent: label }), input);
    });
    const adv = el('details', { className: 'dz-sec', open: advOpen }, el('summary', { textContent: `🔧 ${d.advanced} (${d.algos[cfg.algo][0]})` }), el('div', { className: 'dz-grid' }, ...fields));
    adv.addEventListener('toggle', () => (advOpen = adv.open));

    const preset = el('button', { className: 'btn ghost', textContent: d.preset });
    preset.addEventListener('click', () => {
      // 알고리즘은 그대로 두고, 나머지를 예제 설계 + 알고리즘 추천값으로
      cfg = resolveConfig({ ...structuredClone(DEFAULT_CONFIG), ...ctx.base, ...ALGO_PRESETS[cfg.algo], algo: cfg.algo });
      commit();
    });
    const close = el('button', { className: 'btn play', textContent: d.close });
    close.addEventListener('click', () => dialog.close());

    dialog.replaceChildren(
      el('h2', { textContent: d.title }),
      el('div', { className: 'help', textContent: d.help }),
      el('h3', { className: 'dz-h', textContent: `🧩 ${d.algo}` }),
      algos,
      model,
      common,
      adv,
      el('div', { className: 'km-foot' }, preset, close),
    );
  };

  dialog.classList.add('dz-dialog');
  dialog.addEventListener('close', () => dialog.classList.remove('dz-dialog'), { once: true });
  render();
  dialog.showModal();
}
