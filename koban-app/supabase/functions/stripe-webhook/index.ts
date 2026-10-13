// Stripe の webhook。署名を確かめてから、プランを付ける・外す。
// 環境変数：STRIPE_WEBHOOK_SECRET（whsec_...）
// 受ける event：checkout.session.completed, customer.subscription.created/updated/deleted,
//               invoice.paid, invoice.marked_uncollectible

import { adminRpc } from '../_shared/admin.ts';
import { verifySignature } from '../_shared/stripe.ts';

const SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

interface Obj {
  id: string;
  mode?: string;
  status?: string;
  payment_status?: string;
  current_period_end?: number;
  items?: { data: { current_period_end?: number }[] };
  metadata?: Record<string, string>;
}

Deno.serve(async (req) => {
  const payload = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';
  if (!SECRET || !(await verifySignature(payload, sig, SECRET))) return new Response('bad signature', { status: 400 });

  const event = JSON.parse(payload) as { type: string; data: { object: Obj } };
  const o = event.data.object;
  const m = o.metadata ?? {};
  const owner = m.owner;
  if (!owner) return new Response('ignored');

  switch (event.type) {
    case 'checkout.session.completed':
      if (o.mode === 'payment' && o.payment_status === 'paid' && m.kind === 'project' && m.project_id) {
        await adminRpc('koban_admin_grant_project', { p_owner: owner, p_project: m.project_id, p_source: 'card', p_grant: true });
      }
      break;
    case 'invoice.paid':
      if (m.kind === 'project' && m.project_id) {
        await adminRpc('koban_admin_grant_project', { p_owner: owner, p_project: m.project_id, p_source: 'invoice', p_grant: true });
      }
      break;
    case 'invoice.marked_uncollectible':
      if (m.kind === 'project' && m.project_id) {
        await adminRpc('koban_admin_grant_project', { p_owner: owner, p_project: m.project_id, p_source: 'invoice', p_grant: false });
      }
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const end = o.current_period_end ?? o.items?.data[0]?.current_period_end;
      const active = event.type !== 'customer.subscription.deleted' && ['active', 'trialing', 'past_due'].includes(o.status ?? '');
      await adminRpc('koban_admin_set_company', { p_owner: owner, p_until: active && end ? new Date(end * 1000).toISOString() : null });
      break;
    }
  }
  return new Response('ok');
});
