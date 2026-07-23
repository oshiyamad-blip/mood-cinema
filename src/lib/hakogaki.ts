/**
 * 脚本の「箱書き」エディタのデータモデルと永続化。
 * 完全クライアントサイド — アウトライン 1 件を localStorage に保存する。
 */

const KEY = 'mc:hakogaki';

export type StructureId = 'three-act' | 'kishotenketsu' | 'free';

export interface Box {
  id: string;
  act: string;      // 所属する幕の ID（自由構成では ''）
  heading: string;  // シーン見出し
  body: string;     // 内容メモ
}

export interface Outline {
  title: string;
  structure: StructureId;
  boxes: Box[];
  updated: number;
}

/** 各構成テンプレートが持つ幕（セクション）の ID 一覧。ラベルは i18n 側。 */
export const STRUCTURES: Record<StructureId, { id: StructureId; acts: string[] }> = {
  'three-act':     { id: 'three-act',     acts: ['setup', 'confrontation', 'resolution'] },
  'kishotenketsu': { id: 'kishotenketsu', acts: ['ki', 'sho', 'ten', 'ketsu'] },
  'free':          { id: 'free',          acts: [] },
};

export const STRUCTURE_IDS: StructureId[] = ['three-act', 'kishotenketsu', 'free'];

/** 衝突しにくい短い ID を生成（ブラウザ実行前提）。 */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function emptyOutline(): Outline {
  return { title: '', structure: 'three-act', boxes: [], updated: Date.now() };
}

export function loadOutline(): Outline | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Outline;
    // 最低限の妥当性チェック（壊れた保存データで UI が落ちないように）
    if (!o || !Array.isArray(o.boxes) || !STRUCTURES[o.structure]) return null;
    return o;
  } catch {
    return null;
  }
}

export function saveOutline(o: Outline): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* quota / プライベートモードは無視 */
  }
}

export function clearOutline(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * アウトラインを Markdown 風のプレーンテキストへ書き出す。
 * ラベルは i18n に依存するため、呼び出し側から解決関数を渡す。
 */
export function outlineToText(
  o: Outline,
  labels: { title: string; actLabel: (actId: string) => string; unassigned: string },
): string {
  const lines: string[] = [`# ${o.title || labels.title}`, ''];
  const acts = STRUCTURES[o.structure].acts;

  const renderBox = (box: Box, n: number) => {
    lines.push(`${n}. ${box.heading || '—'}`);
    if (box.body.trim()) {
      box.body.trim().split('\n').forEach(l => lines.push(`   ${l}`));
    }
    lines.push('');
  };

  if (acts.length === 0) {
    o.boxes.forEach((box, i) => renderBox(box, i + 1));
  } else {
    let n = 0;
    for (const act of acts) {
      const boxes = o.boxes.filter(b => b.act === act);
      if (boxes.length === 0) continue;
      lines.push(`## ${labels.actLabel(act)}`, '');
      boxes.forEach(box => renderBox(box, ++n));
    }
    // どの幕にも属さない箱（構成変更で取り残されたもの）
    const orphans = o.boxes.filter(b => !acts.includes(b.act));
    if (orphans.length > 0) {
      lines.push(`## ${labels.unassigned}`, '');
      orphans.forEach(box => renderBox(box, ++n));
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}
