// Stripe の REST API を fetch で呼ぶ（SDK に頼らない）。Supabase Edge Functions（Deno）で動く。

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

function form(params: Record<string, unknown>, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        if (typeof x === 'object') form(x as Record<string, unknown>, `${key}[${i}]`, out);
        else out.append(`${key}[${i}]`, String(x));
      });
    } else if (typeof v === 'object') form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe<T = Record<string, unknown>>(method: 'GET' | 'POST', path: string, params: Record<string, unknown> = {}): Promise<T> {
  const body = method === 'POST' ? form(params) : undefined;
  const qs = method === 'GET' && Object.keys(params).length ? `?${form(params)}` : '';
  const res = await fetch(`https://api.stripe.com/v1/${path}${qs}`, {
    method,
    headers: { authorization: `Bearer ${STRIPE_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path}: ${json?.error?.message ?? res.status}`);
  return json as T;
}

/** Stripe-Signature を検証する（https://docs.stripe.com/webhooks#verify-manually） */
export async function verifySignature(payload: string, header: string, secret: string, toleranceSec = 300): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = parts['t'];
  const sigs = header
    .split(',')
    .filter((kv) => kv.startsWith('v1='))
    .map((kv) => kv.slice(3));
  if (!t || sigs.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => timingSafeEqual(s, hex));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
