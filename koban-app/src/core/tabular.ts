// 香盤表の取り込み（A-2・A-3・A-5）。Excel・CSV・貼り付けを、文字列の格子にそろえてから扱う。

import { newId } from './ids';
import type { ColumnRole, FieldKey, ImportMapping, IntExt, Project, Scene } from './model';
import { createLocation, createPerson, createScene, nameKey } from './project';
import { toHalfWidth } from './time';

export type Grid = string[][];

// ---- 格子にする ----

/** CSV・TSV を読む。区切りは1行目のタブとカンマの数で決める。引用符と改行入りのセルに対応 */
export function parseDelimited(text: string): Grid {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/\t/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) && firstLine.includes('\t') ? '\t' : ',';
  const rows: Grid = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell === '') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return trimGrid(rows);
}

/** Excel のセル（文字・数・真偽・日付）を文字にする */
export function cellToString(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) {
    // 時刻だけのセルは 1899-12-30 起点で来る
    if (v.getUTCFullYear() < 1901) return `${v.getUTCHours()}:${String(v.getUTCMinutes()).padStart(2, '0')}`;
    return v.toISOString().slice(0, 10);
  }
  return String(v);
}

/** 末尾の空行・空列を落とし、行の長さをそろえる */
export function trimGrid(rows: Grid): Grid {
  const out = rows.map((r) => r.map((c) => c.replace(/\r/g, '').trim()));
  while (out.length > 0 && out[out.length - 1].every((c) => c === '')) out.pop();
  const width = Math.max(0, ...out.map((r) => lastNonEmpty(r) + 1));
  return out.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
}

function lastNonEmpty(r: string[]): number {
  for (let i = r.length - 1; i >= 0; i--) if (r[i] !== '') return i;
  return -1;
}

// ---- 見出しと列の割り当て ----

const HEADER_RULES: { re: RegExp; role: ColumnRole }[] = [
  { re: /^(s#|#|no\.?|ｎｏ|番号|シーン(番号|no)?|scene( ?no)?|sc\.?|場面)$/i, role: { kind: 'field', field: 'no' } },
  { re: /^(柱|場所|シーン名|見出し|heading|set)$/i, role: { kind: 'field', field: 'heading' } },
  { re: /^(ロケ地?|ロケーション|撮影場所|location)$/i, role: { kind: 'field', field: 'location' } },
  { re: /^(時間帯?|昼夜|d\/n|day\/night|時刻)$/i, role: { kind: 'field', field: 'timeOfDay' } },
  { re: /^(内外|屋内外|内\/外|i\/e|int\/ext|セット\/ロケ)$/i, role: { kind: 'field', field: 'intExt' } },
  { re: /^(ページ|ペラ|頁|枚数?|p|pages?)$/i, role: { kind: 'field', field: 'pages' } },
  { re: /^(見積|撮影見積|予定時間|所要|所要時間|分|est\.?)$/i, role: { kind: 'field', field: 'estMin' } },
  { re: /^(内容|あらすじ|概要|シーン内容|ト書き|synopsis|description)$/i, role: { kind: 'field', field: 'synopsis' } },
  { re: /^(備考|メモ|注意|注意事項|note|notes)$/i, role: { kind: 'field', field: 'note' } },
  { re: /^(出演|出演者|登場人物|キャスト|人物|役|cast)$/i, role: { kind: 'castList' } },
  { re: /^(衣裳|衣装)$/, role: { kind: 'elemList', category: '衣裳' } },
  { re: /^(小道具|小物)$/, role: { kind: 'elemList', category: '小道具' } },
  { re: /^(持ち道具|持道具)$/, role: { kind: 'elemList', category: '持ち道具' } },
  { re: /^(美術|装飾)$/, role: { kind: 'elemList', category: '美術' } },
  { re: /^(メイク|ヘアメイク)$/, role: { kind: 'elemList', category: 'メイク' } },
  { re: /^(車両|劇用車)$/, role: { kind: 'elemList', category: '車両' } },
  { re: /^(特機)$/, role: { kind: 'elemList', category: '特機' } },
  { re: /^(エキストラ|ex)$/i, role: { kind: 'elemList', category: 'エキストラ' } },
];

function headerKey(h: string): string {
  return toHalfWidth(h).replace(/\s+/g, '').toLowerCase();
}

/** 印として扱わない値 */
const NOT_MARK = new Set(['', '-', 'ー', '―', '−', '×', '✕', 'x', 'false', '0', 'なし', '無']);

export function isMark(v: string): boolean {
  return !NOT_MARK.has(toHalfWidth(v).trim().toLowerCase());
}

/** 印らしい値（○・●・◎・✓・1 など短いもの）だけの列か */
function looksLikeMarkColumn(values: string[]): boolean {
  const filled = values.filter((v) => v.trim() !== '');
  if (filled.length === 0) return false;
  return filled.every((v) => /^[○◯●◎〇✓✔◉☆★△▲oO1]$/.test(v.trim()));
}

/** 見出しの行を推定する。既知の見出し語が2つ以上ある最初の行、なければ0行目 */
export function guessHeaderRow(grid: Grid): number {
  const limit = Math.min(grid.length, 15);
  for (let i = 0; i < limit; i++) {
    const hits = grid[i].filter((c) => HEADER_RULES.some((r) => r.re.test(headerKey(c)))).length;
    if (hits >= 2) return i;
  }
  return 0;
}

export function guessRole(header: string, values: string[]): ColumnRole {
  const k = headerKey(header);
  if (k === '') return { kind: 'ignore' };
  for (const r of HEADER_RULES) if (r.re.test(k)) return r.role;
  if (looksLikeMarkColumn(values)) return { kind: 'castMark' };
  return { kind: 'ignore' };
}

/** 割り当てを作る。前回の割り当てがあれば見出しで引き当てて使い回す（A-2） */
export function guessMapping(grid: Grid, previous: ImportMapping | null): ImportMapping {
  return mappingForHeaderRow(grid, guessHeaderRow(grid), previous);
}

/** 見出しの行を指定して割り当てを作り直す */
export function mappingForHeaderRow(grid: Grid, headerRow: number, previous: ImportMapping | null): ImportMapping {
  const headers = grid[headerRow] ?? [];
  const byHeader: Record<string, ColumnRole> = {};
  headers.forEach((h, i) => {
    if (h === '') return;
    const prev = previous?.byHeader[h];
    byHeader[h] = prev ?? guessRole(h, grid.slice(headerRow + 1).map((r) => r[i] ?? ''));
  });
  return { headerRow, byHeader };
}

// ---- 下書き ----

export interface DraftScene {
  key: string;
  no: string;
  /** 割り当てられた項目だけが入る。入っていない項目は既存の値を残す */
  fields: Partial<Record<FieldKey, string>>;
  cast: string[] | null;
  elements: { category: string; name: string }[] | null;
  row: number;
}

export interface Draft {
  scenes: DraftScene[];
  skippedRows: number[];
  duplicateNos: string[];
}

/** シーン番号の照合キー（「S#012」「シーン12」「１２」→ 「12」、「12a」→「12A」） */
export function sceneKey(no: string): string {
  const s = toHalfWidth(no).toUpperCase().replace(/\s+/g, '').replace(/^(S#|#|SC\.?|SCENE|シーン|NO\.?)/, '');
  return s.replace(/^0+(?=\d)/, '');
}

export function splitList(v: string): string[] {
  return v
    .split(/[、,，/／\n]+/)
    .map((x) => x.trim())
    .filter((x) => x !== '');
}

export function buildDraft(grid: Grid, mapping: ImportMapping): Draft {
  const headers = grid[mapping.headerRow] ?? [];
  const cols = headers.map((h) => (h === '' ? ({ kind: 'ignore' } as ColumnRole) : (mapping.byHeader[h] ?? { kind: 'ignore' })));
  const noCol = cols.findIndex((r) => r.kind === 'field' && r.field === 'no');
  const hasCast = cols.some((r) => r.kind === 'castList' || r.kind === 'castMark');
  const hasElem = cols.some((r) => r.kind === 'elemList' || r.kind === 'elemMark');
  const scenes: DraftScene[] = [];
  const seen = new Set<string>();
  const skippedRows: number[] = [];
  const duplicateNos: string[] = [];

  for (let r = mapping.headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    if (row.every((c) => c === '')) continue;
    const no = noCol >= 0 ? row[noCol].trim() : '';
    if (no === '') {
      skippedRows.push(r);
      continue;
    }
    const key = sceneKey(no);
    if (seen.has(key)) {
      duplicateNos.push(no);
      continue;
    }
    seen.add(key);
    const d: DraftScene = { key, no, fields: {}, cast: hasCast ? [] : null, elements: hasElem ? [] : null, row: r };
    cols.forEach((role, i) => {
      const v = row[i] ?? '';
      switch (role.kind) {
        case 'field':
          if (role.field !== 'no') d.fields[role.field] = v;
          break;
        case 'castList':
          d.cast!.push(...splitList(v));
          break;
        case 'castMark':
          if (isMark(v)) d.cast!.push(headers[i]);
          break;
        case 'elemList':
          for (const name of splitList(v)) d.elements!.push({ category: role.category, name });
          break;
        case 'elemMark':
          if (isMark(v)) d.elements!.push({ category: role.category, name: headers[i] });
          break;
        case 'ignore':
          break;
      }
    });
    if (d.cast) d.cast = uniqueBy(d.cast, nameKey);
    if (d.elements) d.elements = uniqueBy(d.elements, (e) => `${e.category}\u0000${nameKey(e.name)}`);
    scenes.push(d);
  }
  return { scenes, skippedRows, duplicateNos };
}

function uniqueBy<T>(xs: T[], key: (x: T) => string): T[] {
  const s = new Set<string>();
  return xs.filter((x) => {
    const k = key(x);
    if (s.has(k)) return false;
    s.add(k);
    return true;
  });
}

// ---- 値の読み取り ----

export function parseIntExt(v: string): IntExt {
  const s = toHalfWidth(v).trim().toUpperCase();
  if (s === '') return '';
  if (/^(I\/E|INT\/EXT|内外|内\/外)$/.test(s)) return 'INT/EXT';
  if (/^(I|INT|内|屋内|セット|スタジオ)/.test(s)) return 'INT';
  if (/^(E|EXT|外|屋外|ロケ)/.test(s)) return 'EXT';
  return '';
}

/** 「1.5」「1/8」「1 3/8」を数にする */
export function parsePages(v: string): number | null {
  const s = toHalfWidth(v).trim().replace(/(ページ|ペラ|枚|p)$/i, '');
  if (s === '') return null;
  let m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = /^(\d+)\/(\d+)$/.exec(s);
  if (m) return Number(m[1]) / Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 「30」「30分」「1:30」「1時間」「1時間30分」を分にする */
export function parseMinutes(v: string): number | null {
  const s = toHalfWidth(v).trim();
  if (s === '') return null;
  let m = /^(\d+)[:：](\d{2})$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(?:(\d+)時間)?(?:(\d+)分)?$/.exec(s);
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  const n = Number(s.replace(/(分|min|m)$/i, ''));
  return Number.isFinite(n) ? n : null;
}

// ---- 前回からの変化（A-5） ----

export type ChangeField = 'heading' | 'timeOfDay' | 'intExt' | 'pages' | 'estMin' | 'location' | 'synopsis' | 'note' | 'cast' | 'elements';

export interface ImportDiff {
  added: DraftScene[];
  removed: Scene[];
  changed: { scene: Scene; draft: DraftScene; fields: ChangeField[] }[];
  unchanged: number;
  restored: Scene[];
  newPersons: string[];
  newElements: { category: string; name: string }[];
  newLocations: string[];
  /** 消えるシーンのうち撮影日に割り当て済みのもの。割り当ては未割当へ退避する */
  unassignedByRemoval: Scene[];
}

export function diffImport(p: Project, draft: Draft): ImportDiff {
  const persons = new Map(p.persons.map((x) => [nameKey(x.name), x]));
  const elements = new Map(p.elements.map((e) => [`${e.category}\u0000${nameKey(e.name)}`, e]));
  const locations = new Map(p.locations.map((l) => [nameKey(l.name), l]));
  const byKey = new Map(p.scenes.map((s) => [sceneKey(s.no), s]));
  const draftKeys = new Set(draft.scenes.map((d) => d.key));
  const assigned = new Set<string>();
  for (const day of p.days) for (const it of day.items) if (it.kind === 'scene') assigned.add(it.sceneId);

  const diff: ImportDiff = {
    added: [],
    removed: [],
    changed: [],
    unchanged: 0,
    restored: [],
    newPersons: [],
    newElements: [],
    newLocations: [],
    unassignedByRemoval: [],
  };
  const newP = new Set<string>();
  const newE = new Set<string>();
  const newL = new Set<string>();

  for (const d of draft.scenes) {
    for (const c of d.cast ?? []) {
      const k = nameKey(c);
      if (!persons.has(k) && !newP.has(k)) {
        newP.add(k);
        diff.newPersons.push(c);
      }
    }
    for (const e of d.elements ?? []) {
      const k = `${e.category}\u0000${nameKey(e.name)}`;
      if (!elements.has(k) && !newE.has(k)) {
        newE.add(k);
        diff.newElements.push(e);
      }
    }
    const loc = d.fields.location?.trim();
    if (loc && !locations.has(nameKey(loc)) && !newL.has(nameKey(loc))) {
      newL.add(nameKey(loc));
      diff.newLocations.push(loc);
    }

    const s = byKey.get(d.key);
    if (!s) {
      diff.added.push(d);
      continue;
    }
    if (s.archived) diff.restored.push(s);
    const fields = changedFields(p, s, d);
    if (fields.length > 0) diff.changed.push({ scene: s, draft: d, fields });
    else if (!s.archived) diff.unchanged++;
  }
  for (const s of p.scenes) {
    if (s.archived || draftKeys.has(sceneKey(s.no))) continue;
    diff.removed.push(s);
    if (assigned.has(s.id)) diff.unassignedByRemoval.push(s);
  }
  return diff;
}

function changedFields(p: Project, s: Scene, d: DraftScene): ChangeField[] {
  const out: ChangeField[] = [];
  const f = d.fields;
  if (f.heading !== undefined && f.heading !== s.heading) out.push('heading');
  if (f.timeOfDay !== undefined && f.timeOfDay !== s.timeOfDay) out.push('timeOfDay');
  if (f.intExt !== undefined && parseIntExt(f.intExt) !== s.intExt) out.push('intExt');
  if (f.pages !== undefined && parsePages(f.pages) !== s.pages) out.push('pages');
  if (f.estMin !== undefined && parseMinutes(f.estMin) !== s.estMin) out.push('estMin');
  if (f.synopsis !== undefined && f.synopsis !== s.synopsis) out.push('synopsis');
  if (f.note !== undefined && f.note !== s.note) out.push('note');
  if (f.location !== undefined) {
    const cur = p.locations.find((l) => l.id === s.locationId)?.name ?? '';
    if (nameKey(cur) !== nameKey(f.location)) out.push('location');
  }
  if (d.cast) {
    const cur = s.castIds.map((id) => p.persons.find((x) => x.id === id)?.name ?? '').map(nameKey).sort();
    const nxt = d.cast.map(nameKey).sort();
    if (cur.join('\u0000') !== nxt.join('\u0000')) out.push('cast');
  }
  if (d.elements) {
    const cur = s.elementIds
      .map((id) => p.elements.find((e) => e.id === id))
      .filter((e) => e != null)
      .map((e) => `${e.category}\u0000${nameKey(e.name)}`)
      .sort();
    const nxt = d.elements.map((e) => `${e.category}\u0000${nameKey(e.name)}`).sort();
    if (cur.join('\u0001') !== nxt.join('\u0001')) out.push('elements');
  }
  return out;
}

/**
 * 下書きを作品に反映する。消えたシーンは削除せず archived にし、撮影日の割り当てから外す
 * （外したシーンは総スケの「未割当」に出る）。人物・要素・ロケ地は名前で引き当て、無ければ作る。
 */
export function applyImport(p: Project, draft: Draft, mapping: ImportMapping): Project {
  const persons = [...p.persons];
  const elements = [...p.elements];
  const locations = [...p.locations];
  const personByKey = new Map(persons.map((x) => [nameKey(x.name), x]));
  const elemByKey = new Map(elements.map((e) => [`${e.category}\u0000${nameKey(e.name)}`, e]));
  const locByKey = new Map(locations.map((l) => [nameKey(l.name), l]));

  const personId = (name: string) => {
    const k = nameKey(name);
    let x = personByKey.get(k);
    if (!x) {
      x = createPerson(name, 'cast');
      persons.push(x);
      personByKey.set(k, x);
    }
    return x.id;
  };
  const elementId = (category: string, name: string) => {
    const k = `${category}\u0000${nameKey(name)}`;
    let e = elemByKey.get(k);
    if (!e) {
      e = { id: newId(), category, name: name.trim() };
      elements.push(e);
      elemByKey.set(k, e);
    }
    return e.id;
  };
  const locationId = (name: string) => {
    const k = nameKey(name);
    if (k === '') return null;
    let l = locByKey.get(k);
    if (!l) {
      l = createLocation(name);
      locations.push(l);
      locByKey.set(k, l);
    }
    return l.id;
  };

  const byKey = new Map(p.scenes.map((s) => [sceneKey(s.no), s]));
  const draftKeys = new Set(draft.scenes.map((d) => d.key));
  const out: Scene[] = [];

  for (const d of draft.scenes) {
    const s = byKey.get(d.key) ?? createScene(d.no);
    const f = d.fields;
    out.push({
      ...s,
      no: d.no,
      heading: f.heading ?? s.heading,
      timeOfDay: f.timeOfDay ?? s.timeOfDay,
      intExt: f.intExt !== undefined ? parseIntExt(f.intExt) : s.intExt,
      pages: f.pages !== undefined ? parsePages(f.pages) : s.pages,
      estMin: f.estMin !== undefined ? parseMinutes(f.estMin) : s.estMin,
      synopsis: f.synopsis ?? s.synopsis,
      note: f.note ?? s.note,
      locationId: f.location !== undefined ? locationId(f.location) : s.locationId,
      castIds: d.cast ? d.cast.map(personId) : s.castIds,
      elementIds: d.elements ? d.elements.map((e) => elementId(e.category, e.name)) : s.elementIds,
      archived: false,
    });
  }
  // 取り込みに無かったシーンは archived にして残す（取り込み済みの並びの後ろに置く）
  const removedIds = new Set<string>();
  for (const s of p.scenes) {
    if (draftKeys.has(sceneKey(s.no))) continue;
    if (!s.archived) removedIds.add(s.id);
    out.push({ ...s, archived: true });
  }
  const days = p.days.map((day) =>
    day.items.some((it) => it.kind === 'scene' && removedIds.has(it.sceneId))
      ? { ...day, items: day.items.filter((it) => !(it.kind === 'scene' && removedIds.has(it.sceneId))) }
      : day,
  );
  return { ...p, scenes: out, persons, elements, locations, days, importMapping: mapping };
}
