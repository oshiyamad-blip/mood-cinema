// 閲覧ページ（受け取る人）。アプリもアカウントも要らない（D-3）。
// 先頭に「自分の入り時間と出番」、次に前の版からの変化、確認ボタン、全体の日々スケ。

import { useEffect, useState } from 'react';
import { CallSheetView } from '../components/CallSheetView';
import type { ViewPayload } from '../core/share';
import { formatDateLong, formatTime } from '../core/time';
import { viewer, viewerIsDemo } from '../backend/viewer';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; reason: 'not-found' | 'expired' | 'revoked' | 'network' | 'no-token'; cached: ViewPayload | null }
  | { kind: 'ok'; payload: ViewPayload; ackedVersion: number | null; offline: boolean };

const ERR_TEXT: Record<string, { title: string; body: string }> = {
  'no-token': { title: 'リンクが途中で切れています', body: 'LINE で届いたリンクを、最後まで含めて開き直してください。' },
  'not-found': { title: 'このリンクは見つかりません', body: 'リンクが途中で切れているか、配った人が作り直した可能性があります。配った人に確認してください。' },
  expired: { title: 'このリンクは期限が切れました', body: '撮影日を過ぎたリンクは見られなくなります。必要なら配った人に頼んでください。' },
  revoked: { title: 'このリンクは取り消されました', body: '配った人が新しいリンクを送っているはずです。届いていなければ確認してください。' },
  network: { title: 'つながりませんでした', body: '電波の良い場所でもう一度開いてください。' },
};

function cacheKey(token: string): string {
  return `koban:v1:view:${token.slice(0, 8)}`;
}

function readCache(token: string): ViewPayload | null {
  try {
    const v = JSON.parse(localStorage.getItem(cacheKey(token)) ?? 'null');
    return v && v.v === 1 ? (v as ViewPayload) : null;
  } catch {
    return null;
  }
}

function writeCache(token: string, p: ViewPayload) {
  try {
    localStorage.setItem(cacheKey(token), JSON.stringify(p));
  } catch {
    // 保存できなくても表示は続ける
  }
}

const isLineBrowser = /\bLine\//i.test(navigator.userAgent);

export function ViewPage() {
  const token = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [acking, setAcking] = useState(false);
  const [ackError, setAckError] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ kind: 'error', reason: 'no-token', cached: null });
      return;
    }
    let alive = true;
    viewer.view(token).then((r) => {
      if (!alive) return;
      if (r.ok) {
        writeCache(token, r.payload);
        setState({ kind: 'ok', payload: r.payload, ackedVersion: r.ackedVersion, offline: false });
        document.title = `日々スケ ${formatDateLong(r.payload.date)}`;
      } else if (r.reason === 'network') {
        const cached = readCache(token);
        setState(cached ? { kind: 'ok', payload: cached, ackedVersion: null, offline: true } : { kind: 'error', reason: 'network', cached: null });
      } else {
        setState({ kind: 'error', reason: r.reason, cached: null });
      }
    });
    return () => {
      alive = false;
    };
  }, [token]);

  if (state.kind === 'loading') {
    return (
      <main className="vw">
        <p className="vw-loading" role="status">
          読み込んでいます…
        </p>
      </main>
    );
  }
  if (state.kind === 'error') {
    const t = ERR_TEXT[state.reason];
    return (
      <main className="vw">
        <section className="vw-error" role="alert">
          <h1>{t.title}</h1>
          <p>{t.body}</p>
        </section>
      </main>
    );
  }

  const { payload, ackedVersion, offline } = state;
  const acked = ackedVersion != null && ackedVersion >= payload.versionN;

  async function ack() {
    setAcking(true);
    setAckError(false);
    const ok = await viewer.ack(token, payload.versionN);
    setAcking(false);
    if (ok) setState({ ...state, kind: 'ok', ackedVersion: payload.versionN } as State);
    else setAckError(true);
  }

  const mineChanges = payload.changes.filter((c) => c.mine);
  const otherChanges = payload.changes.filter((c) => !c.mine);

  return (
    <main className="vw">
      {payload.viewerName && <Watermark name={payload.viewerName} />}
      {viewerIsDemo && (
        <p className="vw-demo no-print">デモ表示：この端末の中だけで動いています。ほかの人の端末では開けません。</p>
      )}
      {offline && <p className="vw-demo no-print">電波がないため、前に開いたときの内容を表示しています。最新でない可能性があります。</p>}

      <header className="vw-head">
        <p className="vw-title">{payload.projectTitle}</p>
        <h1 className="vw-date">{formatDateLong(payload.date)}</h1>
        <p className="vw-ver num">第{payload.versionN}版</p>
      </header>

      {payload.me ? (
        <section className="vw-me" aria-label="あなたの予定">
          <p className="vw-me-name">
            {payload.me.name}さん{payload.me.role && <span>（{payload.me.role}）</span>}
          </p>
          <p className="vw-me-call">
            <span>入り</span>
            <strong className="num">{formatTime(payload.me.call)}</strong>
          </p>
          {payload.me.scenes.length > 0 ? (
            <ul className="vw-me-scenes">
              {payload.me.scenes.map((s) => (
                <li key={s.no}>
                  <span className="num">{formatTime(s.start)}</span>
                  <span className="num">S#{s.no}</span>
                  <span>{s.heading}</span>
                </li>
              ))}
            </ul>
          ) : (
            payload.doc.cast.length > 0 && <p className="vw-sub">この日の出番はありません（スタッフの集合は下の表を見てください）</p>
          )}
        </section>
      ) : (
        <p className="vw-sub">グループ用のリンクです。自分の入り時間は表の中で探してください。</p>
      )}

      {payload.changes.length > 0 && (
        <section className="vw-changes" aria-label="前の版から変わったこと">
          <h2>前の版から変わったこと</h2>
          <ul>
            {mineChanges.map((c, i) => (
              <li key={`m${i}`} className="vw-change-mine">
                {c.text}
              </li>
            ))}
            {otherChanges.map((c, i) => (
              <li key={`o${i}`}>{c.text}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="vw-actions no-print">
        {payload.viewerName ? (
          acked ? (
            <p className="vw-acked" role="status">
              ✓ 第{payload.versionN}版を確認しました
            </p>
          ) : (
            <>
              {ackedVersion != null && <p className="vw-sub">前の版（第{ackedVersion}版）は確認済みです。新しい版を確認してください。</p>}
              <button type="button" className="vw-ack" onClick={ack} disabled={acking || offline}>
                {acking ? '送っています…' : '確認しました'}
              </button>
              {ackError && <p className="vw-err">送れませんでした。電波の良い場所でもう一度押してください。</p>}
            </>
          )
        ) : null}
        <button type="button" className="vw-print" onClick={() => window.print()}>
          PDFで保存・印刷
        </button>
        {isLineBrowser && <p className="vw-sub">保存できないときは、右上のメニューから「ブラウザで開く」を選んでください。</p>}
      </div>

      <CallSheetView doc={payload.doc} versionN={payload.versionN} highlightPersonId={payload.me?.personId ?? null} />

      <footer className="vw-foot">
        <p>
          このページは {payload.viewerName ? `${payload.viewerName}さん専用です。転送しないでください。` : 'グループ用です。'}
          リンクの期限：{new Date(payload.expiresAt).toLocaleDateString('ja-JP')}
        </p>
      </footer>
    </main>
  );
}

function Watermark({ name }: { name: string }) {
  const cells = Array.from({ length: 40 }, (_, i) => <span key={i}>{name}</span>);
  return (
    <div className="vw-wm" aria-hidden="true">
      {cells}
    </div>
  );
}
