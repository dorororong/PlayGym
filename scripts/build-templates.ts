// 블록 템플릿 소스(src/templates/sources.ts) → src/templates/<이름>.json (Project 형식)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { projectFromBlocksJson } from '../src/blocks/headless';
import { normalizeKeymap } from '../src/ui/keys';
import { TEMPLATE_KEYMAPS, TEMPLATE_SOURCES, TEMPLATE_TRAINING } from '../src/templates/sources';

for (const [name, build] of Object.entries(TEMPLATE_SOURCES)) {
  const project = { ...projectFromBlocksJson(build()), keymap: normalizeKeymap(TEMPLATE_KEYMAPS[name as keyof typeof TEMPLATE_KEYMAPS]), training: TEMPLATE_TRAINING[name as keyof typeof TEMPLATE_TRAINING] };
  const out = fileURLToPath(new URL(`../src/templates/${name}.json`, import.meta.url));
  writeFileSync(out, JSON.stringify(project, null, 2) + '\n', 'utf8');
  console.log(`${name}: ${out}`);
}
