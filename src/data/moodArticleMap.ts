interface RelatedArticle {
  slug: string;
  reason: string;
}

const BALLOON_ARTICLE_MAP: Record<string, RelatedArticle[]> = {
  cry:          [{ slug: 'tearjerker-movies',    reason: '泣ける映画の選び方' },
                 { slug: 'solo-night-movies',     reason: 'ひとりで没入するために' }],
  heartstring:  [{ slug: 'tearjerker-movies',    reason: '切ない映画特集' },
                 { slug: 'rainy-day-movies',      reason: '雨の夜に観る映画' }],
  laugh:        [{ slug: 'stress-relief-movies', reason: '笑ってスッキリ' },
                 { slug: 'weekend-movies',        reason: '週末の気分転換に' }],
  excited:      [{ slug: 'stress-relief-movies', reason: 'テンション爆上げ映画' },
                 { slug: 'weekend-movies',        reason: '週末に観たい映画' }],
  heal:         [{ slug: 'rainy-day-movies',     reason: '癒し映画の選び方' },
                 { slug: 'family-night',          reason: '温かい映画特集' }],
  think:        [{ slug: 'solo-night-movies',    reason: 'ひとりで深く考える夜に' },
                 { slug: 'why-use-quiz',          reason: '自分に合う映画の見つけ方' }],
  scared:       [{ slug: 'horror-night',         reason: '怖い映画の選び方' }],
  heartbreak:   [{ slug: 'tearjerker-movies',    reason: '失恋に効く映画' },
                 { slug: 'date-night',            reason: '恋愛映画の選び方' }],
  family:       [{ slug: 'family-night',         reason: '家族で観られる映画' }],
  'family-watch':[{ slug: 'family-night',        reason: '家族で観られる映画' }],
  partner:      [{ slug: 'date-night',           reason: '恋人と観る映画の選び方' }],
  romantic:     [{ slug: 'date-night',           reason: 'ロマンチックな映画特集' }],
  light:        [{ slug: 'short-runtime-classics', reason: '90分以内の名作' }],
  bedtime:      [{ slug: 'short-runtime-classics', reason: '短くて良い映画特集' }],
  'rainy-night':[{ slug: 'rainy-day-movies',     reason: '雨の夜に観たい映画' },
                 { slug: 'solo-night-movies',     reason: 'ひとりで観る映画' }],
  solo:         [{ slug: 'solo-night-movies',    reason: 'ひとりで観る映画特集' }],
  'friday-night':[{ slug: 'weekend-movies',      reason: '週末・金曜の夜に観る映画' }],
  friends:      [{ slug: 'weekend-movies',       reason: '友達と観る映画特集' }],
};

export function getRelatedArticles(balloonIds: string[]): RelatedArticle[] {
  const seen = new Set<string>();
  const result: RelatedArticle[] = [];

  const add = (a: RelatedArticle) => {
    if (!seen.has(a.slug)) {
      seen.add(a.slug);
      result.push(a);
    }
  };

  for (const id of balloonIds) {
    for (const a of BALLOON_ARTICLE_MAP[id] ?? []) {
      add(a);
      if (result.length >= 3) return result;
    }
  }
  return result;
}
