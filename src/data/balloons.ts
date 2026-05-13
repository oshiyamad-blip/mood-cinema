import { GENRE } from './moodMapping';

export type MoodKey = 'cry' | 'laugh' | 'think' | 'heal' | 'excited' | 'scared';
export type BalloonCategory = 'mood' | 'scene' | 'intensity' | 'theme' | 'atmosphere' | 'with';
export type AtmosphereKey = 'quiet' | 'warm' | 'epic' | 'dark' | 'arty' | 'mature';

export interface BalloonWeights {
  moods?:          Partial<Record<MoodKey, number>>;
  genres?:         Partial<Record<number, number>>;
  excludeGenres?:  number[];
  runtime?:        'short' | 'mid' | 'long';
  atmosphere?:     AtmosphereKey;
  familyFriendly?: boolean;
  voteAverageBoost?: number;
}

export interface Balloon {
  id:       string;
  emoji:    string;
  label:    string;
  category: BalloonCategory;
  weights:  BalloonWeights;
}

export const CATEGORY_META: Record<BalloonCategory, { label: string; order: number }> = {
  mood:       { label: '気分',   order: 1 },
  scene:      { label: 'シーン', order: 2 },
  intensity:  { label: '濃さ',   order: 3 },
  theme:      { label: 'テーマ', order: 4 },
  atmosphere: { label: '雰囲気', order: 5 },
  with:       { label: '誰と',   order: 6 },
};

export const BALLOONS: Balloon[] = [
  // ── 気分 ──────────────────────────────────────
  { id: 'cry',         emoji: '💧', label: '泣きたい',   category: 'mood',
    weights: { moods: { cry: 3 } } },
  { id: 'laugh',       emoji: '😂', label: '笑いたい',   category: 'mood',
    weights: { moods: { laugh: 3 } } },
  { id: 'think',       emoji: '🤔', label: '考えたい',   category: 'mood',
    weights: { moods: { think: 3 } } },
  { id: 'heartstring', emoji: '🥺', label: '切ない',     category: 'mood',
    weights: { moods: { cry: 2, think: 1 } } },
  { id: 'excited',     emoji: '⚡', label: '興奮したい', category: 'mood',
    weights: { moods: { excited: 3 } } },
  { id: 'scared',      emoji: '😱', label: '怖がりたい', category: 'mood',
    weights: { moods: { scared: 3 } } },

  // ── シーン ────────────────────────────────────
  { id: 'rainy-night',      emoji: '🌧️', label: '雨の夜',   category: 'scene',
    weights: { moods: { think: 1, heal: 1 }, runtime: 'mid', atmosphere: 'quiet' } },
  { id: 'friday-night',     emoji: '🌃', label: '金曜の夜', category: 'scene',
    weights: { moods: { laugh: 1, excited: 1 }, runtime: 'mid' } },
  { id: 'sunday-afternoon', emoji: '☀️', label: '日曜の昼', category: 'scene',
    weights: { moods: { heal: 1, laugh: 1 }, atmosphere: 'warm' } },
  { id: 'bedtime',          emoji: '🛌', label: '寝る前',   category: 'scene',
    weights: { runtime: 'short', atmosphere: 'quiet' } },
  { id: 'winter-night',     emoji: '❄️', label: '寒い夜',   category: 'scene',
    weights: { moods: { heal: 1, cry: 1 }, atmosphere: 'warm' } },

  // ── 濃さ ──────────────────────────────────────
  { id: 'dense', emoji: '🌊', label: '濃いやつ',  category: 'intensity',
    weights: { voteAverageBoost: 0.4, runtime: 'long' } },
  { id: 'light', emoji: '🌱', label: '軽めで',    category: 'intensity',
    weights: { runtime: 'short', moods: { laugh: 1, heal: 1 } } },
  { id: 'epic',  emoji: '🏔️', label: '壮大なやつ', category: 'intensity',
    weights: { runtime: 'long', atmosphere: 'epic',
               genres: { [GENRE.ADVENTURE]: 2, [GENRE.SCIFI]: 1 } } },

  // ── テーマ ────────────────────────────────────
  { id: 'heartbreak',   emoji: '💔', label: '失恋',      category: 'theme',
    weights: { genres: { [GENRE.ROMANCE]: 2, [GENRE.DRAMA]: 1 }, moods: { cry: 1 } } },
  { id: 'family',       emoji: '👪', label: '家族',      category: 'theme',
    weights: { genres: { [GENRE.FAMILY]: 2, [GENRE.DRAMA]: 1 }, familyFriendly: true } },
  { id: 'society',      emoji: '🌍', label: '社会派',    category: 'theme',
    weights: { genres: { [GENRE.DRAMA]: 2, [GENRE.HISTORY]: 1 }, moods: { think: 1 } } },
  { id: 'scifi-theme',  emoji: '🚀', label: 'SF',        category: 'theme',
    weights: { genres: { [GENRE.SCIFI]: 3 }, moods: { think: 1, excited: 1 } } },
  { id: 'mystery-theme',emoji: '🕵️', label: 'ミステリー', category: 'theme',
    weights: { genres: { [GENRE.MYSTERY]: 3, [GENRE.THRILLER]: 1 } } },
  { id: 'life',         emoji: '🎭', label: '人生',      category: 'theme',
    weights: { genres: { [GENRE.DRAMA]: 2 }, moods: { think: 1, cry: 1 } } },

  // ── 雰囲気 ────────────────────────────────────
  { id: 'mature',   emoji: '🍷', label: '大人な',     category: 'atmosphere',
    weights: { atmosphere: 'mature', excludeGenres: [GENRE.FAMILY, GENRE.ANIMATION] } },
  { id: 'artsy',    emoji: '🎨', label: 'アート系',   category: 'atmosphere',
    weights: { atmosphere: 'arty', voteAverageBoost: 0.3 } },
  { id: 'noir',     emoji: '🖤', label: 'ノワール',   category: 'atmosphere',
    weights: { genres: { [GENRE.CRIME]: 2, [GENRE.THRILLER]: 1 }, atmosphere: 'dark' } },
  { id: 'romantic', emoji: '🌸', label: 'ロマンチック', category: 'atmosphere',
    weights: { genres: { [GENRE.ROMANCE]: 2 } } },

  // ── 誰と ──────────────────────────────────────
  { id: 'solo',         emoji: '🧍', label: 'ひとり', category: 'with',
    weights: { atmosphere: 'quiet' } },
  { id: 'partner',      emoji: '👫', label: '恋人と', category: 'with',
    weights: { genres: { [GENRE.ROMANCE]: 1 } } },
  { id: 'family-watch', emoji: '👨‍👩‍👧', label: '家族と', category: 'with',
    weights: { familyFriendly: true, excludeGenres: [GENRE.HORROR, GENRE.THRILLER] } },
  { id: 'friends',      emoji: '👯', label: '友達と', category: 'with',
    weights: { moods: { laugh: 1, excited: 1 } } },
];

export const BALLOON_MAP: Record<string, Balloon> =
  Object.fromEntries(BALLOONS.map(b => [b.id, b]));
