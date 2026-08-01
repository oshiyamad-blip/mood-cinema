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
  heading: string;  // 箱の中身（1 行）
  body: string;     // 旧「内容メモ」。入れ子化以降は子の箱へ移すので通常は空
  at?: number;      // 逆ハコ：作品開始からの秒数（観ながら打刻したシーン開始位置）
  depth?: number;   // 入れ子の深さ。0＝いちばん外側。未設定は 0 とみなす
}

/** 入れ子の深さ（未設定は 0）。 */
export function depthOf(b: Box): number {
  return typeof b.depth === 'number' && b.depth > 0 ? Math.floor(b.depth) : 0;
}

/** 逆ハコで題材にした作品（TMDB 由来。手入力もできるので id は任意）。 */
export interface FilmRef {
  tmdbId?: number;
  title: string;
  year?: string;
  runtime?: number;      // 分
  posterPath?: string | null;
}

export interface Outline {
  id: string;            // 作品 ID（複数作品を区別する）
  title: string;
  structure: StructureId;
  boxes: Box[];
  updated: number;
  deletedAt?: number;    // ソフト削除の時刻（ゴミ箱行き）。未設定なら生きている。
  film?: FilmRef;        // 逆ハコで起こした場合の題材作品
}

/** 秒数を h:mm:ss / m:ss に整形する（逆ハコの打刻表示）。 */
export function formatTimecode(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
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
/**
 * 新しい作品の既定の構成。
 * 枠から入らせない：まず自由に書き出して、構成は必要になってから選ぶ。
 * 幕に振り直したくなったら、構成を切り替えて箱ごとに幕を指定できる。
 */
export const DEFAULT_STRUCTURE: StructureId = 'free';

export function emptyOutline(): Outline {
  return { id: uid(), title: '', structure: DEFAULT_STRUCTURE, boxes: [], updated: Date.now() };
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
        // 旧「本文」は子の箱へ移して、すべてを箱に統一する（文字は捨てない）
        const outlines = w.outlines
          .filter(isValidOutline)
          .map((o) => {
            const boxes = migrateBodiesToBoxes(o.boxes);
            return boxes === o.boxes ? o : { ...o, boxes };
          });
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

// ── メモ帳表示（テキストのまま書く）───────────────────────────────────
/** メモ帳の字下げ 1 段ぶん。 */
export const INDENT = '  ';

/**
 * 旧「本文（body）」を子の箱へ移す。すべてを箱に統一するための一度きりの移行。
 * 本文の各行が、その箱のひとつ内側の箱になる。**文字は 1 つも捨てない。**
 */
export function migrateBodiesToBoxes(boxes: Box[]): Box[] {
  if (!boxes.some((b) => b.body && b.body.trim())) return boxes; // 移行不要ならそのまま
  const out: Box[] = [];
  for (const b of boxes) {
    const d = depthOf(b);
    out.push({ ...b, body: '', depth: d });
    const lines = (b.body ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
    lines.forEach((line) => out.push({ id: uid(), act: b.act, heading: line, body: '', depth: d + 1 }));
  }
  return out;
}

/**
 * 深さを正規化する。いきなり 2 段以上深くならないように詰め、先頭は必ず 0 にする
 * （手で書いた字下げのブレを吸収する）。
 */
export function normalizeDepths(items: { depth: number }[]): void {
  let prev = -1;
  for (const it of items) {
    it.depth = Math.max(0, Math.min(it.depth, prev + 1));
    prev = it.depth;
  }
}

/**
 * 作品を「メモ帳」用のテキストにする。**すべての行が 1 つの箱**で、
 * 字下げの深さがそのまま入れ子の深さになる。幕がある構成では `## 幕名` を挟む
 * （空の幕も出して、その下に書き足せるようにする）。番号は付けない — 番号は
 * カード表示側の飾りで、書いている最中には邪魔になる。
 */
export function outlineToNotepad(o: Outline, actLabel: (actId: string) => string): string {
  const acts = STRUCTURES[o.structure].acts;
  const lines: string[] = [];
  const render = (b: Box) => lines.push(INDENT.repeat(depthOf(b)) + b.heading);
  if (acts.length === 0) {
    o.boxes.forEach(render);
  } else {
    for (const a of acts) {
      lines.push(`## ${actLabel(a)}`);
      o.boxes.filter((b) => b.act === a).forEach(render);
      lines.push('');
    }
    o.boxes.filter((b) => !acts.includes(b.act)).forEach(render);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export interface NotepadItem {
  heading: string;
  depth: number;
  actLabel: string | null;
}

/**
 * メモ帳のテキストを箱の並びへ。空行は無視し、中身のある行はすべて 1 箱にする。
 * 行頭の空白（全角スペース・タブも可）2 つで 1 段の入れ子。`## …` は幕の区切り。
 */
export function parseNotepad(text: string): NotepadItem[] {
  const items: NotepadItem[] = [];
  let act: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, INDENT).replace(/　/g, ' ');
    if (line.trim() === '') continue;
    const trimmed = line.trim();
    if (/^##\s+/.test(trimmed)) {
      act = trimmed.replace(/^##\s+/, '').trim();
      continue;
    }
    const indent = line.length - line.replace(/^ +/, '').length;
    items.push({ heading: trimmed, depth: Math.floor(indent / INDENT.length), actLabel: act });
  }
  normalizeDepths(items);
  return items;
}

/**
 * 選択した範囲を「ひとつ内側の箱」にする（マトリョーシカ的な整理）。
 * 選択が行の一部なら、その部分を切り出して直下に子の箱として置く。
 * 複数行にまたがるときは、その各行をまとめて 1 段深くする。
 * 返り値は書き換え後のテキストと、次に置くべき選択範囲。
 */
export function nestSelection(
  text: string,
  start: number,
  end: number,
): { text: string; selStart: number; selEnd: number } | null {
  if (start === end) return null;
  const selected = text.slice(start, end);
  if (!selected.trim()) return null;

  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEndIdx = text.indexOf('\n', end);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;

  // 複数行：それぞれを 1 段深くする
  if (selected.includes('\n')) {
    const block = text.slice(lineStart, lineEnd);
    const shifted = block
      .split('\n')
      .map((l) => (l.trim() === '' ? l : INDENT + l))
      .join('\n');
    const next = text.slice(0, lineStart) + shifted + text.slice(lineEnd);
    return { text: next, selStart: lineStart, selEnd: lineStart + shifted.length };
  }

  // 1 行の一部：その部分を切り出して、直下に 1 段深い箱として置く
  const line = text.slice(lineStart, lineEnd);
  const indent = line.length - line.replace(/^ +/, '').length;
  const before = text.slice(lineStart, start).replace(/\s+$/, '');
  const after = text.slice(end, lineEnd).replace(/^\s+/, '');
  const keep = (before + (before && after ? ' ' : '') + after).trim();
  const childIndent = INDENT.repeat(Math.floor(indent / INDENT.length) + 1);
  const child = childIndent + selected.trim();
  // 切り出した結果その行が空になるなら、行ごと子に置き換える（空の箱を残さない）
  const head = keep ? line.slice(0, indent) + keep + '\n' : '';
  const next = text.slice(0, lineStart) + head + child + text.slice(lineEnd);
  const childStart = lineStart + head.length + childIndent.length;
  return { text: next, selStart: childStart, selEnd: childStart + selected.trim().length };
}

/**
 * 編集後のテキストから作り直した箱を、編集前の箱に突き合わせて **id と打刻時刻
 * (at) を引き継ぐ**。これが無いとメモ帳で 1 文字直すたびに逆ハコの時刻が消え、
 * 同期上も別物の箱として扱われてしまう。
 *
 * 突き合わせは ①見出しが一致するもの ②残りは順番で、の 2 段階。
 * 見出しを書き換えても位置が近ければ引き継げる。
 */
export function reconcileBoxes(
  prev: Box[],
  items: { heading: string; act: string; depth: number }[],
): Box[] {
  const pool = [...prev];
  const out: (Box | null)[] = items.map(() => null);
  // 1) 見出しがそのまま残っているものを先に対応づける（並べ替えに強い）
  items.forEach((it, i) => {
    const k = pool.findIndex((b) => b.heading === it.heading);
    if (k >= 0) {
      const b = pool.splice(k, 1)[0];
      out[i] = { ...b, heading: it.heading, act: it.act, depth: it.depth };
    }
  });
  // 2) 残りは順番に割り当てる（見出しを書き換えた箱を拾う）
  items.forEach((it, i) => {
    if (out[i]) return;
    const b = pool.shift();
    out[i] = b
      ? { ...b, heading: it.heading, act: it.act, depth: it.depth }
      : { id: uid(), act: it.act, heading: it.heading, body: '', depth: it.depth };
  });
  return out as Box[];
}

// ── バックアップ（JSON で持ち出す・戻す）──────────────────────────────
const BACKUP_KIND = 'tsumugi-workspace';

export interface WorkspaceBackup {
  app: string;
  kind: string;
  version: number;
  exportedAt: string;
  outlines: Outline[];
}

/**
 * 全作品（ゴミ箱の中身も含む）を JSON 文字列にする。
 * クラウドに頼らず自分で持ち出せる控えを作るための出口。無料枠に自動バックアップが
 * 無くても、ここからいつでも救い出せる。
 */
export function exportWorkspaceJson(w: Workspace, now = new Date()): string {
  const backup: WorkspaceBackup = {
    app: 'Tsumugi',
    kind: BACKUP_KIND,
    version: 1,
    exportedAt: now.toISOString(),
    outlines: w.outlines,
  };
  return JSON.stringify(backup, null, 2);
}

/**
 * バックアップ JSON を検証して作品の配列を返す。読めなければ null。
 * 壊れた行は落とすが、読める行は必ず拾う（全部か無かにしない）。
 */
export function parseWorkspaceBackup(text: string): Outline[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const b = data as Partial<WorkspaceBackup>;
  if (b.kind !== BACKUP_KIND) return null;
  if (!Array.isArray(b.outlines)) return null;
  const valid = b.outlines.filter(isValidOutline);
  return valid.length > 0 ? valid : null;
}

// ── 箱の並べ替え（幕をまたぐ移動を含む）────────────────────────────────
/**
 * 画面に出る順に箱を並べ直す。幕ありなら幕の順→幕内は配列順、
 * どの幕にも属さない箱（構成変更で取り残されたもの）は末尾に置く。
 */
export function orderedBoxes(boxes: Box[], structure: StructureId): Box[] {
  const acts = STRUCTURES[structure].acts;
  if (acts.length === 0) return [...boxes];
  const grouped = acts.flatMap((a) => boxes.filter((b) => b.act === a));
  const orphans = boxes.filter((b) => !acts.includes(b.act));
  return [...grouped, ...orphans];
}

/**
 * 箱を 1 つ上/下へ動かす。**幕の境目では隣の幕へ移る**（同じ幕の中で詰まらない）。
 * 「このシーンは二幕に回そう」を ↑↓ だけで実現するための中核。
 */
export function moveBoxAcross(
  boxes: Box[],
  structure: StructureId,
  id: string,
  dir: -1 | 1,
): Box[] {
  const acts = STRUCTURES[structure].acts;
  const ordered = orderedBoxes(boxes, structure);
  const i = ordered.findIndex((b) => b.id === id);
  if (i < 0) return boxes;
  const j = i + dir;

  // 同じ幕の中に隣がいれば、ただ入れ替える
  if (j >= 0 && j < ordered.length && ordered[j].act === ordered[i].act) {
    const next = [...ordered];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  }

  // ここから先は幕をまたぐ移動。幕なし構成では端なので何もしない。
  if (acts.length === 0) return boxes;
  const ai = acts.indexOf(ordered[i].act);
  if (ai < 0) return boxes; // どの幕にも属さない箱は動かさない
  const targetIdx = ai + dir;
  if (targetIdx < 0 || targetIdx >= acts.length) return boxes; // 最初の幕の頭／最後の幕の尻
  const targetAct = acts[targetIdx];

  // 隣の幕が空でも必ずそこへ入る（幕を飛び越さない）
  const rest = ordered.filter((b) => b.id !== id);
  const positions = rest.reduce<number[]>((acc, b, k) => (b.act === targetAct ? [...acc, k] : acc), []);
  const at =
    positions.length === 0
      ? rest.length // 空の幕：配列上の位置は表示順に影響しない
      : dir === -1
        ? positions[positions.length - 1] + 1 // 上へ：前の幕の最後に付く
        : positions[0];                        // 下へ：次の幕の先頭に付く
  rest.splice(at, 0, { ...ordered[i], act: targetAct });
  return rest;
}

/** 箱を指定した幕へ移す（移動先の幕の最後に置く。細かい順は ↑↓ で詰める）。 */
export function setBoxAct(boxes: Box[], structure: StructureId, id: string, act: string): Box[] {
  const acts = STRUCTURES[structure].acts;
  if (acts.length > 0 && !acts.includes(act)) return boxes;
  const target = boxes.find((b) => b.id === id);
  if (!target || target.act === act) return boxes;
  const ordered = orderedBoxes(boxes.filter((b) => b.id !== id), structure);
  const lastOfAct = ordered.map((b) => b.act).lastIndexOf(act);
  ordered.splice(lastOfAct >= 0 ? lastOfAct + 1 : ordered.length, 0, { ...target, act });
  return ordered;
}

/**
 * "34:12" / "1:02:05" / "812"（秒だけ）を秒数へ。解釈できなければ null。
 * 逆ハコで、プレイヤーに出ている時刻をそのまま打ち直せるようにするためのもの。
 */
export function parseTimecode(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s); // 秒だけの入力
  const parts = s.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((x) => /^\d{1,3}$/.test(x))) return null;
  const n = parts.map(Number);
  const [h, m, sec] = parts.length === 3 ? n : [0, n[0], n[1]];
  if (sec > 59) return null;
  if (parts.length === 3 && m > 59) return null;
  return h * 3600 + m * 60 + sec;
}

// ── 取り込み：テキスト → 箱の解析 ──────────────────────────────────────
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
    const pad = INDENT.repeat(depthOf(box));
    // いちばん外側の箱にだけ通し番号を振り、内側は字下げで入れ子を示す
    lines.push(depthOf(box) === 0 ? `${n}. ${box.heading || '—'}` : `${pad}${box.heading || '—'}`);
    if (box.body.trim()) {
      box.body.trim().split('\n').forEach(l => lines.push(`   ${pad}${l}`));
    }
    if (depthOf(box) === 0) lines.push('');
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
