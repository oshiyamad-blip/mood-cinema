/**
 * 診断回答 → 関連記事スラッグ のマッピング。
 * 結果ページの「この結果に合う特集記事」欄で使う。
 */

interface RelatedArticle {
  slug: string;
  reason: string;
}

const MOOD_MAP: Record<string, RelatedArticle[]> = {
  cry: [
    { slug: 'tearjerker-movies', reason: '泣ける映画の選び方' },
    { slug: 'solo-night-movies', reason: 'ひとりで没入するために' },
  ],
  laugh: [
    { slug: 'stress-relief-movies', reason: '笑ってスッキリ' },
    { slug: 'weekend-movies', reason: '週末の気分転換に' },
  ],
  excited: [
    { slug: 'stress-relief-movies', reason: 'テンション爆上げ映画の選び方' },
    { slug: 'weekend-movies', reason: '週末に観たい映画' },
  ],
  heal: [
    { slug: 'rainy-day-movies', reason: '雨の日に観たい癒し映画' },
    { slug: 'family-night', reason: '家族と観れる温かい映画' },
  ],
  think: [
    { slug: 'solo-night-movies', reason: 'ひとりで深く考える夜に' },
    { slug: 'why-use-quiz', reason: '自分に合う映画を見つける方法' },
  ],
  scared: [
    { slug: 'horror-night', reason: '怖い映画の選び方' },
  ],
};

const WITH_MAP: Record<string, RelatedArticle> = {
  partner: { slug: 'date-night', reason: '恋人と観る映画の選び方' },
  family: { slug: 'family-night', reason: '家族で観れる映画' },
};

const RUNTIME_MAP: Record<string, RelatedArticle> = {
  short: { slug: 'short-runtime-classics', reason: '90分以内の名作' },
};

export function getRelatedArticles(answers: {
  mood?: string;
  with?: string;
  runtime?: string;
}): RelatedArticle[] {
  const seen = new Set<string>();
  const result: RelatedArticle[] = [];

  const add = (a: RelatedArticle) => {
    if (!seen.has(a.slug)) {
      seen.add(a.slug);
      result.push(a);
    }
  };

  if (answers.mood) {
    for (const a of MOOD_MAP[answers.mood] ?? []) add(a);
  }
  if (answers.with && WITH_MAP[answers.with]) {
    add(WITH_MAP[answers.with]);
  }
  if (answers.runtime && RUNTIME_MAP[answers.runtime]) {
    add(RUNTIME_MAP[answers.runtime]);
  }

  return result.slice(0, 3);
}

export const MOOD_SHARE_TEXT: Record<string, string> = {
  cry:     '泣ける映画を診断してみた 😢',
  laugh:   '笑える映画を診断してみた 😂',
  excited: 'テンション上がる映画を診断してみた 🔥',
  heal:    '癒される映画を診断してみた 🌿',
  think:   '考えさせられる映画を診断してみた 🧠',
  scared:  '怖い映画を診断してみた 👻',
};
