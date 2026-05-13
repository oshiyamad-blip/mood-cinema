import type { TmdbMovie } from '../lib/tmdb';
import { posterUrl } from '../lib/tmdb';
import AffiliateButtons from './AffiliateButtons';

interface Props {
  movie: TmdbMovie;
  reason?: string;
}

export default function MovieCard({ movie, reason }: Props) {
  const poster = posterUrl(movie.poster_path);
  const year = movie.release_date ? movie.release_date.slice(0, 4) : undefined;
  return (
    <article className="movie-card">
      <div className={poster ? 'movie-card__poster' : 'movie-card__poster movie-card__poster--empty'}>
        {poster ? (
          <img src={poster} alt={`${movie.title} のポスター`} loading="lazy" />
        ) : (
          <span>ポスター画像なし</span>
        )}
      </div>
      <div className="movie-card__body">
        <h3 className="movie-card__title">{movie.title}</h3>
        <p className="movie-card__meta">
          {year ?? '----'}
          {movie.original_title !== movie.title && ` · ${movie.original_title}`}
        </p>
        <p className="movie-card__rating" aria-label={`評価 ${movie.vote_average.toFixed(1)} / 10`}>
          ★ {movie.vote_average.toFixed(1)} <span style={{ color: 'var(--color-text-muted)' }}>({movie.vote_count.toLocaleString()})</span>
        </p>
        {reason && <p className="movie-card__reason">{reason}</p>}
        {movie.overview && <p className="movie-card__overview">{movie.overview}</p>}
        <div className="movie-card__actions">
          <AffiliateButtons title={movie.title} year={year} />
        </div>
      </div>
    </article>
  );
}
