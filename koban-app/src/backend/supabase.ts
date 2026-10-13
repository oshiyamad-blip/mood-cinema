// クラウド（Supabase）。編集画面からだけ読み込む（閲覧ページは viewer.ts の fetch だけを使う）。

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Ack } from '../core/share';
import { CLOUD_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { PublishError, type Backend } from './types';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!CLOUD_ENABLED) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'koban:v1:auth' },
    });
  }
  return client;
}

function rpcError(e: { message?: string; hint?: string; code?: string } | null): PublishError {
  const msg = e?.message ?? '通信に失敗しました。';
  if (e?.hint === 'limit-recipients') return new PublishError(msg, 'limit-recipients');
  if (e?.hint === 'limit-projects') return new PublishError(msg, 'limit-projects');
  if (e?.code === '28000' || e?.code === 'PGRST301') return new PublishError('ログインが必要です。', 'auth');
  if (!e?.code) return new PublishError('通信できませんでした。電波の良い場所でもう一度お試しください。', 'network');
  return new PublishError(msg, 'other');
}

export const cloudBackend: Backend = {
  mode: 'cloud',
  async publish(projectId, dayId, items) {
    const sb = supabase();
    if (!sb) throw new PublishError('クラウドが設定されていません。', 'other');
    const { error } = await sb.rpc('koban_publish', {
      p_project: projectId,
      p_day: dayId,
      p_items: items.map((it) => ({
        id: it.shareId,
        token_hash: it.tokenHash,
        person_id: it.personId ?? '',
        version: it.version,
        expires_at: it.expiresAt,
        payload: it.payload,
      })),
    });
    if (error) throw rpcError(error);
  },
  async setRevoked(shareIds, revoked) {
    const sb = supabase();
    if (!sb) return;
    const { error } = await sb.rpc('koban_set_revoked', { p_ids: shareIds, p_revoked: revoked });
    if (error) throw rpcError(error);
  },
  async fetchAcks(projectId, dayId) {
    const sb = supabase();
    if (!sb) return [];
    const { data, error } = await sb.rpc('koban_acks', { p_project: projectId, p_day: dayId });
    if (error) throw rpcError(error);
    return ((data ?? []) as { share_id: string; version: number; at: string }[]).map(
      (r): Ack => ({ shareId: r.share_id, version: r.version, at: Date.parse(r.at) }),
    );
  },
};
