import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SCENE_MAP } from '../data/sceneLandings';
import { BALLOON_MAP } from '../data/balloons';
import { buildParamsFromBalloons } from '../lib/balloonMapper';
import { buildRecommendReason } from '../data/moodMapping';
import { discoverMovies, TmdbConfigError } from '../lib/tmdb';
import type { TmdbMovie } from '../lib/tmdb';
import MovieCard from '../components/MovieCard';
import AdBanner from '../components/AdBanner';
import NotFound from './NotFound';
import { useSeo } from '../lib/seo';

export default function SceneLanding() {
  const { slug } = useParams<{ slug: string }>();
  const scene = slug ? SCENE_MAP[slug] : undefined;

  const [movies, setMovies] = useState<TmdbMovie[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const balloons = (scene?.balloonIds ?? []).map(id => BALLOON_MAP[id]).filter(Boolean);
  const { params, moodReason } = buildParamsFromBalloons(balloons);

  useSeo({
    title: scene?.title ?? 'シーン別おすすめ映画 | Scene Studio',
    description: scene?.description ?? '',
    canonicalPath: scene ? `/scene/${scene.slug}` : '/mood',
  });

  useEffect(() => {
    if (!scene) return;
    let mounted = true;
    setMovies(null);
    setError(null);
    discoverMovies(params)
      .then(res => { if (mounted) setMovies(res.slice(0, 5)); })
      .catch((e: unknown) => {
        if (!mounted) return;
        if (e instanceof TmdbConfigError) setError(e.message);
        else setError('取得エラーが発生しました');
      });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!scene) return <NotFound />;

  return (
    <div className="container">
      <section className="result__header">
        <h1>{scene.h1}</h1>
        <p className="result__summary">{scene.description}</p>
        <div className="result__tags">
          {balloons.map(b => (
            <span key={b.id} className="result__tag">{b.emoji}{b.label}</span>
          ))}
        </div>
      </section>

      {error && <div className="state-box"><p>{error}</p></div>}
      {!error && !movies && <div className="state-box">読み込み中…</div>}
      {movies && movies.length === 0 && (
        <div className="state-box">条件に合う作品が見つかりませんでした。</div>
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

      <div className="result__retry">
        <Link to={`/result?b=${scene.balloonIds.join(',')}`} className="btn btn--secondary">
          別の日の結果を見る
        </Link>
        <Link to="/mood" className="btn btn--primary">自分でバルーンを選ぶ</Link>
      </div>
      <AdBanner />
    </div>
  );
}
