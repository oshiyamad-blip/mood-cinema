// この端末の中だけで動く配布（デモ）。Supabase が未設定のときに使う。
// 同じブラウザで閲覧ページを開くと、配った中身と確認の流れをそのまま試せる。

import type { Ack } from '../core/share';
import { sha256Hex } from '../core/ids';
import type { Backend, PublishItem, ViewResult, ViewerBackend } from './types';

const KEY = 'koban:v1:demo-shares';

interface Row extends PublishItem {
  projectId: string;
  dayId: string;
  revokedAt: number | null;
  acks: { version: number; at: number }[];
}

function load(): Row[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(rows: Row[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    throw new Error('この端末に保存できませんでした。');
  }
}

export const localBackend: Backend = {
  mode: 'local',
  async publish(projectId, dayId, items) {
    const rows = load();
    for (const it of items) {
      const i = rows.findIndex((r) => r.shareId === it.shareId);
      const prev = i >= 0 ? rows[i] : null;
      const row: Row = { ...it, projectId, dayId, revokedAt: prev?.revokedAt ?? null, acks: prev?.acks ?? [] };
      if (i >= 0) rows[i] = row;
      else rows.push(row);
    }
    save(rows);
  },
  async setRevoked(shareIds, revoked) {
    const ids = new Set(shareIds);
    save(load().map((r) => (ids.has(r.shareId) ? { ...r, revokedAt: revoked ? Date.now() : null } : r)));
  },
  async fetchAcks(projectId, dayId) {
    const out: Ack[] = [];
    for (const r of load()) {
      if (r.projectId !== projectId || r.dayId !== dayId) continue;
      for (const a of r.acks) out.push({ shareId: r.shareId, version: a.version, at: a.at });
    }
    return out;
  },
};

export const localViewer: ViewerBackend = {
  async view(token): Promise<ViewResult> {
    const h = await sha256Hex(token);
    const r = load().find((x) => x.tokenHash === h);
    if (!r) return { ok: false, reason: 'not-found' };
    if (r.revokedAt != null) return { ok: false, reason: 'revoked' };
    if (r.expiresAt < Date.now()) return { ok: false, reason: 'expired' };
    const acked = r.acks.reduce<number | null>((m, a) => (m == null || a.version > m ? a.version : m), null);
    return { ok: true, payload: r.payload, ackedVersion: acked };
  },
  async ack(token, version) {
    const h = await sha256Hex(token);
    const rows = load();
    const r = rows.find((x) => x.tokenHash === h);
    if (!r || r.revokedAt != null || r.expiresAt < Date.now() || version > r.version) return false;
    if (!r.acks.some((a) => a.version === version)) r.acks.push({ version, at: Date.now() });
    save(rows);
    return true;
  },
};
