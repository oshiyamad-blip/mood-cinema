// メールの確認コードでログインする（E-1）。クラウドが未設定ならログインの導線ごと出さない。

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../backend/supabase';

export function useSession(): { session: Session | null; ready: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase());
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready };
}

export async function sendCode(email: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return 'クラウドが設定されていません。';
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return error ? error.message : null;
}

export async function verifyCode(email: string, token: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return 'クラウドが設定されていません。';
  const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  return error ? 'コードが違うか、期限が切れています。' : null;
}

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut();
}

/** 退会（E-2）。サーバーの作品・配布・確認とアカウントを消す。端末の作品は残す */
export async function deleteAccount(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return 'クラウドが設定されていません。';
  const { error } = await sb.rpc('koban_delete_account');
  if (error) return error.message;
  await sb.auth.signOut();
  return null;
}
