/**
 * 脚本ビュー（hakogaki-app の縦書きエディタを移植）。
 * プロットの最上位の箱＝シーン。柱は box.heading と単一ソース。
 * 編集はデバウンスして applyDocToOutline で書き戻す（子箱・打刻には触れない）。
 */
import { useEffect, useRef } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { ScriptBlockType } from './schema';
import { buildKeymap, baseKeymap, setBlockType } from './keymap';
import { docFromOutline, applyDocToOutline } from './docSync';
import type { Outline } from '../lib/hakogaki';
import { useI18n } from '../i18n';

interface Props {
  outline: Outline;
  onApply: (next: Outline) => void;
}

export default function ScriptEditor({ outline, onApply }: Props) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const outlineRef = useRef(outline);
  useEffect(() => { outlineRef.current = outline; }, [outline]);

  // 作品が変わった時だけ doc を作り直す（打っている最中に上書きしない）
  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: docFromOutline(outlineRef.current),
      plugins: [history(), buildKeymap(true), keymap(baseKeymap)],
    });
    const flush = (view: EditorView) => {
      window.clearTimeout(timer.current);
      const next = applyDocToOutline(view.state.doc, outlineRef.current);
      if (next !== outlineRef.current) onApply(next);
    };
    const view = new EditorView(hostRef.current, {
      state,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);
        if (tr.docChanged) {
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => flush(view), 600);
        }
      },
    });
    viewRef.current = view;
    // E2E・デバッグ用（hakogaki-app と同じ流儀）
    (window as unknown as { __pmView?: EditorView }).__pmView = view;
    return () => {
      flush(view); // 画面を離れるときに書きかけを取りこぼさない
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outline.id]);

  const apply = (type: ScriptBlockType) => {
    const view = viewRef.current;
    if (!view) return;
    setBlockType(type)(view.state, view.dispatch, view);
    view.focus();
  };

  return (
    <div className="script">
      <div className="script__bar">
        <button type="button" className="script__type" onClick={() => apply('hashira')}>{t.hako.scriptHashira}</button>
        <button type="button" className="script__type" onClick={() => apply('togaki')}>{t.hako.scriptTogaki}</button>
        <button type="button" className="script__type" onClick={() => apply('serifu')}>{t.hako.scriptSerifu}</button>
        <span className="script__hint">{t.hako.scriptHint}</span>
      </div>
      <div className="script-shell">
        <div ref={hostRef} className="script-editor" />
      </div>
    </div>
  );
}
