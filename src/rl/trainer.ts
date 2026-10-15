// 학습기 공통 모양과 만들기. 알고리즘은 학습 설계(LearnConfig.algo)로 고른다.

import type { Env } from '../engine/env';
import type { Agent } from './agent';
import { ko } from '../i18n/ko';
import type { UpdateStats } from './common';
import { ALGO_NAMES, type LearnConfig } from './config';
import { DqnTrainer } from './dqn';
import { PpoTrainer } from './ppo';
import { QTableTrainer } from './qtable';
import { ReinforceTrainer } from './reinforce';

export interface Trainer {
  readonly cfg: LearnConfig;
  /** 지금까지 진행한 프레임 수 */
  readonly steps: number;
  /** 경험을 모으고 한 번 배운다 */
  update(): UpdateStats;
  /** 지금까지 배운 것의 복사본 */
  agent(): Agent;
}

/** init 을 주면 그 AI 에서 이어서 학습한다 (canResume 이 null 일 때만) */
export function createTrainer(makeEnv: () => Env, cfg: LearnConfig, init?: Agent): Trainer {
  if (init) {
    const why = canResume(init, cfg, makeEnv());
    if (why) throw new Error(why);
  }
  switch (cfg.algo) {
    case 'qtable':
      return new QTableTrainer(makeEnv, cfg, init);
    case 'dqn':
      return new DqnTrainer(makeEnv, cfg, init);
    case 'reinforce':
      return new ReinforceTrainer(makeEnv, cfg, init);
    default:
      return new PpoTrainer(makeEnv, cfg, init);
  }
}

/** 이 AI 에서 지금 설계로 이어서 학습할 수 있는지. 안 되면 이유 (학습자에게 보여 줄 문장) */
export function canResume(agent: Agent, cfg: LearnConfig, env: Env): string | null {
  const r = ko.resume;
  if (!agent.fits(env)) return r.notFit;
  if (agent.algo !== cfg.algo) return r.algo(ALGO_NAMES[agent.algo], ALGO_NAMES[cfg.algo]);
  if (cfg.algo === 'qtable') return agent.qtable && agent.qtable.bins === cfg.qtable.bins ? null : r.bins;
  const want = [env.observationSpace.shape[0], ...cfg.network.hidden, env.actionSpace.n];
  const net = agent.net;
  if (!net || net.sizes.length !== want.length || net.sizes.some((n, i) => n !== want[i]) || net.act !== cfg.network.activation) return r.network;
  return null;
}
