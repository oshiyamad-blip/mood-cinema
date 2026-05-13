import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { buildDiscoverParams, buildRecommendReason } from '../data/moodMapping';
import type { AnswerMap, StepKey } from '../data/questions';
import { discoverMovies, TmdbConfigError } from '../lib/tmdb';
import type { TmdbMovie } from '../lib/tmdb';
import MovieCard from '../components/MovieCard';
import AdBanner from '../components/AdBanner';
import ShareButtons from '../components/ShareButtons';
import { useSeo } from '../lib/seo';
import { saveHistory } from '../lib/history';
import { getRelatedArticles, MOOD_SHARE_TEXT } from '../data/moodArticleMap';

const KEYS: StepKey[] = ['mood', 'with', 'runtime', 'era', 'origin'];

function parseAnswers(params: URLSearchParams): AnswerMap {
  const a: AnswerMap = {};
  for (const k of KEYS) {
    const v = params.get(k);
    if (v) a[k] = v;
  }
  return a;
}

export default function Result() {
  const [search] = useSearchParams();
  const answers = parseAnswers(search);
  const { params, labels, moodReason } = buildDiscoverParams(answers);

  const [movies, setMovies] = useState<TmdbMovie[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const relatedArticles = getRelatedArticles(answers);
  const shareTitle = MOOD_SHARE_TEXT[answers.mood ?? ''] ?? '気分で選ぶ映画診断、やってみた';

  useSeo({
    title: `${labels.join(' / ') || '映画'} のおすすめ 5 選 | mood-cinema`,
    description: `気分「${labels.join(' / ') || 'おまかせ'}」のあなたへ。今夜ぴったりの映画 5 本を診断結果として紹介します。`,
    canonicalPath: `/result?${search.toString()}`,
  });

  useEffect(() => {
    let mounted = true;
    setMovies(null);
    setError(null);
    discoverMovies(params)
      .then((res) => {
        if (!mounted) return;
        setMovies(res.slice(0, 5));
        saveHistory({
          answers,
          labels,
          query: search.toString(),
        });
      })
      .catch((e: unknown) => {
        if (!mounted) return;
        if (e instanceof TmdbConfigError) {
          setError(e.message);
        } else if (e instanceof Error) {
          setError(`取得エラー: ${e.message}`);
        } else {
          setError('不明なエラー');
        }
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.toString()]);

  const shareUrl =
    typeof window !== 'undefined' ? window.location.href : '';

  return (
    <div className="container">
      <section className="result__header">
        <h1>今夜のおすすめ 5 本</h1>
        <p className="result__summary">
          {labels.length > 0
            ? `「${labels.join(' / ')}」の条件で抽出しました`
            : '人気作品から抽出しました'}
        </p>
        {labels.length > 0 && (
          <div className="result__tags">
            {labels.map((l) => (
              <span key={l} className="result__tag">{l}</span>
            ))}
          </div>
        )}
      </section>

      <ShareButtons title={shareTitle} url={shareUrl} />

      {error && (
        <div className="state-box">
          <p>{error}</p>
          <p style={{ fontSize: '0.85rem' }}>
            開発者向け: <code>.env.local</code> に <code>VITE_TMDB_TOKEN</code> を設定してください。
          </p>
        </div>
      )}

      {!error && !movies && (
        <div className="state-box">読み込み中…</div>
      )}

      {movies && movies.length === 0 && (
        <div className="state-box">
          条件に合う作品が見つかりませんでした。条件を変えてもう一度お試しください。
        </div>
      )}

      {movies && movies.length > 0 && (
        <>
          <AdBanner />
          <div className="result__list">
            {movies.map((m, i) => (
              <div key={m.id}>
                <MovieCard
                  movie={m}
                  reason={buildRecommendReason(moodReason, m.vote_average, m.vote_count)}
                />
                {i === 1 && <AdBanner />}
              </div>
            ))}
          </div>
        </>
      )}

      {relatedArticles.length > 0 && (
        <section className="result__related">
          <h2>この結果に合う特集記事</h2>
          <ul className="article-list">
            {relatedArticles.map((a) => (
              <li key={a.slug} className="article-list-item">
                <Link to={`/article/${a.slug}`}>
                  <h3>{a.reason}</h3>
                  <p>特集を読む →</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="result__retry">
        <Link to="/quiz" className="btn btn--primary">もう一度診断する</Link>
        <Link to="/" className="btn btn--secondary">トップに戻る</Link>
      </div>

      <AdBanner />
    </div>
  );
}
