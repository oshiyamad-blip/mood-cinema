/**
 * 脚本ビューのキーマップ（hakogaki-app から移植・簡素化）。
 * Enter=同種のブロックを続ける／Tab=ト書き⇄セリフ／Mod-1..3=柱・ト書き・セリフ／
 * Alt+↑↓=シーン間ジャンプ／縦書き時は矢印を再マップ。
 */
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, chainCommands } from 'prosemirror-commands';
import { undo, redo } from 'prosemirror-history';
import { TextSelection } from 'prosemirror-state';
import type { Command, Plugin } from 'prosemirror-state';
import { schema } from './schema';
import type { ScriptBlockType } from './schema';
import { moveInLine, moveBetweenLines } from './verticalMotion';

/** キャレットのある block の type。block 外なら null。 */
function currentType(state: Parameters<Command>[0]): ScriptBlockType | null {
  const $f = state.selection.$from;
  for (let d = $f.depth; d > 0; d -= 1) {
    const n = $f.node(d);
    if (n.type === schema.nodes.block) return n.attrs.type as ScriptBlockType;
  }
  return null;
}

/** 選択範囲の block の type を書き換える。 */
export function setBlockType(type: ScriptBlockType): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const tr = state.tr;
    let changed = false;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === schema.nodes.block && node.attrs.type !== type) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, type });
        changed = true;
      }
    });
    if (!changed) return false;
    if (dispatch) dispatch(tr);
    return true;
  };
}

/**
 * Enter：block を割って続きを書く。柱で押したときは次をト書きにする
 * （柱を連打することはまず無く、柱→本文が自然な流れのため）。
 */
const splitScriptBlock: Command = (state, dispatch) => {
  const cur = currentType(state);
  if (cur === null) return false;
  const tr = state.tr.deleteSelection();
  const $from = tr.selection.$from;
  if (!tr.doc.resolve($from.pos).parent.type.spec.content?.includes('text')) return false;
  tr.split($from.pos, 1, [
    { type: schema.nodes.block, attrs: { type: cur === 'hashira' ? 'togaki' : cur, speaker: null } },
  ]);
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};

/** シーン間ジャンプ。 */
export function jumpToAdjacentScene(dir: -1 | 1): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const target = $from.index(0) + dir;
    if (target < 0 || target >= state.doc.childCount) return false;
    let offset = 0;
    for (let k = 0; k < target; k += 1) offset += state.doc.child(k).nodeSize;
    if (dispatch) {
      const sel = TextSelection.near(state.doc.resolve(offset + 1));
      dispatch(state.tr.setSelection(sel).scrollIntoView());
    }
    return true;
  };
}

/**
 * Home / End：いまいる block の先頭・末尾へ。
 * 縦書き（vertical-rl）ではブラウザ標準の Home/End が視覚行の解釈を誤って
 * 文書先頭へ飛んでしまうため、論理的な行頭・行末に明示的に束縛する。
 */
function toBlockEdge(end: boolean): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    if (!$from.parent.isTextblock) return false;
    const pos = end ? $from.end() : $from.start();
    if (dispatch) {
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView());
    }
    return true;
  };
}

export function buildKeymap(vertical: boolean): Plugin {
  // Tab：ト書き⇄セリフをワンキーで反転（柱にいるときはセリフへ）。
  const toggleTogakiSerifu: Command = (state, dispatch, view) => {
    const cur = currentType(state);
    if (cur === null) return false;
    return setBlockType(cur === 'serifu' ? 'togaki' : 'serifu')(state, dispatch, view);
  };

  const bindings: Record<string, Command> = {
    Enter: chainCommands(splitScriptBlock, baseKeymap.Enter),
    'Mod-z': undo,
    'Mod-y': redo,
    'Shift-Mod-z': redo,
    Tab: toggleTogakiSerifu,
    'Shift-Tab': toggleTogakiSerifu,
    'Mod-1': setBlockType('hashira'),
    'Mod-2': setBlockType('togaki'),
    'Mod-3': setBlockType('serifu'),
    'Alt-ArrowUp': jumpToAdjacentScene(-1),
    'Alt-ArrowDown': jumpToAdjacentScene(1),
  };
  if (vertical) {
    bindings.ArrowUp = moveInLine(-1);
    bindings.ArrowDown = moveInLine(1);
    bindings.ArrowLeft = moveBetweenLines(-1);
    bindings.ArrowRight = moveBetweenLines(1);
    bindings.Home = toBlockEdge(false);
    bindings.End = toBlockEdge(true);
  }
  return keymap(bindings);
}

export { baseKeymap };
