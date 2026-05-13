import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BALLOON_MAP } from '../data/balloons';
import { buildParamsFromBalloons, buildBalloonShareText } from '../lib/balloonMapper';
import { buildRecommendReason } from '../data/moodMapping';
import { discoverMovies, TmdbConfigError } from '../lib/tmdb';
import type { TmdbMovie } from '../lib/tmdb';
import MovieCard from '../components/MovieCard';
import AdBanner from '../components/AdBanner';
import ShareButtons from '../components/ShareButtons';
import { useSeo } from '../lib/seo';
import { saveHistory } from '../lib/history';
import { getRelatedArticles } from '../data/moodArticleMap';
import { track } from '../lib/analytics';

export default function Result() {
  const [search] = useSearchParams();

  const balloonIds = (search.get('b') ?? '').split(',').filter(id => id && BALLOON_MAP[id]);
  const balloons = balloonIds.map(id => BALLOON_MAP[id]).filter(Boolean);
  const { params, labels, moodReason } = buildParamsFromBalloons(balloons);
  const shareTitle = buildBalloonShareText(balloons);

  const [movies, setMovies] = useState<TmdbMovie[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canonicalB = [...balloonIds].sort().join(',');

  useSeo({
    title: `${labels.slice(0,3).map(l=>l.replace(/^./,'')).join(' × ') || '映画'} のおすすめ 5 選 | mood-cinema`,
    description: `「${balloons.slice(0,3).map(b=>b.label).join('・')}」の気分にぴったりな映画 5 本を診断結果として紹介します。`,
    canonicalPath: canonicalB ? `/result?b=${canonicalB}` : '/result',
  });

  useEffect(() => {
    let mounted = true;
    setMovies(null);
    setError(null);

    discoverMovies(params)
      .then(res => {
        if (!mounted) return;
        const list = res.slice(0, 5);
        setMovies(list);
        track.resultView(balloonIds.join(','));
        saveHistory({ answers: {}, labels, query: search.toString() });
      })
      .catch((e: unknown) => {
        if (!mounted) return;
        if (e instanceof TmdbConfigError) setError(e.message);
        else if (e instanceof Error) setError(`取得エラー: ${e.message}`);
        else setError('不明なエラー');
      });

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.toString()]);

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const relatedArticles = getRelatedArticles(balloonIds);

  return (
    <div className="container">
      <section className="result__header">
        <h1>今夜のおすすめ 5 本</h1>
        {labels.length > 0 && (
          <>
            <p className="result__summary">
              「{balloons.map(b => b.label).join(' × ')}」の条件で抽出しました
            </p>
            <div className="result__tags">
              {balloons.map(b => (
                <span key={b.id} className="result__tag">{b.emoji}{b.label}</span>
              ))}
            </div>
          </>
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
      {!error && !movies && <div className="state-box">読み込み中…</div>}
      {movies && movies.length === 0 && (
        <div className="state-box">
          条件に合う作品が見つかりませんでした。バルーンを変えてもう一度お試しください。
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
            {relatedArticles.map(a => (
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
        <Link to="/mood" className="btn btn--primary">もう一度選びなおす</Link>
        <Link to="/" className="btn btn--secondary">トップに戻る</Link>
      </div>

      <AdBanner />
    </div>
  );
}
