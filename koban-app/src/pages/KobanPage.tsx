// 香盤表（B-1・B-3・A-4）。取り込んだ表の確認と小さな修正。印（出演・衣裳・小道具…）を付け外しする。

import { memo, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ELEMENT_CATEGORIES, type Element, type ID, type IntExt, type Person, type Project, type Scene } from '../core/model';
import { assignedSceneIds, createScene, nameKey } from '../core/project';
import { newId } from '../core/ids';
import { projectStore } from '../store/projects';
import { CellInput, NumInput } from '../ui/cells';
import { Empty, useToast } from '../ui/ui';

interface Actions {
  update: (id: ID, patch: Partial<Scene>) => void;
  toggleCast: (sceneId: ID, personId: ID) => void;
  addElement: (sceneId: ID, category: string, name: string) => void;
  setLocation: (sceneId: ID, name: string) => void;
  archive: (s: Scene) => void;
}

function makeActions(pid: ID, onArchived: (s: Scene, undo: () => void) => void): Actions {
  const mapScene = (id: ID, fn: (s: Scene) => Scene) =>
    projectStore.update(pid, (q) => ({ ...q, scenes: q.scenes.map((s) => (s.id === id ? fn(s) : s)) }));
  const update = (id: ID, patch: Partial<Scene>) => mapScene(id, (s) => ({ ...s, ...patch }));
  return {
    update,
    toggleCast: (sceneId, personId) =>
      mapScene(sceneId, (s) => ({ ...s, castIds: s.castIds.includes(personId) ? s.castIds.filter((x) => x !== personId) : [...s.castIds, personId] })),
    addElement: (sceneId, category, name) => {
      const n = name.trim();
      if (!n) return;
      projectStore.update(pid, (q) => {
        let e = q.elements.find((x) => x.category === category && nameKey(x.name) === nameKey(n));
        const elements = e ? q.elements : [...q.elements, (e = { id: newId(), category, name: n })];
        return {
          ...q,
          elements,
          scenes: q.scenes.map((x) => (x.id === sceneId && !x.elementIds.includes(e!.id) ? { ...x, elementIds: [...x.elementIds, e!.id] } : x)),
        };
      });
    },
    setLocation: (sceneId, name) => {
      const n = name.trim();
      projectStore.update(pid, (q) => {
        if (!n) return { ...q, scenes: q.scenes.map((x) => (x.id === sceneId ? { ...x, locationId: null } : x)) };
        let l = q.locations.find((x) => nameKey(x.name) === nameKey(n));
        const locations = l ? q.locations : [...q.locations, (l = { id: newId(), name: n, address: '', meetingPoint: '', note: '' })];
        return { ...q, locations, scenes: q.scenes.map((x) => (x.id === sceneId ? { ...x, locationId: l!.id } : x)) };
      });
    },
    archive: (s) => {
      projectStore.update(pid, (q) => ({
        ...q,
        scenes: q.scenes.map((x) => (x.id === s.id ? { ...x, archived: true } : x)),
        days: q.days.map((d) => ({ ...d, items: d.items.filter((it) => !(it.kind === 'scene' && it.sceneId === s.id)) })),
      }));
      onArchived(s, () => update(s.id, { archived: false }));
    },
  };
}

export function KobanPage({ project: p }: { project: Project }) {
  const toast = useToast();
  const [elemCat, setElemCat] = useState(ELEMENT_CATEGORIES[0]);
  const scenes = p.scenes.filter((s) => !s.archived);
  const archived = p.scenes.filter((s) => s.archived);
  // 行を描き直すかどうかは参照で決めるので、作品の部分ごとに作り分ける
  const castCols = useMemo(() => p.persons.filter((x) => x.kind !== 'staff'), [p.persons]);
  const locById = useMemo(() => new Map(p.locations.map((l) => [l.id, l.name])), [p.locations]);
  const elemById = useMemo(() => new Map(p.elements.map((e) => [e.id, e])), [p.elements]);
  const actions = useMemo(
    () => makeActions(p.id, (s, undo) => toast({ text: `S#${s.no} を消えたシーンに移しました`, action: { label: '元に戻す', run: undo } })),
    [p.id, toast],
  );
  const assigned = assignedSceneIds(p);

  function addScene() {
    const max = Math.max(0, ...scenes.map((s) => Number.parseInt(s.no, 10)).filter((n) => Number.isFinite(n)));
    projectStore.update(p.id, (q) => ({ ...q, scenes: [...q.scenes, createScene(String(max + 1))] }));
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
                <th key={x.id} className="person-head" title={x.role ? `${x.name}（${x.role}）` : x.name}>
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
              <SceneRow
                key={s.id}
                s={s}
                castCols={castCols}
                locName={s.locationId ? (locById.get(s.locationId) ?? '') : ''}
                elemById={elemById}
                elemCat={elemCat}
                actions={actions}
              />
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
                <button type="button" className="btn btn-sm" onClick={() => actions.update(s.id, { archived: false })}>
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

interface RowProps {
  s: Scene;
  castCols: Person[];
  locName: string;
  elemById: Map<ID, Element>;
  elemCat: string;
  actions: Actions;
}

const SceneRow = memo(function SceneRow({ s, castCols, locName, elemById, elemCat, actions }: RowProps) {
  const { update } = actions;
  return (
    <tr>
      <td className="sticky-col" style={{ width: 64 }}>
        <CellInput value={s.no} label="シーン番号" onCommit={(v) => v.trim() && update(s.id, { no: v.trim() })} />
      </td>
      <td style={{ minWidth: 160 }}>
        <CellInput value={s.heading} label={`S#${s.no} の柱`} onCommit={(v) => update(s.id, { heading: v })} />
      </td>
      <td style={{ width: 70 }}>
        <CellInput value={s.timeOfDay} label={`S#${s.no} の時間帯`} onCommit={(v) => update(s.id, { timeOfDay: v })} />
      </td>
      <td style={{ width: 70 }}>
        <select value={s.intExt} aria-label={`S#${s.no} の屋内外`} onChange={(e) => update(s.id, { intExt: e.target.value as IntExt })}>
          <option value="">―</option>
          <option value="INT">内</option>
          <option value="EXT">外</option>
          <option value="INT/EXT">内外</option>
        </select>
      </td>
      <td style={{ width: 56 }}>
        <NumInput value={s.pages} label={`S#${s.no} のページ`} onCommit={(v) => update(s.id, { pages: v })} />
      </td>
      <td style={{ width: 64 }}>
        <NumInput value={s.estMin} label={`S#${s.no} の撮影見積（分）`} placeholder="自動" onCommit={(v) => update(s.id, { estMin: v })} />
      </td>
      <td style={{ minWidth: 120 }}>
        <LocInput value={locName} label={`S#${s.no} のロケ地`} onCommit={(v) => actions.setLocation(s.id, v)} />
      </td>
      {castCols.map((x) => {
        const on = s.castIds.includes(x.id);
        return (
          <td key={x.id} className="mark-cell">
            <button type="button" className="mark" aria-pressed={on} aria-label={`S#${s.no} に ${x.name}`} onClick={() => actions.toggleCast(s.id, x.id)}>
              {on ? '○' : ''}
            </button>
          </td>
        );
      })}
      <td style={{ minWidth: 200, whiteSpace: 'normal' }}>
        {s.elementIds.map((eid) => {
          const e = elemById.get(eid);
          if (!e) return null;
          return (
            <span key={eid} className="chip" title={e.category}>
              {e.name}
              <button type="button" aria-label={`${e.name} を外す`} onClick={() => update(s.id, { elementIds: s.elementIds.filter((x) => x !== eid) })}>
                ×
              </button>
            </span>
          );
        })}
        <AddChip label={`S#${s.no} に${elemCat}を足す`} onAdd={(v) => actions.addElement(s.id, elemCat, v)} />
      </td>
      <td style={{ minWidth: 160 }}>
        <CellInput value={s.synopsis} label={`S#${s.no} の内容`} onCommit={(v) => update(s.id, { synopsis: v })} />
      </td>
      <td style={{ minWidth: 120 }}>
        <CellInput value={s.note} label={`S#${s.no} の備考`} onCommit={(v) => update(s.id, { note: v })} />
      </td>
      <td>
        <button type="button" className="btn-link" onClick={() => actions.archive(s)}>
          外す
        </button>
      </td>
    </tr>
  );
});

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
