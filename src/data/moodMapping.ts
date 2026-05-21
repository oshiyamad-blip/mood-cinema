/**
 * TMDB ジャンル ID (映画)
 * https://developer.themoviedb.org/reference/genre-movie-list
 */
export const GENRE = {
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

export const MOOD_CONFIG: Record<string, MoodConfig> = {
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


/** 映画カードの推薦理由テキストを生成 */
export function buildRecommendReason(
  moodReason: string,
  voteAverage: number,
  voteCount: number,
  lang = 'ja',
): string {
  const avg = voteAverage.toFixed(1);
  if (lang === 'en') {
    const label = voteCount < 5000 ? 'Hidden gem' : voteCount < 20000 ? 'Cult favorite' : 'Fan favorite';
    return `${label} · TMDB ${avg}/10`;
  }
  if (!moodReason) return '';
  const countLabel = voteCount < 5000
    ? '知る人ぞ知る'
    : voteCount < 20000
    ? 'コアなファンに支持される'
    : '多くの人に愛される';
  return `${countLabel}${moodReason}。TMDB評価 ${avg}点。`;
}
