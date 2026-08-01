export interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  original_language: string;
  popularity: number;
}

interface DiscoverResponse {
  page: number;
  results: TmdbMovie[];
  total_pages: number;
  total_results: number;
}

const BASE = 'https://api.themoviedb.org/3';
const TOKEN = import.meta.env.VITE_TMDB_TOKEN as string | undefined;

const CACHE_PREFIX = 'mc:tmdb:';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t: number; v: T };
    if (Date.now() - parsed.t > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return parsed.v;
  } catch {
    return null;
  }
}

function cacheSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ t: Date.now(), v: value }),
    );
  } catch {
    /* quota exceeded — ignore */
  }
}

function buildUrl(path: string, query: Record<string, unknown>): string {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export class TmdbConfigError extends Error {}
export class TmdbApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, query: Record<string, unknown>): Promise<T> {
  if (!TOKEN) {
    throw new TmdbConfigError(
      'TMDB トークンが設定されていません。.env.local に VITE_TMDB_TOKEN を設定してください。',
    );
  }
  const url = buildUrl(path, query);
  const cacheKey = url;
  const cached = cacheGet<T>(cacheKey);
  if (cached) return cached;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new TmdbApiError(`TMDB API error ${res.status}`, res.status);
  }
  const json = (await res.json()) as T;
  cacheSet(cacheKey, json);
  return json;
}

/** タイトル検索（逆ハコで観る作品を選ぶのに使う）。 */
export async function searchMovies(query: string, language = 'ja-JP'): Promise<TmdbMovie[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await request<DiscoverResponse>('/search/movie', {
    query: q,
    language,
    include_adult: false,
  });
  return data.results;
}

interface MovieDetail {
  id: number;
  title: string;
  runtime: number | null;
  release_date: string;
  poster_path: string | null;
}

/** 作品の尺（分）。取れなければ null（逆ハコは尺なしでも成立するので落とさない）。 */
export async function getMovieRuntime(movieId: number, language = 'ja-JP'): Promise<number | null> {
  try {
    const data = await request<MovieDetail>(`/movie/${movieId}`, { language });
    return typeof data.runtime === 'number' && data.runtime > 0 ? data.runtime : null;
  } catch {
    return null;
  }
}

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

interface WatchProvidersResponse {
  id: number;
  results: Record<string, {
    link: string;
    flatrate?: WatchProvider[];
    rent?: WatchProvider[];
    buy?: WatchProvider[];
  }>;
}

export async function getJpWatchProviders(movieId: number): Promise<{
  flatrate: WatchProvider[];
  link: string | null;
} | null> {
  try {
    const data = await request<WatchProvidersResponse>(
      `/movie/${movieId}/watch/providers`,
      {},
    );
    const jp = data.results['JP'];
    if (!jp) return null;
    return { flatrate: jp.flatrate ?? [], link: jp.link ?? null };
  } catch {
    return null;
  }
}

const POSTER_SIZE = 'w500';
export function posterUrl(path: string | null): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${POSTER_SIZE}${path}`;
}
