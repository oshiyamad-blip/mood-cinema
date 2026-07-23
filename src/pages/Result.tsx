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
import { ARTICLE_MAP } from '../data/articles';
import { ARTICLE_MAP_EN } from '../data/articles.en';
import { track } from '../lib/analytics';
import { useI18n } from '../i18n';

export default function Result() {
  const { t, prefix, lang } = useI18n();
  const [search] = useSearchParams();

  const balloonIds = (search.get('b') ?? '').split(',').filter(id => id && BALLOON_MAP[id]);
  const balloons = balloonIds.map(id => BALLOON_MAP[id]).filter(Boolean);
  const { params, moodReason } = buildParamsFromBalloons(balloons, t.tmdbLanguage);
  const labels = balloons.map(b => `${b.emoji}${t.balloonLabel[b.id] ?? b.label}`);
  const shareTitle = buildBalloonShareText(balloons, t.balloonLabel, t.shareDefault, t.shareText);

  const [movies, setMovies] = useState<TmdbMovie[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canonicalB = [...balloonIds].sort().join(',');
  const courseName = t.getCombinationName(balloonIds);

  const titleLabels = labels.slice(0, 3).map(l => l.replace(/^./, ''));
  const seoTitle = lang === 'en'
    ? `${titleLabels.join(' × ') || 'Movies'} — Top 5 Picks | Scene Studio`
    : `${titleLabels.join(' × ') || '映画'} のおすすめ 5 選 | Scene Studio`;
  const seoDesc = lang === 'en'
    ? `Top 5 movie picks for ${balloons.slice(0, 3).map(b => t.balloonLabel[b.id] ?? b.label).join(', ')} mood.`
    : `「${balloons.slice(0, 3).map(b => t.balloonLabel[b.id] ?? b.label).join('・')}」の気分にぴったりな映画 5 本。`;

  useSeo({
    title: seoTitle,
    description: seoDesc,
    canonicalPath: canonicalB ? `${prefix}/result?b=${canonicalB}` : `${prefix}/result`,
    noindex: true,
    lang,
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
        else if (e instanceof Error) setError(`Error: ${e.message}`);
        else setError('Unknown error');
      });

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.toString()]);

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const relatedArticles = getRelatedArticles(balloonIds);
  const articleMap = lang === 'en' ? ARTICLE_MAP_EN : ARTICLE_MAP;

  return (
    <div className="container">
      <section className="result__header">
        <p className="result__course">{courseName}</p>
        <h1>{t.result.heading}</h1>
        {labels.length > 0 && (
          <>
            <p className="result__summary">
              「{balloons.map(b => t.balloonLabel[b.id] ?? b.label).join(t.result.summarySep)}」
              {lang === 'en' ? ' selected' : 'の条件で抽出しました'}
            </p>
            <div className="result__tags">
              {balloons.map(b => (
                <span key={b.id} className="result__tag">{b.emoji}{t.balloonLabel[b.id] ?? b.label}</span>
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
            Dev: <code>.env.local</code> → <code>VITE_TMDB_TOKEN</code>
          </p>
        </div>
      )}
      {!error && !movies && <div className="state-box">{t.result.loading}</div>}
      {movies && movies.length === 0 && (
        <div className="state-box">{t.result.noResults}</div>
      )}

      {movies && movies.length > 0 && (
        <>
          <AdBanner />
          <div className="result__list">
            {movies.map((m, i) => (
              <div key={m.id}>
                <MovieCard
                  movie={m}
                  reason={buildRecommendReason(moodReason, m.vote_average, m.vote_count, lang)}
                />
                {i === 1 && <AdBanner />}
              </div>
            ))}
          </div>
        </>
      )}

      {relatedArticles.length > 0 && (
        <section className="result__related">
          <h2>{t.result.relatedHeading}</h2>
          <ul className="article-list">
            {relatedArticles.map(a => {
              const article = articleMap[a.slug];
              return (
                <li key={a.slug} className="article-list-item">
                  <Link to={`${prefix}/article/${a.slug}`}>
                    <h3>{article?.title ?? a.reason}</h3>
                    <p>{t.result.relatedReadMore}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="result__retry">
        <Link to={`${prefix}/mood?s=${balloonIds.join(',')}`} className="btn btn--primary">
          {t.result.retryBtn}
        </Link>
        <Link to={`${prefix}/mood`} className="btn btn--secondary">{t.result.retryBtnFull}</Link>
      </div>

      <AdBanner />
    </div>
  );
}
