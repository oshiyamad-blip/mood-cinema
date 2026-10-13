// 作品の生成・正規化・小さな操作。どれも純関数で、引数の作品を書き換えずに新しい作品を返す。

import { newId } from './ids';
import {
  DEFAULT_SETTINGS,
  type CallSheetOverrides,
  type Contact,
  type ID,
  type Location,
  type Person,
  type PersonKind,
  type Project,
  type ProjectKind,
  type Scene,
  type ShootDay,
} from './model';

export const SCHEMA_VERSION = 1;

export function createProject(title: string, kind: ProjectKind, now = Date.now()): Project {
  return {
    id: newId(),
    title: title.trim() || '無題の作品',
    kind,
    periodStart: '',
    periodEnd: '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    settings: { ...DEFAULT_SETTINGS },
    scenes: [],
    elements: [],
    persons: [],
    locations: [],
    days: [],
    callSheets: {},
    versions: [],
    shares: [],
    importMapping: null,
    rev: 0,
  };
}

export function emptyContact(): Contact {
  return { phone: '', email: '', showPhone: false, listed: false };
}

export function createScene(no: string, heading = ''): Scene {
  return {
    id: newId(),
    no,
    heading,
    timeOfDay: '',
    intExt: '',
    pages: null,
    estMin: null,
    synopsis: '',
    locationId: null,
    castIds: [],
    elementIds: [],
    note: '',
    archived: false,
  };
}

export function createPerson(name: string, kind: PersonKind): Person {
  return {
    id: newId(),
    name: name.trim(),
    role: '',
    kind,
    dept: kind === 'staff' ? '' : '出演',
    agency: '',
    ngDates: [],
    contact: emptyContact(),
    seesAddress: kind === 'staff',
  };
}

export function createLocation(name: string): Location {
  return { id: newId(), name: name.trim(), address: '', meetingPoint: '', note: '' };
}

export function createDay(date: string): ShootDay {
  return { id: newId(), date, callTime: 8 * 60, wrapPlan: 20 * 60, locationIds: [], items: [], note: '' };
}

export function emptyOverrides(): CallSheetOverrides {
  return { personCall: {}, deptCall: {}, meals: '', moves: '', notices: '', deptNotes: {}, weather: '' };
}

/** 古い形や欠けた値を補う。読み込み（localStorage・JSON・クラウド）の入口で必ず通す */
export function normalizeProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<Project>;
  if (typeof p.id !== 'string' || typeof p.title !== 'string') return null;
  const base = createProject(p.title, (p.kind as ProjectKind) ?? 'other', p.createdAt ?? Date.now());
  return {
    ...base,
    ...p,
    id: p.id,
    settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
    scenes: (p.scenes ?? []).map((s) => ({ ...createScene(s.no ?? ''), ...s })),
    elements: p.elements ?? [],
    persons: (p.persons ?? []).map((x) => ({
      ...createPerson(x.name ?? '', x.kind ?? 'cast'),
      ...x,
      contact: { ...emptyContact(), ...(x.contact ?? {}) },
    })),
    locations: (p.locations ?? []).map((l) => ({ ...createLocation(l.name ?? ''), ...l })),
    days: (p.days ?? []).map((d) => ({ ...createDay(d.date ?? ''), ...d, items: d.items ?? [] })),
    callSheets: Object.fromEntries(
      Object.entries(p.callSheets ?? {}).map(([k, v]) => [k, { ...emptyOverrides(), ...v }]),
    ),
    versions: p.versions ?? [],
    shares: p.shares ?? [],
    importMapping: p.importMapping ?? null,
    deletedAt: p.deletedAt ?? null,
    rev: p.rev ?? 0,
  };
}

export function touch(p: Project, now = Date.now()): Project {
  return { ...p, updatedAt: now, rev: p.rev + 1 };
}

export function indexById<T extends { id: ID }>(xs: T[]): Map<ID, T> {
  return new Map(xs.map((x) => [x.id, x]));
}

/** 撮影日を日付順に並べる（日付未定は後ろ） */
export function sortedDays(p: Project): ShootDay[] {
  return [...p.days].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
}

/** 撮影日の通し番号（1始まり）。日付未定の日は含めない */
export function dayNumber(p: Project, dayId: ID): { n: number; total: number } {
  const dated = sortedDays(p).filter((d) => d.date);
  const i = dated.findIndex((d) => d.id === dayId);
  return { n: i + 1, total: dated.length };
}

/** シーン番号の並べ替え用キー（「12A」→ [12, 'A']） */
export function sceneSortKey(no: string): [number, string] {
  const m = /(\d+)(.*)$/.exec(no);
  return m ? [Number(m[1]), m[2]] : [Number.MAX_SAFE_INTEGER, no];
}

export function compareSceneNo(a: string, b: string): number {
  const [an, as] = sceneSortKey(a);
  const [bn, bs] = sceneSortKey(b);
  return an !== bn ? an - bn : as.localeCompare(bs, 'ja');
}

/** 撮影日のどこかに割り当てられているシーン */
export function assignedSceneIds(p: Project): Set<ID> {
  const s = new Set<ID>();
  for (const d of p.days) for (const it of d.items) if (it.kind === 'scene') s.add(it.sceneId);
  return s;
}

/** 名前の比較用の正規化（空白と全角半角の違いを無視） */
export function nameKey(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}
