// 端末への保存。localStorage のキーは公開 API 扱い（形を変えるときは normalizeProject で移行する）。
//   koban:v1:index        作品 ID の配列
//   koban:v1:p:<id>       作品の JSON
//   koban:v1:snap:<id>    破壊的な操作の直前の写し（最大5件）
// どのアクセスも try/catch で包む（容量超過・プライベートモード）。

import type { Project } from '../core/model';
import { normalizeProject } from '../core/project';

const INDEX = 'koban:v1:index';
const P = (id: string) => `koban:v1:p:${id}`;
const SNAP = (id: string) => `koban:v1:snap:${id}`;
const MAX_SNAPS = 5;
export const TRASH_DAYS = 30;

export class StorageError extends Error {}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    throw new StorageError(
      e instanceof DOMException && e.name === 'QuotaExceededError'
        ? 'この端末の保存領域がいっぱいです。使わない作品をゴミ箱から削除するか、書き出して退避してください。'
        : 'この端末に保存できませんでした（プライベートブラウズでは保存できないことがあります）。',
    );
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 消せなくても害はない
  }
}

function readIndex(): string[] {
  try {
    const v = JSON.parse(read(INDEX) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function loadAll(): Project[] {
  const out: Project[] = [];
  for (const id of readIndex()) {
    const raw = read(P(id));
    if (!raw) continue;
    try {
      const p = normalizeProject(JSON.parse(raw));
      if (p) out.push(p);
    } catch {
      // 壊れた作品は読み飛ばす（消さない）
    }
  }
  return out;
}

export function saveProject(p: Project): void {
  write(P(p.id), JSON.stringify(p));
  const idx = readIndex();
  if (!idx.includes(p.id)) write(INDEX, JSON.stringify([...idx, p.id]));
}

/** ゴミ箱から完全に消す。直前の写しも消す */
export function purgeProject(id: string): void {
  remove(P(id));
  remove(SNAP(id));
  write(INDEX, JSON.stringify(readIndex().filter((x) => x !== id)));
}

export interface Snapshot {
  at: number;
  reason: string;
  project: Project;
}

/** 取り込みの反映など、大きく書き換える前に呼ぶ */
export function pushSnapshot(p: Project, reason: string): void {
  const list = loadSnapshots(p.id);
  const next = [{ at: Date.now(), reason, project: p }, ...list].slice(0, MAX_SNAPS);
  try {
    write(SNAP(p.id), JSON.stringify(next));
  } catch {
    // 写しが保存できなくても本体の保存は続ける。古い写しを減らして再挑戦する
    try {
      write(SNAP(p.id), JSON.stringify(next.slice(0, 1)));
    } catch {
      /* 諦める */
    }
  }
}

export function loadSnapshots(id: string): Snapshot[] {
  try {
    const v = JSON.parse(read(SNAP(id)) ?? '[]');
    if (!Array.isArray(v)) return [];
    return v
      .map((s) => ({ at: Number(s.at), reason: String(s.reason ?? ''), project: normalizeProject(s.project) }))
      .filter((s): s is Snapshot => s.project != null);
  } catch {
    return [];
  }
}

/** 30日を過ぎたゴミ箱の作品 */
export function expiredTrash(projects: Project[], now = Date.now()): Project[] {
  return projects.filter((p) => p.deletedAt != null && now - p.deletedAt > TRASH_DAYS * 86400000);
}

// ---- 書き出しと復元（A-6） ----

export interface Backup {
  app: 'koban';
  schema: 1;
  exportedAt: number;
  project: Project;
}

export function toBackupJson(p: Project): string {
  const b: Backup = { app: 'koban', schema: 1, exportedAt: Date.now(), project: p };
  return JSON.stringify(b, null, 1);
}

export function parseBackup(text: string): Project {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new Error('JSON として読めませんでした。');
  }
  const b = v as Partial<Backup>;
  if (b?.app !== 'koban') throw new Error('KOBAN の書き出しファイルではありません。');
  const p = normalizeProject(b.project);
  if (!p) throw new Error('作品のデータが壊れています。');
  return p;
}

// ---- 小さな設定 ----

export function readPref(key: string): string | null {
  return read(`koban:v1:pref:${key}`);
}

export function writePref(key: string, value: string): void {
  try {
    write(`koban:v1:pref:${key}`, value);
  } catch {
    // 設定が保存できなくても動作は続ける
  }
}
