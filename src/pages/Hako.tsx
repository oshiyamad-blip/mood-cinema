import { useEffect, useRef, useState } from 'react';
import { useSeo } from '../lib/seo';
import { useI18n } from '../i18n';
import {
  STRUCTURES,
  STRUCTURE_IDS,
  uid,
  emptyOutline,
  loadOutline,
  saveOutline,
  clearOutline,
  outlineToText,
} from '../lib/hakogaki';
import type { Box, Outline, StructureId } from '../lib/hakogaki';

export default function Hako() {
  const { t, prefix, lang } = useI18n();

  useSeo({
    title: t.hako.title,
    description: t.hako.description,
    canonicalPath: `${prefix}/hako`,
    lang,
  });

  const [outline, setOutline] = useState<Outline>(() => emptyOutline());
  const [loaded, setLoaded] = useState(false);
  // トーストは通知だけの場合と「元に戻す」操作つきの場合がある
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const headingRefs = useRef(new Map<string, HTMLInputElement>());
  const focusBodyRef = useRef<HTMLTextAreaElement | null>(null);

  // 初回マウントで保存済みアウトラインを復元
  useEffect(() => {
    const saved = loadOutline();
    if (saved) setOutline(saved);
    setLoaded(true);
  }, []);

  // 変更を localStorage へ自動保存（初回復元後のみ）
  useEffect(() => {
    if (!loaded) return;
    saveOutline(outline);
  }, [outline, loaded]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // 箱を追加した直後、その見出し入力へフォーカスして続けて書けるようにする
  useEffect(() => {
    if (!focusId) return;
    headingRefs.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  // フォーカス執筆モード：開いている箱が変わったら本文の高さを内容に合わせる
  useEffect(() => {
    if (!openId) return;
    autoGrow(focusBodyRef.current);
  }, [openId]);

  // フォーカス執筆モード中は Esc で閉じ、背面スクロールを止める
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [openId]);

  // textarea を内容に合わせて自動で伸ばす（スマホで本文を書き切れるように）
  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  const setFocusBody = (el: HTMLTextAreaElement | null) => {
    focusBodyRef.current = el;
    autoGrow(el);
  };

  // 「元に戻す」つきのトーストは、うっかり見逃さないよう長め（6 秒）に出す
  const flash = (msg: string, undo?: () => void) => {
    setToast({ msg, undo });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), undo ? 6000 : 1800);
  };

  const patch = (p: Partial<Outline>) =>
    setOutline(prev => ({ ...prev, ...p, updated: Date.now() }));

  const acts = STRUCTURES[outline.structure].acts;

  const setStructure = (structure: StructureId) => {
    if (structure === outline.structure) return;
    const nextActs = STRUCTURES[structure].acts;
    // 箱は保持したまま、幕を新テンプレートに合わせて振り直す
    const boxes = outline.boxes.map(b =>
      nextActs.length === 0
        ? { ...b, act: '' }
        : nextActs.includes(b.act) ? b : { ...b, act: nextActs[0] },
    );
    patch({ structure, boxes });
  };

  const addBox = (act: string) => {
    const id = uid();
    patch({ boxes: [...outline.boxes, { id, act, heading: '', body: '' }] });
    setFocusId(id);
  };

  const updateBox = (id: string, p: Partial<Box>) =>
    patch({ boxes: outline.boxes.map(b => (b.id === id ? { ...b, ...p } : b)) });

  // 箱の削除は取り消せる：即座に消して「元に戻す」トーストを出す（設計理念：本文を静かに失わない）
  const deleteBox = (id: string) => {
    const idx = outline.boxes.findIndex(b => b.id === id);
    if (idx < 0) return;
    const removed = outline.boxes[idx];
    if (openId === id) setOpenId(null);
    patch({ boxes: outline.boxes.filter(b => b.id !== id) });
    flash(t.hako.deleted, () =>
      setOutline(prev => {
        if (prev.boxes.some(b => b.id === removed.id)) return prev; // 二重復元を防ぐ
        const boxes = [...prev.boxes];
        boxes.splice(Math.min(idx, boxes.length), 0, removed); // 元の位置へ差し戻す
        return { ...prev, boxes, updated: Date.now() };
      }),
    );
  };

  // 同じ幕に属する隣の箱と入れ替える
  const moveBox = (id: string, dir: -1 | 1) => {
    const boxes = [...outline.boxes];
    const i = boxes.findIndex(b => b.id === id);
    if (i < 0) return;
    const act = boxes[i].act;
    let j = i + dir;
    while (j >= 0 && j < boxes.length && boxes[j].act !== act) j += dir;
    if (j < 0 || j >= boxes.length) return;
    [boxes[i], boxes[j]] = [boxes[j], boxes[i]];
    patch({ boxes });
  };

  const exportLabels = {
    title: t.hako.exportTitleFallback,
    actLabel: (a: string) => t.hako.acts[a] ?? a,
    unassigned: t.hako.actUnassigned,
  };

  const copyText = async () => {
    const text = outlineToText(outline, exportLabels);
    try {
      await navigator.clipboard.writeText(text);
      flash(t.hako.copied);
    } catch {
      // クリップボード不可の環境ではフォールバックで選択させる
      window.prompt(t.hako.copy, text);
    }
  };

  const downloadText = () => {
    const text = outlineToText(outline, exportLabels);
    const name = (outline.title || t.hako.exportTitleFallback).replace(/[\\/:*?"<>|]/g, '_');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${name}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  const reset = () => {
    if (outline.boxes.length === 0 && !outline.title.trim()) return;
    if (!window.confirm(t.hako.resetConfirm)) return;
    const snapshot = outline; // 全消去も取り消せるよう、消す前の状態を控えておく
    clearOutline();
    setOutline(emptyOutline());
    setOpenId(null);
    flash(t.hako.resetDone, () => setOutline({ ...snapshot, updated: Date.now() }));
  };

  const renderBox = (box: Box, index: number, siblings: Box[]) => {
    const pos = siblings.findIndex(b => b.id === box.id);
    return (
      <div className="hako-box" key={box.id}>
        <span className="hako-box__num">{index}</span>
        <div className="hako-box__fields">
          <input
            ref={el => {
              if (el) headingRefs.current.set(box.id, el);
              else headingRefs.current.delete(box.id);
            }}
            className="hako-box__heading"
            type="text"
            value={box.heading}
            placeholder={t.hako.boxHeadingPlaceholder}
            onChange={e => updateBox(box.id, { heading: e.target.value })}
          />
          <textarea
            className="hako-box__body"
            value={box.body}
            placeholder={t.hako.boxBodyPlaceholder}
            rows={2}
            onChange={e => updateBox(box.id, { body: e.target.value })}
          />
        </div>
        <div className="hako-box__actions">
          <button
            type="button"
            className="hako-box__open"
            aria-label={t.hako.open}
            onClick={() => setOpenId(box.id)}
          >⤢</button>
          <button
            type="button"
            aria-label={t.hako.moveUp}
            disabled={pos <= 0}
            onClick={() => moveBox(box.id, -1)}
          >↑</button>
          <button
            type="button"
            aria-label={t.hako.moveDown}
            disabled={pos >= siblings.length - 1}
            onClick={() => moveBox(box.id, 1)}
          >↓</button>
          <button
            type="button"
            className="hako-box__del"
            aria-label={t.hako.delete}
            onClick={() => deleteBox(box.id)}
          >✕</button>
        </div>
      </div>
    );
  };

  // 幕ごと（自由構成なら 1 グループ）に箱をまとめる
  let counter = 0;
  const groups =
    acts.length === 0
      ? [{ act: '', boxes: outline.boxes }]
      : acts.map(act => ({ act, boxes: outline.boxes.filter(b => b.act === act) }));

  // フォーカス執筆モード用：表示順にならした箱の一覧（前後移動と通し番号に使う）
  const orderedBoxes: Box[] =
    acts.length === 0
      ? outline.boxes
      : acts.flatMap(act => outline.boxes.filter(b => b.act === act));
  const openBox = openId ? orderedBoxes.find(b => b.id === openId) : undefined;
  const openIndex = openBox ? orderedBoxes.findIndex(b => b.id === openBox.id) : -1;
  const openActLabel = openBox?.act ? (t.hako.acts[openBox.act] ?? openBox.act) : '';

  const gotoFocus = (dir: -1 | 1) => {
    const j = openIndex + dir;
    if (j < 0 || j >= orderedBoxes.length) return;
    setOpenId(orderedBoxes[j].id);
  };

  return (
    <div className="container hako-page">
      <div className="hako-header">
        <h1>{t.hako.heading}</h1>
        <p className="hako-header__sub">{t.hako.sub}</p>
      </div>

      <input
        className="hako-title-input"
        type="text"
        value={outline.title}
        placeholder={t.hako.titlePlaceholder}
        onChange={e => patch({ title: e.target.value })}
        aria-label={t.hako.titlePlaceholder}
      />

      <div className="hako-structures" role="group" aria-label={t.hako.structureLabel}>
        <span className="hako-structures__label">{t.hako.structureLabel}</span>
        {STRUCTURE_IDS.map(id => (
          <button
            key={id}
            type="button"
            className={`hako-struct-btn${outline.structure === id ? ' hako-struct-btn--on' : ''}`}
            aria-pressed={outline.structure === id}
            onClick={() => setStructure(id)}
          >
            {t.hako.structures[id]}
          </button>
        ))}
      </div>

      {outline.boxes.length === 0 && (
        <p className="hako-empty">{t.hako.empty}</p>
      )}

      {groups.map(group => (
        <section className="hako-act" key={group.act || 'free'}>
          {group.act && <h2 className="hako-act__label">{t.hako.acts[group.act] ?? group.act}</h2>}
          {group.boxes.map(box => renderBox(box, ++counter, group.boxes))}
          <button type="button" className="hako-add" onClick={() => addBox(group.act)}>
            {t.hako.addBox}
          </button>
        </section>
      ))}

      <div className="hako-footer">
        <span className="hako-meta">{t.hako.boxCount(outline.boxes.length)}</span>
        <div className="hako-export">
          <button type="button" className="btn btn--secondary" onClick={copyText}>{t.hako.copy}</button>
          <button type="button" className="btn btn--secondary" onClick={downloadText}>{t.hako.download}</button>
          <button type="button" className="hako-reset" onClick={reset}>{t.hako.reset}</button>
        </div>
      </div>

      {toast && (
        <div className="hako-toast" role="status">
          <span>{toast.msg}</span>
          {toast.undo && (
            <button
              type="button"
              className="hako-toast__undo"
              onClick={() => { toast.undo?.(); setToast(null); }}
            >
              {t.hako.undo}
            </button>
          )}
        </div>
      )}

      {openBox && (
        <div className="hako-focus" role="dialog" aria-modal="true" aria-label={t.hako.heading}>
          <div className="hako-focus__bar">
            <span className="hako-focus__pos">
              {openActLabel && <span className="hako-focus__act">{openActLabel}</span>}
              {openIndex + 1} / {orderedBoxes.length}
            </span>
            <button type="button" className="hako-focus__done" onClick={() => setOpenId(null)}>
              {t.hako.done}
            </button>
          </div>
          <div className="hako-focus__body">
            <input
              className="hako-focus__heading"
              type="text"
              value={openBox.heading}
              placeholder={t.hako.boxHeadingPlaceholder}
              onChange={e => updateBox(openBox.id, { heading: e.target.value })}
            />
            <textarea
              ref={setFocusBody}
              className="hako-focus__text"
              value={openBox.body}
              placeholder={t.hako.boxBodyPlaceholder}
              onChange={e => { updateBox(openBox.id, { body: e.target.value }); autoGrow(e.target); }}
              autoFocus
            />
          </div>
          <div className="hako-focus__nav">
            <button
              type="button"
              disabled={openIndex <= 0}
              onClick={() => gotoFocus(-1)}
            >{t.hako.prevBox}</button>
            <button
              type="button"
              disabled={openIndex >= orderedBoxes.length - 1}
              onClick={() => gotoFocus(1)}
            >{t.hako.nextBox}</button>
          </div>
        </div>
      )}
    </div>
  );
}
