/**
 * 認証状態の共有ストアと useAuth フック。
 * Supabase のセッションを 1 か所で購読し、ヘッダー・アカウントページ・箱書きへ配る。
 * 未設定（getSupabase()===null）なら常に「未ログイン・configured=false」で安全に縮退。
 *
 * 設計理念：サインアウトはセッション破棄のみ。ローカルの作品データには一切触れない。
 */
import { useEffect, useReducer } from 'react';
import { getSupabase, isSupabaseConfigured } from './supabase';

export interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthSnapshot {
  ready: boolean; // 初回のセッション取得が済んだか
  user: AuthUser | null;
}

let snapshot: AuthSnapshot = { ready: !isSupabaseConfigured, user: null };
const listeners = new Set<() => void>();
let initialized = false;

function emit(next: AuthSnapshot) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function toUser(u: { id: string; email?: string } | undefined | null): AuthUser | null {
  return u ? { id: u.id, email: u.email ?? null } : null;
}

async function init(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const sp = getSupabase();
  if (!sp) {
    emit({ ready: true, user: null });
    return;
  }
  try {
    const client = await sp;
    const { data } = await client.auth.getSession();
    emit({ ready: true, user: toUser(data.session?.user) });
    client.auth.onAuthStateChange((_event, session) => {
      emit({ ready: true, user: toUser(session?.user) });
    });
  } catch {
    // 取得に失敗しても未ログイン扱いで前へ進む（アプリは縮退動作）
    emit({ ready: true, user: null });
  }
}

/** メールへワンタイムコード（＋マジックリンク）を送る。 */
export async function signInWithOtp(email: string): Promise<void> {
  const sp = getSupabase();
  if (!sp) throw new Error('not-configured');
  const client = await sp;
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/** メールで届いた 6 桁コードを検証してログインする。 */
export async function verifyOtp(email: string, token: string): Promise<void> {
  const sp = getSupabase();
  if (!sp) throw new Error('not-configured');
  const client = await sp;
  const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

/** ログアウト（セッション破棄のみ。ローカル作品は消さない）。 */
export async function signOut(): Promise<void> {
  const sp = getSupabase();
  if (!sp) return;
  const client = await sp;
  await client.auth.signOut();
}

export interface UseAuth extends AuthSnapshot {
  configured: boolean;
  signInWithOtp: typeof signInWithOtp;
  verifyOtp: typeof verifyOtp;
  signOut: typeof signOut;
}

/** 認証状態を購読するフック。複数箇所で呼んでも購読は 1 本に集約される。 */
export function useAuth(): UseAuth {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    void init();
    const l = () => force();
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    ...snapshot,
    configured: isSupabaseConfigured,
    signInWithOtp,
    verifyOtp,
    signOut,
  };
}
