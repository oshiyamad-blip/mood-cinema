// 香盤表（B-1・B-3・A-4）。取り込んだ表の確認と小さな修正。印（出演・衣裳・小道具…）を付け外しする。

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ELEMENT_CATEGORIES, type ID, type IntExt, type Project, type Scene } from '../core/model';
import { assignedSceneIds, createScene, nameKey } from '../core/project';
import { newId } from '../core/ids';
import { projectStore } from '../store/projects';
import { CellInput, NumInput } from '../ui/cells';
import { Empty, useToast } from '../ui/ui';

export function KobanPage({ project: p }: { project: Project }) {
  const toast = useToast();
  const [elemCat, setElemCat] = useState(ELEMENT_CATEGORIES[0]);
  const scenes = p.scenes.filter((s) => !s.archived);
  const archived = p.scenes.filter((s) => s.archived);
  const castCols = p.persons.filter((x) => x.kind !== 'staff');
  const locById = new Map(p.locations.map((l) => [l.id, l]));
  const elemById = new Map(p.elements.map((e) => [e.id, e]));
  const assigned = assignedSceneIds(p);

  const updateScene = (id: ID, patch: Partial<Scene>) =>
    projectStore.update(p.id, (q) => ({ ...q, scenes: q.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const toggleCast = (s: Scene, pid: ID) =>
    updateScene(s.id, { castIds: s.castIds.includes(pid) ? s.castIds.filter((x) => x !== pid) : [...s.castIds, pid] });

  function addScene() {
    const max = Math.max(0, ...scenes.map((s) => Number.parseInt(s.no, 10)).filter((n) => Number.isFinite(n)));
    projectStore.update(p.id, (q) => ({ ...q, scenes: [...q.scenes, createScene(String(max + 1))] }));
  }

  function addElement(s: Scene, name: string) {
    const n = name.trim();
    if (!n) return;
    projectStore.update(p.id, (q) => {
      let e = q.elements.find((x) => x.category === elemCat && nameKey(x.name) === nameKey(n));
      const elements = e ? q.elements : [...q.elements, (e = { id: newId(), category: elemCat, name: n })];
      return {
        ...q,
        elements,
        scenes: q.scenes.map((x) => (x.id === s.id && !x.elementIds.includes(e!.id) ? { ...x, elementIds: [...x.elementIds, e!.id] } : x)),
      };
    });
  }

  function setLocation(s: Scene, name: string) {
    const n = name.trim();
    projectStore.update(p.id, (q) => {
      if (!n) return { ...q, scenes: q.scenes.map((x) => (x.id === s.id ? { ...x, locationId: null } : x)) };
      let l = q.locations.find((x) => nameKey(x.name) === nameKey(n));
      const locations = l ? q.locations : [...q.locations, (l = { id: newId(), name: n, address: '', meetingPoint: '', note: '' })];
      return { ...q, locations, scenes: q.scenes.map((x) => (x.id === s.id ? { ...x, locationId: l!.id } : x)) };
    });
  }

  function archive(s: Scene) {
    projectStore.update(p.id, (q) => ({
      ...q,
      scenes: q.scenes.map((x) => (x.id === s.id ? { ...x, archived: true } : x)),
      days: q.days.map((d) => ({ ...d, items: d.items.filter((it) => !(it.kind === 'scene' && it.sceneId === s.id)) })),
    }));
    toast({ text: `S#${s.no} を消えたシーンに移しました`, action: { label: '元に戻す', run: () => updateScene(s.id, { archived: false }) } });
  }

  if (scenes.length === 0 && archived.length === 0) {
    return (
      <Empty title="シーンがまだありません">
        <p>香盤表を取り込むか、空の表に番号と柱を打ってシーンを作ります。</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link to={`/p/${p.id}/import`} className="btn btn-primary">
            香盤表を取り込む
          </Link>
          <button type="button" className="btn" onClick={addScene}>
            空の表から始める
          </button>
        </div>
      </Empty>
    );
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="sub num">
          {scenes.length} シーン ・ 出演 {castCols.length} 人 ・ 撮影日に入っている {scenes.filter((s) => assigned.has(s.id)).length}
        </span>
        <span style={{ flex: 1 }} />
        <label className="check">
          印を足す分類
          <select value={elemCat} onChange={(e) => setElemCat(e.target.value)}>
            {ELEMENT_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={addScene}>
          シーンを足す
        </button>
      </div>
      <datalist id="loc-list">
        {p.locations.map((l) => (
          <option key={l.id} value={l.name} />
        ))}
      </datalist>
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="sticky-col">S#</th>
              <th>柱</th>
              <th>時間帯</th>
              <th>内外</th>
              <th>P</th>
              <th>見積</th>
              <th>ロケ地</th>
              {castCols.map((x) => (
                <th key={x.id} className="vertical-head" title={x.role || x.name}>
                  {x.name}
                </th>
              ))}
              <th>印（{elemCat}を足す）</th>
              <th>内容</th>
              <th>備考</th>
              <th>
                <span className="visually-hidden">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {scenes.map((s) => (
              <tr key={s.id}>
                <td className="sticky-col" style={{ width: 64 }}>
                  <CellInput value={s.no} label="シーン番号" onCommit={(v) => v.trim() && updateScene(s.id, { no: v.trim() })} />
                </td>
                <td style={{ minWidth: 160 }}>
                  <CellInput value={s.heading} label={`S#${s.no} の柱`} onCommit={(v) => updateScene(s.id, { heading: v })} />
                </td>
                <td style={{ width: 70 }}>
                  <CellInput value={s.timeOfDay} label={`S#${s.no} の時間帯`} onCommit={(v) => updateScene(s.id, { timeOfDay: v })} />
                </td>
                <td style={{ width: 70 }}>
                  <select value={s.intExt} aria-label={`S#${s.no} の屋内外`} onChange={(e) => updateScene(s.id, { intExt: e.target.value as IntExt })}>
                    <option value="">―</option>
                    <option value="INT">内</option>
                    <option value="EXT">外</option>
                    <option value="INT/EXT">内外</option>
                  </select>
                </td>
                <td style={{ width: 56 }}>
                  <NumInput value={s.pages} label={`S#${s.no} のページ`} onCommit={(v) => updateScene(s.id, { pages: v })} />
                </td>
                <td style={{ width: 64 }}>
                  <NumInput value={s.estMin} label={`S#${s.no} の撮影見積（分）`} placeholder="自動" onCommit={(v) => updateScene(s.id, { estMin: v })} />
                </td>
                <td style={{ minWidth: 120 }}>
                  <LocInput value={s.locationId ? (locById.get(s.locationId)?.name ?? '') : ''} label={`S#${s.no} のロケ地`} onCommit={(v) => setLocation(s, v)} />
                </td>
                {castCols.map((x) => (
                  <td key={x.id} className="mark-cell">
                    <button
                      type="button"
                      className="mark"
                      aria-pressed={s.castIds.includes(x.id)}
                      aria-label={`S#${s.no} に ${x.name}`}
                      onClick={() => toggleCast(s, x.id)}
                    >
                      {s.castIds.includes(x.id) ? '○' : ''}
                    </button>
                  </td>
                ))}
                <td style={{ minWidth: 200, whiteSpace: 'normal' }}>
                  {s.elementIds.map((eid) => {
                    const e = elemById.get(eid);
                    if (!e) return null;
                    return (
                      <span key={eid} className="chip" title={e.category}>
                        {e.name}
                        <button type="button" aria-label={`${e.name} を外す`} onClick={() => updateScene(s.id, { elementIds: s.elementIds.filter((x) => x !== eid) })}>
                          ×
                        </button>
                      </span>
                    );
                  })}
                  <AddChip label={`S#${s.no} に${elemCat}を足す`} onAdd={(v) => addElement(s, v)} />
                </td>
                <td style={{ minWidth: 160 }}>
                  <CellInput value={s.synopsis} label={`S#${s.no} の内容`} onCommit={(v) => updateScene(s.id, { synopsis: v })} />
                </td>
                <td style={{ minWidth: 120 }}>
                  <CellInput value={s.note} label={`S#${s.no} の備考`} onCommit={(v) => updateScene(s.id, { note: v })} />
                </td>
                <td>
                  <button type="button" className="btn-link" onClick={() => archive(s)}>
                    外す
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {castCols.length === 0 && <p className="muted">出演者の列は、「人物・ロケ地」でキャストを足すと出ます。</p>}

      {archived.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary>消えたシーン（{archived.length}）</summary>
          <p className="muted">取り込み直しで無くなったシーンや、外したシーンです。データは残っているので戻せます。</p>
          <ul>
            {archived.map((s) => (
              <li key={s.id} className="row">
                <span className="num">S#{s.no}</span>
                <span>{s.heading}</span>
                <button type="button" className="btn btn-sm" onClick={() => updateScene(s.id, { archived: false })}>
                  戻す
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function LocInput({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [v, setV] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setV(value);
  }
  return (
    <input
      list="loc-list"
      value={v}
      aria-label={label}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function AddChip({ label, onAdd }: { label: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <input
      style={{ width: 90, display: 'inline-block' }}
      value={v}
      placeholder="＋"
      aria-label={label}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onAdd(v);
          setV('');
        }
      }}
      onBlur={() => {
        if (v.trim()) onAdd(v);
        setV('');
      }}
    />
  );
}
