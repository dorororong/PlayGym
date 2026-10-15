"""PlayGym 프로젝트를 Python 강화학습 라이브러리에서 쓰기 위한 Gymnasium 래퍼.

엔진은 JS 하나로 유지하고(브라우저와 같은 결과), Node 환경 서버(scripts/env-server.ts)를
자식 프로세스로 띄워 표준 입출력으로 reset/step 을 주고받는다.

    from playgym_env import PlayGymEnv
    env = PlayGymEnv("dino")                 # 또는 PlayGymEnv("my-project.json")
    obs, info = env.reset(seed=1)
    obs, reward, terminated, truncated, info = env.step(1)

gymnasium 이 설치되어 있으면 gymnasium.Env 를 상속하므로 Stable-Baselines3 등에 바로 넣을 수 있다.
없으면 같은 메서드를 가진 일반 클래스로 동작한다. Node.js 와 이 저장소의 npm install 이 필요하다.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from typing import Any

try:  # gymnasium 은 선택
    import gymnasium as gym
    import numpy as np

    _Base: Any = gym.Env
except ImportError:  # pragma: no cover
    gym = None
    np = None
    _Base = object

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class PlayGymEnv(_Base):  # type: ignore[misc]
    metadata = {"render_modes": []}

    def __init__(self, project: str = "dino"):
        npx = shutil.which("npx") or shutil.which("npx.cmd")
        if npx is None:
            raise RuntimeError("Node.js(npx)를 찾을 수 없어요")
        target = project if not project.endswith(".json") else os.path.abspath(project)
        self._proc = subprocess.Popen(
            [npx, "tsx", os.path.join("scripts", "env-server.ts"), target],
            cwd=ROOT,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        spec = self._call({"cmd": "spec"})
        self.action_names: list[str] = spec["actionSpace"]["names"]
        self.obs_labels: list[str] = spec["observationSpace"]["labels"]
        self.max_steps: int = spec["maxSteps"]
        if gym is not None:
            low = np.array(spec["observationSpace"]["low"], dtype=np.float32)
            high = np.array(spec["observationSpace"]["high"], dtype=np.float32)
            self.observation_space = gym.spaces.Box(low=low, high=high, dtype=np.float32)
            self.action_space = gym.spaces.Discrete(spec["actionSpace"]["n"])

    def _call(self, msg: dict) -> dict:
        assert self._proc.stdin and self._proc.stdout
        self._proc.stdin.write(json.dumps(msg) + "\n")
        self._proc.stdin.flush()
        line = self._proc.stdout.readline()
        if not line:
            raise RuntimeError("환경 서버가 응답하지 않아요")
        res = json.loads(line)
        if "error" in res:
            raise RuntimeError(res["error"])
        return res

    def _obs(self, o):
        return np.asarray(o, dtype=np.float32) if np is not None else list(o)

    def reset(self, *, seed: int | None = None, options: dict | None = None):
        if gym is not None:
            super().reset(seed=seed)  # Gymnasium 규약 (실제 난수는 JS 엔진의 시드 RNG 가 쓴다)
        r = self._call({"cmd": "reset", "seed": seed})
        return self._obs(r["obs"]), r["info"]

    def step(self, action):
        r = self._call({"cmd": "step", "action": int(action)})
        return self._obs(r["obs"]), r["reward"], r["terminated"], r["truncated"], r["info"]

    def close(self):
        if self._proc.poll() is None:
            try:
                self._call_nowait({"cmd": "close"})
            finally:
                self._proc.wait(timeout=5)

    def _call_nowait(self, msg: dict) -> None:
        assert self._proc.stdin
        self._proc.stdin.write(json.dumps(msg) + "\n")
        self._proc.stdin.flush()


if __name__ == "__main__":
    # 간단한 확인: 무작위 행동으로 3판
    import random

    env = PlayGymEnv("dino")
    print("행동:", env.action_names, "관찰:", env.obs_labels)
    for ep in range(3):
        obs, info = env.reset(seed=ep)
        total, done = 0.0, False
        while not done:
            obs, r, term, trunc, info = env.step(random.randrange(len(env.action_names)))
            total += r
            done = term or trunc
        print(f"에피소드 {ep}: 보상 {total:.1f}, 프레임 {info['frame']}")
    env.close()
