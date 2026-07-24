import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeo } from '../lib/seo';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { fullSync, pushOutlines, deleteRemote } from '../lib/cloudSync';
import {
  STRUCTURES,
  STRUCTURE_IDS,
  uid,
  loadWorkspace,
  saveWorkspace,
  listProjects,
  listTrashed,
  currentOutline,
  upsertOutline,
  createProject,
  switchProject,
  trashProject,
  restoreProject,
  purgeProject,
  outlineToText,
} from '../lib/hakogaki';
import type { Box, Outline, StructureId, Workspace } from '../lib/hakogaki';

const BANNER_KEY = 'mc:hako:syncBannerDismissed';

export default function Hako() {
  const { t, prefix, lang } = useI18n();
  const { user, configured } = useAuth();

  useSeo({
    title: t.hako.title,
    description: t.hako.description,
    canonicalPath: `${prefix}/hako`,
    lang,
  });

  const [ws, setWs] = useState<Workspace>(() => ({ currentId: null, outlines: [] }));
  const [loaded, setLoaded] = useState(false);
  // トーストは通知だけの場合と「元に戻す」操作つきの場合がある
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const headingRefs = useRef(new Map<string, HTMLInputElement>());
  const focusBodyRef = useRef<HTMLTextAreaElement | null>(null);

  // ── クラウド同期（ログイン中のみ。未設定/未ログインでは何も起きない）──
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try { return localStorage.getItem(BANNER_KEY) === '1'; } catch { return false; }
  });
  const wsRef = useRef(ws);
  const pushTimer = useRef<number | undefined>(undefined);
  const lastPushed = useRef<Map<string, number>>(new Map()); // id→updated（送信済みの基準）
  const mergeApplying = useRef(false); // マージ結果の setWs 由来では push しない
  useEffect(() => { wsRef.current = ws; }, [ws]);

  // 初回マウントで保存済みワークスペースを復元（旧単一作品は自動移行）。
  // 現在作品が無ければ、生きている最新作品へ切替 or 空の作品を1件用意する。
  useEffect(() => {
    let w = loadWorkspace();
    if (!currentOutline(w)) {
      const alive = listProjects(w);
      w = alive.length > 0 ? switchProject(w, alive[0].id) : createProject(w).workspace;
    }
    setWs(w);
    setLoaded(true);
  }, []);

  // 変更を localStorage へ自動保存（初回復元後のみ）
  useEffect(() => {
    if (!loaded) return;
    saveWorkspace(ws);
  }, [ws, loaded]);

  // ログイン時・タブ復帰時に pull→マージ→差分push（ローカルは真実の源のまま）
  useEffect(() => {
    if (!loaded || !configured || !user) { setSyncState('idle'); return; }
    let cancelled = false;
    const run = async () => {
      setSyncState('syncing');
      try {
        const res = await fullSync(wsRef.current);
        if (cancelled) return;
        if (!res) { setSyncState('idle'); return; }
        if (res.changed) { mergeApplying.current = true; setWs(res.workspace); }
        res.workspace.outlines.forEach((o) => lastPushed.current.set(o.id, o.updated));
        setSyncState('synced');
      } catch {
        if (!cancelled) setSyncState('error'); // 失敗してもローカルは無傷
      }
    };
    run();
    const onFocus = () => { if (!document.hidden) run(); };
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
  }, [loaded, configured, user]);

  // 編集のたび、変わった作品だけを 2 秒デバウンスで push
  useEffect(() => {
    if (!loaded || !configured || !user) return;
    if (mergeApplying.current) { mergeApplying.current = false; return; } // マージ適用由来は送らない
    const changed = ws.outlines.filter((o) => lastPushed.current.get(o.id) !== o.updated);
    if (changed.length === 0) return;
    window.clearTimeout(pushTimer.current);
    setSyncState('syncing');
    pushTimer.current = window.setTimeout(async () => {
      try {
        await pushOutlines(changed);
        changed.forEach((o) => lastPushed.current.set(o.id, o.updated));
        setSyncState('synced');
      } catch {
        setSyncState('error');
      }
    }, 2000);
  }, [ws, loaded, configured, user]);
  useEffect(() => () => window.clearTimeout(pushTimer.current), []);

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

  const outline = currentOutline(ws);
  const projects = listProjects(ws);
  const trashed = listTrashed(ws);

  // 現在作品を不変更新する（本文編集はすべてここを通す）
  const patchOutline = (updater: (o: Outline) => Outline) =>
    setWs(prev => {
      const cur = currentOutline(prev);
      return cur ? upsertOutline(prev, updater(cur)) : prev;
    });
  const patch = (p: Partial<Outline>) =>
    patchOutline(o => ({ ...o, ...p, updated: Date.now() }));

  // ── 作品（プロジェクト）操作 ──────────────────────────────
  const newProject = () => setWs(prev => createProject(prev).workspace);
  const selectProject = (id: string) => setWs(prev => switchProject(prev, id));

  const deleteCurrentProject = () => {
    if (!outline) return;
    const oid = outline.id;
    setWs(prev => {
      let next = trashProject(prev, oid);
      // 最後の1件を消したら、常に書ける状態を保つため空の作品を用意
      if (!currentOutline(next)) next = createProject(next).workspace;
      return next;
    });
    setOpenId(null);
    flash(t.hako.projectTrashed, () =>
      setWs(prev => switchProject(restoreProject(prev, oid), oid)),
    );
  };

  const restoreFromTrash = (id: string) =>
    setWs(prev => switchProject(restoreProject(prev, id), id));

  const purgeFromTrash = (id: string) => {
    if (!window.confirm(t.hako.purgeConfirm)) return;
    setWs(prev => purgeProject(prev, id));
    lastPushed.current.delete(id);
    // サーバの行も消す（消さないと次回 pull で復活する）。オフライン時は best-effort。
    if (user) deleteRemote([id]).catch(() => undefined);
  };

  const dismissBanner = () => {
    setBannerDismissed(true);
    try { localStorage.setItem(BANNER_KEY, '1'); } catch { /* ignore */ }
  };

  // ── 箱（シーン）操作 ──────────────────────────────────────
  const setStructure = (structure: StructureId) => {
    if (!outline || structure === outline.structure) return;
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
    if (!outline) return;
    const id = uid();
    patch({ boxes: [...outline.boxes, { id, act, heading: '', body: '' }] });
    setFocusId(id);
  };

  const updateBox = (id: string, p: Partial<Box>) =>
    patchOutline(o => ({ ...o, boxes: o.boxes.map(b => (b.id === id ? { ...b, ...p } : b)), updated: Date.now() }));

  // 箱の削除は取り消せる：即座に消して「元に戻す」トーストを出す（設計理念：本文を静かに失わない）
  const deleteBox = (id: string) => {
    if (!outline) return;
    const oid = outline.id;
    const idx = outline.boxes.findIndex(b => b.id === id);
    if (idx < 0) return;
    const removed = outline.boxes[idx];
    if (openId === id) setOpenId(null);
    patchOutline(o => ({ ...o, boxes: o.boxes.filter(b => b.id !== id), updated: Date.now() }));
    flash(t.hako.deleted, () =>
      setWs(prev => {
        const cur = prev.outlines.find(o => o.id === oid);
        if (!cur || cur.boxes.some(b => b.id === removed.id)) return prev; // 二重復元を防ぐ
        const boxes = [...cur.boxes];
        boxes.splice(Math.min(idx, boxes.length), 0, removed); // 元の位置へ差し戻す
        return upsertOutline(prev, { ...cur, boxes, updated: Date.now() });
      }),
    );
  };

  // 同じ幕に属する隣の箱と入れ替える
  const moveBox = (id: string, dir: -1 | 1) => {
    patchOutline(o => {
      const boxes = [...o.boxes];
      const i = boxes.findIndex(b => b.id === id);
      if (i < 0) return o;
      const act = boxes[i].act;
      let j = i + dir;
      while (j >= 0 && j < boxes.length && boxes[j].act !== act) j += dir;
      if (j < 0 || j >= boxes.length) return o;
      [boxes[i], boxes[j]] = [boxes[j], boxes[i]];
      return { ...o, boxes, updated: Date.now() };
    });
  };

  const exportLabels = {
    title: t.hako.exportTitleFallback,
    actLabel: (a: string) => t.hako.acts[a] ?? a,
    unassigned: t.hako.actUnassigned,
  };

  const copyText = async () => {
    if (!outline) return;
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
    if (!outline) return;
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

  // 現在作品の中身だけを空にする（作品自体は残す）。取り消し可能。
  const reset = () => {
    if (!outline) return;
    if (outline.boxes.length === 0 && !outline.title.trim()) return;
    if (!window.confirm(t.hako.resetConfirm)) return;
    const snapshot = outline; // 消す前の状態を控えておく
    patchOutline(o => ({ ...o, title: '', structure: 'three-act', boxes: [], updated: Date.now() }));
    setOpenId(null);
    flash(t.hako.resetDone, () => setWs(prev => upsertOutline(prev, { ...snapshot, updated: Date.now() })));
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

  // 復元前・ロード前は最小限だけ描画する（現在作品が確定してから本体を出す）
  if (!outline) {
    return (
      <div className="container hako-page">
        <div className="hako-header">
          <h1>{t.hako.heading}</h1>
          <p className="hako-header__sub">{t.hako.sub}</p>
        </div>
      </div>
    );
  }

  const acts = STRUCTURES[outline.structure].acts;

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

      {configured && !user && !bannerDismissed && (
        <div className="hako-syncbanner">
          <span>{t.hako.syncBanner}</span>
          <Link to={`${prefix}/account`} className="hako-syncbanner__cta">{t.hako.syncBannerCta}</Link>
          <button
            type="button"
            className="hako-syncbanner__x"
            aria-label={t.hako.syncBannerDismiss}
            onClick={dismissBanner}
          >×</button>
        </div>
      )}

      <div className="hako-projects" role="group" aria-label={t.hako.projectLabel}>
        <label className="hako-projects__pick">
          <span className="hako-projects__label">{t.hako.projectLabel}</span>
          <select
            className="hako-projects__select"
            value={outline.id}
            onChange={e => selectProject(e.target.value)}
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.title || t.hako.exportTitleFallback}</option>
            ))}
          </select>
        </label>
        <button type="button" className="hako-projects__new" onClick={newProject}>
          {t.hako.newProject}
        </button>
        {projects.length > 1 && (
          <button type="button" className="hako-projects__del" onClick={deleteCurrentProject}>
            {t.hako.deleteProject}
          </button>
        )}
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
        {configured && user && (
          <span className={`hako-sync hako-sync--${syncState}`}>
            {syncState === 'syncing'
              ? t.hako.syncSyncing
              : syncState === 'error'
                ? t.hako.syncError
                : t.hako.syncSynced}
          </span>
        )}
        <div className="hako-export">
          <button type="button" className="btn btn--secondary" onClick={copyText}>{t.hako.copy}</button>
          <button type="button" className="btn btn--secondary" onClick={downloadText}>{t.hako.download}</button>
          <button type="button" className="hako-reset" onClick={reset}>{t.hako.reset}</button>
        </div>
      </div>

      {trashed.length > 0 && (
        <details className="hako-trash">
          <summary className="hako-trash__summary">{t.hako.trashTitle(trashed.length)}</summary>
          {trashed.map(tp => (
            <div className="hako-trash__row" key={tp.id}>
              <span className="hako-trash__name">{tp.title || t.hako.exportTitleFallback}</span>
              <button type="button" className="hako-trash__restore" onClick={() => restoreFromTrash(tp.id)}>
                {t.hako.restore}
              </button>
              <button type="button" className="hako-trash__purge" onClick={() => purgeFromTrash(tp.id)}>
                {t.hako.purge}
              </button>
            </div>
          ))}
        </details>
      )}

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
