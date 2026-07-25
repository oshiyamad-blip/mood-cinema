import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSeo } from '../lib/seo';
import { useI18n } from '../i18n';
import { searchMovies, getMovieRuntime, posterUrl, TmdbConfigError } from '../lib/tmdb';
import type { TmdbMovie } from '../lib/tmdb';
import {
  uid,
  formatTimecode,
  parseTimecode,
  loadWorkspace,
  saveWorkspace,
} from '../lib/hakogaki';
import type { Box, FilmRef, Outline } from '../lib/hakogaki';

/** 観ながらの打刻セッション。リロードで消えないよう localStorage に常時保存する。 */
interface Session {
  film: FilmRef | null;
  startedAt: number | null; // 計測中なら再開時刻(epoch ms)、停止中は null
  accumulated: number;      // 停止までに貯まった秒数
  scenes: { id: string; at: number; heading: string; body: string }[];
}

const SESSION_KEY = 'mc:gyaku:session';

function emptySession(): Session {
  return { film: null, startedAt: null, accumulated: 0, scenes: [] };
}

function loadSession(): Session {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return emptySession();
    const s = JSON.parse(raw) as Session;
    if (!s || !Array.isArray(s.scenes)) return emptySession();
    return {
      film: s.film ?? null,
      startedAt: typeof s.startedAt === 'number' ? s.startedAt : null,
      accumulated: typeof s.accumulated === 'number' ? s.accumulated : 0,
      scenes: s.scenes,
    };
  } catch {
    return emptySession();
  }
}

function saveSession(s: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* quota / プライベートモードは無視 */
  }
}

/** 経過秒。計測中なら再開時刻からの実時間を足す（リロードしてもズレない）。 */
function elapsedOf(s: Session): number {
  return s.accumulated + (s.startedAt ? (Date.now() - s.startedAt) / 1000 : 0);
}

export default function Gyaku() {
  const { t, prefix, lang } = useI18n();
  const navigate = useNavigate();

  useSeo({
    title: t.gyaku.title,
    description: t.gyaku.description,
    canonicalPath: `${prefix}/gyaku`,
    lang,
  });

  const [session, setSession] = useState<Session>(() => emptySession());
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(0); // 表示更新のためのティック
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TmdbMovie[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');
  const [tcDrafts, setTcDrafts] = useState<Record<string, string>>({}); // 時刻を打ち直している最中の値
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const headingRefs = useRef(new Map<string, HTMLInputElement>());
  const focusId = useRef<string | null>(null);

  // 中断していたセッションを復元（観ている途中でリロードしても失わない）
  useEffect(() => {
    setSession(loadSession());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveSession(session);
  }, [session, loaded]);

  // 計測中だけ 1 秒ごとに再描画する
  useEffect(() => {
    if (!session.startedAt) return;
    const id = window.setInterval(() => setNow(n => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [session.startedAt]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // 打刻直後、その見出し入力へフォーカス（観ながら即タイプできるように）
  useEffect(() => {
    if (!focusId.current) return;
    headingRefs.current.get(focusId.current)?.focus();
    focusId.current = null;
  }, [session.scenes.length]);

  const flash = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 1800);
  };

  const elapsed = elapsedOf(session);
  void now; // ティックで再評価させるためだけに参照する
  const running = session.startedAt !== null;
  const runtimeSec = session.film?.runtime ? session.film.runtime * 60 : 0;
  const progress = runtimeSec > 0 ? Math.min(100, (elapsed / runtimeSec) * 100) : 0;

  // ── 作品選び ────────────────────────────────────────────────
  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchErr('');
    try {
      const list = await searchMovies(query, t.tmdbLanguage);
      setResults(list.slice(0, 8));
      if (list.length === 0) setSearchErr(t.gyaku.searchEmpty);
    } catch (err) {
      // トークン未設定でも手入力で使えるので、機能自体は止めない
      setSearchErr(err instanceof TmdbConfigError ? t.gyaku.searchUnavailable : t.gyaku.searchError);
    } finally {
      setSearching(false);
    }
  };

  const chooseFilm = async (m: TmdbMovie) => {
    const film: FilmRef = {
      tmdbId: m.id,
      title: m.title,
      year: m.release_date ? m.release_date.slice(0, 4) : undefined,
      posterPath: m.poster_path,
    };
    setSession(s => ({ ...s, film }));
    setResults([]);
    setQuery('');
    const runtime = await getMovieRuntime(m.id, t.tmdbLanguage); // 尺は取れたら足す
    if (runtime) setSession(s => (s.film ? { ...s, film: { ...s.film, runtime } } : s));
  };

  const chooseManual = () => {
    const title = query.trim();
    if (!title) return;
    setSession(s => ({ ...s, film: { title } }));
    setResults([]);
    setQuery('');
  };

  // ── 計測 ────────────────────────────────────────────────────
  const toggleTimer = () =>
    setSession(s =>
      s.startedAt
        ? { ...s, accumulated: elapsedOf(s), startedAt: null }
        : { ...s, startedAt: Date.now() },
    );

  /** 打刻位置の微調整（早すぎた/遅すぎた分をまとめてずらす）。 */
  const nudge = (delta: number) =>
    setSession(s => {
      const next = Math.max(0, elapsedOf(s) + delta);
      return { ...s, accumulated: next, startedAt: s.startedAt ? Date.now() : null };
    });

  // ── シーンの打刻 ────────────────────────────────────────────
  // 打刻＝「映画を止めてメモを取る」瞬間なので、計測も一緒に止める。
  // こうしないとメモを書いている間だけ時間が進み、以降の時刻が全部ずれる。
  const capture = useCallback(() => {
    setSession(s => {
      const id = uid();
      focusId.current = id;
      const at = Math.round(elapsedOf(s));
      return {
        ...s,
        accumulated: at,
        startedAt: null,
        scenes: [...s.scenes, { id, at, heading: '', body: '' }],
      };
    });
  }, []);

  // Space / Enter で打刻（入力中は邪魔しない）
  useEffect(() => {
    if (!session.film) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') { e.preventDefault(); capture(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session.film, capture]);

  const updateScene = (id: string, patch: Partial<{ heading: string; body: string; at: number }>) =>
    setSession(s => ({ ...s, scenes: s.scenes.map(x => (x.id === id ? { ...x, ...patch } : x)) }));

  const removeScene = (id: string) =>
    setSession(s => ({ ...s, scenes: s.scenes.filter(x => x.id !== id) }));

  /** 時刻の打ち直しを確定する。読めない入力は元の値に戻すだけで、メモは触らない。 */
  const commitTimecode = (id: string) => {
    const draft = tcDrafts[id];
    setTcDrafts(d => {
      const { [id]: _drop, ...rest } = d;
      void _drop;
      return rest;
    });
    if (draft === undefined) return;
    const sec = parseTimecode(draft);
    if (sec !== null) updateScene(id, { at: sec });
  };

  // ── 保存：ワークスペースへ作品として書き出す ────────────────
  const scenesSorted = useMemo(
    () => [...session.scenes].sort((a, b) => a.at - b.at),
    [session.scenes],
  );

  const saveAsProject = () => {
    if (scenesSorted.length === 0) return;
    // 幕には振らない：観たままの並びを time 順のフラットな箱として残す（構成は後で決められる）
    const boxes: Box[] = scenesSorted.map(sc => ({
      id: uid(),
      act: '',
      heading: sc.heading,
      body: sc.body,
      at: sc.at,
    }));

    const outline: Outline = {
      id: uid(),
      title: session.film?.title ? t.gyaku.projectTitle(session.film.title) : t.gyaku.projectTitleFallback,
      structure: 'free',
      boxes,
      updated: Date.now(),
      film: session.film ?? undefined,
    };
    // 既存のワークスペースには足すだけ（他の作品には触れない）
    const ws = loadWorkspace();
    saveWorkspace({ currentId: outline.id, outlines: [...ws.outlines, outline] });
    localStorage.removeItem(SESSION_KEY);
    navigate(`${prefix}/hako`);
  };

  const discard = () => {
    if (!window.confirm(t.gyaku.discardConfirm)) return;
    localStorage.removeItem(SESSION_KEY);
    setSession(emptySession());
    flash(t.gyaku.discarded);
  };

  // ── 作品未選択：セットアップ画面 ────────────────────────────
  if (!session.film) {
    return (
      <div className="container gyaku">
        <h1 className="gyaku__h1">{t.gyaku.heading}</h1>
        <p className="gyaku__lede">{t.gyaku.lede}</p>

        <form className="gyaku__search" onSubmit={runSearch}>
          <input
            className="gyaku__searchinput"
            type="text"
            value={query}
            placeholder={t.gyaku.searchPlaceholder}
            onChange={e => setQuery(e.target.value)}
            aria-label={t.gyaku.searchPlaceholder}
          />
          <button type="submit" className="btn btn--primary" disabled={searching || !query.trim()}>
            {searching ? t.gyaku.searching : t.gyaku.search}
          </button>
        </form>

        {searchErr && <p className="gyaku__err">{searchErr}</p>}

        {results.length > 0 && (
          <ul className="gyaku__results">
            {results.map(m => {
              const src = posterUrl(m.poster_path);
              return (
                <li key={m.id}>
                  <button type="button" className="gyaku__result" onClick={() => void chooseFilm(m)}>
                    {src
                      ? <img className="gyaku__poster" src={src} alt="" loading="lazy" />
                      : <span className="gyaku__poster gyaku__poster--none" aria-hidden />}
                    <span className="gyaku__resultmeta">
                      <span className="gyaku__resulttitle">{m.title}</span>
                      <span className="gyaku__resultyear">{m.release_date?.slice(0, 4)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {query.trim() && (
          <button type="button" className="gyaku__manual" onClick={chooseManual}>
            {t.gyaku.manual(query.trim())}
          </button>
        )}
      </div>
    );
  }

  // ── 打刻画面 ────────────────────────────────────────────────
  const poster = session.film.posterPath ? posterUrl(session.film.posterPath) : null;

  return (
    <div className="container gyaku">
      <div className="gyaku__film">
        {poster && <img className="gyaku__filmposter" src={poster} alt="" />}
        <div>
          <h1 className="gyaku__filmtitle">{session.film.title}</h1>
          <p className="gyaku__filmmeta">
            {session.film.year}
            {session.film.runtime ? ` ・ ${t.gyaku.runtime(session.film.runtime)}` : ''}
          </p>
        </div>
        <button type="button" className="gyaku__change" onClick={discard}>{t.gyaku.change}</button>
      </div>

      <div className="gyaku__clock">
        <span className="gyaku__time">{formatTimecode(elapsed)}</span>
        {runtimeSec > 0 && (
          <span className="gyaku__progress" aria-hidden>
            <span className="gyaku__progressbar" style={{ width: `${progress}%` }} />
          </span>
        )}
        <div className="gyaku__timerbtns">
          <button type="button" onClick={() => nudge(-10)} aria-label={t.gyaku.back10}>−10s</button>
          <button
            type="button"
            className={`gyaku__toggle${running ? ' gyaku__toggle--on' : ''}`}
            onClick={toggleTimer}
          >{running ? t.gyaku.pause : elapsed > 0 ? t.gyaku.resume : t.gyaku.start}</button>
          <button type="button" onClick={() => nudge(10)} aria-label={t.gyaku.fwd10}>＋10s</button>
        </div>
      </div>

      <button type="button" className="gyaku__capture" onClick={capture}>
        {t.gyaku.capture}
        <span className="gyaku__capturehint">{t.gyaku.captureHint}</span>
      </button>

      {scenesSorted.length === 0 ? (
        <p className="gyaku__empty">{t.gyaku.empty}</p>
      ) : (
        <ol className="gyaku__scenes">
          {scenesSorted.map((sc, i) => (
            <li className="gyaku__scene" key={sc.id}>
              {/* 時刻はプレイヤーの表示を見て打ち直せる（ここが逆ハコの肝） */}
              <input
                className="gyaku__at"
                type="text"
                inputMode="numeric"
                aria-label={t.gyaku.timecodeLabel}
                value={tcDrafts[sc.id] ?? formatTimecode(sc.at)}
                onChange={e => setTcDrafts(d => ({ ...d, [sc.id]: e.target.value }))}
                onBlur={() => commitTimecode(sc.id)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
              <span className="gyaku__no">{i + 1}</span>
              <div className="gyaku__fields">
                <input
                  ref={el => {
                    if (el) headingRefs.current.set(sc.id, el);
                    else headingRefs.current.delete(sc.id);
                  }}
                  className="gyaku__heading"
                  type="text"
                  value={sc.heading}
                  placeholder={t.gyaku.headingPlaceholder}
                  onChange={e => updateScene(sc.id, { heading: e.target.value })}
                />
                <textarea
                  className="gyaku__body"
                  value={sc.body}
                  rows={1}
                  placeholder={t.gyaku.bodyPlaceholder}
                  onChange={e => updateScene(sc.id, { body: e.target.value })}
                />
              </div>
              <button
                type="button"
                className="gyaku__del"
                aria-label={t.gyaku.removeScene}
                onClick={() => removeScene(sc.id)}
              >✕</button>
            </li>
          ))}
        </ol>
      )}

      {scenesSorted.length > 0 && (
        <div className="gyaku__save">
          <button type="button" className="btn btn--primary gyaku__savebtn" onClick={saveAsProject}>
            {t.gyaku.save(scenesSorted.length)}
          </button>
        </div>
      )}

      {toast && <div className="hako-toast" role="status"><span>{toast}</span></div>}
    </div>
  );
}
