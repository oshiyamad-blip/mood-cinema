/**
 * 脚本の「箱書き」エディタのデータモデルと永続化。
 * 完全クライアントサイド — 複数の作品（アウトライン）を localStorage に保存する。
 *
 * 設計理念「絶対にユーザーのデータを消さない」：
 * - 旧フォーマット（単一作品）は起動時に自動移行し、決して失わない。
 * - 作品の削除はソフト削除（deletedAt を立てる）。完全削除は明示操作でのみ。
 */

const KEY = 'mc:hakogaki';          // 旧：単一作品（移行元。読むだけ）
const WS_KEY = 'mc:hakogaki:ws';    // 新：複数作品ワークスペース

export type StructureId = 'three-act' | 'kishotenketsu' | 'free';

export interface Box {
  id: string;
  act: string;      // 所属する幕の ID（自由構成では ''）
  heading: string;  // シーン見出し
  body: string;     // 内容メモ
}

export interface Outline {
  id: string;            // 作品 ID（複数作品を区別する）
  title: string;
  structure: StructureId;
  boxes: Box[];
  updated: number;
  deletedAt?: number;    // ソフト削除の時刻（ゴミ箱行き）。未設定なら生きている。
}

/** 一覧表示用の軽量メタ（本文は含めない）。 */
export interface ProjectMeta {
  id: string;
  title: string;
  updated: number;
}

/** localStorage 上の複数作品ワークスペース。 */
export interface Workspace {
  currentId: string | null;
  outlines: Outline[];   // ソフト削除済みも保持（一覧では除外）
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

/** 新規の空作品を1件つくる。 */
export function emptyOutline(): Outline {
  return { id: uid(), title: '', structure: 'three-act', boxes: [], updated: Date.now() };
}

/** 壊れた保存データで UI が落ちないよう、最低限の妥当性チェックを通す。 */
function isValidOutline(o: unknown): o is Outline {
  if (!o || typeof o !== 'object') return false;
  const c = o as Partial<Outline>;
  return (
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    typeof c.structure === 'string' &&
    !!c.structure &&
    STRUCTURES[c.structure as StructureId] !== undefined &&
    Array.isArray(c.boxes)
  );
}

function emptyWorkspace(): Workspace {
  return { currentId: null, outlines: [] };
}

/**
 * ワークスペースを読み込む。無ければ旧フォーマットから移行し、それも無ければ空を返す。
 * 移行はここで一度だけ行い、成功したら新フォーマットで保存する（旧キーは保険で残す）。
 */
export function loadWorkspace(): Workspace {
  // 1) 新フォーマット
  try {
    const raw = localStorage.getItem(WS_KEY);
    if (raw) {
      const w = JSON.parse(raw) as Workspace;
      if (w && Array.isArray(w.outlines)) {
        const outlines = w.outlines.filter(isValidOutline);
        const currentId =
          typeof w.currentId === 'string' && outlines.some((o) => o.id === w.currentId)
            ? w.currentId
            : null;
        return { currentId, outlines };
      }
    }
  } catch {
    /* 壊れていたら移行を試みる */
  }
  // 2) 旧フォーマット（単一作品）からの移行
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const legacy = JSON.parse(raw) as Partial<Outline>;
      if (legacy && Array.isArray(legacy.boxes) && STRUCTURES[legacy.structure as StructureId]) {
        const migrated: Outline = {
          id: uid(),
          title: typeof legacy.title === 'string' ? legacy.title : '',
          structure: legacy.structure as StructureId,
          boxes: legacy.boxes as Box[],
          updated: typeof legacy.updated === 'number' ? legacy.updated : Date.now(),
        };
        const w: Workspace = { currentId: migrated.id, outlines: [migrated] };
        saveWorkspace(w); // 新フォーマットへ確定（旧キーは消さず保険に残す）
        return w;
      }
    }
  } catch {
    /* ignore */
  }
  return emptyWorkspace();
}

export function saveWorkspace(w: Workspace): void {
  try {
    localStorage.setItem(WS_KEY, JSON.stringify(w));
  } catch {
    /* quota / プライベートモードは無視 */
  }
}

/** 生きている作品の一覧（新しい順）。 */
export function listProjects(w: Workspace): ProjectMeta[] {
  return w.outlines
    .filter((o) => !o.deletedAt)
    .map((o) => ({ id: o.id, title: o.title, updated: o.updated }))
    .sort((a, b) => b.updated - a.updated);
}

/** ゴミ箱（ソフト削除済み）の一覧（削除が新しい順）。 */
export function listTrashed(w: Workspace): (ProjectMeta & { deletedAt: number })[] {
  return w.outlines
    .filter((o) => o.deletedAt)
    .map((o) => ({ id: o.id, title: o.title, updated: o.updated, deletedAt: o.deletedAt as number }))
    .sort((a, b) => b.deletedAt - a.deletedAt);
}

/** 現在の作品を取り出す（無ければ null）。 */
export function currentOutline(w: Workspace): Outline | null {
  return w.outlines.find((o) => o.id === w.currentId && !o.deletedAt) ?? null;
}

/** 作品を1件更新して差し替えた新しいワークスペースを返す（不変更新）。 */
export function upsertOutline(w: Workspace, o: Outline): Workspace {
  const i = w.outlines.findIndex((x) => x.id === o.id);
  const outlines = i >= 0 ? w.outlines.map((x) => (x.id === o.id ? o : x)) : [...w.outlines, o];
  return { ...w, outlines };
}

/** 新しい作品を作って現在作品にする。 */
export function createProject(w: Workspace): { workspace: Workspace; outline: Outline } {
  const o = emptyOutline();
  return { workspace: { currentId: o.id, outlines: [...w.outlines, o] }, outline: o };
}

/** 現在作品を切り替える。 */
export function switchProject(w: Workspace, id: string): Workspace {
  if (!w.outlines.some((o) => o.id === id && !o.deletedAt)) return w;
  return { ...w, currentId: id };
}

/**
 * 作品をゴミ箱へ（ソフト削除）。本文は消さず deletedAt を立てるだけ。
 * 現在作品を消したときは、生きている別の作品へ切り替える（無ければ null）。
 */
export function trashProject(w: Workspace, id: string): Workspace {
  const now = Date.now();
  // updated も進める：削除を「新しい編集」として LWW で伝播させ、同期の差分検出にも乗せる
  const outlines = w.outlines.map((o) => (o.id === id ? { ...o, deletedAt: now, updated: now } : o));
  let currentId = w.currentId;
  if (currentId === id) {
    const alive = outlines.filter((o) => !o.deletedAt).sort((a, b) => b.updated - a.updated);
    currentId = alive[0]?.id ?? null;
  }
  return { currentId, outlines };
}

/** ゴミ箱から復元する（deletedAt を外す）。 */
export function restoreProject(w: Workspace, id: string): Workspace {
  const now = Date.now();
  const outlines = w.outlines.map((o) => {
    if (o.id !== id) return o;
    const { deletedAt: _omit, ...rest } = o;
    void _omit;
    return { ...rest, updated: now }; // 復元も新しい編集＝LWW で復活を伝播
  });
  return { ...w, outlines };
}

/** 完全削除（取り消し不可）。ゴミ箱からの明示操作でのみ呼ぶ。 */
export function purgeProject(w: Workspace, id: string): Workspace {
  const outlines = w.outlines.filter((o) => o.id !== id);
  const currentId = w.currentId === id ? null : w.currentId;
  return { currentId, outlines };
}

// ── 逆ハコ：テキスト → 箱の解析 ────────────────────────────────────────
/** 解析で得られた 1 箱ぶん。actLabel は見出し行（## …）の生ラベル。 */
export interface ParsedItem {
  heading: string;
  body: string;
  actLabel: string | null;
}
export interface ParsedOutline {
  title: string;
  items: ParsedItem[];
}

/** 箱の始まりを示す行頭マーカー。先に一致したものを採用する。 */
const BOX_MARKERS: RegExp[] = [
  /^#{3,}\s+(.+)$/,                        // ### 見出し
  /^\d+[.．、)）]\s*(.*)$/,                 // 1. / 1、/ 1)
  /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*(.*)$/, // ①②③…
  /^[○◯〇●]\s*(.*)$/,                      // ○柱（シーン見出しの慣習）
  /^[-*]\s+(.+)$/,                          // - / * 箇条書き
  /^・\s*(.+)$/,                            // ・箇条書き
];

function markerText(line: string): string | null {
  for (const re of BOX_MARKERS) {
    const m = line.match(re);
    if (m) return (m[1] ?? '').trim();
  }
  return null;
}

/**
 * あらすじ・脚本などのテキストを箱に分解する（逆ハコ）。
 * 自前の書き出し形式（# 題名 / ## 幕 / 1. 見出し + 字下げ本文）を往復できることを第一に、
 * 素のテキストでも「空行区切り＝1 箱・先頭行＝見出し」で拾う。破壊的な解釈はしない。
 */
export function parseOutlineText(text: string): ParsedOutline {
  const lines = text.split(/\r?\n/);
  let title = '';
  let act: string | null = null;
  let blank = false;
  const items: ParsedItem[] = [];
  let cur: { heading: string; body: string[]; act: string | null } | null = null;

  const flush = () => {
    if (!cur) return;
    items.push({ heading: cur.heading, body: cur.body.join('\n').trim(), actLabel: cur.act });
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      blank = true; // 空行は「次の行から新しい箱」の合図として覚えておく
      continue;
    }
    if (!title && /^#\s+/.test(line)) {
      title = line.replace(/^#\s+/, '').trim();
      blank = false;
      continue;
    }
    if (/^##\s+/.test(line)) {
      flush();
      act = line.replace(/^##\s+/, '').trim();
      blank = false;
      continue;
    }
    const mt = markerText(line);
    if (mt !== null) {
      flush();
      cur = { heading: mt, body: [], act };
      blank = false;
      continue;
    }
    if (!cur || blank) {
      flush();
      cur = { heading: line, body: [], act };
      blank = false;
      continue;
    }
    cur.body.push(line);
  }
  flush();
  return { title, items };
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
