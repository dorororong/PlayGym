# 제3자 구성요소 고지

PlayGym 배포본에는 아래 구성요소가 포함되거나 불러와진다. 배포할 때 이 파일을 함께 둔다.

| 구성요소 | 용도 | 라이선스 | 출처 |
| --- | --- | --- | --- |
| Blockly 12 (`blockly`) | 블록 편집기, 둥근 블록 렌더러(`zelos`), 한국어 메시지 | Apache License 2.0 | https://github.com/google/blockly |
| Pretendard | 본문 글꼴 (CDN 로드, 실패 시 시스템 글꼴) | SIL Open Font License 1.1 | https://github.com/orioncactus/pretendard |
| Jua | 제목 글꼴 (Google Fonts 로드) | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Jua |

Apache 2.0 은 배포 시 라이선스 사본을 함께 줄 것을 요구한다. npm 패키지에는 LICENSE 파일이 없으므로 배포본에는
https://www.apache.org/licenses/LICENSE-2.0 의 전문을 `LICENSE-blockly.txt` 로 저장해 THIRD_PARTY_NOTICES.md 와 함께 넣는다 (Blockly 빌드 파일에는 라이선스 머리말이 없어서 이 고지가 필요하다).

## 그래픽

게임 모양(공룡·오리·우주선·선인장·파이프·운석·패들·공·벽돌 등)과 배경 그림은 모두
`src/render/costumes.ts`, `src/render/backdrops.ts` 에서 캔버스 코드로 직접 그린 원본이다.
외부 이미지 파일이나 원작 게임(Flappy Bird, Breakout, Chrome 공룡 게임 등)의 그래픽은 쓰지 않는다.
