/**
 * 縦書き（writing-mode: vertical-rl）のキャレット移動。基本設計書 §6.2。
 *
 * 縦書きでは物理キーと論理移動の対応が横書きと入れ替わる:
 *   - 上下キー = 行内移動（列に沿って文字を前後）
 *   - 左右キー = 行間移動（列＝行を跨ぐ。vertical-rl では次の列は「左」）
 *
 * また Chrome / Safari では Range.getBoundingClientRect が 0 を返すことがあり、
 * coordsAtPos が退化した座標を返す。safeCoords でフォールバックする。
 */
import { Selection, TextSelection } from 'prosemirror-state';
import type { Command } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

type Coords = { x: number; y: number };

/** 座標が退化（全て 0 付近）しているか。 */
function isDegenerate(r: { left: number; right: number; top: number; bottom: number }): boolean {
  return r.left === 0 && r.right === 0 && r.top === 0 && r.bottom === 0;
}

/**
 * coordsAtPos の縦書き対応版。0 矩形が返るケースを近傍位置・DOM 矩形でフォールバック。
 */
export function safeCoords(view: EditorView, pos: number): Coords {
  const tryPos = (p: number): Coords | null => {
    if (p < 0 || p > view.state.doc.content.size) return null;
    try {
      const r = view.coordsAtPos(p);
      if (!isDegenerate(r)) return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
    } catch {
      /* 無視してフォールバックへ */
    }
    return null;
  };

  // まず当該位置、だめなら前後 1 文字分をなめる
  const found = tryPos(pos) ?? tryPos(pos - 1) ?? tryPos(pos + 1);
  if (found) return found;

  // 最後の砦: 位置の親 DOM 要素の矩形中心
  const dom = view.domAtPos(Math.max(0, Math.min(pos, view.state.doc.content.size)));
  const node = dom.node.nodeType === 1 ? (dom.node as HTMLElement) : dom.node.parentElement;
  if (node) {
    const r = node.getBoundingClientRect();
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  }
  return { x: 0, y: 0 };
}

/** 1列（1行）の幅の目安。行内フォントサイズ×行間から推定する。 */
function lineStep(view: EditorView): number {
  const cs = getComputedStyle(view.dom);
  const font = parseFloat(cs.fontSize) || 18;
  const lh = parseFloat(cs.lineHeight);
  const step = Number.isFinite(lh) && lh > 0 ? lh : font * 2;
  return Math.max(step, font * 1.2);
}

/** IME 変換中はブラウザに委ねる。 */
function composing(view?: EditorView): boolean {
  return !!view && view.composing;
}

/**
 * 行内移動（上下キー）。dir = +1 で文字を1つ後方（下へ）、-1 で前方（上へ）。
 * 文書位置を ±1 して最寄りのテキスト位置へスナップする。
 */
export function moveInLine(dir: 1 | -1): Command {
  return (state, dispatch, view) => {
    if (composing(view)) return false;
    const { doc, selection } = state;
    const base = dir > 0 ? selection.to : selection.from;
    const targetPos = Math.max(0, Math.min(base + dir, doc.content.size));
    const $target = doc.resolve(targetPos);
    const sel = Selection.near($target, dir);
    if (sel.eq(selection)) return false;
    if (dispatch) dispatch(state.tr.setSelection(sel).scrollIntoView());
    return true;
  };
}

/**
 * 行間移動の goal（列を跨いでも保ちたい行位置）。連続した左右キーの間だけ有効で、
 * head が一致しなくなったら（クリック・入力・上下移動）自動的に破棄される。
 * y はページスクロールの影響を受けないよう editor DOM 上端からの相対値で持つ。
 */
const lineGoals = new WeakMap<EditorView, { head: number; relY: number }>();

/**
 * goal に使う行位置のサンプリング。実測（doc/user-journey 手当て時のプローブ）で
 * Chromium＋posAtCoords は縦書きで「指した点を含む文字の**直後**境界」を返す
 * （セル内のどこを指しても +1。上下半分での丸めは行われない）。したがって
 * キャレット境界 k へ吸着させたい点は「k の**直前**の文字のセル中央」。
 * 列頭（前の文字が同じ列に無い）では境界より少し上を指す — y は列内に
 * クランプされるため先頭境界 k がそのまま返る（これも実測で確認）。
 */
function rowSampleY(view: EditorView, head: number, colX: number, step: number): number {
  const at = safeCoords(view, head);
  const size = view.state.doc.content.size;
  if (head - 1 >= 0) {
    const prv = safeCoords(view, head - 1);
    if (Math.abs(prv.x - colX) < step / 2 && at.y > prv.y + 1) return (prv.y + at.y) / 2;
  }
  if (head + 1 <= size) {
    const nxt = safeCoords(view, head + 1);
    if (Math.abs(nxt.x - colX) < step / 2 && nxt.y > at.y + 1) return at.y - (nxt.y - at.y) / 2;
  }
  return at.y;
}

/**
 * 行間移動（左右キー）。vertical-rl では次の列は左（x が小さい方）。
 * physical = -1（左キー）で次の列（前進）、+1（右キー）で前の列（後退）。
 *
 * - goal（開始時の行位置）を連続移動の間保持する：短い列（柱など）を跨いでも
 *   元の行の深さへ戻れる。
 * - ルビ付きの列は行送り（lineStep）より幅が広く 1 歩では隣列に届かないことが
 *   あるため、届くまで歩幅を段階的に広げる（最大 3 行送り）。
 */
export function moveBetweenLines(physical: 1 | -1): Command {
  return (state, dispatch, view) => {
    if (!view || composing(view)) return false;
    const head = state.selection.head;
    const c = safeCoords(view, head);
    const step = lineStep(view);
    const domTop = view.dom.getBoundingClientRect().top;
    const remembered = lineGoals.get(view);
    const goalY =
      remembered && remembered.head === head ? domTop + remembered.relY : rowSampleY(view, head, c.x, step);
    // ルビ付きの列は行送りより幅広、シーン境界は罫線分の余白が挟まるため、
    // 1 歩で届かなければ歩幅を広げて再試行する。escalation は内側から外へ
    // 向かうので、最初に見つかった異なる列＝最寄りの隣列。
    for (const mul of [1, 1.6, 2.2, 3]) {
      const targetX = c.x + physical * step * mul; // 左キー(physical<0)= x を減らす=次の列
      const found = view.posAtCoords({ left: targetX, top: goalY });
      if (!found) continue;
      const $p = state.doc.resolve(Math.max(0, Math.min(found.pos, state.doc.content.size)));
      const sel = Selection.near($p);
      if (sel.eq(state.selection)) continue;
      const landed = safeCoords(view, sel.head);
      // 進行方向の別の列に着地したか（同じ列や逆方向は歩幅不足・取りこぼし）
      if ((landed.x - c.x) * physical < step * 0.3) continue;
      if (dispatch) {
        dispatch(state.tr.setSelection(sel).scrollIntoView());
        lineGoals.set(view, { head: sel.head, relY: goalY - domTop });
      }
      return true;
    }
    // 隣の列が無い（文書の端の列）。ここで false を返すとブラウザ既定の
    // 縦書きキャレット処理 — まさに置き換え対象の壊れた挙動 — に落ちて
    // 文末へ飛ぶため、キーを消費して動かさない（Word の文書端と同じ感覚）。
    return true;
  };
}

/**
 * 縦書きのキャレットを可視領域へ収める（横スクロール追従）。
 * scrollIntoView() でおおむね追従するが、退化座標対策として明示スクロールも行う。
 */
export function scrollHeadIntoView(view: EditorView): void {
  const c = safeCoords(view, view.state.selection.head);
  // 実際にスクロールする要素は overflow-x:auto の .script-shell。
  // parentElement（.editor）は overflow を持たず scrollLeft への書き込みが no-op だった（レビュー m3）。
  const shell = (view.dom.closest('.script-shell') as HTMLElement | null) ?? view.dom.parentElement;
  if (!shell) return;
  const rect = shell.getBoundingClientRect();
  if (c.x < rect.left) shell.scrollLeft -= rect.left - c.x + 24;
  else if (c.x > rect.right) shell.scrollLeft += c.x - rect.right + 24;
}

/** セリフ選択を先頭ブロックへ寄せる等の TextSelection ユーティリティ。 */
export function selectPos(view: EditorView, pos: number): void {
  const $p = view.state.doc.resolve(Math.max(0, Math.min(pos, view.state.doc.content.size)));
  view.dispatch(view.state.tr.setSelection(new TextSelection($p)).scrollIntoView());
  view.focus();
}
