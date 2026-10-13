// アカウント（E-1〜E-4）：メールの確認コードでログイン、同期、プランの購入（カード・請求書）、退会。
// クラウドが未設定なら、デモの説明と書き出しだけを出す。

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BILLING_ENABLED, CLOUD_ENABLED } from '../backend/config';
import { supabase } from '../backend/supabase';
import { deleteAccount, sendCode, signOut, useSession, verifyCode } from '../store/auth';
import { useProjects } from '../store/projects';
import { toBackupJson } from '../store/storage';
import { onSyncStatus, pullAll, syncStatus, type SyncStatus } from '../store/sync';
import { downloadText, useConfirm, useToast } from '../ui/ui';

export const PRICES = {
  project: { label: '作品プラン', price: 19800, note: '1作品。配布先・撮影日の上限なし。作成から撮了後3か月まで編集でき、以後は閲覧と書き出しのみで保存し続けます。' },
  company: { label: '会社プラン', price: 29800, note: '月額。作品数・配布先の上限なし。毎月自動で更新され、いつでも解約できます（解約は次の更新日から）。' },
} as const;

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}（税込）`;

export function AccountPage() {
  const { session, ready } = useSession();
  const { projects } = useProjects();

  function exportAll() {
    for (const p of projects) downloadText(`${p.title}.koban.json`, toBackupJson(p));
  }

  if (!CLOUD_ENABLED) {
    return (
      <section className="legal">
        <h1>設定</h1>
        <p>
          いまはデモの状態です。作品はこのブラウザの中だけに保存され、配布のリンクもこのブラウザの中でしか開けません。
          本番では、クラウド（Supabase）の設定を入れるとログイン・端末間の同期・本当の配布が使えます（<code>koban-app/README.md</code>）。
        </p>
        <button type="button" className="btn" onClick={exportAll} disabled={projects.length === 0}>
          すべての作品を書き出す（{projects.length}件）
        </button>
      </section>
    );
  }
  if (!ready) return <p className="muted">読み込んでいます…</p>;
  return session ? <SignedIn email={session.user.email ?? ''} exportAll={exportAll} /> : <SignIn />;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <section className="legal">
      <h1>ログイン</h1>
      <p className="sub">メールに届く6桁のコードでログインします。パスワードはありません。初めての人はこのままアカウントができます。</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          const r = sent ? await verifyCode(email, code.trim()) : await sendCode(email.trim());
          setBusy(false);
          if (r) setErr(r);
          else if (!sent) setSent(true);
        }}
      >
        <div className="fields">
          <label className="field">
            メールアドレス
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent} autoComplete="email" />
          </label>
          {sent && (
            <label className="field">
              届いたコード
              <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            </label>
          )}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {sent ? 'ログイン' : 'コードを送る'}
          </button>
          {sent && (
            <button type="button" className="btn-link" onClick={() => setSent(false)}>
              メールアドレスを直す
            </button>
          )}
        </div>
        {err && (
          <p className="issue issue-error" role="alert">
            {err}
          </p>
        )}
      </form>
      <p className="muted">
        ログインすると、<Link to="/legal/terms">利用規約</Link>と<Link to="/legal/privacy">プライバシーポリシー</Link>に同意したものとします。
      </p>
    </section>
  );
}

interface Plan {
  companyUntil: string | null;
  paidProjects: { projectId: string; editUntil: string | null }[];
}

function SignedIn({ email, exportAll }: { email: string; exportAll: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { projects } = useProjects();
  const [sync, setSync] = useState<SyncStatus>(syncStatus());
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => onSyncStatus(setSync), []);
  useEffect(() => {
    void supabase()
      ?.rpc('koban_plan')
      .then(({ data }) => setPlan((data as Plan) ?? null));
  }, []);

  const live = projects.filter((p) => p.deletedAt == null);
  const paidIds = new Set(plan?.paidProjects.map((x) => x.projectId) ?? []);
  const companyActive = plan?.companyUntil != null && Date.parse(plan.companyUntil) > Date.now();

  return (
    <section className="legal">
      <h1>アカウント</h1>
      <p>
        {email} でログインしています。
        <button type="button" className="btn-link" onClick={() => void signOut()}>
          ログアウト
        </button>
      </p>
      <p className="sub">
        同期：{{ off: '止まっています', idle: 'クラウドと同じです', syncing: '送っています…', error: '送れていません（この端末には保存済み）' }[sync]}{' '}
        <button type="button" className="btn btn-sm" onClick={() => void pullAll()}>
          今すぐ同期
        </button>
      </p>

      <h2>プラン</h2>
      {companyActive ? (
        <p>会社プランをご利用中です（次の更新：{new Date(plan!.companyUntil!).toLocaleDateString('ja-JP')}）。</p>
      ) : (
        <p className="sub">無料：進行中の作品1本まで、配布先は10人まで。すべての機能が使えます。</p>
      )}
      <table>
        <tbody>
          <tr>
            <th>{PRICES.project.label}</th>
            <td>
              {yen(PRICES.project.price)}／作品。{PRICES.project.note}
            </td>
          </tr>
          <tr>
            <th>{PRICES.company.label}</th>
            <td>
              {yen(PRICES.company.price)}／月。{PRICES.company.note}
            </td>
          </tr>
        </tbody>
      </table>
      {BILLING_ENABLED ? (
        <Purchase projects={live.filter((p) => !paidIds.has(p.id)).map((p) => ({ id: p.id, title: p.title }))} companyActive={companyActive} />
      ) : (
        <p className="muted">プランの購入は準備中です。</p>
      )}

      <h2>書き出し</h2>
      <button type="button" className="btn" onClick={exportAll} disabled={projects.length === 0}>
        すべての作品を書き出す（{projects.length}件）
      </button>

      <h2>退会</h2>
      <p className="sub">退会すると、クラウドの作品・配布のリンク・確認の記録・アカウントを削除します。配ったリンクはすぐ開けなくなります。この端末に保存した作品は残ります。</p>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          const ok = await confirm({
            title: '退会しますか',
            body: (
              <>
                <p>この操作は戻せません。先に「すべての作品を書き出す」で手元に残すことをおすすめします。</p>
                {companyActive && <p>会社プランの自動更新も止まります。</p>}
              </>
            ),
            confirmLabel: '退会する',
            danger: true,
          });
          if (!ok) return;
          const err = await deleteAccount();
          toast({ text: err ?? '退会しました' });
        }}
      >
        退会する
      </button>
    </section>
  );
}

function Purchase({ projects, companyActive }: { projects: { id: string; title: string }[]; companyActive: boolean }) {
  const confirm = useConfirm();
  const [kind, setKind] = useState<'project' | 'company'>('project');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [method, setMethod] = useState<'card' | 'invoice'>('card');
  const [billTo, setBillTo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const item = PRICES[kind];

  async function buy() {
    // 最終確認画面（特定商取引法 第12条の6）：分量・価格・支払の時期と方法・提供の時期・解約の条件を示す
    const ok = await confirm({
      title: 'ご注文の最終確認',
      body: (
        <table>
          <tbody>
            <tr>
              <th>内容</th>
              <td>
                {item.label}
                {kind === 'project' && `（${projects.find((p) => p.id === projectId)?.title ?? ''}）`}
              </td>
            </tr>
            <tr>
              <th>価格</th>
              <td>{yen(item.price)}{kind === 'company' ? '／月' : ''}</td>
            </tr>
            <tr>
              <th>支払</th>
              <td>{method === 'card' ? 'クレジットカード。この画面の次で決済します' : '請求書（銀行振込）。発行日から30日以内にお支払いください'}</td>
            </tr>
            <tr>
              <th>提供の時期</th>
              <td>{method === 'card' ? '決済の完了後すぐ' : '請求書の発行後すぐ（お支払いが確認できない場合は停止します）'}</td>
            </tr>
            <tr>
              <th>期間・解約</th>
              <td>{kind === 'company' ? '1か月ごとに自動で更新します。アカウントの画面からいつでも解約でき、次の更新日から止まります。日割りの返金はしません。' : '買い切りです（自動更新はありません）。デジタルサービスの性質上、提供開始後の返金はできません。'}</td>
            </tr>
          </tbody>
        </table>
      ),
      confirmLabel: method === 'card' ? '決済へ進む' : '請求書を発行する',
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    const sb = supabase();
    const { data, error } = (await sb?.functions.invoke('billing', {
      body: { kind, projectId: kind === 'project' ? projectId : null, method, billTo: billTo.trim(), returnUrl: window.location.href },
    })) ?? { data: null, error: new Error('クラウドが設定されていません') };
    setBusy(false);
    if (error || !data?.url) {
      setErr('手続きを始められませんでした。時間をおいてもう一度お試しください。');
      return;
    }
    window.location.href = data.url as string;
  }

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div className="fields">
        <label className="field">
          プラン
          <select value={kind} onChange={(e) => setKind(e.target.value as 'project' | 'company')}>
            <option value="project">作品プラン</option>
            <option value="company" disabled={companyActive}>
              会社プラン{companyActive ? '（利用中）' : ''}
            </option>
          </select>
        </label>
        {kind === 'project' && (
          <label className="field">
            作品
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          支払い方法
          <select value={method} onChange={(e) => setMethod(e.target.value as 'card' | 'invoice')}>
            <option value="card">クレジットカード</option>
            <option value="invoice">請求書（銀行振込・適格請求書）</option>
          </select>
        </label>
        {method === 'invoice' && (
          <label className="field">
            請求書の宛名
            <input value={billTo} onChange={(e) => setBillTo(e.target.value)} placeholder="株式会社〇〇" />
          </label>
        )}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-primary" disabled={busy || (kind === 'project' && !projectId) || (method === 'invoice' && !billTo.trim())} onClick={() => void buy()}>
          申し込む
        </button>
      </div>
      {err && (
        <p className="issue issue-error" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
