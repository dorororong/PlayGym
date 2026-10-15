import './ui/style.css';
import { App } from './ui/app';

const app = new App();
void app.start();
// 개발 서버에서만: 콘솔 디버깅용 노출, ?demo=예제&steps=N 으로 예제를 랜덤 AI 로 N 프레임 돌린 화면, ?tab=train 으로 학습 탭 (스크린샷 확인용)
if (import.meta.env.DEV) {
  (window as unknown as { playgym: App }).playgym = app;
  const q = new URLSearchParams(location.search);
  const demo = q.get('demo');
  // 불러온 직후의 재컴파일(300ms 지연)이 끝난 뒤에 돌린다
  if (demo) setTimeout(() => app.demo(demo, Number(q.get('steps') ?? 120)), 800);
  if (q.get('tab') === 'train') setTimeout(() => document.querySelectorAll<HTMLElement>('.tab')[1]?.click(), 900);
  const open = q.get('open');
  const priv = app as unknown as Record<string, (...a: unknown[]) => void>;
  if (open === 'assets') setTimeout(() => priv.showAssets.call(app, false), 1200);
  else if (open) setTimeout(() => priv[open === 'library' ? 'openLibrary' : 'openDesign']?.call(app), 1200);
  // ?train=qtable 등: 학습을 바로 시작 (스크린샷용)
  const train = q.get('train');
  if (train)
    setTimeout(async () => {
      const { resolveConfig } = await import('./rl/config');
      const a = app as unknown as { training: unknown; trainPanel: { start(r?: boolean): void; refresh(): void } };
      a.training = resolveConfig({ ...(a.training as object), algo: train, steps: Number(q.get('trainSteps') ?? 300000) });
      a.trainPanel.refresh();
      document.querySelectorAll<HTMLElement>('#tabs .tab')[1]?.click();
      a.trainPanel.start();
    }, 1500);
}
