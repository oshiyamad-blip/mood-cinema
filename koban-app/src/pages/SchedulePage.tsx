// 総スケ（B-4〜B-6、C-3）。撮影日を作り、シーンを割り当てて並べる。NG日・撤収・拘束・休息を検査する。
// パソコンではシーンをつかんで日へ落とせる。スマホでも同じことが選択と矢印のボタンでできる。

import { useMemo, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import type { DayItem, ID, Project, ShootDay } from '../core/model';
import { assignedSceneIds, compareSceneNo, createDay, indexById, sortedDays } from '../core/project';
import { checkProject, moveItem, moveSceneToDay, timetable } from '../core/schedule';
import { addDays, formatDate, formatTime, todayJst } from '../core/time';
import { newId } from '../core/ids';
import { projectStore } from '../store/projects';
import { NumInput, TimeInput } from '../ui/cells';
import { Empty, IssueList, useConfirm, useToast } from '../ui/ui';

const DRAG_TYPE = 'text/x-koban-scene';

export function SchedulePage({ project: p }: { project: Project }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [picked, setPicked] = useState<Set<ID>>(new Set());
  const [target, setTarget] = useState<ID | ''>('');
  const [query, setQuery] = useState('');
  const [over, setOver] = useState<ID | null>(null);

  const days = sortedDays(p);
  const scenes = indexById(p.scenes);
  const persons = indexById(p.persons);
  const assigned = assignedSceneIds(p);
  const issues = useMemo(() => checkProject(p), [p]);
  const pool = p.scenes
    .filter((s) => !s.archived && !assigned.has(s.id))
    .filter((s) => !query || `${s.no} ${s.heading}`.includes(query))
    .sort((a, b) => compareSceneNo(a.no, b.no));

  const update = (fn: (q: Project) => Project) => projectStore.update(p.id, fn);
  const updateDay = (id: ID, patch: Partial<ShootDay>) => update((q) => ({ ...q, days: q.days.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  const updateItem = (dayId: ID, itemId: ID, patch: Partial<DayItem>) =>
    update((q) => ({
      ...q,
      days: q.days.map((d) => (d.id === dayId ? { ...d, items: d.items.map((it) => (it.id === itemId ? ({ ...it, ...patch } as DayItem) : it)) } : d)),
    }));

  function addDay() {
    const last = days.filter((d) => d.date).at(-1);
    const date = last ? addDays(last.date, 1) : todayJst();
    const d = { ...createDay(date), callTime: last?.callTime ?? 8 * 60, wrapPlan: last?.wrapPlan ?? 20 * 60, locationIds: [] };
    update((q) => ({ ...q, days: [...q.days, d] }));
    setTarget(d.id);
  }

  async function removeDay(d: ShootDay) {
    const ok = await confirm({
      title: `${formatDate(d.date)} の撮影日を削除しますか`,
      body: <p>入っている {d.items.filter((i) => i.kind === 'scene').length} シーンは未割当に戻ります。日々スケの上書きと配布の記録は残ります。</p>,
      confirmLabel: '削除',
      danger: true,
    });
    if (!ok) return;
    update((q) => ({ ...q, days: q.days.filter((x) => x.id !== d.id) }));
    toast({ text: '撮影日を削除しました', action: { label: '元に戻す', run: () => update((q) => ({ ...q, days: [...q.days, d] })) } });
  }

  function assignPicked() {
    if (!target || picked.size === 0) return;
    const ids = [...picked].sort((a, b) => compareSceneNo(scenes.get(a)?.no ?? '', scenes.get(b)?.no ?? ''));
    update((q) => ids.reduce((acc, id) => moveSceneToDay(acc, id, target), q));
    setPicked(new Set());
  }

  function addBreak(dayId: ID, label: string, durMin: number) {
    update((q) => ({
      ...q,
      days: q.days.map((d) => (d.id === dayId ? { ...d, items: [...d.items, { kind: 'break', id: newId(), label, fixedStart: null, durMin }] } : d)),
    }));
  }

  function onDrop(e: DragEvent, dayId: ID, index?: number) {
    e.preventDefault();
    setOver(null);
    const sid = e.dataTransfer.getData(DRAG_TYPE);
    if (sid) update((q) => moveSceneToDay(q, sid, dayId, index));
  }

  const dragProps = (sceneId: ID) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, sceneId);
      e.dataTransfer.effectAllowed = 'move';
    },
  });

  if (p.scenes.length === 0) {
    return (
      <Empty title="シーンがまだありません">
        <p>
          先に<Link to={`/p/${p.id}/import`}>香盤表を取り込む</Link>か、<Link to={`/p/${p.id}/koban`}>香盤表</Link>でシーンを作ってください。
        </p>
      </Empty>
    );
  }

  const projectIssues = issues.filter((i) => i.severity !== 'info');

  return (
    <div className="sched">
      <aside className="pool panel" aria-label="未割当のシーン">
        <h2>未割当（{pool.length}）</h2>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="番号・柱で探す" aria-label="未割当のシーンを探す" style={{ width: '100%', marginBottom: 8 }} />
        {pool.map((s) => (
          <div key={s.id} className="scene-chip" {...dragProps(s.id)}>
            <input
              type="checkbox"
              checked={picked.has(s.id)}
              aria-label={`S#${s.no} を選ぶ`}
              onChange={(e) => {
                const n = new Set(picked);
                if (e.target.checked) n.add(s.id);
                else n.delete(s.id);
                setPicked(n);
              }}
            />
            <span>
              <span className="scene-no">S#{s.no}</span> {s.heading}
              <span className="muted"> {s.timeOfDay}</span>
            </span>
            <span className="muted num">{s.castIds.length > 0 && `${s.castIds.length}人`}</span>
          </div>
        ))}
        {pool.length === 0 && <p className="muted">すべてのシーンが撮影日に入っています。</p>}
        {days.length > 0 && pool.length > 0 && (
          <div className="row" style={{ marginTop: 8, position: 'sticky', bottom: 0, background: 'var(--surface)', paddingTop: 6 }}>
            <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="入れる撮影日">
              <option value="">撮影日を選ぶ</option>
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatDate(d.date)}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-primary btn-sm" disabled={!target || picked.size === 0} onClick={assignPicked}>
              選んだ{picked.size || ''}件を入れる
            </button>
          </div>
        )}
      </aside>

      <section aria-label="撮影日">
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="sub">撮影日 {days.length}日</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-primary" onClick={addDay}>
            撮影日を足す
          </button>
        </div>
        {projectIssues.length === 0 && days.length > 0 && <p className="muted">NG日の衝突・撤収の超過・拘束時間・休息の問題はありません。</p>}

        {days.length === 0 && (
          <Empty title="撮影日がまだありません">
            <button type="button" className="btn btn-primary" onClick={addDay}>
              最初の撮影日を作る
            </button>
          </Empty>
        )}

        {days.map((d) => {
          const tt = timetable(p, d, scenes);
          const dayIssues = issues.filter((i) => i.dayId === d.id);
          return (
            <article
              key={d.id}
              className={`day${over === d.id ? ' drop-target' : ''}`}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(DRAG_TYPE)) {
                  e.preventDefault();
                  setOver(d.id);
                }
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => onDrop(e, d.id)}
            >
              <div className="day-head">
                <h3>{formatDate(d.date)}</h3>
                <label className="check">
                  日付
                  <input type="date" value={d.date} onChange={(e) => updateDay(d.id, { date: e.target.value })} />
                </label>
                <label className="check">
                  集合
                  <TimeInput value={d.callTime} label="全体の集合" onCommit={(v) => v != null && updateDay(d.id, { callTime: v })} />
                </label>
                <label className="check">
                  撤収予定
                  <TimeInput value={d.wrapPlan} allowEmpty placeholder="未定" label="撤収予定" onCommit={(v) => updateDay(d.id, { wrapPlan: v })} />
                </label>
                <span className="muted num">
                  見込み {formatTime(tt.end)} ・ {d.items.filter((i) => i.kind === 'scene').length}シーン
                </span>
                <span style={{ flex: 1 }} />
                <Link to={`/p/${p.id}/days/${d.id}`} className="btn btn-sm">
                  日々スケ
                </Link>
                <Link to={`/p/${p.id}/share/${d.id}`} className="btn btn-sm">
                  配布
                </Link>
                <button type="button" className="btn-link" onClick={() => void removeDay(d)}>
                  削除
                </button>
              </div>
              <div style={{ padding: '4px 10px' }}>
                <DayLocations p={p} day={d} onChange={(locationIds) => updateDay(d.id, { locationIds })} />
                <IssueList issues={dayIssues} />
              </div>
              <table className="day-items">
                <tbody>
                  {tt.rows.map((r, i) => {
                    const it = r.item;
                    return (
                      <tr
                        key={it.id}
                        className={it.kind === 'break' ? 'break' : undefined}
                        {...(it.kind === 'scene' ? dragProps(it.sceneId) : {})}
                        onDragOver={(e) => e.dataTransfer.types.includes(DRAG_TYPE) && e.preventDefault()}
                        onDrop={(e) => {
                          e.stopPropagation();
                          onDrop(e, d.id, i);
                        }}
                      >
                        <td className="num" style={{ width: 90, whiteSpace: 'nowrap' }}>
                          {formatTime(r.start)}–{formatTime(r.end)}
                        </td>
                        <td>
                          {it.kind === 'scene' ? (
                            <>
                              <span className="scene-no">S#{r.scene?.no ?? '?'}</span> {r.scene?.heading}
                              <span className="muted"> {r.scene?.timeOfDay}</span>
                              <span className="muted">
                                {' '}
                                {r.scene?.castIds
                                  .map((id) => persons.get(id)?.name)
                                  .filter(Boolean)
                                  .join('、')}
                              </span>
                            </>
                          ) : (
                            <BreakLabel value={it.label} onCommit={(label) => updateItem(d.id, it.id, { label })} />
                          )}
                        </td>
                        <td style={{ width: 80 }} title="所要（分）">
                          <NumInput
                            value={it.kind === 'scene' ? it.durMin : it.durMin}
                            placeholder={String(r.end - r.start)}
                            label="所要（分）"
                            onCommit={(v) => updateItem(d.id, it.id, it.kind === 'scene' ? { durMin: v } : { durMin: v ?? 30 })}
                          />
                        </td>
                        <td style={{ width: 80 }} title="開始を固定">
                          <TimeInput value={it.fixedStart} allowEmpty placeholder="自動" label="開始を固定" onCommit={(v) => updateItem(d.id, it.id, { fixedStart: v })} />
                        </td>
                        <td style={{ whiteSpace: 'nowrap', width: 1 }}>
                          <button type="button" className="btn-link" aria-label="上へ" disabled={i === 0} onClick={() => updateDay(d.id, { items: moveItem(d, i, i - 1).items })}>
                            ↑
                          </button>
                          <button type="button" className="btn-link" aria-label="下へ" disabled={i === d.items.length - 1} onClick={() => updateDay(d.id, { items: moveItem(d, i, i + 1).items })}>
                            ↓
                          </button>
                          {it.kind === 'scene' && (
                            <select
                              value=""
                              aria-label="別の日へ移す"
                              style={{ width: 92 }}
                              onChange={(e) => {
                                const to = e.target.value;
                                if (to) update((q) => moveSceneToDay(q, it.sceneId, to === '__pool' ? null : to));
                              }}
                            >
                              <option value="">移す…</option>
                              <option value="__pool">未割当へ</option>
                              {days
                                .filter((x) => x.id !== d.id)
                                .map((x) => (
                                  <option key={x.id} value={x.id}>
                                    {formatDate(x.date)}
                                  </option>
                                ))}
                            </select>
                          )}
                          {it.kind === 'break' && (
                            <button type="button" className="btn-link" onClick={() => updateDay(d.id, { items: d.items.filter((x) => x.id !== it.id) })}>
                              消す
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {tt.rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted" style={{ padding: 12 }}>
                        左の未割当からシーンを選ぶか、ここへつかんで落としてください。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="day-foot row">
                <button type="button" className="btn btn-sm" onClick={() => addBreak(d.id, '昼食', 60)}>
                  ＋昼食
                </button>
                <button type="button" className="btn btn-sm" onClick={() => addBreak(d.id, '移動', 30)}>
                  ＋移動
                </button>
                <button type="button" className="btn btn-sm" onClick={() => addBreak(d.id, '休憩', 15)}>
                  ＋休憩
                </button>
              </div>
            </article>
          );
        })}

        {p.scenes.some((s) => s.archived) && (
          <p className="muted">
            取り込み直しで消えたシーンは <Link to={`/p/${p.id}/koban`}>香盤表</Link> の「消えたシーン」から戻せます。
          </p>
        )}
      </section>
    </div>
  );
}

function BreakLabel({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  return <input value={v} aria-label="項目の名前" onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} style={{ width: 120 }} />;
}

function DayLocations({ p, day, onChange }: { p: Project; day: ShootDay; onChange: (ids: ID[]) => void }) {
  const locs = indexById(p.locations);
  return (
    <div className="row" style={{ fontSize: '0.8125rem' }}>
      <span className="muted">場所</span>
      {day.locationIds.map((id) => (
        <span key={id} className="chip">
          {locs.get(id)?.name ?? '（削除されたロケ地）'}
          <button type="button" aria-label="場所から外す" onClick={() => onChange(day.locationIds.filter((x) => x !== id))}>
            ×
          </button>
        </span>
      ))}
      {p.locations.length > 0 ? (
        <select value="" aria-label="場所を足す" onChange={(e) => e.target.value && onChange([...day.locationIds, e.target.value])}>
          <option value="">{day.locationIds.length === 0 ? '未指定（シーンのロケ地を使う）' : '＋場所'}</option>
          {p.locations
            .filter((l) => !day.locationIds.includes(l.id))
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </select>
      ) : (
        <span className="muted">（人物・ロケ地の画面でロケ地を足せます）</span>
      )}
    </div>
  );
}
