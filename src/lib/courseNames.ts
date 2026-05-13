const MOOD_LABEL: Record<string, string> = {
  cry:        '涙活',
  laugh:      '爆笑',
  think:      '思索',
  heal:       '癒し',
  excited:    '興奮',
  scared:     'ホラー',
  heartstring:'切なさ',
  heartbreak: '失恋',
};

const SCENE_LABEL: Record<string, string> = {
  solo:             'ひとり',
  partner:          '恋人と',
  friends:          '友達と',
  family:           '家族と',
  'family-watch':   '家族と',
  'rainy-night':    '雨夜',
  'friday-night':   '金曜夜',
  'winter-night':   '冬の夜',
  'sunday-afternoon': '日曜昼',
  bedtime:          '眠れぬ夜',
};

export function getCombinationName(ids: string[]): string {
  const mood  = ids.find(id => MOOD_LABEL[id]);
  const scene = ids.find(id => SCENE_LABEL[id]);

  if (mood && scene) {
    return `${SCENE_LABEL[scene]}の${MOOD_LABEL[mood]}コース`;
  }
  if (mood)  return `${MOOD_LABEL[mood]}映画コース`;
  if (scene) return `${SCENE_LABEL[scene]}映画コース`;
  return '今夜のおすすめコース';
}
