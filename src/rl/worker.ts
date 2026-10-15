// 브라우저 학습용 Web Worker. 화면이 멈추지 않도록 환경과 학습기를 여기서 돌린다.
// 생성 코드는 이 워커 안에서 new Function 으로 컴파일된다 (엔진은 DOM 을 쓰지 않는다).
//
// 학습하면서 보내는 것:
//  - progress  : 업데이트마다 진행 상황
//  - snapshot  : 2초마다 지금까지 배운 AI (화면의 "학습 중 실시간 보기" 가 쓴다)
//  - checkpoint: 학습의 0·10·…·100% 시점에 한 판을 녹화 (시드 + 프레임별 행동) → 나중에 똑같이 다시 볼 수 있다

import { createEnv } from '../engine/env';
import type { Project } from '../engine/types';
import { Agent, PLAY_TEMPERATURE, type AgentJson } from './agent';
import { evaluate, recordEpisode, type EpisodeRecording, type EvalResult, type UpdateStats } from './common';
import type { LearnConfig } from './config';
import { createTrainer } from './trainer';

export interface Checkpoint extends EpisodeRecording {
  index: number;
  /** 이 시점까지 학습한 프레임 수 */
  steps: number;
}

export const CHECKPOINTS = 10;
const CHECKPOINT_SEED = 777;

/** resume: 이 AI 에서 이어서 학습 (학습 곡선·체크포인트의 프레임 수도 이어진다) */
export type ToWorker = { type: 'start'; project: Project; config: LearnConfig; resume?: AgentJson } | { type: 'stop' };

export type FromWorker =
  | { type: 'baseline'; random: EvalResult }
  | { type: 'progress'; stats: UpdateStats; seconds: number; total: number; start: number }
  | { type: 'snapshot'; agent: AgentJson }
  | { type: 'checkpoint'; cp: Checkpoint }
  | { type: 'done'; agent: AgentJson; seconds: number; stopped: boolean; result: EvalResult }
  | { type: 'error'; message: string };

const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);
let stopRequested = false;

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'stop') {
    stopRequested = true;
    return;
  }
  stopRequested = false;
  try {
    const cfg = m.config;
    const makeEnv = () => createEnv(m.project);
    post({ type: 'baseline', random: evaluate(makeEnv, null, 10) });
    const tr = createTrainer(makeEnv, cfg, m.resume ? Agent.fromJSON(m.resume) : undefined);
    const start = tr.steps;
    const target = start + cfg.steps;
    const t0 = performance.now();
    let lastSnap = -Infinity;
    // 이어서 학습이면 시작 시점 녹화는 이전 학습의 마지막 체크포인트와 같으므로 건너뛴다
    let nextCp = m.resume ? 1 : 0;
    const checkpoint = () => {
      const agent = tr.agent();
      post({ type: 'checkpoint', cp: { index: nextCp, steps: tr.steps, ...recordEpisode(makeEnv, agent, CHECKPOINT_SEED, PLAY_TEMPERATURE) } });
      nextCp++;
    };
    if (!m.resume) checkpoint(); // 0%: 아무것도 모를 때
    // Q-table 은 표가 커질 수 있어 스냅샷을 덜 자주 보낸다
    const snapEvery = cfg.algo === 'qtable' ? 6 : 2;
    while (tr.steps < target && !stopRequested) {
      const stats = tr.update();
      const seconds = (performance.now() - t0) / 1000;
      post({ type: 'progress', stats, seconds, total: target, start });
      if (seconds - lastSnap > snapEvery) {
        lastSnap = seconds;
        post({ type: 'snapshot', agent: tr.agent().toJSON() });
      }
      while (nextCp <= CHECKPOINTS && tr.steps >= start + (cfg.steps * nextCp) / CHECKPOINTS) checkpoint();
      // 멈추기 메시지를 받을 틈을 준다
      await new Promise((r) => setTimeout(r, 0));
    }
    if (nextCp <= CHECKPOINTS) checkpoint(); // 멈췄을 때도 마지막 모습을 남긴다
    const agent = tr.agent();
    post({
      type: 'done',
      agent: agent.toJSON(),
      seconds: (performance.now() - t0) / 1000,
      stopped: stopRequested,
      result: evaluate(makeEnv, agent, 10, 1000, PLAY_TEMPERATURE),
    });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
