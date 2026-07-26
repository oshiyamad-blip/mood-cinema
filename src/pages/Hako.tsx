import { useEffect, useMemo, useRef, useState } from 'react';
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
  parseOutlineText,
  formatTimecode,
  moveBoxAcross,
  setBoxAct,
  orderedBoxes,
} from '../lib/hakogaki';
import type { Box, Outline, ParsedItem, StructureId, Workspace } from '../lib/hakogaki';

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
  // ── 逆ハコ（テキスト → 箱）の取り込みダイアログ ──
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'new' | 'append'>('new');
  const parsed = useMemo(() => parseOutlineText(importText), [importText]);

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

  // 取り込みダイアログは Esc で閉じる
  useEffect(() => {
    if (!importOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setImportOpen(false); setImportText(''); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [importOpen]);

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
  // ↑↓ は幕の境目を越える（境目で押すと隣の幕へ移る）
  const moveBox = (id: string, dir: -1 | 1) => {
    patchOutline(o => {
      const boxes = moveBoxAcross(o.boxes, o.structure, id, dir);
      return boxes === o.boxes ? o : { ...o, boxes, updated: Date.now() };
    });
  };

  // 幕を直接指定して移す（離れた幕へ一度で動かす用）
  const changeBoxAct = (id: string, act: string) => {
    patchOutline(o => {
      const boxes = setBoxAct(o.boxes, o.structure, id, act);
      return boxes === o.boxes ? o : { ...o, boxes, updated: Date.now() };
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

  // ── 逆ハコ：解析結果を箱へ変換して取り込む（既存データは一切書き換えない）──
  // 書き出しの幕見出し（ラベル）から幕 ID を引き直すための逆引き表
  const actIdByLabel = useMemo(() => {
    const m = new Map<string, string>();
    Object.entries(t.hako.acts).forEach(([id, label]) => m.set(label, id));
    return m;
  }, [t]);

  /** 幕ラベルから構成テンプレートを推定（自前の書き出しを読み戻すと元の構成に戻る）。 */
  const detectStructure = (items: ParsedItem[]): StructureId | null => {
    const ids = [...new Set(items.map(i => i.actLabel).filter(Boolean) as string[])]
      .map(l => actIdByLabel.get(l))
      .filter(Boolean) as string[];
    if (ids.length === 0) return null;
    for (const sid of STRUCTURE_IDS) {
      const acts = STRUCTURES[sid].acts;
      if (acts.length > 0 && ids.every(id => acts.includes(id))) return sid;
    }
    return null;
  };

  const buildBoxes = (structure: StructureId, items: ParsedItem[]): Box[] => {
    const acts = STRUCTURES[structure].acts;
    return items.map(it => {
      const mapped = it.actLabel ? actIdByLabel.get(it.actLabel) : undefined;
      const act = acts.length === 0 ? '' : (mapped && acts.includes(mapped) ? mapped : acts[0]);
      return { id: uid(), act, heading: it.heading, body: it.body };
    });
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportText('');
  };

  const runImport = () => {
    const items = parsed.items;
    if (items.length === 0) return;
    if (importMode === 'new') {
      // 新しい作品として追加（既存作品には触れない）
      const structure = detectStructure(items) ?? 'free';
      const fresh: Outline = {
        id: uid(),
        title: parsed.title,
        structure,
        boxes: buildBoxes(structure, items),
        updated: Date.now(),
      };
      setWs(prev => ({ currentId: fresh.id, outlines: [...prev.outlines, fresh] }));
      // 取り消しはゴミ箱行き（＝復元可能）。完全削除はしない。
      flash(t.hako.importDone(items.length), () => setWs(prev => trashProject(prev, fresh.id)));
    } else {
      if (!outline) return;
      const oid = outline.id;
      const added = buildBoxes(outline.structure, items);
      const addedIds = new Set(added.map(b => b.id));
      patchOutline(o => ({ ...o, boxes: [...o.boxes, ...added], updated: Date.now() }));
      // 取り消しは「今足した箱だけ」を戻す（元からあった箱には触れない）
      flash(t.hako.importDone(items.length), () =>
        setWs(prev => {
          const cur = prev.outlines.find(o => o.id === oid);
          if (!cur) return prev;
          return upsertOutline(prev, {
            ...cur,
            boxes: cur.boxes.filter(b => !addedIds.has(b.id)),
            updated: Date.now(),
          });
        }),
      );
    }
    closeImport();
  };

  const pickImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // 同じファイルを選び直せるように
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result ?? ''));
    reader.readAsText(f);
  };

  // index は作品全体の通し番号（1 始まり）。↑↓ は幕を越えるので端の判定も全体で行い、
  // 隣の幕が空でもそこへ入れる（＝前後に幕が残っていれば押せる）。
  const renderBox = (box: Box, index: number, total: number, boxActs: string[]) => {
    const actIdx = boxActs.indexOf(box.act);
    const canUp = index > 1 || actIdx > 0;
    const canDown = index < total || (actIdx >= 0 && actIdx < boxActs.length - 1);
    return (
      <div className="hako-box" key={box.id}>
        <span className="hako-box__num">
          {index}
          {/* 逆ハコで起こした箱は、作品内での位置（打刻時刻）を添える */}
          {typeof box.at === 'number' && (
            <span className="hako-box__at">{formatTimecode(box.at)}</span>
          )}
        </span>
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
          {/* 離れた幕へは一度で移せるように（↑↓ は隣の幕まで） */}
          {boxActs.length > 0 && (
            <select
              className="hako-box__act"
              aria-label={t.hako.moveToAct}
              value={box.act}
              onChange={e => changeBoxAct(box.id, e.target.value)}
            >
              {boxActs.map(a => (
                <option key={a} value={a}>{t.hako.actsShort[a] ?? a}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="hako-box__open"
            aria-label={t.hako.open}
            onClick={() => setOpenId(box.id)}
          >⤢</button>
          <button
            type="button"
            aria-label={t.hako.moveUp}
            disabled={!canUp}
            onClick={() => moveBox(box.id, -1)}
          >↑</button>
          <button
            type="button"
            aria-label={t.hako.moveDown}
            disabled={!canDown}
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

  // 表示順にならした箱の一覧（フォーカス執筆の前後移動・通し番号・端の判定に使う）
  const ordered: Box[] = orderedBoxes(outline.boxes, outline.structure);
  const openBox = openId ? ordered.find(b => b.id === openId) : undefined;
  const openIndex = openBox ? ordered.findIndex(b => b.id === openBox.id) : -1;
  const openActLabel = openBox?.act ? (t.hako.acts[openBox.act] ?? openBox.act) : '';

  const gotoFocus = (dir: -1 | 1) => {
    const j = openIndex + dir;
    if (j < 0 || j >= ordered.length) return;
    setOpenId(ordered[j].id);
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
          {group.boxes.map(box => renderBox(box, ++counter, ordered.length, acts))}
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
          <button type="button" className="btn btn--secondary" onClick={() => setImportOpen(true)}>{t.hako.importBtn}</button>
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

      {importOpen && (
        <div className="hako-import" role="dialog" aria-modal="true" aria-label={t.hako.importTitle}>
          <div className="hako-import__panel">
            <h2 className="hako-import__title">{t.hako.importTitle}</h2>
            <p className="hako-import__help">{t.hako.importHelp}</p>

            <textarea
              className="hako-import__text"
              value={importText}
              placeholder={t.hako.importPlaceholder}
              onChange={e => setImportText(e.target.value)}
              autoFocus
            />

            <div className="hako-import__row">
              <label className="hako-import__file">
                {t.hako.importFile}
                <input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={pickImportFile} hidden />
              </label>
              <span className="hako-import__count">
                {parsed.items.length > 0 ? t.hako.importDetected(parsed.items.length) : t.hako.importNone}
              </span>
            </div>

            {parsed.items.length > 0 && (
              <ol className="hako-import__preview">
                {parsed.items.slice(0, 8).map((it, i) => (
                  <li key={i}>{it.heading || '—'}</li>
                ))}
                {parsed.items.length > 8 && <li className="hako-import__more">… {parsed.items.length - 8}</li>}
              </ol>
            )}

            <div className="hako-import__modes" role="group" aria-label={t.hako.importTitle}>
              <button
                type="button"
                className={`hako-import__mode${importMode === 'new' ? ' hako-import__mode--on' : ''}`}
                aria-pressed={importMode === 'new'}
                onClick={() => setImportMode('new')}
              >{t.hako.importModeNew}</button>
              <button
                type="button"
                className={`hako-import__mode${importMode === 'append' ? ' hako-import__mode--on' : ''}`}
                aria-pressed={importMode === 'append'}
                onClick={() => setImportMode('append')}
              >{t.hako.importModeAppend}</button>
            </div>

            <div className="hako-import__actions">
              <button type="button" className="hako-import__cancel" onClick={closeImport}>{t.hako.importCancel}</button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={parsed.items.length === 0}
                onClick={runImport}
              >{t.hako.importRun}</button>
            </div>
          </div>
        </div>
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
