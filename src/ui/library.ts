// "내 게임" 저장소: 브라우저 IndexedDB 에 게임(프로젝트)을 여러 개 저장한다.
// localStorage 는 5MB 남짓이라 학습된 AI·녹화까지 담기엔 작아서 IndexedDB 를 쓴다.

import type { Project } from '../engine/types';

export interface StoredGame {
  id: string;
  name: string;
  created: number;
  updated: number;
  /** 게임 화면 작은 그림 (JPEG data URL) */
  thumb?: string;
  /** 어떤 예제에서 시작했는지 (아이콘 표시용) */
  from?: string;
  project: Project;
}

const DB = 'playgym';
const STORE = 'games';
const CURRENT_KEY = 'playgym.currentId';
const LEGACY_KEY = 'playgym.project.v1';

let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = f(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const listGames = async (): Promise<StoredGame[]> =>
  (await tx<StoredGame[]>('readonly', (s) => s.getAll())).sort((a, b) => b.updated - a.updated);
export const getGame = (id: string) => tx<StoredGame | undefined>('readonly', (s) => s.get(id));
export const putGame = (g: StoredGame) => tx('readwrite', (s) => s.put(g));
export const deleteGame = (id: string) => tx('readwrite', (s) => s.delete(id));

export function newId(): string {
  return `g${Date.now().toString(36)}${Math.floor(performance.now() * 1000).toString(36).slice(-4)}`;
}

export function currentId(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

export function setCurrentId(id: string): void {
  try {
    localStorage.setItem(CURRENT_KEY, id);
  } catch {
    /* 저장 공간이 없으면 다음에 처음 게임으로 시작할 뿐이다 */
  }
}

/** 예전 버전(한 개만 localStorage 에 자동 저장)에서 쓰던 작업을 라이브러리로 옮긴다 */
export async function migrateLegacy(): Promise<StoredGame | null> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const project = JSON.parse(raw) as Project;
    if (project?.version !== 1) return null;
    const g: StoredGame = { id: newId(), name: '이전에 만들던 게임', created: Date.now(), updated: Date.now(), project };
    await putGame(g);
    localStorage.removeItem(LEGACY_KEY);
    return g;
  } catch {
    return null;
  }
}

/** 게임 화면 캔버스를 작은 썸네일로 */
export function thumbnail(canvas: HTMLCanvasElement): string | undefined {
  try {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 120;
    c.getContext('2d')!.drawImage(canvas, 0, 0, 160, 120);
    return c.toDataURL('image/jpeg', 0.7);
  } catch {
    return undefined;
  }
}
