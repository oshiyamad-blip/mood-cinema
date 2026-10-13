// 配布と確認（D-1〜D-10）。配る → 確認を集める → 差し替えたら差分つきで配り直し、
// 影響を受ける人と未確認の人にだけ再送の文面を作る。スマホのブラウザでも見られる。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { buildCallSheet } from '../core/callsheet';
import type { ID, Person, Project, Share } from '../core/model';
import { PERSON_KIND_LABEL } from '../core/model';
import { sortedDays } from '../core/project';
import {
  ACK_LABEL,
  ackRows,
  affectedPersonIds,
  diffDocs,
  latestVersion,
  lineText,
  previousVersion,
  viewUrl,
  type Ack,
  type AckRow,
} from '../core/share';
import { formatDate, jstMidnight, todayJst, addDays } from '../core/time';
import { backend } from '../backend';
import { CLOUD_ENABLED, FREE_RECIPIENT_LIMIT, viewOrigin } from '../backend/config';
import { PublishError } from '../backend/types';
import { useSession } from '../store/auth';
import { publishDay, revokeShares } from '../store/publish';
import { Empty, copyText, useConfirm, useToast } from '../ui/ui';

export function SharePage({ project: p }: { project: Project }) {
  const { did } = useParams();
  const days = sortedDays(p);
  if (days.length === 0) {
    return (
      <Empty title="撮影日がまだありません">
        <p>
          <Link to={`/p/${p.id}/schedule`}>総スケ</Link>で撮影日を作ってください。
        </p>
      </Empty>
    );
  }
  const day = days.find((d) => d.id === did);
  if (!day) {
    const today = todayJst();
    const next = days.find((d) => d.date >= today) ?? days[0];
    return <Navigate to={`/p/${p.id}/share/${next.id}`} replace />;
  }
  return (
    <>
      <nav className="day-tabs" aria-label="撮影日">
        {days.map((d) => (
          <Link key={d.id} to={`/p/${p.id}/share/${d.id}`} className={d.id === day.id ? 'active' : ''} aria-current={d.id === day.id ? 'page' : undefined}>
            {formatDate(d.date)}
          </Link>
        ))}
      </nav>
      <ShareDay key={day.id} p={p} dayId={day.id} />
    </>
  );
}

function ShareDay({ p, dayId }: { p: Project; dayId: ID }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { session } = useSession();
  const day = p.days.find((d) => d.id === dayId)!;
  const doc = useMemo(() => buildCallSheet(p, day), [p, day]);
  const latest = latestVersion(p, dayId);
  const changed = !latest || JSON.stringify(latest.doc) !== JSON.stringify(doc);
  const changes = latest ? diffDocs(latest.doc, doc) : [];

  const inDoc = new Set([...doc.cast, ...doc.staff].map((x) => x.personId));
  const shared = new Set(p.shares.filter((s) => s.dayId === dayId && s.revokedAt == null && s.personId).map((s) => s.personId!));
  const [selected, setSelected] = useState<Set<ID>>(() => new Set([...inDoc, ...shared]));
  const [group, setGroup] = useState(() => p.shares.some((s) => s.dayId === dayId && s.personId == null && s.revokedAt == null));
  const [expiry, setExpiry] = useState(() => (day.date ? addDays(day.date, 2) : addDays(todayJst(), 14)));
  const [busy, setBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [acks, setAcks] = useState<Ack[]>([]);
  const [ackError, setAckError] = useState(false);
  const loadAcks = useCallback(async () => {
    try {
      setAcks(await backend.fetchAcks(p.id, dayId));
      setAckError(false);
    } catch {
      setAckError(true);
    }
  }, [p.id, dayId]);
  useEffect(() => {
    void loadAcks();
    const t = window.setInterval(() => void loadAcks(), 30000);
    const onFocus = () => void loadAcks();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadAcks]);

  const rows = latest ? ackRows(p, dayId, acks, latest.n) : [];
  const live = rows.filter((r) => r.state !== 'revoked' && r.state !== 'expired' && r.person);
  const ackedCount = live.filter((r) => r.state === 'acked').length;

  const needsLogin = CLOUD_ENABLED && !session;
  const personsSorted = [...p.persons].sort((a, b) => Number(inDoc.has(b.id)) - Number(inDoc.has(a.id)));

  async function publish() {
    setBusy(true);
    setPublishError(null);
    try {
      const r = await publishDay(p.id, dayId, {
        personIds: [...selected],
        group,
        expiresAt: jstMidnight(addDays(expiry, 1)),
      });
      toast({ text: r.isNewVersion ? `第${r.version.n}版を ${r.shares.length} 件のリンクに配りました` : `${r.shares.length} 件のリンクを更新しました（中身は第${r.version.n}版のまま）` });
      void loadAcks();
    } catch (e) {
      setPublishError(e instanceof PublishError || e instanceof Error ? e.message : '配布できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  // 再送（D-6）：最新の版で影響を受けた人と、最新の版をまだ確認していない人
  const prev = latest ? previousVersion(p, dayId, latest.n) : null;
  const affected = latest && prev ? affectedPersonIds(prev.doc, latest.doc, diffDocs(prev.doc, latest.doc)) : new Set<ID>();
  const resendRows = rows.filter((r) => r.person && (r.state === 'none' || r.state === 'stale' || (affected.has(r.person.id) && r.state !== 'revoked' && r.state !== 'expired')));

  const origin = viewOrigin();
  const groupShare = p.shares.find((s) => s.dayId === dayId && s.personId == null && s.revokedAt == null);

  return (
    <>
      {needsLogin && (
        <p className="issue issue-warn" role="alert">
          配るにはログインが必要です。<Link to="/account">ログインする</Link>
        </p>
      )}

      <section className="panel" aria-label="配る">
        <div className="row">
          <h2 style={{ margin: 0 }}>{latest ? (changed ? `第${latest.n + 1}版として配り直す` : `第${latest.n}版を配布済み`) : '配る'}</h2>
          <span style={{ flex: 1 }} />
          <Link to={`/p/${p.id}/days/${dayId}`} className="btn btn-sm">
            日々スケを見る・直す
          </Link>
        </div>
        {latest && changed && changes.length > 0 && (
          <>
            <p className="sub">第{latest.n}版からの変化（閲覧ページの先頭にも出ます）</p>
            <ul>
              {changes.map((c, i) => (
                <li key={i}>{c.text}</li>
              ))}
            </ul>
          </>
        )}
        {latest && !changed && <p className="sub">日々スケは配った版から変わっていません。配る相手を足すときだけ、もう一度配ってください。</p>}

        <details open={!latest}>
          <summary>
            配る相手（{selected.size}人{group ? '＋グループ用' : ''}）
          </summary>
          <div className="row" style={{ margin: '6px 0' }}>
            <button type="button" className="btn btn-sm" onClick={() => setSelected(new Set([...inDoc, ...shared]))}>
              この日に関わる人
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setSelected(new Set(p.persons.map((x) => x.id)))}>
              全員
            </button>
            <label className="check">
              <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />
              グループに貼る共通リンクも作る
            </label>
          </div>
          <ul className="issues" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {personsSorted.map((x) => (
              <li key={x.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={selected.has(x.id) || shared.has(x.id)}
                    disabled={shared.has(x.id)}
                    onChange={(e) => {
                      const n = new Set(selected);
                      if (e.target.checked) n.add(x.id);
                      else n.delete(x.id);
                      setSelected(n);
                    }}
                  />
                  {x.name}
                  <span className="muted">
                    {PERSON_KIND_LABEL[x.kind]}
                    {!inDoc.has(x.id) && '・この日は出番なし'}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {p.persons.length === 0 && <p className="muted">人物がいません。「人物・ロケ地」で足してください。</p>}
          {shared.size > 0 && <p className="muted">配布済みの人は、配り直すと同じリンクの中身が新しい版になります（外すときは下の一覧で取り消してください）。</p>}
          {new Set([...selected, ...shared]).size > FREE_RECIPIENT_LIMIT && (
            <p className="issue issue-info">無料で配れるのは1作品 {FREE_RECIPIENT_LIMIT} 人までです。超えるときは作品プランが必要です。</p>
          )}
        </details>
        <div className="row" style={{ marginTop: 10 }}>
          <label className="check">
            リンクの期限
            <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            まで
          </label>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-primary" disabled={busy || needsLogin || (selected.size === 0 && shared.size === 0 && !group)} onClick={() => void publish()}>
            {busy ? '配っています…' : latest ? (changed ? '新しい版を配る' : 'もう一度配る') : '配る'}
          </button>
        </div>
        {publishError && (
          <p className="issue issue-error" role="alert">
            {publishError}
          </p>
        )}
      </section>

      {latest && (
        <section className="panel" aria-label="確認の状況">
          <div className="row">
            <h2 style={{ margin: 0 }}>確認の状況（第{latest.n}版）</h2>
            <span className="num sub">
              {ackedCount} / {live.length} 人が確認
            </span>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-sm" onClick={() => void loadAcks()}>
              更新
            </button>
          </div>
          <div className="meter" role="img" aria-label={`確認率 ${live.length ? Math.round((ackedCount / live.length) * 100) : 0}%`} style={{ margin: '8px 0' }}>
            <span style={{ width: `${live.length ? (ackedCount / live.length) * 100 : 0}%` }} />
          </div>
          {ackError && <p className="issue issue-warn">確認の状況を取りに行けませんでした。電波が戻ったら「更新」を押してください。</p>}
          <div className="grid-wrap" style={{ maxHeight: 'none' }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>名前</th>
                  <th>状態</th>
                  <th>LINE</th>
                  <th>
                    <span className="visually-hidden">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => r.person)
                  .sort((a, b) => stateOrder(a) - stateOrder(b))
                  .map((r) => (
                    <ShareRow key={r.share.id} r={r} p={p} origin={origin} onRevoke={async (revoked) => {
                      if (revoked) {
                        const ok = await confirm({
                          title: `${r.person!.name} のリンクを取り消しますか`,
                          body: <p>このリンクは開けなくなります。あとで戻すこともできます。</p>,
                          confirmLabel: '取り消す',
                          danger: true,
                        });
                        if (!ok) return;
                      }
                      try {
                        await revokeShares(p.id, [r.share.id], revoked);
                      } catch (e) {
                        toast({ text: e instanceof Error ? e.message : '取り消せませんでした' });
                      }
                    }} />
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {latest && resendRows.length > 0 && <ResendPanel p={p} rows={resendRows} affected={affected} origin={origin} versionN={latest.n} />}

      {latest && (
        <section className="panel" aria-label="手作業に戻すとき">
          <h2>グループ用の文面と PDF</h2>
          <p className="muted">サービスが止まっても、この文面と日々スケの PDF で手作業の配布に戻れます（この端末に保存した最新の版から作ります）。</p>
          <LineBox
            text={lineText(latest.doc, latest.n, groupShare ? viewUrl(origin, groupShare.token) : '（PDF を添付してください）', null, latest.n > 1 ? 'changed' : 'first')}
          />
          <Link to={`/p/${p.id}/days/${dayId}`} className="btn btn-sm">
            日々スケを開いて印刷・PDF
          </Link>
        </section>
      )}
    </>
  );
}

function stateOrder(r: AckRow): number {
  return { stale: 0, none: 1, acked: 2, expired: 3, revoked: 4 }[r.state];
}

function ShareRow({ r, p, origin, onRevoke }: { r: AckRow; p: Project; origin: string; onRevoke: (revoked: boolean) => void }) {
  const toast = useToast();
  const latest = latestVersion(p, r.share.dayId)!;
  const person = r.person as Person;
  const url = viewUrl(origin, r.share.token);
  const text = lineText(latest.doc, latest.n, url, person, r.state === 'stale' ? 'changed' : r.state === 'none' && r.share.createdAt < Date.now() - 3600000 ? 'remind' : 'first');
  return (
    <tr>
      <td>
        {person.name} <span className="muted">{person.role}</span>
      </td>
      <td>
        <span className={`ack-state ack-${r.state}`}>{ACK_LABEL[r.state]}</span>
        {r.state === 'stale' && <span className="muted"> 第{r.ackedVersion}版まで</span>}
        {r.ackedAt && r.state === 'acked' && <span className="muted num"> {new Date(r.ackedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        {r.state !== 'revoked' && (
          <>
            <a className="btn btn-sm" href={`https://line.me/R/share?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
              LINEで送る
            </a>{' '}
            <button
              type="button"
              className="btn btn-sm"
              onClick={async () => toast({ text: (await copyText(text)) ? '文面を写しました' : '写せませんでした。リンクを長押しして写してください' })}
            >
              文面を写す
            </button>{' '}
            <a className="btn-link" href={url} target="_blank" rel="noreferrer">
              開く
            </a>
          </>
        )}
      </td>
      <td>
        {r.state === 'revoked' ? (
          <button type="button" className="btn-link" onClick={() => onRevoke(false)}>
            戻す
          </button>
        ) : (
          <button type="button" className="btn-link" onClick={() => onRevoke(true)}>
            取り消す
          </button>
        )}
      </td>
    </tr>
  );
}

function ResendPanel({ p, rows, affected, origin, versionN }: { p: Project; rows: AckRow[]; affected: Set<ID>; origin: string; versionN: number }) {
  const toast = useToast();
  const latest = latestVersion(p, rows[0].share.dayId)!;
  const [picked, setPicked] = useState<Set<ID>>(() => new Set(rows.map((r) => r.share.id)));
  const kindOf = (r: AckRow) => (versionN > 1 && (affected.has(r.person!.id) || r.state === 'stale') ? 'changed' : 'remind');
  const texts = rows
    .filter((r) => picked.has(r.share.id))
    .map((r) => ({ r, text: lineText(latest.doc, versionN, viewUrl(origin, (r.share as Share).token), r.person, kindOf(r)) }));
  return (
    <section className="panel" aria-label="再送">
      <h2>{versionN > 1 ? `再送する人（${picked.size}）` : `確認を催促する人（${picked.size}）`}</h2>
      <p className="muted">
        {versionN > 1 ? `第${versionN}版で予定が変わった人と、まだ確認していない人です。` : 'まだ確認していない人です。'}一人ずつ LINE で送れます。
      </p>
      <ul className="issues">
        {rows.map((r) => (
          <li key={r.share.id}>
            <label className="check">
              <input
                type="checkbox"
                checked={picked.has(r.share.id)}
                onChange={(e) => {
                  const n = new Set(picked);
                  if (e.target.checked) n.add(r.share.id);
                  else n.delete(r.share.id);
                  setPicked(n);
                }}
              />
              {r.person!.name}
              <span className="muted">
                {[versionN > 1 && affected.has(r.person!.id) ? '予定が変わった' : '', r.state !== 'acked' ? ACK_LABEL[r.state] : ''].filter(Boolean).join('・')}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {texts.map(({ r, text }) => (
        <div key={r.share.id} className="row" style={{ marginTop: 6 }}>
          <strong style={{ minWidth: '6em' }}>{r.person!.name}</strong>
          <a className="btn btn-sm" href={`https://line.me/R/share?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
            LINEで送る
          </a>
          <button type="button" className="btn btn-sm" onClick={async () => toast({ text: (await copyText(text)) ? '文面を写しました' : '写せませんでした' })}>
            文面を写す
          </button>
          <details style={{ flexBasis: '100%' }}>
            <summary className="muted">文面を見る</summary>
            <pre className="line-text">{text}</pre>
          </details>
        </div>
      ))}
    </section>
  );
}

function LineBox({ text }: { text: string }) {
  const toast = useToast();
  return (
    <div>
      <pre className="line-text">{text}</pre>
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={async () => toast({ text: (await copyText(text)) ? '文面を写しました' : '写せませんでした' })}>
          文面を写す
        </button>
        <a className="btn btn-sm" href={`https://line.me/R/share?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
          LINEで送る
        </a>
      </div>
    </div>
  );
}
