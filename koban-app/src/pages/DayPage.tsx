// 日々スケ（C-1〜C-4）。自動の内容に、手で上書き・追記する。上書きした値には印を付け、自動に戻せる。
// 印刷すると日々スケだけが A4 横で出る（PDF で保存できる）。

import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { buildCallSheet, overridesFor } from '../core/callsheet';
import type { CallSheetOverrides, ID, Project } from '../core/model';
import { emptyOverrides, sortedDays } from '../core/project';
import { latestVersion } from '../core/share';
import { formatDate, formatTime, todayJst } from '../core/time';
import { CallSheetView } from '../components/CallSheetView';
import { projectStore } from '../store/projects';
import { TimeInput } from '../ui/cells';
import { Empty } from '../ui/ui';

export function DayPage({ project: p }: { project: Project }) {
  const { did } = useParams();
  const days = sortedDays(p);
  if (days.length === 0) {
    return (
      <Empty title="撮影日がまだありません">
        <p>
          <Link to={`/p/${p.id}/schedule`}>総スケ</Link>で撮影日を作り、シーンを入れると日々スケができます。
        </p>
      </Empty>
    );
  }
  const day = days.find((d) => d.id === did);
  if (!day) {
    const today = todayJst();
    const next = days.find((d) => d.date >= today) ?? days[0];
    return <Navigate to={`/p/${p.id}/days/${next.id}`} replace />;
  }

  const ov = overridesFor(p, day.id);
  const doc = buildCallSheet(p, day);
  const latest = latestVersion(p, day.id);
  const changed = latest != null && JSON.stringify(latest.doc) !== JSON.stringify(doc);

  const updateOv = (fn: (o: CallSheetOverrides) => CallSheetOverrides) =>
    projectStore.update(p.id, (q) => ({ ...q, callSheets: { ...q.callSheets, [day.id]: fn(q.callSheets[day.id] ?? emptyOverrides()) } }));
  const setText = (k: 'meals' | 'moves' | 'notices' | 'weather') => (v: string) => updateOv((o) => ({ ...o, [k]: v }));
  const setPersonCall = (id: ID, v: number | null) =>
    updateOv((o) => {
      const personCall = { ...o.personCall };
      if (v == null) delete personCall[id];
      else personCall[id] = v;
      return { ...o, personCall };
    });
  const setDeptCall = (dept: string, v: number | null) =>
    updateOv((o) => {
      const deptCall = { ...o.deptCall };
      if (v == null) delete deptCall[dept];
      else deptCall[dept] = v;
      return { ...o, deptCall };
    });

  const noteDepts = [...new Set([...doc.prep.map((g) => g.category), ...doc.deptCalls.map((d) => d.dept), ...Object.keys(ov.deptNotes)])];

  return (
    <>
      <nav className="day-tabs" aria-label="撮影日">
        {days.map((d) => (
          <Link key={d.id} to={`/p/${p.id}/days/${d.id}`} className={d.id === day.id ? 'active' : ''} aria-current={d.id === day.id ? 'page' : undefined}>
            {formatDate(d.date)}
          </Link>
        ))}
      </nav>
      <div className="daypage">
        <section className="editor" aria-label="上書きと追記">
          <div className="panel">
            <h2>連絡事項</h2>
            <TextArea label="天気・日の出" value={ov.weather} onCommit={setText('weather')} rows={1} />
            <TextArea label="食事" value={ov.meals} onCommit={setText('meals')} placeholder="例：昼 12:30 ロケ弁（〇〇）" />
            <TextArea label="移動" value={ov.moves} onCommit={setText('moves')} placeholder="例：14:00 ロケバスで公園へ移動" />
            <TextArea label="注意事項" value={ov.notices} onCommit={setText('notices')} />
            <TextArea
              label="メモ（撮影日）"
              value={day.note}
              onCommit={(v) => projectStore.update(p.id, (q) => ({ ...q, days: q.days.map((d) => (d.id === day.id ? { ...d, note: v } : d)) }))}
            />
          </div>

          {doc.cast.length > 0 && (
            <div className="panel">
              <h2>キャストの入り</h2>
              <p className="muted">自動の入りは「最初の出番の {p.settings.castLeadMin} 分前（集合より早くしない）」です。</p>
              {doc.cast.map((c) => {
                const auto = Math.max(day.callTime, (c.firstStart ?? day.callTime) - p.settings.castLeadMin);
                return (
                  <div key={c.personId} className="override">
                    <span>
                      {c.name} <span className="muted">S#{c.sceneNos.join('・')}</span>
                    </span>
                    <TimeInput value={c.call} label={`${c.name} の入り`} onCommit={(v) => setPersonCall(c.personId, v == null || v === auto ? null : v)} />
                    {c.callOverridden ? (
                      <button type="button" className="btn-link" onClick={() => setPersonCall(c.personId, null)} title={`自動は ${formatTime(auto)}`}>
                        <span className="manual">手入力</span> 自動に戻す
                      </button>
                    ) : (
                      <span className="muted">自動</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {doc.deptCalls.length > 0 && (
            <div className="panel">
              <h2>部署ごとの集合</h2>
              {doc.deptCalls.map((d) => (
                <div key={d.dept} className="override">
                  <span>{d.dept}</span>
                  <TimeInput value={d.call} label={`${d.dept} の集合`} onCommit={(v) => setDeptCall(d.dept, v == null || v === day.callTime ? null : v)} />
                  {d.overridden ? (
                    <button type="button" className="btn-link" onClick={() => setDeptCall(d.dept, null)}>
                      <span className="manual">手入力</span> 全体に合わせる
                    </button>
                  ) : (
                    <span className="muted">全体</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {noteDepts.length > 0 && (
            <div className="panel">
              <h2>各部のメモ</h2>
              {noteDepts.map((dept) => (
                <TextArea
                  key={dept}
                  label={dept}
                  value={ov.deptNotes[dept] ?? ''}
                  rows={2}
                  onCommit={(v) => updateOv((o) => ({ ...o, deptNotes: { ...o.deptNotes, [dept]: v } }))}
                />
              ))}
            </div>
          )}
        </section>

        <section aria-label="日々スケ">
          <div className="row no-print" style={{ marginBottom: 8 }}>
            <span className="sub">
              {latest ? `第${latest.n}版を配布済み` : 'まだ配っていません'}
              {changed && '・配った版から変わっています'}
            </span>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn" onClick={() => window.print()}>
              印刷・PDF
            </button>
            <Link to={`/p/${p.id}/share/${day.id}`} className="btn btn-primary">
              {changed ? '再配布へ' : '配布へ'}
            </Link>
          </div>
          <CallSheetView doc={doc} versionN={changed || !latest ? undefined : latest.n} />
        </section>
      </div>
    </>
  );
}

function TextArea({ label, value, onCommit, rows = 3, placeholder }: { label: string; value: string; onCommit: (v: string) => void; rows?: number; placeholder?: string }) {
  const [v, setV] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setV(value);
  }
  return (
    <label className="field" style={{ marginBottom: 8 }}>
      {label}
      <textarea value={v} rows={rows} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} style={{ minHeight: rows * 24 + 12 }} />
    </label>
  );
}
