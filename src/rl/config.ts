// 학습 설계: 알고리즘·신경망·하이퍼파라미터. 프로젝트(`Project.training`)에 저장되고 학습 설계 창에서 바꾼다.

export type Algo = 'qtable' | 'dqn' | 'reinforce' | 'ppo';
export type Activation = 'tanh' | 'relu' | 'sigmoid';

export interface LearnConfig {
  algo: Algo;
  /** 학습할 총 프레임 수 */
  steps: number;
  /** 고른 행동을 몇 프레임 유지할지 (frame skip) */
  frameSkip: number;
  /** 같은 시드면 같은 결과. null 이면 시작할 때마다 새로 뽑는다 */
  seed: number | null;
  /** 미래 보상 할인율 γ */
  gamma: number;
  /** 신경망 학습률 (Q-table 은 qtable.alpha 를 쓴다) */
  lr: number;
  network: { hidden: number[]; activation: Activation };
  ppo: { nEnvs: number; nSteps: number; epochs: number; minibatch: number; clip: number; lambda: number; entCoef: number };
  dqn: {
    buffer: number;
    batch: number;
    learningStarts: number;
    trainFreq: number;
    targetUpdate: number;
    epsStart: number;
    epsEnd: number;
    epsFraction: number;
    double: boolean;
  };
  reinforce: { episodes: number; entCoef: number };
  qtable: { bins: number; alpha: number; epsStart: number; epsEnd: number; epsFraction: number };
}

export const DEFAULT_CONFIG: LearnConfig = {
  algo: 'ppo',
  steps: 1_000_000,
  frameSkip: 4,
  seed: null,
  gamma: 0.99,
  lr: 5e-4,
  network: { hidden: [64, 64], activation: 'tanh' },
  ppo: { nEnvs: 8, nSteps: 128, epochs: 4, minibatch: 256, clip: 0.2, lambda: 0.95, entCoef: 0.01 },
  dqn: { buffer: 50_000, batch: 64, learningStarts: 1000, trainFreq: 4, targetUpdate: 1000, epsStart: 1, epsEnd: 0.05, epsFraction: 0.3, double: true },
  reinforce: { episodes: 8, entCoef: 0.01 },
  qtable: { bins: 8, alpha: 0.1, epsStart: 1, epsEnd: 0.05, epsFraction: 0.5 },
};

/** 알고리즘을 바꿀 때 함께 바꾸면 좋은 기본값 */
export const ALGO_PRESETS: Record<Algo, Partial<LearnConfig>> = {
  qtable: { gamma: 0.99 },
  dqn: { lr: 5e-4, network: { hidden: [64, 64], activation: 'relu' } },
  reinforce: { lr: 1e-3, network: { hidden: [32], activation: 'tanh' } },
  ppo: { lr: 5e-4, network: { hidden: [64, 64], activation: 'tanh' } },
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** 저장된(부분) 설정을 기본값 위에 덮어쓴다. 모르는 값·잘못된 형식은 기본값 */
export function resolveConfig(partial: unknown): LearnConfig {
  const out = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>;
  const merge = (dst: Record<string, unknown>, src: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(src)) {
      if (!(k in dst)) continue;
      const d = dst[k];
      if (isObj(d) && isObj(v)) merge(d, v);
      else if (Array.isArray(d)) {
        if (Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x))) dst[k] = [...v];
      } else if (typeof d === typeof v || (k === 'seed' && (v === null || typeof v === 'number'))) dst[k] = v;
    }
  };
  if (isObj(partial)) merge(out, partial);
  const c = out as unknown as LearnConfig;
  if (!['qtable', 'dqn', 'reinforce', 'ppo'].includes(c.algo)) c.algo = 'ppo';
  if (!['tanh', 'relu', 'sigmoid'].includes(c.network.activation)) c.network.activation = 'tanh';
  c.network.hidden = c.network.hidden.map((n) => Math.max(1, Math.min(512, Math.round(n)))).slice(0, 6);
  c.steps = Math.max(1000, Math.round(c.steps));
  c.frameSkip = Math.max(1, Math.min(16, Math.round(c.frameSkip)));
  return c;
}

export const ALGO_NAMES: Record<Algo, string> = { qtable: 'Q-table', dqn: 'DQN', reinforce: 'REINFORCE', ppo: 'PPO' };

/** 학습 설계를 한 줄로 (패널 요약용) */
export function describeConfig(c: LearnConfig): string {
  const name = ALGO_NAMES[c.algo];
  const net = c.algo === 'qtable' ? `칸 ${c.qtable.bins}개씩` : c.network.hidden.length ? `${c.network.hidden.join('×')} ${c.network.activation}` : '은닉층 없음';
  return `${name} · ${net} · 행동 유지 ${c.frameSkip}`;
}
