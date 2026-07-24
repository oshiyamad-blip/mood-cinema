/**
 * Supabase クライアントの遅延生成。
 * 環境変数（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）が未設定なら null を返し、
 * アプリ全体はこの null チェックで安全に縮退する（ログイン導線ごと非表示）。
 * dynamic import にしてバンドル本体を汚さない（同期を使わない人には読み込ませない）。
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** env 2 変数が揃っているか。UI はこれを見てログイン導線の表示可否を決める。 */
export const isSupabaseConfigured = Boolean(url && anonKey);

let clientPromise: Promise<SupabaseClient> | null = null;

/** 設定済みなら Supabase クライアント（Promise）を、未設定なら null を返す。 */
export function getSupabase(): Promise<SupabaseClient> | null {
  if (!isSupabaseConfigured) return null;
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url as string, anonKey as string, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true, // マジックリンクで戻ってきた時に自動でセッション確立
        },
      }),
    );
  }
  return clientPromise;
}
