// 作品の設定：題名・種別・期間、見積の換算、書き出し（A-6）、直前の状態からの復元、ゴミ箱へ（A-1）。

import { useNavigate } from 'react-router-dom';
import { KIND_LABEL, PROJECT_KINDS, type Project, type ProjectKind, type ProjectSettings } from '../core/model';
import { formatDuration } from '../core/time';
import { projectStore } from '../store/projects';
import { loadSnapshots, toBackupJson } from '../store/storage';
import { CellInput, NumInput } from '../ui/cells';
import { downloadText, useConfirm, useToast } from '../ui/ui';

export function SettingsPage({ project: p }: { project: Project }) {
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const snaps = loadSnapshots(p.id);
  const set = (patch: Partial<Project>) => projectStore.update(p.id, (q) => ({ ...q, ...patch }));
  const setS = (patch: Partial<ProjectSettings>) => projectStore.update(p.id, (q) => ({ ...q, settings: { ...q.settings, ...patch } }));

  return (
    <>
      <section className="panel">
        <h2>作品</h2>
        <div className="fields">
          <label className="field">
            題名
            <CellInput value={p.title} label="題名" onCommit={(v) => v.trim() && set({ title: v.trim() })} />
          </label>
          <label className="field">
            種別
            <select value={p.kind} onChange={(e) => set({ kind: e.target.value as ProjectKind })}>
              {PROJECT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            撮影期間（始め）
            <input type="date" value={p.periodStart} onChange={(e) => set({ periodStart: e.target.value })} />
          </label>
          <label className="field">
            撮影期間（終わり）
            <input type="date" value={p.periodEnd} onChange={(e) => set({ periodEnd: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>時間割の換算</h2>
        <div className="fields">
          <label className="field">
            1ページあたりの撮影見積（分）
            <NumInput value={p.settings.minPerPage} label="1ページあたりの撮影見積" onCommit={(v) => v && setS({ minPerPage: v })} />
          </label>
          <label className="field">
            ページも見積もないシーン（分）
            <NumInput value={p.settings.defaultSceneMin} label="既定の見積" onCommit={(v) => v && setS({ defaultSceneMin: v })} />
          </label>
          <label className="field">
            集合から最初のシーンまで（分）
            <NumInput value={p.settings.setupMin} label="準備" onCommit={(v) => v != null && setS({ setupMin: v })} />
          </label>
          <label className="field">
            キャストの入り（最初の出番の何分前）
            <NumInput value={p.settings.castLeadMin} label="キャストの入り" onCommit={(v) => v != null && setS({ castLeadMin: v })} />
          </label>
          <label className="field">
            拘束時間の上限（時間）
            <NumInput value={p.settings.maxSpanMin / 60} label="拘束時間の上限" onCommit={(v) => v && setS({ maxSpanMin: Math.round(v * 60) })} />
          </label>
          <label className="field">
            撤収から次の集合まで（時間）
            <NumInput value={p.settings.minRestMin / 60} label="休息" onCommit={(v) => v != null && setS({ minRestMin: Math.round(v * 60) })} />
          </label>
        </div>
        <p className="muted">
          拘束時間 {formatDuration(p.settings.maxSpanMin)}・休息 {formatDuration(p.settings.minRestMin)} は、JAC の指針（2026年7月〜）に合わせた既定値です。
        </p>
      </section>

      <section className="panel">
        <h2>書き出しと復元</h2>
        <p className="sub">作品をまるごと JSON で書き出します。作品一覧の「書き出しから復元」で戻せます。</p>
        <button type="button" className="btn" onClick={() => downloadText(`${p.title}-${new Date().toISOString().slice(0, 10)}.koban.json`, toBackupJson(p))}>
          JSON で書き出す
        </button>
        {snaps.length > 0 && (
          <>
            <h3>直前の状態</h3>
            <p className="muted">取り込みや削除の直前に、自動で残した状態です（新しい順に{snaps.length}件）。</p>
            <ul className="issues">
              {snaps.map((s, i) => (
                <li key={i} className="row">
                  <span className="num">{new Date(s.at).toLocaleString('ja-JP')}</span>
                  <span>{s.reason}</span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'この状態に戻しますか',
                        body: <p>今の状態も「直前の状態」に残すので、もう一度戻せます。</p>,
                        confirmLabel: '戻す',
                      });
                      if (!ok) return;
                      projectStore.update(p.id, (cur) => ({ ...s.project, id: cur.id, rev: cur.rev }), { snapshot: '復元の前' });
                      toast({ text: '戻しました' });
                    }}
                  >
                    この状態に戻す
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="panel">
        <h2>ゴミ箱へ</h2>
        <p className="sub">ゴミ箱に入れても30日間は作品一覧から戻せます。配布済みのリンクは期限まで開けます。</p>
        {p.deletedAt == null ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              projectStore.trash(p.id);
              toast({ text: `「${p.title}」をゴミ箱に入れました`, action: { label: '元に戻す', run: () => projectStore.restore(p.id) } });
              nav('/');
            }}
          >
            ゴミ箱に入れる
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => projectStore.restore(p.id)}>
            ゴミ箱から戻す
          </button>
        )}
      </section>
    </>
  );
}
