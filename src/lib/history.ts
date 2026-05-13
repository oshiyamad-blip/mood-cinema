import type { AnswerMap } from '../data/questions';

const KEY = 'mc:history';
const MAX = 10;

export interface HistoryEntry {
  ts: number;
  answers: AnswerMap;
  labels: string[];
  query: string;
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function saveHistory(entry: Omit<HistoryEntry, 'ts'>) {
  const list = loadHistory();
  const next: HistoryEntry[] = [{ ts: Date.now(), ...entry }, ...list].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
