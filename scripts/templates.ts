// 스크립트가 쓰는 예제 프로젝트 목록 (src/templates/*.json, npm run templates 로 생성)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Project } from '../src/engine/types';
import { TEMPLATE_SOURCES } from '../src/templates/sources';

export const TEMPLATE_NAMES = Object.keys(TEMPLATE_SOURCES);

export function loadTemplate(name: string): Project | null {
  if (!TEMPLATE_NAMES.includes(name)) return null;
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../src/templates/${name}.json`, import.meta.url)), 'utf8')) as Project;
}
