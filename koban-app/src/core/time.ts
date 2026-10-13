// 時刻と日付。撮影の時刻は 24 時を超えて書く（25:30 = 翌 1:30）ので、分の整数で持つ。

import type { Minutes } from './model';

/** 「8:30」「08:30」「25:30」「830」「8時30分」「8時半」を分にする。読めなければ null */
export function parseTime(input: string): Minutes | null {
  const s = toHalfWidth(input).trim();
  if (s === '') return null;
  let m = /^(\d{1,2})[:：](\d{2})$/.exec(s);
  if (m) return hm(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})時(?:(\d{1,2})分|(半))?$/.exec(s);
  if (m) return hm(Number(m[1]), m[3] ? 30 : m[2] ? Number(m[2]) : 0);
  m = /^(\d{1,2})(\d{2})$/.exec(s);
  if (m) return hm(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})$/.exec(s);
  if (m) return hm(Number(m[1]), 0);
  return null;
}

function hm(h: number, min: number): Minutes | null {
  if (h > 47 || min > 59) return null;
  return h * 60 + min;
}

/** 分を「8:30」「25:30」にする */
export function formatTime(min: Minutes | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '';
  const sign = min < 0 ? '-' : '';
  const a = Math.abs(Math.round(min));
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}

/** 「2時間30分」 */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** YYYY-MM-DD を検証する */
export function isDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** 「10/20（火）」 */
export function formatDate(s: string): string {
  if (!isDate(s)) return s || '日付未定';
  const [y, mo, d] = s.split('-').map(Number);
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${mo}/${d}（${WEEKDAYS[wd]}）`;
}

/** 「2026年10月20日（火）」 */
export function formatDateLong(s: string): string {
  if (!isDate(s)) return s || '日付未定';
  const [y, mo, d] = s.split('-').map(Number);
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${y}年${mo}月${d}日（${WEEKDAYS[wd]}）`;
}

/** 二つの日付の差（日）。b − a */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** 日付に日数を足す */
export function addDays(s: string, n: number): string {
  const t = Date.parse(`${s}T00:00:00Z`) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 日本時間の今日（YYYY-MM-DD） */
export function todayJst(now = Date.now()): string {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
}

/** 日本時間のその日の 0:00 を epoch ミリ秒で */
export function jstMidnight(date: string): number {
  return Date.parse(`${date}T00:00:00+09:00`);
}

/** 全角の英数字と記号を半角にする */
export function toHalfWidth(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ');
}
