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
  reasonTemplate: string;
}

const MOOD_CONFIG: Record<string, MoodConfig> = {
  laugh: {
    withGenres: [GENRE.COMEDY],
    withoutGenres: [GENRE.HORROR, GENRE.THRILLER],
    label: '笑える',
    reasonTemplate: '思わず笑えるコメディの隠れた名作',
  },
  cry: {
    withGenres: [GENRE.DRAMA, GENRE.ROMANCE],
    withoutGenres: [GENRE.HORROR, GENRE.ACTION],
    label: '泣ける',
    reasonTemplate: '感情を揺さぶるドラマの中でも特に評価が高い一本',
  },
  excited: {
    withGenres: [GENRE.ACTION, GENRE.THRILLER, GENRE.ADVENTURE],
    withoutGenres: [GENRE.FAMILY],
    label: '興奮する',
    reasonTemplate: 'スクリーンから目が離せないアクション・スリラーの傑作',
  },
  heal: {
    withGenres: [GENRE.FAMILY, GENRE.ANIMATION, GENRE.ROMANCE],
    withoutGenres: [GENRE.HORROR, GENRE.THRILLER, GENRE.ACTION],
    label: '癒される',
    reasonTemplate: '心がほぐれる温かいストーリーの名作',
  },
  think: {
    withGenres: [GENRE.DRAMA, GENRE.MYSTERY, GENRE.HISTORY, GENRE.SCIFI],
    withoutGenres: [GENRE.COMEDY, GENRE.HORROR],
    label: '考えさせられる',
    reasonTemplate: '観終わった後もずっと頭に残る深みのある作品',
  },
  scared: {
    withGenres: [GENRE.HORROR, GENRE.THRILLER],
    withoutGenres: [GENRE.FAMILY, GENRE.ANIMATION],
    label: '怖い',
    reasonTemplate: '評価が高いホラー・スリラーの中でも特に鳥肌が立つ一本',
  },
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
  'vote_count.lte'?: number;
  'vote_average.gte'?: number;
  language?: string;
  region?: string;
  page?: number;
  include_adult?: boolean;
}

export interface MappingResult {
  params: DiscoverParams;
  labels: string[];
  moodReason: string;
}

/** 日付ベースのページ番号（1-3）。同じ日は同じページ → キャッシュ有効。翌日は変化 */
function dailyPage(): number {
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return (day % 3) + 1;
}

export function buildDiscoverParams(answers: AnswerMap): MappingResult {
  const labels: string[] = [];
  const params: DiscoverParams = {
    sort_by: 'vote_average.desc',
    'vote_count.gte': 200,
    'vote_count.lte': 50000,
    'vote_average.gte': 6.8,
    language: 'ja-JP',
    region: 'JP',
    include_adult: false,
    page: dailyPage(),
  };

  const mood = answers.mood ? MOOD_CONFIG[answers.mood] : undefined;
  let moodReason = '';
  if (mood) {
    params.with_genres = mood.withGenres.join(',');
    if (mood.withoutGenres) params.without_genres = mood.withoutGenres.join(',');
    labels.push(mood.label);
    moodReason = mood.reasonTemplate;
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

  // 名作（1999年以前）は有名作品も含めるため上限を緩和
  if (answers.era === 'classic') {
    params['vote_count.lte'] = 200000;
  }

  const origin = originConfig(answers.origin);
  if (origin.country) params.with_origin_country = origin.country;
  if (answers.origin && answers.origin !== 'any') labels.push(origin.label);

  const cert = certificationConfig(answers.with);
  if (cert.country) {
    params.certification_country = cert.country;
    if (cert.lte) params['certification.lte'] = cert.lte;
    labels.push(cert.label);
  }

  return { params, labels, moodReason };
}

/** 映画カードの推薦理由テキストを生成 */
export function buildRecommendReason(
  moodReason: string,
  voteAverage: number,
  voteCount: number,
): string {
  if (!moodReason) return '';
  const avg = voteAverage.toFixed(1);
  const countLabel = voteCount < 5000
    ? '知る人ぞ知る'
    : voteCount < 20000
    ? 'コアなファンに支持される'
    : '多くの人に愛される';
  return `${countLabel}${moodReason}。TMDB評価 ${avg}点。`;
}
