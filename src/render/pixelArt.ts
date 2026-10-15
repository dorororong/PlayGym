// 사용자가 그린 픽셀 그림 (MakeCode 이미지 편집기처럼 16색 팔레트).
// 프로젝트 JSON 에 문자열로 저장한다: 한 칸 = 한 글자 ('.' 투명, '0'~'f' 팔레트 번호).
// 이 파일은 DOM 이 필요 없는 부분만 담는다 (블록 정의가 Node 에서도 쓴다).

export interface PixelArt {
  w: number;
  h: number;
  data: string;
}

/** PlayGym 16색 팔레트 */
export const PALETTE = [
  '#000000', '#ffffff', '#9aa0a6', '#4b4b5c',
  '#e63946', '#ff8c42', '#ffd23f', '#7bd389',
  '#2a9d8f', '#3a86ff', '#1d3557', '#8338ec',
  '#ff6fb5', '#a0522d', '#f4d1ae', '#5ad1ff',
];
export const TRANSPARENT = '.';
export const CUSTOM_PREFIX = 'px:';

export function blankArt(w = 16, h = 16): PixelArt {
  return { w, h, data: TRANSPARENT.repeat(w * h) };
}

export function isPixelArt(a: unknown): a is PixelArt {
  const p = a as PixelArt;
  return !!p && Number.isInteger(p.w) && Number.isInteger(p.h) && p.w > 0 && p.h > 0 && p.w <= 64 && p.h <= 64 && typeof p.data === 'string' && p.data.length === p.w * p.h && /^[.0-9a-f]*$/.test(p.data);
}

/** 프로젝트에 저장된 그림 목록. 블록의 "모양" 드롭다운이 읽는다 */
let registry: Record<string, PixelArt> = {};

export function setCustomCostumes(c: Record<string, PixelArt> | undefined): void {
  registry = {};
  for (const [k, v] of Object.entries(c ?? {})) if (isPixelArt(v)) registry[k] = v;
}

export function customCostumes(): Record<string, PixelArt> {
  return registry;
}

/** 모양 탭에서 활성화한 모양 키. null 이면 전부 (Node 에서 블록을 코드로 바꿀 때) */
let active: Set<string> | null = null;

export function setActiveAssets(list: string[] | null): void {
  active = list ? new Set(list) : null;
}

export function isActiveAsset(key: string): boolean {
  return !active || active.has(key);
}

/** 블록 JSON 에서 "모양" 블록이 쓰는 모양 키를 모은다 (불러올 때 자동 활성화용) */
export function costumesUsedIn(blocksJson: unknown): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.type === 'pg_set_costume' && o.fields && typeof (o.fields as Record<string, unknown>).COSTUME === 'string') {
      found.add((o.fields as Record<string, string>).COSTUME);
    }
    for (const x of Object.values(o)) walk(x);
  };
  walk(blocksJson);
  return [...found];
}
