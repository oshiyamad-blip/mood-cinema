import type { AnswerMap } from './questions';

/**
 * TMDB ジャンル ID (映画)
 * https://developer.themoviedb.org/reference/genre-movie-list
 */
const GENRE = {
  ACTION: 28,
  ADVENTURE: 12,
  ANIMATION: 16,
  COMEDY: 35,
  CRIME: 80,
  DOCUMENTARY: 99,
  DRAMA: 18,
  FAMILY: 10751,
  FANTASY: 14,
  HISTORY: 36,
  HORROR: 27,
  MUSIC: 10402,
  MYSTERY: 9648,
  ROMANCE: 10749,
  SCIFI: 878,
  THRILLER: 53,
  WAR: 10752,
  WESTERN: 37,
} as const;

interface MoodConfig {
  withGenres: number[];
  withoutGenres?: number[];
  label: string;
}

const MOOD_CONFIG: Record<string, MoodConfig> = {
  laugh: { withGenres: [GENRE.COMEDY], withoutGenres: [GENRE.HORROR], label: '笑える' },
  cry: { withGenres: [GENRE.DRAMA, GENRE.ROMANCE], label: '泣ける' },
  excited: { withGenres: [GENRE.ACTION, GENRE.THRILLER], label: '興奮する' },
  heal: { withGenres: [GENRE.FAMILY, GENRE.ANIMATION], withoutGenres: [GENRE.HORROR], label: '癒される' },
  think: { withGenres: [GENRE.DRAMA, GENRE.SCIFI, GENRE.MYSTERY], label: '考えさせられる' },
  scared: { withGenres: [GENRE.HORROR, GENRE.THRILLER], label: '怖い' },
};

interface RuntimeConfig {
  max?: number;
  min?: number;
  label: string;
}
const RUNTIME_CONFIG: Record<string, RuntimeConfig> = {
  short: { max: 90, label: '90分以内' },
  mid: { min: 90, max: 150, label: '90〜150分' },
  long: { label: '長め OK' },
};

interface EraConfig {
  gte?: string;
  lte?: string;
  label: string;
}
function eraConfig(era?: string): EraConfig {
  const now = new Date();
  const y = now.getFullYear();
  switch (era) {
    case 'latest':
      return { gte: `${y - 3}-01-01`, label: '新作' };
    case '2010s':
      return { gte: '2010-01-01', lte: '2019-12-31', label: '2010年代' };
    case '2000s':
      return { gte: '2000-01-01', lte: '2009-12-31', label: '2000年代' };
    case 'classic':
      return { lte: '1999-12-31', label: '名作' };
    case 'any':
    default:
      return { label: '年代不問' };
  }
}

function originConfig(origin?: string): { country?: string; label: string } {
  switch (origin) {
    case 'jp':
      return { country: 'JP', label: '邦画' };
    case 'foreign':
      return { country: 'US|GB|FR|KR|CN|IN', label: '海外' };
    default:
      return { label: '国不問' };
  }
}

function certificationConfig(withWhom?: string): { country?: string; lte?: string; label: string } {
  // TMDB certification は地域固有。子供向け考慮で family の時のみ絞る。
  if (withWhom === 'family') {
    return { country: 'US', lte: 'PG-13', label: '家族向け' };
  }
  return { label: '' };
}

export interface DiscoverParams {
  with_genres?: string;
  without_genres?: string;
  'with_runtime.gte'?: number;
  'with_runtime.lte'?: number;
  'primary_release_date.gte'?: string;
  'primary_release_date.lte'?: string;
  with_origin_country?: string;
  certification_country?: string;
  'certification.lte'?: string;
  sort_by?: string;
  'vote_count.gte'?: number;
  language?: string;
  region?: string;
  page?: number;
  include_adult?: boolean;
}

export interface MappingResult {
  params: DiscoverParams;
  labels: string[];
}

export function buildDiscoverParams(answers: AnswerMap): MappingResult {
  const labels: string[] = [];
  const params: DiscoverParams = {
    sort_by: 'popularity.desc',
    'vote_count.gte': 100,
    language: 'ja-JP',
    region: 'JP',
    include_adult: false,
  };

  const mood = answers.mood ? MOOD_CONFIG[answers.mood] : undefined;
  if (mood) {
    params.with_genres = mood.withGenres.join(',');
    if (mood.withoutGenres) params.without_genres = mood.withoutGenres.join(',');
    labels.push(mood.label);
  }

  const runtime = answers.runtime ? RUNTIME_CONFIG[answers.runtime] : undefined;
  if (runtime) {
    if (runtime.min !== undefined) params['with_runtime.gte'] = runtime.min;
    if (runtime.max !== undefined) params['with_runtime.lte'] = runtime.max;
    labels.push(runtime.label);
  }

  const era = eraConfig(answers.era);
  if (era.gte) params['primary_release_date.gte'] = era.gte;
  if (era.lte) params['primary_release_date.lte'] = era.lte;
  if (answers.era && answers.era !== 'any') labels.push(era.label);

  const origin = originConfig(answers.origin);
  if (origin.country) params.with_origin_country = origin.country;
  if (answers.origin && answers.origin !== 'any') labels.push(origin.label);

  const cert = certificationConfig(answers.with);
  if (cert.country) {
    params.certification_country = cert.country;
    if (cert.lte) params['certification.lte'] = cert.lte;
    labels.push(cert.label);
  }

  return { params, labels };
}
