// 日々スケの導出（C-1〜C-3）。撮影日と作品から、上書きを反映した「解決済みの文書」を作る。
// 配布する版はこの文書をそのまま保存するので、後から作品を直しても配った中身は変わらない。

import type { CallSheetOverrides, ID, Minutes, PersonKind, Project, ShootDay } from './model';
import { dayNumber, emptyOverrides, indexById } from './project';
import { dayEnd, timetable } from './schedule';

export interface DocRow {
  kind: 'scene' | 'break';
  start: Minutes;
  end: Minutes;
  sceneId: ID | null;
  sceneNo: string;
  heading: string;
  timeOfDay: string;
  intExt: string;
  pages: number | null;
  synopsis: string;
  locationName: string;
  castIds: ID[];
  castNames: string[];
  label: string;
}

export interface DocPerson {
  personId: ID;
  name: string;
  role: string;
  kind: PersonKind;
  dept: string;
  agency: string;
  call: Minutes;
  callOverridden: boolean;
  /** 最初の出番（スタッフは null） */
  firstStart: Minutes | null;
  sceneNos: string[];
}

export interface DocLocation {
  id: ID;
  name: string;
  address: string;
  meetingPoint: string;
}

export interface DocContact {
  personId: ID;
  name: string;
  role: string;
  dept: string;
  phone: string;
  showPhone: boolean;
  email: string;
}

export interface DocPrep {
  category: string;
  items: { name: string; sceneNos: string[] }[];
}

export interface CallSheetDoc {
  projectTitle: string;
  dayId: ID;
  date: string;
  dayN: number;
  dayTotal: number;
  generalCall: Minutes;
  wrapPlan: Minutes | null;
  estEnd: Minutes;
  locations: DocLocation[];
  rows: DocRow[];
  /** キャスト・エキストラ（出番のある人） */
  cast: DocPerson[];
  /** スタッフ */
  staff: DocPerson[];
  deptCalls: { dept: string; call: Minutes; overridden: boolean }[];
  prep: DocPrep[];
  deptNotes: { dept: string; text: string }[];
  meals: string;
  moves: string;
  notices: string;
  weather: string;
  note: string;
  contacts: DocContact[];
}

export function overridesFor(p: Project, dayId: ID): CallSheetOverrides {
  return p.callSheets[dayId] ?? emptyOverrides();
}

export function buildCallSheet(p: Project, day: ShootDay): CallSheetDoc {
  const ov = overridesFor(p, day.id);
  const scenes = indexById(p.scenes);
  const persons = indexById(p.persons);
  const locations = indexById(p.locations);
  const elements = indexById(p.elements);
  const tt = timetable(p, day, scenes);
  const { n, total } = dayNumber(p, day.id);

  const rows: DocRow[] = tt.rows.map((r) => {
    if (r.item.kind === 'break' || !r.scene) {
      return {
        kind: 'break',
        start: r.start,
        end: r.end,
        sceneId: null,
        sceneNo: '',
        heading: '',
        timeOfDay: '',
        intExt: '',
        pages: null,
        synopsis: '',
        locationName: '',
        castIds: [],
        castNames: [],
        label: r.item.kind === 'break' ? r.item.label : '（削除されたシーン）',
      };
    }
    const s = r.scene;
    return {
      kind: 'scene',
      start: r.start,
      end: r.end,
      sceneId: s.id,
      sceneNo: s.no,
      heading: s.heading,
      timeOfDay: s.timeOfDay,
      intExt: s.intExt,
      pages: s.pages,
      synopsis: s.synopsis,
      locationName: s.locationId ? (locations.get(s.locationId)?.name ?? '') : '',
      castIds: s.castIds.filter((id) => persons.has(id)),
      castNames: s.castIds.map((id) => persons.get(id)?.name ?? '').filter((x) => x !== ''),
      label: '',
    };
  });

  // 出番のある人を、最初の出番の順に
  const first = new Map<ID, { start: Minutes; nos: string[] }>();
  for (const r of rows) {
    if (r.kind !== 'scene') continue;
    for (const id of r.castIds) {
      const f = first.get(id);
      if (f) f.nos.push(r.sceneNo);
      else first.set(id, { start: r.start, nos: [r.sceneNo] });
    }
  }
  const cast: DocPerson[] = [...first.entries()]
    .map(([id, f]) => {
      const x = persons.get(id)!;
      const auto = Math.max(day.callTime, f.start - p.settings.castLeadMin);
      const o = ov.personCall[id];
      return {
        personId: id,
        name: x.name,
        role: x.role,
        kind: x.kind,
        dept: x.dept,
        agency: x.agency,
        call: o ?? auto,
        callOverridden: o != null,
        firstStart: f.start,
        sceneNos: f.nos,
      };
    })
    .sort((a, b) => a.call - b.call || (a.firstStart ?? 0) - (b.firstStart ?? 0));

  const staffPersons = p.persons.filter((x) => x.kind === 'staff');
  const depts = [...new Set(staffPersons.map((x) => x.dept || 'その他'))];
  const deptCalls = depts.map((dept) => {
    const o = ov.deptCall[dept];
    return { dept, call: o ?? day.callTime, overridden: o != null };
  });
  const deptCallMap = new Map(deptCalls.map((d) => [d.dept, d.call]));
  const staff: DocPerson[] = staffPersons.map((x) => {
    const o = ov.personCall[x.id];
    return {
      personId: x.id,
      name: x.name,
      role: x.role,
      kind: x.kind,
      dept: x.dept || 'その他',
      agency: x.agency,
      call: o ?? deptCallMap.get(x.dept || 'その他') ?? day.callTime,
      callOverridden: o != null,
      firstStart: null,
      sceneNos: [],
    };
  });

  // 各部の準備物：その日のシーンの印を部署（分類）ごとに
  const prepMap = new Map<string, Map<string, string[]>>();
  for (const r of rows) {
    if (r.kind !== 'scene' || !r.sceneId) continue;
    for (const eid of scenes.get(r.sceneId)?.elementIds ?? []) {
      const e = elements.get(eid);
      if (!e) continue;
      const cat = prepMap.get(e.category) ?? new Map<string, string[]>();
      cat.set(e.name, [...(cat.get(e.name) ?? []), r.sceneNo]);
      prepMap.set(e.category, cat);
    }
  }
  const prep: DocPrep[] = [...prepMap.entries()].map(([category, m]) => ({
    category,
    items: [...m.entries()].map(([name, sceneNos]) => ({ name, sceneNos })),
  }));

  // ロケ地：撮影日に指定したもの、なければシーンのロケ地を出てくる順に
  const locIds = day.locationIds.length > 0
    ? day.locationIds
    : [...new Set(rows.map((r) => (r.sceneId ? scenes.get(r.sceneId)?.locationId : null)).filter((x): x is ID => x != null))];
  const docLocations = locIds
    .map((id) => locations.get(id))
    .filter((l) => l != null)
    .map((l) => ({ id: l.id, name: l.name, address: l.address, meetingPoint: l.meetingPoint }));

  const contacts: DocContact[] = p.persons
    .filter((x) => x.contact.listed)
    .map((x) => ({
      personId: x.id,
      name: x.name,
      role: x.role,
      dept: x.dept,
      phone: x.contact.phone,
      showPhone: x.contact.showPhone,
      email: x.contact.email,
    }));

  return {
    projectTitle: p.title,
    dayId: day.id,
    date: day.date,
    dayN: n,
    dayTotal: total,
    generalCall: day.callTime,
    wrapPlan: day.wrapPlan,
    estEnd: tt.end,
    locations: docLocations,
    rows,
    cast,
    staff,
    deptCalls,
    prep,
    deptNotes: Object.entries(ov.deptNotes)
      .filter(([, t]) => t.trim() !== '')
      .map(([dept, text]) => ({ dept, text })),
    meals: ov.meals,
    moves: ov.moves,
    notices: ov.notices,
    weather: ov.weather,
    note: day.note,
    contacts,
  };
}

/** 撮影日の拘束の終わり（日々スケの見出し用） */
export function docDayEnd(p: Project, day: ShootDay): Minutes {
  return dayEnd(p, day);
}

/** 人物ごとの「自分の予定」。閲覧ページの先頭と、差分の影響判定に使う */
export interface PersonalSummary {
  personId: ID;
  name: string;
  role: string;
  call: Minutes | null;
  scenes: { no: string; start: Minutes; heading: string }[];
}

export function personalSummary(doc: CallSheetDoc, personId: ID): PersonalSummary | null {
  const x = doc.cast.find((c) => c.personId === personId) ?? doc.staff.find((c) => c.personId === personId);
  if (!x) return null;
  return {
    personId,
    name: x.name,
    role: x.role,
    call: x.call,
    scenes: doc.rows
      .filter((r) => r.kind === 'scene' && r.castIds.includes(personId))
      .map((r) => ({ no: r.sceneNo, start: r.start, heading: r.heading })),
  };
}
