// 環境変数。どれも未設定なら安全に縮退する。

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
export const CLOUD_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const BILLING_ENABLED = CLOUD_ENABLED && import.meta.env.VITE_BILLING_ENABLED === 'true';

/** 閲覧ページのオリジン。未設定なら今のオリジン */
export function viewOrigin(): string {
  const v = (import.meta.env.VITE_VIEW_ORIGIN as string | undefined) ?? '';
  return v || window.location.origin;
}

/** 無料枠（要件 12章）。最終的な判定はサーバーが行い、ここは画面の案内に使う */
export const FREE_RECIPIENT_LIMIT = 10;
export const FREE_ACTIVE_PROJECTS = 1;
