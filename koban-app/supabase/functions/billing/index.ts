// プランの申し込み（E-3）。カードは Stripe Checkout へ、請求書は Stripe Invoicing で発行して支払いページへ。
// 請求書は発行・送付・期日の催促・入金の確認まで Stripe が自動で回す（手作業を残さない、原則4）。
//
// 環境変数：STRIPE_SECRET_KEY, STRIPE_PRICE_PROJECT（¥19,800 一回）, STRIPE_PRICE_COMPANY（¥29,800 月額）,
//           STRIPE_TAX_RATE（10% 内税の Tax Rate ID。適格請求書に税率ごとの税額を出す）, INVOICE_REGISTRATION_NUMBER（T+13桁）,
//           APP_ORIGIN（戻り先の検証）

import { adminRpc, currentUser } from '../_shared/admin.ts';
import { stripe } from '../_shared/stripe.ts';

const ORIGIN = Deno.env.get('APP_ORIGIN') ?? '';
const PRICE_PROJECT = Deno.env.get('STRIPE_PRICE_PROJECT') ?? '';
const PRICE_COMPANY = Deno.env.get('STRIPE_PRICE_COMPANY') ?? '';
const TAX_RATE = Deno.env.get('STRIPE_TAX_RATE') ?? '';
const REG_NO = Deno.env.get('INVOICE_REGISTRATION_NUMBER') ?? '';

const cors = {
  'access-control-allow-origin': ORIGIN || '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
}

interface Body {
  kind: 'project' | 'company';
  projectId: string | null;
  method: 'card' | 'invoice';
  billTo: string;
  returnUrl: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const user = await currentUser(req);
  if (!user) return json({ error: 'auth' }, 401);

  let b: Body;
  try {
    b = await req.json();
  } catch {
    return json({ error: 'body' }, 400);
  }
  if (b.kind !== 'project' && b.kind !== 'company') return json({ error: 'kind' }, 400);
  if (b.method !== 'card' && b.method !== 'invoice') return json({ error: 'method' }, 400);
  if (b.kind === 'project' && !(b.projectId && UUID.test(b.projectId))) return json({ error: 'project' }, 400);
  const returnUrl = ORIGIN && typeof b.returnUrl === 'string' && b.returnUrl.startsWith(ORIGIN) ? b.returnUrl : `${ORIGIN}/account`;
  const billTo = String(b.billTo ?? '').slice(0, 120);

  // 利用者ごとの Stripe の顧客（初回だけ作る）
  let customer = await adminRpc<string | null>('koban_admin_customer', { p_owner: user.id, p_customer: null });
  if (!customer) {
    const c = await stripe<{ id: string }>('POST', 'customers', { email: user.email, metadata: { owner: user.id } });
    customer = await adminRpc<string>('koban_admin_customer', { p_owner: user.id, p_customer: c.id });
  }
  if (billTo) await stripe('POST', `customers/${customer}`, { name: billTo });

  const metadata = { owner: user.id, kind: b.kind, project_id: b.projectId ?? '' };
  const taxRates = TAX_RATE ? [TAX_RATE] : undefined;
  const invoiceFields = REG_NO ? [{ name: '登録番号', value: REG_NO }] : undefined;

  if (b.method === 'card') {
    const session = await stripe<{ url: string }>('POST', 'checkout/sessions', {
      mode: b.kind === 'project' ? 'payment' : 'subscription',
      customer,
      line_items: [{ price: b.kind === 'project' ? PRICE_PROJECT : PRICE_COMPANY, quantity: 1, tax_rates: taxRates }],
      metadata,
      ...(b.kind === 'project'
        ? { payment_intent_data: { metadata }, invoice_creation: { enabled: true, invoice_data: { metadata, custom_fields: invoiceFields } } }
        : { subscription_data: { metadata } }),
      success_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}paid=1`,
      cancel_url: returnUrl,
      locale: 'ja',
    });
    return json({ url: session.url });
  }

  // 請求書（銀行振込）
  if (b.kind === 'company') {
    const sub = await stripe<{ latest_invoice: string }>('POST', 'subscriptions', {
      customer,
      items: [{ price: PRICE_COMPANY, tax_rates: taxRates }],
      collection_method: 'send_invoice',
      days_until_due: 30,
      metadata,
      invoice_settings: invoiceFields ? { custom_fields: invoiceFields } : undefined,
    });
    const inv = await stripe<{ id: string }>('POST', `invoices/${sub.latest_invoice}/finalize`, {});
    const sent = await stripe<{ hosted_invoice_url: string }>('POST', `invoices/${inv.id}/send`, {});
    return json({ url: sent.hosted_invoice_url });
  }
  const draft = await stripe<{ id: string }>('POST', 'invoices', {
    customer,
    collection_method: 'send_invoice',
    days_until_due: 30,
    metadata,
    custom_fields: invoiceFields,
    default_tax_rates: taxRates,
  });
  await stripe('POST', 'invoiceitems', { customer, invoice: draft.id, price: PRICE_PROJECT });
  await stripe('POST', `invoices/${draft.id}/finalize`, {});
  const sent = await stripe<{ hosted_invoice_url: string }>('POST', `invoices/${draft.id}/send`, {});
  // 請求書の発行と同時に使えるようにする（期日を過ぎて回収できなければ webhook で外す）
  await adminRpc('koban_admin_grant_project', { p_owner: user.id, p_project: b.projectId, p_source: 'invoice', p_grant: true });
  return json({ url: sent.hosted_invoice_url });
});
