// 作品一覧（A-1）：作品カード、新規作成（Excel・CSV／貼り付け／空から）、書き出しからの復元、ゴミ箱。

import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KIND_LABEL, PROJECT_KINDS, type ProjectKind } from '../core/model';
import { createProject } from '../core/project';
import { formatDate } from '../core/time';
import { projectStore, useProjects } from '../store/projects';
import { TRASH_DAYS, parseBackup } from '../store/storage';
import { Empty, useConfirm, useToast } from '../ui/ui';

export function HomePage() {
  const { projects } = useProjects();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ProjectKind>('drama');
  const fileRef = useRef<HTMLInputElement>(null);

  const live = projects.filter((p) => p.deletedAt == null).sort((a, b) => b.updatedAt - a.updatedAt);
  const trash = projects.filter((p) => p.deletedAt != null).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

  function create(start: 'import' | 'empty') {
    const p = createProject(title, kind);
    projectStore.add(p);
    setCreating(false);
    setTitle('');
    nav(start === 'import' ? `/p/${p.id}/import` : `/p/${p.id}/koban`);
  }

  async function restoreFile(file: File) {
    try {
      const p = parseBackup(await file.text());
      const exists = projectStore.get(p.id);
      if (exists) {
        const ok = await confirm({
          title: '同じ作品がすでにあります',
          body: <p>「{exists.title}」を上書きせず、写しとして復元します。</p>,
          confirmLabel: '写しとして復元',
        });
        if (!ok) return;
        projectStore.add({ ...p, id: crypto.randomUUID(), title: `${p.title}（復元）`, shares: [], rev: 0 });
      } else {
        projectStore.add(p);
      }
      toast({ text: `「${p.title}」を復元しました` });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : '復元できませんでした' });
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>作品</h1>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          書き出しから復元
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void restoreFile(f);
            e.target.value = '';
          }}
        />
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          新しい作品
        </button>
      </div>

      {creating && (
        <section className="panel" aria-label="新しい作品">
          <h2>新しい作品</h2>
          <div className="fields">
            <label className="field">
              題名
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：〇〇 第1話" autoFocus />
            </label>
            <label className="field">
              種別
              <select value={kind} onChange={(e) => setKind(e.target.value as ProjectKind)}>
                {PROJECT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => create('import')}>
              香盤表（Excel・CSV・貼り付け）から作る
            </button>
            <button type="button" className="btn" onClick={() => create('empty')}>
              空の表から作る
            </button>
            <button type="button" className="btn-link" onClick={() => setCreating(false)}>
              やめる
            </button>
          </div>
          <p className="muted">
            手元に香盤表がなければ、<a href="/koban-template.csv" download>見本の香盤表（CSV）</a>を Excel やスプレッドシートで開いて使えます。
          </p>
        </section>
      )}

      {live.length === 0 && !creating ? (
        <Empty title="まだ作品がありません">
          <p>香盤表を取り込むと、撮影日ごとの日々スケを作って、関係者一人ひとりにリンクで配れます。</p>
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            最初の作品を作る
          </button>
        </Empty>
      ) : (
        <div className="cards">
          {live.map((p) => {
            const dated = p.days.filter((d) => d.date).map((d) => d.date).sort();
            return (
              <article key={p.id} className="card">
                <Link to={`/p/${p.id}/schedule`} className="card-link">
                  <h3>{p.title}</h3>
                </Link>
                <p className="sub" style={{ margin: 0 }}>
                  {KIND_LABEL[p.kind]}
                  {dated.length > 0 && ` ・ ${formatDate(dated[0])}〜${formatDate(dated[dated.length - 1])}`}
                </p>
                <p className="muted num" style={{ margin: '4px 0 0' }}>
                  シーン {p.scenes.filter((s) => !s.archived).length} ・ 撮影日 {p.days.length} ・ 配布 {p.versions.length}版
                </p>
              </article>
            );
          })}
        </div>
      )}

      {trash.length > 0 && (
        <details style={{ marginTop: 24 }}>
          <summary>ゴミ箱（{trash.length}）</summary>
          <p className="muted">ゴミ箱の作品は {TRASH_DAYS} 日たつと完全に削除されます。それまではいつでも戻せます。</p>
          <ul className="issues">
            {trash.map((p) => {
              const left = Math.max(0, TRASH_DAYS - Math.floor((Date.now() - (p.deletedAt ?? 0)) / 86400000));
              return (
                <li key={p.id} className="row">
                  <span>{p.title}</span>
                  <span className="muted">あと{left}日</span>
                  <button type="button" className="btn btn-sm" onClick={() => projectStore.restore(p.id)}>
                    戻す
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={async () => {
                      const ok = await confirm({
                        title: `「${p.title}」を完全に削除しますか`,
                        body: <p>この操作は戻せません。必要なら先に作品の設定から書き出してください。</p>,
                        confirmLabel: '完全に削除',
                        danger: true,
                      });
                      if (ok) projectStore.purge(p.id);
                    }}
                  >
                    完全に削除
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </>
  );
}
