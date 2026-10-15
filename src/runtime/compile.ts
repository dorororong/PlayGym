// 생성 코드 컴파일. 엔진 API 객체만 넘긴다 (완전한 샌드박스는 요구사항이 아니다).
// self/other 를 바깥에서 undefined 로 주어 충돌 이벤트 밖에서 써도 ReferenceError 대신 무시된다.

import type { Api } from '../engine/api';

export type Program = (api: Api) => void;

export class CompileError extends Error {}

export function compile(code: string): Program {
  let fn: (api: Api, self: undefined, other: undefined) => void;
  try {
    fn = new Function('api', 'self', 'other', `"use strict";\n${code}`) as typeof fn;
  } catch (e) {
    throw new CompileError(`코드를 만들 수 없어요: ${e instanceof Error ? e.message : String(e)}`);
  }
  return (api) => fn(api, undefined, undefined);
}
