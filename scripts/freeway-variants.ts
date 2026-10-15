// 닭 길 건너기 학습 실험용 변형 게임들을 만든다 → experiments/freeway/<이름>.json
// 바꾸는 것은 학습자가 블록으로 바꿀 수 있는 것뿐이다: 보상 블록, 관찰 센서, 태그 나누기.
//   base      : 지금 예제 그대로 (위 버튼을 누르면 +0.02)
//   progress  : 보상 = 실제로 올라간 만큼 (밀려나면 그만큼 벌점)  ← "가치 있는 결과" 에 보상
//   dir       : progress + 차를 방향별 태그(carL·carR)로 나눠 격자 센서를 두 개 (차가 어느 쪽으로 가는지 보이게)
//   dirnear   : dir + 가까운 차 4대의 위치
//   hard*     : 치이면 출발점으로 (Frogger 식). 피하기의 가치가 커서 "피하기를 배우는가" 를 시험하기 좋다
// 실행: npx tsx scripts/freeway-variants.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { projectFromBlocksJson } from '../src/blocks/headless';
import { TemplateBuilder } from '../src/templates/builder';

interface Opt {
  progress: boolean;
  dirTags: boolean;
  near: boolean;
  hitReset?: boolean;
}

function freeway(name: string, o: Opt) {
  const t = new TemplateBuilder(`fw_${name}`);
  const lane = () => t.getVar('lane');
  const py = () => t.get(t.tag('player'), 'y');
  const carTags = o.dirTags ? ['carL', 'carR'] : ['car'];
  t.settings(['none', 'up', 'down'], 2000, '#2e8b3e', 'road');
  t.observe([
    t.sProp('player', 'y', 0, 300),
    ...carTags.map((c) => t.sGrid('player', 5, 9, 28, c)),
    ...(o.near ? carTags.map((c) => t.sNearestK(2, 'player', c, 'all')) : []),
  ]);
  // 차선 방향: 짝수 차선 ←, 홀수 차선 → (예제와 같은 규칙)
  const speed = () => t.math('ADD', 1, t.math('MULTIPLY', t.mod(lane(), 3), 0.75));
  const vx = () => t.math('MULTIPLY', t.math('MINUS', t.math('MULTIPLY', t.mod(lane(), 2), 2), 1), speed());
  const makeCar = (tag: string) =>
    t.create(tag, t.math('ADD', t.math('MULTIPLY', t.getVar('k'), 200), t.randInt(0, 150)), t.math('ADD', 50, t.math('MULTIPLY', lane(), 28)), 30, 16, t.rainbow(lane()), vx(), 0);
  t.onStart([
    t.create('player', 200, 285, 18, 18, '#ffffff', 0, 0),
    t.setVar('prevY', 285),
    t.for('lane', 0, 7, 1, [
      t.for('k', 0, 1, 1, [
        o.dirTags ? t.if(t.compare('EQ', t.mod(lane(), 2), 0), [makeCar('carL')]) : makeCar('car'),
        ...(o.dirTags ? [t.if(t.compare('EQ', t.mod(lane(), 2), 1), [makeCar('carR')])] : []),
      ]),
    ]),
    ...carTags.flatMap((c) => [t.setBehavior(c, 'wrap'), t.costume(c, 'car')]),
    t.setBehavior('player', 'stayInScreen'),
    t.costume('player', 'chicken'),
  ]);
  t.onTick([
    ...(o.progress
      ? [
          // 올라간 만큼 보상 (한 번 건너기 ≈ +1). 차에 밀려 내려가면 그만큼 마이너스
          t.reward(t.math('MULTIPLY', t.math('MINUS', t.getVar('prevY'), py()), 0.004)),
          t.setVar('prevY', py()),
        ]
      : []),
    t.if(t.compare('LT', py(), 30), [t.addScore(1), t.setPos(t.tag('player'), 200, 285), t.setVar('prevY', 285)]),
  ]);
  t.onAction('up', [t.move(t.tag('player'), 'y', -3), ...(o.progress ? [] : [t.reward(0.02)])]);
  t.onAction('down', [t.move(t.tag('player'), 'y', 3)]);
  for (const c of carTags)
    // 출발점으로 돌려보내기만 한다. prevY 를 그대로 두면 다음 프레임에 잃은 높이만큼 보상이 깎인다
    // (잠재함수 기반 보상: 실패한 시도는 0, 건너면 +). 따로 벌점을 주면 "아예 안 건너기" 를 배운다 (실험)
    t.onCollide('player', c, o.hitReset ? [t.setPos(t.self(), 200, 285)] : [t.move(t.self(), 'y', 28)]);
  return projectFromBlocksJson(t.build());
}

const variants: Record<string, Opt> = {
  base: { progress: false, dirTags: false, near: false },
  progress: { progress: true, dirTags: false, near: false },
  dir: { progress: true, dirTags: true, near: false },
  dirnear: { progress: true, dirTags: true, near: true },
  hard: { progress: true, dirTags: false, near: false, hitReset: true },
  harddir: { progress: true, dirTags: true, near: false, hitReset: true },
};

mkdirSync('experiments/freeway', { recursive: true });
for (const [name, o] of Object.entries(variants)) {
  const p = { ...freeway(name, o), training: { steps: 1_500_000, frameSkip: 4 } };
  writeFileSync(`experiments/freeway/${name}.json`, JSON.stringify(p));
  console.log(name, '관찰', p.generatedCode.match(/api\.sensor\.\w+/g)?.join(' '));
}
