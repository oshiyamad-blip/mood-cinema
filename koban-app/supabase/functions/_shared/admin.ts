// service_role で課金の関数を呼ぶ（koban スキーマは公開しないので、public の koban_admin_* を経由する）

const URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export async function adminRpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** 呼んだ人の利用者 ID とメール。Authorization の JWT を Supabase に確かめてもらう */
export async function currentUser(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get('authorization');
  if (!auth) return null;
  const res = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', authorization: auth } });
  if (!res.ok) return null;
  const u = await res.json();
  return u?.id ? { id: u.id, email: u.email ?? '' } : null;
}
