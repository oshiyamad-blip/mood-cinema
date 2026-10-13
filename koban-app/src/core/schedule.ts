// 時間割と検査（B-4〜B-6、C-3）。時間割の正本は撮影日側の並びと集合時刻だけで、
// 総スケと日々スケは同じ関数で同じ時間割を得る。

import type { DayItem, ID, Minutes, Project, ProjectSettings, Scene, ShootDay } from './model';
import { indexById, sortedDays } from './project';
import { daysBetween, formatDate, formatDuration, formatTime } from './time';

export interface TimedItem {
  item: DayItem;
  start: Minutes;
  end: Minutes;
  scene: Scene | null;
  /** 開始を手で固定している */
  fixed: boolean;
  /** 固定した開始が前の項目の終わりより早い */
  overlap: boolean;
}

export interface Timetable {
  rows: TimedItem[];
  /** 最初の項目の開始（項目が無ければ集合＋準備） */
  firstStart: Minutes;
  /** 最後の項目の終わり（撤収見込み） */
  end: Minutes;
}

export function sceneDuration(s: Scene, settings: ProjectSettings): number {
  if (s.estMin != null && s.estMin > 0) return s.estMin;
  if (s.pages != null && s.pages > 0) return Math.max(5, Math.round((s.pages * settings.minPerPage) / 5) * 5);
  return settings.defaultSceneMin;
}

export function itemDuration(it: DayItem, scenes: Map<ID, Scene>, settings: ProjectSettings): number {
  if (it.kind === 'break') return it.durMin;
  if (it.durMin != null && it.durMin > 0) return it.durMin;
  const s = scenes.get(it.sceneId);
  return s ? sceneDuration(s, settings) : settings.defaultSceneMin;
}

export function timetable(p: Project, day: ShootDay, scenes: Map<ID, Scene> = indexById(p.scenes)): Timetable {
  let cursor = day.callTime + p.settings.setupMin;
  const firstStart = day.items[0]?.fixedStart ?? cursor;
  const rows: TimedItem[] = [];
  for (const it of day.items) {
    const fixed = it.fixedStart != null;
    const start = it.fixedStart ?? cursor;
    const overlap = fixed && rows.length > 0 && start < cursor;
    const end = start + itemDuration(it, scenes, p.settings);
    rows.push({ item: it, start, end, scene: it.kind === 'scene' ? (scenes.get(it.sceneId) ?? null) : null, fixed, overlap });
    cursor = end;
  }
  return { rows, firstStart, end: rows.length > 0 ? cursor : firstStart };
}

// ---- 検査 ----

export type Severity = 'error' | 'warn' | 'info';

export interface Issue {
  severity: Severity;
  code: 'ng' | 'over-wrap' | 'span' | 'rest' | 'overlap' | 'dup-scene' | 'no-date';
  dayId: ID;
  message: string;
  sceneId?: ID;
  personId?: ID;
}

/** その日の拘束の終わり。撤収見込みと撤収予定の遅いほう */
export function dayEnd(p: Project, day: ShootDay, tt: Timetable = timetable(p, day)): Minutes {
  return Math.max(tt.end, day.wrapPlan ?? tt.end);
}

export function checkProject(p: Project): Issue[] {
  const scenes = indexById(p.scenes);
  const persons = indexById(p.persons);
  const issues: Issue[] = [];
  const days = sortedDays(p);
  const sceneDays = new Map<ID, ID[]>();
  let prev: { day: ShootDay; end: Minutes } | null = null;

  for (const day of days) {
    const tt = timetable(p, day, scenes);
    const end = dayEnd(p, day, tt);
    if (!day.date && day.items.length > 0) {
      issues.push({ severity: 'info', code: 'no-date', dayId: day.id, message: '日付が未定の撮影日です' });
    }

    for (const r of tt.rows) {
      if (r.overlap) {
        issues.push({
          severity: 'warn',
          code: 'overlap',
          dayId: day.id,
          sceneId: r.scene?.id,
          message: `${label(r)} の開始 ${formatTime(r.start)} が前の項目の終わりより早くなっています`,
        });
      }
      if (!r.scene) continue;
      sceneDays.set(r.scene.id, [...(sceneDays.get(r.scene.id) ?? []), day.id]);
      if (!day.date) continue;
      for (const pid of r.scene.castIds) {
        const person = persons.get(pid);
        if (person?.ngDates.includes(day.date)) {
          issues.push({
            severity: 'error',
            code: 'ng',
            dayId: day.id,
            sceneId: r.scene.id,
            personId: pid,
            message: `${person.name} は ${formatDate(day.date)} が NG 日です（S#${r.scene.no}）`,
          });
        }
      }
    }

    if (day.wrapPlan != null && tt.end > day.wrapPlan) {
      issues.push({
        severity: 'warn',
        code: 'over-wrap',
        dayId: day.id,
        message: `撤収見込み ${formatTime(tt.end)} が予定 ${formatTime(day.wrapPlan)} を ${formatDuration(tt.end - day.wrapPlan)} 超えます`,
      });
    }
    const span = end - day.callTime;
    if (span > p.settings.maxSpanMin) {
      issues.push({
        severity: 'warn',
        code: 'span',
        dayId: day.id,
        message: `拘束時間が ${formatDuration(span)} で、${formatDuration(p.settings.maxSpanMin)} を超えます`,
      });
    }
    if (prev && day.date && prev.day.date) {
      const gap = daysBetween(prev.day.date, day.date);
      const rest = gap * 1440 + day.callTime - prev.end;
      if (rest < p.settings.minRestMin) {
        issues.push({
          severity: 'warn',
          code: 'rest',
          dayId: day.id,
          message: `前の撮影日（${formatDate(prev.day.date)}）の撤収から ${formatDuration(Math.max(0, rest))} しか空いていません（目安 ${formatDuration(p.settings.minRestMin)}）`,
        });
      }
    }
    if (day.date) prev = { day, end };
  }

  for (const [sid, ds] of sceneDays) {
    if (ds.length < 2) continue;
    const s = scenes.get(sid)!;
    for (const did of ds) {
      issues.push({ severity: 'info', code: 'dup-scene', dayId: did, sceneId: sid, message: `S#${s.no} が ${ds.length} つの撮影日に入っています` });
    }
  }
  return issues;
}

function label(r: TimedItem): string {
  if (r.item.kind === 'break') return r.item.label || '休憩';
  return r.scene ? `S#${r.scene.no}` : 'シーン';
}

// ---- 並びの操作（純関数） ----

export function moveItem(day: ShootDay, from: number, to: number): ShootDay {
  if (from === to || from < 0 || from >= day.items.length) return day;
  const items = [...day.items];
  const [x] = items.splice(from, 1);
  items.splice(Math.max(0, Math.min(items.length, to)), 0, x);
  return { ...day, items };
}

/** シーンを別の日へ移す（toDayId が null なら未割当へ戻す） */
export function moveSceneToDay(p: Project, sceneId: ID, toDayId: ID | null, index?: number): Project {
  let moved: DayItem | null = null;
  const days = p.days.map((d) => {
    const i = d.items.findIndex((it) => it.kind === 'scene' && it.sceneId === sceneId);
    if (i < 0) return d;
    moved = d.items[i];
    return { ...d, items: d.items.filter((_, j) => j !== i) };
  });
  if (toDayId == null) return { ...p, days };
  const item: DayItem = moved ?? { kind: 'scene', id: crypto.randomUUID(), sceneId, fixedStart: null, durMin: null };
  return {
    ...p,
    days: days.map((d) => {
      if (d.id !== toDayId) return d;
      const items = [...d.items];
      items.splice(index ?? items.length, 0, { ...item, fixedStart: null });
      return { ...d, items };
    }),
  };
}
