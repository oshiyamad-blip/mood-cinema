// 作品の置き場（画面から使う）。端末の保存を正本の写しとして常に最新に保つ。
// 保存できなかったときは状態に残して画面に出す（静かに失わない）。

import { useSyncExternalStore } from 'react';
import type { ID, Project } from '../core/model';
import { touch } from '../core/project';
import { StorageError, expiredTrash, loadAll, purgeProject, pushSnapshot, saveProject } from './storage';

interface State {
  projects: Project[];
  saveError: string | null;
}

let state: State = { projects: [], saveError: null };
let loaded = false;
const listeners = new Set<() => void>();
type ChangeHook = (p: Project) => void;
const changeHooks = new Set<ChangeHook>();

function emit() {
  for (const l of listeners) l();
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const all = loadAll();
  const expired = new Set(expiredTrash(all).map((p) => p.id));
  for (const id of expired) purgeProject(id);
  state = { ...state, projects: all.filter((p) => !expired.has(p.id)) };
}

function persist(p: Project) {
  try {
    saveProject(p);
    if (state.saveError) state = { ...state, saveError: null };
  } catch (e) {
    state = { ...state, saveError: e instanceof StorageError ? e.message : '保存に失敗しました。' };
  }
}

export const projectStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  getState(): State {
    ensureLoaded();
    return state;
  },
  get(id: ID): Project | undefined {
    ensureLoaded();
    return state.projects.find((p) => p.id === id);
  },
  /** 新しい作品を加える（取り込み・復元・クラウドから） */
  add(p: Project) {
    ensureLoaded();
    persist(p);
    state = { ...state, projects: [...state.projects.filter((x) => x.id !== p.id), p] };
    emit();
  },
  /** 作品を書き換える。snapshot を渡すと書き換え前の写しを残す */
  update(id: ID, fn: (p: Project) => Project, opts?: { snapshot?: string; silent?: boolean }) {
    ensureLoaded();
    const cur = state.projects.find((p) => p.id === id);
    if (!cur) return;
    const next = fn(cur);
    if (next === cur) return;
    if (opts?.snapshot) pushSnapshot(cur, opts.snapshot);
    const saved = touch(next);
    persist(saved);
    state = { ...state, projects: state.projects.map((p) => (p.id === id ? saved : p)) };
    emit();
    if (!opts?.silent) for (const h of changeHooks) h(saved);
  },
  /** クラウドから受け取った版で置き換える（rev と updatedAt をそのまま使う） */
  replaceFromRemote(p: Project) {
    ensureLoaded();
    persist(p);
    state = { ...state, projects: [...state.projects.filter((x) => x.id !== p.id), p] };
    emit();
  },
  trash(id: ID) {
    this.update(id, (p) => ({ ...p, deletedAt: Date.now() }));
  },
  restore(id: ID) {
    this.update(id, (p) => ({ ...p, deletedAt: null }));
  },
  purge(id: ID) {
    purgeProject(id);
    state = { ...state, projects: state.projects.filter((p) => p.id !== id) };
    emit();
  },
  onChange(h: ChangeHook) {
    changeHooks.add(h);
    return () => {
      changeHooks.delete(h);
    };
  },
  /** テストと再読み込み用 */
  reload() {
    loaded = false;
    ensureLoaded();
    emit();
  },
};

export function useProjects(): State {
  return useSyncExternalStore(projectStore.subscribe, projectStore.getState);
}

export function useProject(id: ID | undefined): Project | undefined {
  const s = useProjects();
  return id ? s.projects.find((p) => p.id === id) : undefined;
}
