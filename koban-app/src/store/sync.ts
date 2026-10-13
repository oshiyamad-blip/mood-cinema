// 作品単位の LWW 同期。端末の作品は絶対に落とさない。
// 端末とクラウドの両方で編集されていたら、クラウドの版を本体にし、端末の版を「写し」として別の作品に残す。

import type { Project } from '../core/model';
import { newId } from '../core/ids';
import { normalizeProject } from '../core/project';
import { supabase } from '../backend/supabase';
import { projectStore } from './projects';
import { readPref, writePref } from './storage';

type SyncedRevs = Record<string, number>;

function syncedRevs(): SyncedRevs {
  try {
    return JSON.parse(readPref('synced-revs') ?? '{}') as SyncedRevs;
  } catch {
    return {};
  }
}

function markSynced(id: string, rev: number) {
  writePref('synced-revs', JSON.stringify({ ...syncedRevs(), [id]: rev }));
}

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error';
let status: SyncStatus = 'off';
const listeners = new Set<(s: SyncStatus) => void>();
function setStatus(s: SyncStatus) {
  status = s;
  for (const l of listeners) l(s);
}
export function syncStatus(): SyncStatus {
  return status;
}
export function onSyncStatus(l: (s: SyncStatus) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function keepLocalCopy(local: Project) {
  const copy: Project = { ...local, id: newId(), title: `${local.title}（この端末の写し）`, rev: 0 };
  projectStore.add(copy);
}

async function push(p: Project): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const { data, error } = await sb.rpc('koban_push_project', {
    p_id: p.id,
    p_data: p,
    p_rev: p.rev,
    p_base_rev: syncedRevs()[p.id] ?? null,
    p_deleted: p.deletedAt != null,
  });
  if (error) throw error;
  const row = (data as { accepted: boolean; server_rev: number; server_data: unknown }[])[0];
  if (row?.accepted) {
    markSynced(p.id, p.rev);
    return;
  }
  // クラウドの方が新しい：クラウドを本体にして、端末の版を写しに残す
  const remote = normalizeProject(row?.server_data);
  if (!remote) return;
  const current = projectStore.get(p.id);
  if (current && current.rev !== syncedRevs()[p.id]) keepLocalCopy(current);
  projectStore.replaceFromRemote(remote);
  markSynced(remote.id, remote.rev);
}

const timers = new Map<string, number>();

/** 編集のたびに呼ばれる。2秒まとめてから送る */
function schedulePush(p: Project) {
  const t = timers.get(p.id);
  if (t) window.clearTimeout(t);
  timers.set(
    p.id,
    window.setTimeout(async () => {
      timers.delete(p.id);
      const cur = projectStore.get(p.id);
      if (!cur) return;
      setStatus('syncing');
      try {
        await push(cur);
        setStatus('idle');
      } catch {
        setStatus('error');
      }
    }, 2000),
  );
}

export async function pullAll(): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  setStatus('syncing');
  try {
    const { data, error } = await sb.rpc('koban_pull_projects', { p_since: null });
    if (error) throw error;
    const synced = syncedRevs();
    const seen = new Set<string>();
    for (const row of (data ?? []) as { id: string; data: unknown; rev: number }[]) {
      seen.add(row.id);
      const remote = normalizeProject(row.data);
      if (!remote) continue;
      const local = projectStore.get(row.id);
      const base = synced[row.id];
      const remoteChanged = row.rev !== base;
      const localChanged = local != null && local.rev !== base;
      if (!local) {
        projectStore.replaceFromRemote(remote);
        markSynced(remote.id, row.rev);
      } else if (remoteChanged && localChanged) {
        if (local.rev === row.rev && local.updatedAt === remote.updatedAt) {
          markSynced(local.id, local.rev);
        } else {
          keepLocalCopy(local);
          projectStore.replaceFromRemote(remote);
          markSynced(remote.id, row.rev);
        }
      } else if (remoteChanged) {
        projectStore.replaceFromRemote(remote);
        markSynced(remote.id, row.rev);
      } else if (localChanged) {
        await push(local);
      }
    }
    // クラウドにまだ無い端末の作品を上げる
    for (const p of projectStore.getState().projects) if (!seen.has(p.id)) await push(p);
    setStatus('idle');
  } catch {
    setStatus('error');
  }
}

let started = false;

/** ログインしたら一度だけ呼ぶ */
export function startSync() {
  if (started || !supabase()) return;
  started = true;
  projectStore.onChange(schedulePush);
  void pullAll();
}
