// 人物とロケ地（B-1・B-2・D-8）。人物はキャスト・エキストラ・スタッフに分け、スタッフも配布の対象にする。

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PERSON_KINDS, PERSON_KIND_LABEL, STAFF_DEPTS, type ID, type Location, type Person, type PersonKind, type Project } from '../core/model';
import { createLocation, createPerson } from '../core/project';
import { formatDate, isDate } from '../core/time';
import { projectStore } from '../store/projects';
import { CellInput } from '../ui/cells';
import { useConfirm, useToast } from '../ui/ui';

export function AssetsPage({ project: p }: { project: Project }) {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'locations' ? 'locations' : 'persons';
  return (
    <>
      <div className="day-tabs" role="tablist">
        <a href="?tab=persons" role="tab" aria-selected={tab === 'persons'} className={tab === 'persons' ? 'active' : ''} onClick={(e) => (e.preventDefault(), setParams({ tab: 'persons' }))}>
          人物（{p.persons.length}）
        </a>
        <a href="?tab=locations" role="tab" aria-selected={tab === 'locations'} className={tab === 'locations' ? 'active' : ''} onClick={(e) => (e.preventDefault(), setParams({ tab: 'locations' }))}>
          ロケ地（{p.locations.length}）
        </a>
      </div>
      {tab === 'persons' ? <Persons p={p} /> : <Locations p={p} />}
    </>
  );
}

function Persons({ p }: { p: Project }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [filter, setFilter] = useState<PersonKind | 'all'>('all');
  const update = (id: ID, patch: Partial<Person>) =>
    projectStore.update(p.id, (q) => ({ ...q, persons: q.persons.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const add = (kind: PersonKind) => projectStore.update(p.id, (q) => ({ ...q, persons: [...q.persons, { ...createPerson('', kind), name: kind === 'staff' ? '新しいスタッフ' : '新しい人物' }] }));
  const usedIn = (id: ID) => p.scenes.filter((s) => s.castIds.includes(id)).length;

  async function remove(x: Person) {
    const n = usedIn(x.id);
    const ok = await confirm({
      title: `${x.name} を削除しますか`,
      body: n > 0 ? <p>{n} シーンの出演から外れます。配布済みのリンクは取り消されません（配布と確認の画面で取り消せます）。</p> : undefined,
      confirmLabel: '削除',
      danger: true,
    });
    if (!ok) return;
    projectStore.update(
      p.id,
      (q) => ({
        ...q,
        persons: q.persons.filter((y) => y.id !== x.id),
        scenes: q.scenes.map((s) => (s.castIds.includes(x.id) ? { ...s, castIds: s.castIds.filter((c) => c !== x.id) } : s)),
      }),
      { snapshot: `${x.name} の削除の前` },
    );
    toast({ text: `${x.name} を削除しました。作品の設定の「直前の状態」から戻せます。` });
  }

  const shown = p.persons.filter((x) => filter === 'all' || x.kind === filter);
  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value as PersonKind | 'all')} aria-label="区分で絞り込む">
          <option value="all">すべて</option>
          {PERSON_KINDS.map((k) => (
            <option key={k} value={k}>
              {PERSON_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={() => add('cast')}>
          キャストを足す
        </button>
        <button type="button" className="btn" onClick={() => add('staff')}>
          スタッフを足す
        </button>
      </div>
      <datalist id="dept-list">
        {STAFF_DEPTS.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="sticky-col">名前</th>
              <th>区分</th>
              <th>役名・役職</th>
              <th>部署</th>
              <th>事務所</th>
              <th>NG日</th>
              <th>電話</th>
              <th>メール</th>
              <th title="閲覧ページで電話番号を見せる">番号を見せる</th>
              <th title="日々スケの連絡先欄に載せる">連絡先に載せる</th>
              <th title="ロケ地の詳しい住所をこの人のリンクに出す">住所を見せる</th>
              <th>出番</th>
              <th>
                <span className="visually-hidden">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((x) => (
              <tr key={x.id}>
                <td className="sticky-col" style={{ minWidth: 120 }}>
                  <CellInput value={x.name} label="名前" onCommit={(v) => v.trim() && update(x.id, { name: v.trim() })} />
                </td>
                <td>
                  <select
                    value={x.kind}
                    aria-label={`${x.name} の区分`}
                    onChange={(e) => {
                      const kind = e.target.value as PersonKind;
                      update(x.id, { kind, dept: kind === 'staff' ? (x.dept === '出演' ? '' : x.dept) : '出演', seesAddress: kind === 'staff' ? true : x.seesAddress });
                    }}
                  >
                    {PERSON_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {PERSON_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ minWidth: 110 }}>
                  <CellInput value={x.role} label={`${x.name} の役名・役職`} onCommit={(v) => update(x.id, { role: v })} />
                </td>
                <td style={{ minWidth: 90 }}>
                  {x.kind === 'staff' ? (
                    <DeptInput value={x.dept} label={`${x.name} の部署`} onCommit={(v) => update(x.id, { dept: v })} />
                  ) : (
                    <span className="muted">出演</span>
                  )}
                </td>
                <td style={{ minWidth: 110 }}>
                  <CellInput value={x.agency} label={`${x.name} の事務所`} onCommit={(v) => update(x.id, { agency: v })} />
                </td>
                <td style={{ minWidth: 180, whiteSpace: 'normal' }}>
                  <NgDates value={x.ngDates} name={x.name} onChange={(ngDates) => update(x.id, { ngDates })} />
                </td>
                <td style={{ minWidth: 120 }}>
                  <CellInput type="tel" value={x.contact.phone} label={`${x.name} の電話`} onCommit={(v) => update(x.id, { contact: { ...x.contact, phone: v } })} />
                </td>
                <td style={{ minWidth: 140 }}>
                  <CellInput type="email" value={x.contact.email} label={`${x.name} のメール`} onCommit={(v) => update(x.id, { contact: { ...x.contact, email: v } })} />
                </td>
                <td className="mark-cell">
                  <input type="checkbox" checked={x.contact.showPhone} aria-label={`${x.name} の電話番号を閲覧ページで見せる`} onChange={(e) => update(x.id, { contact: { ...x.contact, showPhone: e.target.checked } })} />
                </td>
                <td className="mark-cell">
                  <input type="checkbox" checked={x.contact.listed} aria-label={`${x.name} を連絡先に載せる`} onChange={(e) => update(x.id, { contact: { ...x.contact, listed: e.target.checked } })} />
                </td>
                <td className="mark-cell">
                  <input type="checkbox" checked={x.seesAddress} aria-label={`${x.name} のリンクに詳しい住所を出す`} onChange={(e) => update(x.id, { seesAddress: e.target.checked })} />
                </td>
                <td className="num muted">{usedIn(x.id) || ''}</td>
                <td>
                  <button type="button" className="btn-link" onClick={() => void remove(x)}>
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        電話番号は既定で閲覧ページに出しません。「連絡先に載せる」にした人だけが日々スケの連絡先欄に出て、番号は「番号を見せる」にした人だけ表示します。詳しい住所は「住所を見せる」にした人のリンクにだけ出ます（集合場所は全員に出ます）。
      </p>
    </>
  );
}

function DeptInput({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [v, setV] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setV(value);
  }
  return <input list="dept-list" value={v} aria-label={label} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v.trim())} />;
}

function NgDates({ value, name, onChange }: { value: string[]; name: string; onChange: (v: string[]) => void }) {
  const [d, setD] = useState('');
  return (
    <>
      {[...value].sort().map((x) => (
        <span key={x} className="chip num">
          {formatDate(x)}
          <button type="button" aria-label={`${formatDate(x)} を NG 日から外す`} onClick={() => onChange(value.filter((y) => y !== x))}>
            ×
          </button>
        </span>
      ))}
      <input
        type="date"
        value={d}
        aria-label={`${name} の NG 日を足す`}
        style={{ width: 140 }}
        onChange={(e) => {
          const v = e.target.value;
          setD('');
          if (isDate(v) && !value.includes(v)) onChange([...value, v]);
        }}
      />
    </>
  );
}

function Locations({ p }: { p: Project }) {
  const confirm = useConfirm();
  const update = (id: ID, patch: Partial<Location>) =>
    projectStore.update(p.id, (q) => ({ ...q, locations: q.locations.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const usedIn = (id: ID) => p.scenes.filter((s) => s.locationId === id).length;
  async function remove(l: Location) {
    const ok = await confirm({
      title: `${l.name} を削除しますか`,
      body: usedIn(l.id) > 0 ? <p>{usedIn(l.id)} シーンのロケ地が空になります。</p> : undefined,
      confirmLabel: '削除',
      danger: true,
    });
    if (!ok) return;
    projectStore.update(
      p.id,
      (q) => ({
        ...q,
        locations: q.locations.filter((x) => x.id !== l.id),
        scenes: q.scenes.map((s) => (s.locationId === l.id ? { ...s, locationId: null } : s)),
        days: q.days.map((d) => ({ ...d, locationIds: d.locationIds.filter((x) => x !== l.id) })),
      }),
      { snapshot: `${l.name} の削除の前` },
    );
  }
  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={() => projectStore.update(p.id, (q) => ({ ...q, locations: [...q.locations, createLocation('新しいロケ地')] }))}>
          ロケ地を足す
        </button>
      </div>
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="sticky-col">名称</th>
              <th>住所（見せる人だけ）</th>
              <th>集合場所（全員に見せる）</th>
              <th>メモ</th>
              <th>シーン</th>
              <th>
                <span className="visually-hidden">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {p.locations.map((l) => (
              <tr key={l.id}>
                <td className="sticky-col" style={{ minWidth: 140 }}>
                  <CellInput value={l.name} label="名称" onCommit={(v) => v.trim() && update(l.id, { name: v.trim() })} />
                </td>
                <td style={{ minWidth: 240 }}>
                  <CellInput value={l.address} label={`${l.name} の住所`} onCommit={(v) => update(l.id, { address: v })} />
                </td>
                <td style={{ minWidth: 200 }}>
                  <CellInput value={l.meetingPoint} label={`${l.name} の集合場所`} placeholder="例：〇〇駅 東口" onCommit={(v) => update(l.id, { meetingPoint: v })} />
                </td>
                <td style={{ minWidth: 160 }}>
                  <CellInput value={l.note} label={`${l.name} のメモ`} onCommit={(v) => update(l.id, { note: v })} />
                </td>
                <td className="num muted">{usedIn(l.id) || ''}</td>
                <td>
                  <button type="button" className="btn-link" onClick={() => void remove(l)}>
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
