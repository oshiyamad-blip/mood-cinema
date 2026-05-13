export type StepKey = 'mood' | 'with' | 'runtime' | 'era' | 'origin';

export interface Option {
  value: string;
  label: string;
  emoji?: string;
  hint?: string;
}

export interface Question {
  key: StepKey;
  question: string;
  hint?: string;
  options: Option[];
}

export const QUESTIONS: Question[] = [
  {
    key: 'mood',
    question: '今の気分は？',
    hint: '一番ハマるものを選んでください',
    options: [
      { value: 'laugh', label: '笑いたい', emoji: '😂', hint: 'コメディ・楽しい気分転換' },
      { value: 'cry', label: '泣きたい', emoji: '😢', hint: '感動・切ない物語' },
      { value: 'excited', label: '興奮したい', emoji: '🔥', hint: 'アクション・スリル' },
      { value: 'heal', label: '癒されたい', emoji: '🌿', hint: '穏やかでやさしい' },
      { value: 'think', label: '考えさせられたい', emoji: '🧠', hint: '骨太なドラマ・SF' },
      { value: 'scared', label: '怖がりたい', emoji: '👻', hint: 'ホラー・サスペンス' },
    ],
  },
  {
    key: 'with',
    question: '誰と観ますか？',
    options: [
      { value: 'solo', label: '一人で', emoji: '🧘' },
      { value: 'partner', label: '恋人と', emoji: '💑' },
      { value: 'family', label: '家族と', emoji: '👨‍👩‍👧' },
      { value: 'friends', label: '友達と', emoji: '👯' },
    ],
  },
  {
    key: 'runtime',
    question: '視聴時間は？',
    options: [
      { value: 'short', label: '90分以内', emoji: '⏱️', hint: 'サクッと観たい' },
      { value: 'mid', label: '90〜150分', emoji: '🕐', hint: '標準的な映画 1 本分' },
      { value: 'long', label: '制限なし', emoji: '🎞️', hint: '大作・じっくり' },
    ],
  },
  {
    key: 'era',
    question: '年代は？',
    options: [
      { value: 'latest', label: '新作 (3年以内)', emoji: '✨' },
      { value: '2010s', label: '2010年代', emoji: '🆕' },
      { value: '2000s', label: '2000年代', emoji: '📀' },
      { value: 'classic', label: '名作 (1999年以前)', emoji: '🏛️' },
      { value: 'any', label: 'こだわらない', emoji: '🤷' },
    ],
  },
  {
    key: 'origin',
    question: '邦画 / 海外作品の好みは？',
    options: [
      { value: 'any', label: 'こだわらない', emoji: '🌍' },
      { value: 'foreign', label: '海外作品', emoji: '🌎' },
      { value: 'jp', label: '邦画', emoji: '🇯🇵' },
    ],
  },
];

export const TOTAL_STEPS = QUESTIONS.length;

export type AnswerMap = Partial<Record<StepKey, string>>;
