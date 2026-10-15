// 표준 입출력 환경 서버: Python 등 다른 언어에서 PlayGym 환경을 쓰기 위한 다리.
// 한 줄에 JSON 하나씩 주고받는다. python/playgym_env.py 가 이것을 띄워 Gymnasium 환경으로 감싼다.
//
//   → {"cmd":"spec"}                 ← {"actionSpace":{...},"observationSpace":{...},"maxSteps":3000}
//   → {"cmd":"reset","seed":1}       ← {"obs":[...],"info":{"score":0,"frame":0}}
//   → {"cmd":"step","action":1}      ← {"obs":[...],"reward":1,"terminated":false,"truncated":false,"info":{...}}
//   → {"cmd":"close"}
//
// 실행: npx tsx scripts/env-server.ts <예제이름 | project.json>

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createEnv } from '../src/engine/env';
import type { Project } from '../src/engine/types';
import { loadTemplate } from './templates';

const target = process.argv[2] ?? 'dino';
const env = createEnv((loadTemplate(target) ?? JSON.parse(readFileSync(target, 'utf8'))) as Project);

const out = (o: unknown) => process.stdout.write(JSON.stringify(o) + '\n');
const info = (i: { score: number; frame: number; events: { type: string }[] }) => ({
  score: i.score,
  frame: i.frame,
  events: i.events.filter((e) => e.type !== 'collide'),
});

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  try {
    const m = JSON.parse(line);
    if (m.cmd === 'spec') out({ actionSpace: env.actionSpace, observationSpace: env.observationSpace, maxSteps: env.maxSteps });
    else if (m.cmd === 'reset') {
      const r = env.reset(m.seed ?? undefined);
      out({ obs: r.obs, info: info(r.info) });
    } else if (m.cmd === 'step') {
      const r = env.step(m.action);
      out({ obs: r.obs, reward: r.reward, terminated: r.terminated, truncated: r.truncated, info: info(r.info) });
    } else if (m.cmd === 'close') process.exit(0);
    else out({ error: `알 수 없는 명령: ${m.cmd}` });
  } catch (e) {
    out({ error: e instanceof Error ? e.message : String(e) });
  }
});
