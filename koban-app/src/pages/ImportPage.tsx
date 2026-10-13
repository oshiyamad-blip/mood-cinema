// 取り込み（A-2・A-3・A-5）。ファイルか貼り付け → 列の割り当て → 前回からの変化の確認 → 反映。

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ELEMENT_CATEGORIES, type ColumnRole, type FieldKey, type ImportMapping, type Project } from '../core/model';
import {
  applyImport,
  buildDraft,
  cellToString,
  diffImport,
  guessMapping,
  mappingForHeaderRow,
  parseDelimited,
  trimGrid,
  type ChangeField,
  type Grid,
} from '../core/tabular';
import { projectStore } from '../store/projects';
import { loadSnapshots } from '../store/storage';
import { useToast } from '../ui/ui';

const FIELD_LABEL: Record<FieldKey, string> = {
  no: 'シーン番号',
  heading: '柱',
  timeOfDay: '時間帯',
  intExt: '屋内外',
  pages: 'ページ',
  estMin: '撮影見積（分）',
  location: 'ロケ地',
  synopsis: '内容',
  note: '備考',
};

const CHANGE_LABEL: Record<ChangeField, string> = {
  heading: '柱',
  timeOfDay: '時間帯',
  intExt: '屋内外',
  pages: 'ページ',
  estMin: '見積',
  location: 'ロケ地',
  synopsis: '内容',
  note: '備考',
  cast: '出演者',
  elements: '印',
};

function roleKey(r: ColumnRole): string {
  switch (r.kind) {
    case 'field':
      return `field:${r.field}`;
    case 'elemList':
      return `elemList:${r.category}`;
    case 'elemMark':
      return `elemMark:${r.category}`;
    default:
      return r.kind;
  }
}

function parseRoleKey(k: string): ColumnRole {
  const [kind, arg] = k.split(':');
  if (kind === 'field') return { kind: 'field', field: arg as FieldKey };
  if (kind === 'elemList') return { kind: 'elemList', category: arg };
  if (kind === 'elemMark') return { kind: 'elemMark', category: arg };
  if (kind === 'castList') return { kind: 'castList' };
  if (kind === 'castMark') return { kind: 'castMark' };
  return { kind: 'ignore' };
}

const ROLE_OPTIONS: { key: string; label: string }[] = [
  { key: 'ignore', label: '使わない' },
  ...(Object.keys(FIELD_LABEL) as FieldKey[]).map((f) => ({ key: `field:${f}`, label: FIELD_LABEL[f] })),
  { key: 'castList', label: '出演者（セルに名前を並べる）' },
  { key: 'castMark', label: '出演者（見出しが人物名、印で出演）' },
  ...ELEMENT_CATEGORIES.flatMap((c) => [
    { key: `elemList:${c}`, label: `${c}（セルに並べる）` },
    { key: `elemMark:${c}`, label: `${c}（見出しが名前、印で使う）` },
  ]),
];

async function readFileAsText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    // Excel で保存した CSV は Shift_JIS のことが多い
    return new TextDecoder('shift_jis').decode(buf);
  }
}

export function ImportPage({ project }: { project: Project }) {
  const nav = useNavigate();
  const toast = useToast();
  const [sheets, setSheets] = useState<{ name: string; grid: Grid }[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [paste, setPaste] = useState('');
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const grid = sheets[sheetIdx]?.grid ?? null;
  const draft = useMemo(() => (grid && mapping ? buildDraft(grid, mapping) : null), [grid, mapping]);
  const diff = useMemo(() => (draft ? diffImport(project, draft) : null), [project, draft]);

  function loadGrids(list: { name: string; grid: Grid }[]) {
    const usable = list.filter((s) => s.grid.length > 0);
    if (usable.length === 0) {
      setError('表が空でした。見出しの行とシーンの行があるか確かめてください。');
      return;
    }
    setError(null);
    setSheets(usable);
    setSheetIdx(0);
    setMapping(guessMapping(usable[0].grid, project.importMapping));
  }

  async function loadFile(file: File) {
    setBusy(true);
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const { default: readXlsxFile } = await import('read-excel-file/browser');
        const all = await readXlsxFile(file);
        loadGrids(all.map((s) => ({ name: s.sheet, grid: trimGrid(s.data.map((r) => r.map(cellToString))) })));
      } else if (/\.xls$/i.test(file.name)) {
        setError('古い Excel 形式（.xls）は読めません。Excel で「名前を付けて保存」から .xlsx か CSV にしてください。');
      } else {
        loadGrids([{ name: file.name, grid: parseDelimited(await readFileAsText(file)) }]);
      }
    } catch {
      setError('ファイルを読めませんでした。Excel（.xlsx）か CSV で保存し直してお試しください。');
    } finally {
      setBusy(false);
    }
  }

  function setRole(header: string, key: string) {
    if (!mapping) return;
    setMapping({ ...mapping, byHeader: { ...mapping.byHeader, [header]: parseRoleKey(key) } });
  }

  function apply() {
    if (!draft || !mapping) return;
    projectStore.update(project.id, (p) => applyImport(p, draft, mapping), { snapshot: '取り込みの前' });
    toast({
      text: `${draft.scenes.length} シーンを取り込みました`,
      action: {
        label: '元に戻す',
        run: () => {
          const snap = loadSnapshots(project.id)[0];
          if (snap) projectStore.update(project.id, () => ({ ...snap.project, rev: projectStore.get(project.id)!.rev }));
        },
      },
    });
    nav(`/p/${project.id}/koban`);
  }

  const headers = grid && mapping ? (grid[mapping.headerRow] ?? []) : [];
  const hasNo = mapping ? Object.values(mapping.byHeader).some((r) => r.kind === 'field' && r.field === 'no') : false;

  return (
    <>
      {!grid && (
        <section aria-label="取り込むもの">
          <p className="sub">
            香盤表を Excel（.xlsx）・CSV で選ぶか、スプレッドシートの範囲を写して貼り付けてください。1行が1シーンで、見出しの行がある表を読みます。
            {project.importMapping && ' 前回の列の割り当てを使い回します。'}
          </p>
          <div
            className={`dropzone${over ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const f = e.dataTransfer.files[0];
              if (f) void loadFile(f);
            }}
          >
            <p>ここにファイルを落とすか、</p>
            <label className="btn btn-primary">
              {busy ? '読んでいます…' : 'ファイルを選ぶ'}
              <input
                type="file"
                accept=".xlsx,.csv,.tsv,.txt,text/csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void loadFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <h2>貼り付け</h2>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'S#\t柱\t時間帯\t出演者\n1\t駅前\t昼\t田中、佐藤'}
            rows={6}
            aria-label="香盤表の貼り付け"
          />
          <div className="row">
            <button type="button" className="btn" disabled={paste.trim() === ''} onClick={() => loadGrids([{ name: '貼り付け', grid: parseDelimited(paste) }])}>
              貼り付けた表を読む
            </button>
          </div>
          {error && (
            <p className="issue issue-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}

      {grid && mapping && (
        <>
          <section className="panel" aria-label="列の割り当て">
            <div className="row">
              <h2 style={{ margin: 0 }}>列の割り当て</h2>
              <span className="spacer" style={{ flex: 1 }} />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setSheets([]);
                  setMapping(null);
                }}
              >
                別のファイルにする
              </button>
            </div>
            <div className="row" style={{ margin: '8px 0' }}>
              {sheets.length > 1 && (
                <label className="field">
                  シート
                  <select
                    value={sheetIdx}
                    onChange={(e) => {
                      const i = Number(e.target.value);
                      setSheetIdx(i);
                      setMapping(guessMapping(sheets[i].grid, project.importMapping));
                    }}
                  >
                    {sheets.map((s, i) => (
                      <option key={i} value={i}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                見出しの行
                <select
                  value={mapping.headerRow}
                  onChange={(e) => {
                    setMapping(mappingForHeaderRow(grid, Number(e.target.value), project.importMapping));
                  }}
                >
                  {grid.slice(0, 15).map((r, i) => (
                    <option key={i} value={i}>
                      {i + 1}行目：{r.filter((c) => c).slice(0, 4).join(' / ')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid-wrap" style={{ maxHeight: 360 }}>
              <table className="grid">
                <thead>
                  <tr>
                    <th>見出し</th>
                    <th>使い方</th>
                    <th>中身の例</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h, i) =>
                    h === '' ? null : (
                      <tr key={i}>
                        <td>{h}</td>
                        <td style={{ minWidth: 260 }}>
                          <select value={roleKey(mapping.byHeader[h] ?? { kind: 'ignore' })} onChange={(e) => setRole(h, e.target.value)} aria-label={`${h} の使い方`}>
                            {ROLE_OPTIONS.map((o) => (
                              <option key={o.key} value={o.key}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="muted">
                          {grid
                            .slice(mapping.headerRow + 1, mapping.headerRow + 4)
                            .map((r) => r[i])
                            .filter((v) => v)
                            .join(' / ')}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            {!hasNo && (
              <p className="issue issue-error" role="alert">
                「シーン番号」の列を選んでください。番号でシーンを見分けて、取り込み直しの変化を出します。
              </p>
            )}
          </section>

          {draft && diff && hasNo && (
            <section className="panel" aria-label="取り込みの確認">
              <h2>取り込みの確認</h2>
              <p className="num">
                <strong>{draft.scenes.length}</strong> シーンを読みました。
                {project.scenes.length > 0 && (
                  <>
                    {' '}
                    増える <strong className="diff-added">{diff.added.length}</strong> ・ 変わる <strong>{diff.changed.length}</strong> ・ 消える{' '}
                    <strong className="diff-removed">{diff.removed.length}</strong> ・ 同じ {diff.unchanged}
                  </>
                )}
              </p>
              {draft.skippedRows.length > 0 && (
                <p className="issue issue-info">番号のない行を {draft.skippedRows.length} 行飛ばしました（{draft.skippedRows.slice(0, 8).map((r) => r + 1).join('・')}行目）</p>
              )}
              {draft.duplicateNos.length > 0 && (
                <p className="issue issue-warn">同じ番号の行があり、最初の行だけを使います：S#{[...new Set(draft.duplicateNos)].join('・')}</p>
              )}
              {diff.newPersons.length > 0 && <p className="sub">新しい人物：{diff.newPersons.join('、')}</p>}
              {diff.newLocations.length > 0 && <p className="sub">新しいロケ地：{diff.newLocations.join('、')}</p>}
              {diff.newElements.length > 0 && <p className="sub">新しい印：{diff.newElements.map((e) => `${e.name}（${e.category}）`).join('、')}</p>}

              {diff.changed.length > 0 && (
                <>
                  <h3>変わるシーン</h3>
                  <ul>
                    {diff.changed.map((c) => (
                      <li key={c.scene.id}>
                        S#{c.scene.no}：{c.fields.map((f) => CHANGE_LABEL[f]).join('・')}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {diff.removed.length > 0 && (
                <>
                  <h3>消えるシーン</h3>
                  <p className="sub">
                    削除はせず「消えたシーン」として残します。総スケからいつでも戻せます。
                    {diff.unassignedByRemoval.length > 0 &&
                      ` このうち S#${diff.unassignedByRemoval.map((s) => s.no).join('・')} は撮影日に入っているので、割り当てを外して未割当に移します。`}
                  </p>
                  <p className="diff-removed">S#{diff.removed.map((s) => s.no).join('・')}</p>
                </>
              )}
              {diff.added.length > 0 && project.scenes.length > 0 && (
                <>
                  <h3>増えるシーン</h3>
                  <p className="diff-added">S#{diff.added.map((d) => d.no).join('・')}</p>
                </>
              )}
              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-primary" onClick={apply} disabled={draft.scenes.length === 0}>
                  反映する
                </button>
                <span className="muted">反映の直前の状態を残すので、あとから元に戻せます。</span>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
