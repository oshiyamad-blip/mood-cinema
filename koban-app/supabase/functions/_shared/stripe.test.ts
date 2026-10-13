// deno test --allow-env supabase/functions/_shared/stripe.test.ts
import { verifySignature } from './stripe.ts';

async function sign(payload: string, secret: string, t: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.test('正しい署名は通り、改ざん・古い時刻・別の秘密は通らない', async () => {
  const t = Math.floor(Date.now() / 1000);
  const body = '{"type":"invoice.paid"}';
  const v1 = await sign(body, 'whsec_test', t);
  if (!(await verifySignature(body, `t=${t},v1=${v1}`, 'whsec_test'))) throw new Error('正しい署名が通らない');
  if (await verifySignature(body + ' ', `t=${t},v1=${v1}`, 'whsec_test')) throw new Error('改ざんが通った');
  if (await verifySignature(body, `t=${t - 1000},v1=${await sign(body, 'whsec_test', t - 1000)}`, 'whsec_test')) throw new Error('古い時刻が通った');
  if (await verifySignature(body, `t=${t},v1=${v1}`, 'whsec_other')) throw new Error('別の秘密で通った');
  if (await verifySignature(body, `t=${t}`, 'whsec_test')) throw new Error('署名なしが通った');
});
