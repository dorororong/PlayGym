import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { Adam, MLP, softmax } from '../src/rl/nn';
import { Agent, QTable } from '../src/rl/agent';
import { evaluate, recordEpisode, stepSkip } from '../src/rl/common';
import { resolveConfig } from '../src/rl/config';
import { canResume, createTrainer } from '../src/rl/trainer';
import { envFromCode } from './helpers';

describe('MLP', () => {
  it('역전파 기울기가 수치 미분과 같다', () => {
    const net = new MLP([3, 5, 4, 2], new Rng(3));
    const x = [0.3, -0.7, 0.2];
    const target = [0.5, -1];
    const loss = () => {
      const y = net.forward(x);
      return 0.5 * ((y[0] - target[0]) ** 2 + (y[1] - target[1]) ** 2);
    };
    const acts: Float64Array[] = [];
    const y = net.forward(x, acts);
    const g = net.zeroGrads();
    net.backward(acts, Float64Array.from([y[0] - target[0], y[1] - target[1]]), g.gW, g.gb);
    const eps = 1e-6;
    for (let l = 0; l < net.W.length; l++) {
      for (const i of [0, Math.floor(net.W[l].length / 2), net.W[l].length - 1]) {
        const old = net.W[l][i];
        net.W[l][i] = old + eps;
        const up = loss();
        net.W[l][i] = old - eps;
        const down = loss();
        net.W[l][i] = old;
        expect(g.gW[l][i]).toBeCloseTo((up - down) / (2 * eps), 6);
      }
      const old = net.b[l][0];
      net.b[l][0] = old + eps;
      const up = loss();
      net.b[l][0] = old - eps;
      const down = loss();
      net.b[l][0] = old;
      expect(g.gb[l][0]).toBeCloseTo((up - down) / (2 * eps), 6);
    }
  });

  it('Adam 으로 간단한 회귀를 맞춘다', () => {
    const net = new MLP([1, 16, 1], new Rng(1));
    const opt = new Adam(net.params, 1e-2);
    const rng = new Rng(2);
    for (let it = 0; it < 1500; it++) {
      const g = net.zeroGrads();
      for (let k = 0; k < 16; k++) {
        const x = rng.next() * 2 - 1;
        const acts: Float64Array[] = [];
        const y = net.forward([x], acts)[0];
        net.backward(acts, Float64Array.from([(y - Math.sin(3 * x)) / 16]), g.gW, g.gb);
      }
      opt.step([...g.gW, ...g.gb]);
    }
    let err = 0;
    for (let i = 0; i <= 20; i++) {
      const x = -1 + i / 10;
      err += Math.abs(net.forward([x])[0] - Math.sin(3 * x));
    }
    expect(err / 21).toBeLessThan(0.1);
  });

  it('JSON 저장 → 복원하면 같은 출력', () => {
    const net = new MLP([2, 8, 3], new Rng(5));
    const copy = MLP.fromJSON(JSON.parse(JSON.stringify(net.toJSON())));
    expect(Array.from(copy.forward([0.1, 0.9]))).toEqual(Array.from(net.forward([0.1, 0.9])));
  });

  it('softmax 는 합이 1, 큰 값에도 안정', () => {
    const p = softmax([1000, 1001, 999]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(p[1]).toBeGreaterThan(p[0]);
  });
});

// 아주 단순한 게임: 공이 왼쪽/오른쪽 끝 중 한쪽에 생기고, 그쪽으로 가면 +1, 반대로 가면 -1 후 끝
const toyCode = `
api.sensors([api.sensor.variable('side', 0, 1)]);
api.onStart(() => { api.vars.side = api.randInt(0, 1); });
api.onAction('left', () => { api.reward(api.vars.side === 0 ? 1 : -1); api.gameOver(); });
api.onAction('right', () => { api.reward(api.vars.side === 1 ? 1 : -1); api.gameOver(); });
`;
const toyEnv = () => envFromCode(toyCode, { actions: ['none', 'left', 'right'], maxSteps: 20 });

const cfg = (o: Record<string, unknown>) => resolveConfig({ frameSkip: 1, steps: 100_000, seed: 1, ...o });

describe('알고리즘 4종이 간단한 게임을 푼다', () => {
  const cases: [string, Record<string, unknown>, number][] = [
    ['ppo', { algo: 'ppo', lr: 3e-3, ppo: { nEnvs: 4, nSteps: 64 } }, 15],
    ['dqn', { algo: 'dqn', lr: 3e-3, steps: 4000, network: { hidden: [16], activation: 'relu' }, dqn: { learningStarts: 200, targetUpdate: 200, epsFraction: 0.5 } }, 4],
    ['reinforce', { algo: 'reinforce', lr: 1e-2, reinforce: { episodes: 32 } }, 40],
    ['qtable', { algo: 'qtable', steps: 4000, qtable: { bins: 2, alpha: 0.3, epsFraction: 0.5 } }, 2],
  ];
  for (const [name, c, updates] of cases) {
    it(name, () => {
      const tr = createTrainer(toyEnv, cfg(c));
      for (let i = 0; i < updates; i++) tr.update();
      const after = evaluate(toyEnv, tr.agent(), 40);
      expect(after.meanReturn).toBeGreaterThan(0.95);
    });
  }
});

describe('학습기 공통', () => {
  it('같은 시드면 학습 결과가 같다 (결정론, 알고리즘마다)', () => {
    for (const algo of ['ppo', 'dqn', 'reinforce', 'qtable']) {
      const run = () => {
        const tr = createTrainer(toyEnv, cfg({ algo, ppo: { nEnvs: 2, nSteps: 32 }, dqn: { learningStarts: 100 } }));
        tr.update();
        tr.update();
        return JSON.stringify(tr.agent().toJSON());
      };
      expect(run(), algo).toBe(run());
    }
  });

  it('에이전트는 JSON 으로 저장·복원되고, 관찰 이름표·행동이 같은 환경에만 맞는다', () => {
    for (const algo of ['ppo', 'dqn', 'qtable']) {
      const tr = createTrainer(toyEnv, cfg({ algo, ppo: { nEnvs: 1, nSteps: 8 } }));
      tr.update();
      const a = Agent.fromJSON(JSON.parse(JSON.stringify(tr.agent().toJSON())));
      expect(a.algo).toBe(algo);
      expect(a.fits(toyEnv())).toBe(true);
      expect(a.fits(envFromCode(toyCode, { actions: ['none', 'left'] }))).toBe(false);
      const env = toyEnv();
      const o = env.reset(3).obs;
      expect(a.act(o)).toBe(tr.agent().act(o));
    }
  });

  it('예전(PPO 만 있던) 저장 형식도 읽는다', () => {
    const net = new MLP([1, 4, 3]);
    const old = { version: 1, algo: 'ppo', pi: net.toJSON(), labels: ['var.side'], actions: ['none', 'left', 'right'], steps: 10, frameSkip: 2 };
    const a = Agent.fromJSON(old as never);
    expect(a.frameSkip).toBe(2);
    expect(a.fits(toyEnv())).toBe(true);
  });

  it('신경망 모양·활성함수 설정이 반영된다', () => {
    const tr = createTrainer(toyEnv, cfg({ algo: 'ppo', network: { hidden: [8, 6, 4], activation: 'relu' }, ppo: { nEnvs: 1, nSteps: 8 } }));
    const j = tr.agent().toJSON();
    expect(j.net!.sizes).toEqual([1, 8, 6, 4, 3]);
    expect(j.net!.act).toBe('relu');
  });

  it('설정 정리: 모르는 값은 기본값, 범위 밖은 자른다', () => {
    const c = resolveConfig({ algo: 'zzz', frameSkip: 99, network: { hidden: [2000, 'x'], activation: 'swish' }, ppo: { clip: 0.3 } });
    expect(c.algo).toBe('ppo');
    expect(c.frameSkip).toBe(16);
    expect(c.network.hidden).toEqual([64, 64]);
    expect(c.network.activation).toBe('tanh');
    expect(c.ppo.clip).toBe(0.3);
    expect(c.ppo.nEnvs).toBe(8);
  });
});

describe('이어서 학습', () => {
  for (const algo of ['ppo', 'dqn', 'reinforce', 'qtable']) {
    it(`${algo}: 저장된 AI 에서 그대로 시작하고, 프레임 수가 이어지고, 더 배운다`, () => {
      const c = cfg({ algo, ppo: { nEnvs: 2, nSteps: 32 }, dqn: { learningStarts: 50 } });
      const first = createTrainer(toyEnv, c);
      first.update();
      const saved = Agent.fromJSON(JSON.parse(JSON.stringify(first.agent().toJSON())));
      const env = toyEnv();
      expect(canResume(saved, c, env)).toBeNull();
      const tr = createTrainer(toyEnv, c, saved);
      expect(tr.steps).toBe(saved.steps);
      // 시작 직후의 AI 는 저장된 AI 와 똑같이 행동한다
      for (const seed of [1, 2, 3]) {
        const o = env.reset(seed).obs;
        expect(tr.agent().act(o)).toBe(saved.act(o));
      }
      tr.update();
      expect(tr.steps).toBeGreaterThan(saved.steps);
    });
  }

  it('PPO 는 가치망도 저장해 이어서 쓴다', () => {
    const tr = createTrainer(toyEnv, cfg({ algo: 'ppo', ppo: { nEnvs: 1, nSteps: 8 } }));
    const j = tr.agent().toJSON();
    expect(j.value?.sizes).toEqual([1, 64, 64, 1]);
  });

  it('알고리즘·신경망·칸 수가 다르거나 관찰이 바뀌면 이유를 알려 준다', () => {
    const tr = createTrainer(toyEnv, cfg({ algo: 'ppo', ppo: { nEnvs: 1, nSteps: 8 } }));
    const a = tr.agent();
    const env = toyEnv();
    expect(canResume(a, cfg({ algo: 'dqn' }), env)).toMatch(/PPO|ppo/);
    expect(canResume(a, cfg({ algo: 'ppo', network: { hidden: [32] } }), env)).toMatch(/신경망/);
    expect(canResume(a, cfg({ algo: 'ppo', network: { activation: 'relu' } }), env)).toMatch(/신경망/);
    expect(canResume(a, cfg({ algo: 'ppo' }), envFromCode(toyCode, { actions: ['none', 'left'] }))).toMatch(/관찰|행동/);
    const q = createTrainer(toyEnv, cfg({ algo: 'qtable', qtable: { bins: 4 } })).agent();
    expect(canResume(q, cfg({ algo: 'qtable', qtable: { bins: 6 } }), env)).toMatch(/칸/);
    expect(() => createTrainer(toyEnv, cfg({ algo: 'dqn' }), a)).toThrow();
  });
});

describe('Q-table', () => {
  it('관찰을 칸으로 나눠 상태 키를 만든다', () => {
    const q = new QTable(4, [0, -1], [1, 1], 2);
    expect(q.key([0, -1])).toBe('0,0');
    expect(q.key([0.99, 0.99])).toBe('3,3');
    expect(q.key([0.5, 0])).toBe('2,2');
    expect(q.key([5, -5])).toBe('3,0');
  });
});

describe('녹화와 다시 보기', () => {
  it('시드 + 프레임별 행동으로 같은 판을 똑같이 재현한다', () => {
    const tr = createTrainer(toyEnv, cfg({ algo: 'ppo', ppo: { nEnvs: 1, nSteps: 8 } }));
    const rec = recordEpisode(toyEnv, tr.agent(), 42, 0.5);
    const env = toyEnv();
    env.reset(rec.seed);
    let r;
    for (const ch of rec.actions) r = env.step(Number(ch));
    expect(r!.terminated || r!.truncated).toBe(true);
    expect(r!.info.score).toBe(rec.score);
    expect(r!.info.frame).toBe(rec.length);
  });
});

describe('frame skip', () => {
  it('같은 행동을 k 프레임 반복하고 보상을 합친다, 끝나면 바로 멈춘다', () => {
    const env = envFromCode(`api.onAction('up', () => api.addScore(1)); api.onTick(() => { if (api.frame() === 6) api.gameOver(); });`);
    env.reset(0);
    const a = stepSkip(env, 3, 4);
    expect([a.frames, a.reward, a.info.frame]).toEqual([4, 4, 4]);
    const b = stepSkip(env, 3, 4);
    expect([b.frames, b.reward, b.terminated]).toEqual([2, 2, true]);
  });
  it('에이전트는 학습 때의 frame skip 을 함께 저장한다', () => {
    const tr = createTrainer(toyEnv, cfg({ frameSkip: 3, ppo: { nEnvs: 1, nSteps: 8 } }));
    expect(Agent.fromJSON(tr.agent().toJSON()).frameSkip).toBe(3);
  });
});

describe('보상 블록', () => {
  it('보상 = 점수 변화 + 보상 블록 합, events 에 기록', () => {
    const env = envFromCode(`api.onTick(() => { api.addScore(2); api.reward(0.5); api.reward(-1); });`);
    env.reset(0);
    const r = env.step(0);
    expect(r.reward).toBe(1.5);
    expect(r.info.events.filter((e) => e.type === 'reward')).toHaveLength(2);
    expect(r.info.score).toBe(2);
  });
});

describe('점수를 보상으로 끄기', () => {
  it('끄면 보상 블록만 보상이 된다', () => {
    const code = `api.onTick(() => { api.addScore(2); api.reward(0.5); });`;
    const on = envFromCode(code);
    const off = envFromCode(code, { scoreReward: false });
    on.reset(0);
    off.reset(0);
    expect(on.step(0).reward).toBe(2.5);
    const r = off.step(0);
    expect(r.reward).toBe(0.5);
    expect(r.info.score).toBe(2);
  });
});
