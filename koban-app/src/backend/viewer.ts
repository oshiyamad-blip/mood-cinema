// 閲覧ページの通信。依存を持たず fetch だけで PostgREST の関数を呼ぶ（読み込みを軽くするため）。

import { CLOUD_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { localViewer } from './local';
import type { ViewResult, ViewerBackend } from './types';

async function rpc<T>(name: string, body: unknown): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

const cloudViewer: ViewerBackend = {
  async view(token) {
    try {
      return await rpc<ViewResult>('koban_view', { p_token: token });
    } catch {
      return { ok: false, reason: 'network' };
    }
  },
  async ack(token, version) {
    try {
      return await rpc<boolean>('koban_ack', { p_token: token, p_version: version });
    } catch {
      return false;
    }
  },
};

export const viewer: ViewerBackend = CLOUD_ENABLED ? cloudViewer : localViewer;
export const viewerIsDemo = !CLOUD_ENABLED;
