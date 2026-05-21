export const en = {
  nav: {
    diagnose: 'Find movies',
    articles: 'Articles',
    about: 'About',
    langSwitch: '日本語',
  },
  footer: {
    about: 'About',
    privacy: 'Privacy Policy',
    contact: 'Contact',
    tmdb: 'Movie data provided by TMDB (The Movie Database).',
  },
  home: {
    title: 'mood-cinema | Find Movies by Mood',
    description:
      'Just pick your mood and situation — we\'ll recommend 5 perfect movies for your night from hundreds of thousands of titles.',
    heroHeading: 'Find the perfect movie\nfor your mood tonight.',
    heroSub: 'Pick your mood bubbles.\nWe\'ll match 5 films from hundreds of thousands of titles.',
    heroCta: 'Pick tonight\'s mood →',
    shortcutsHeading: 'Quick picks by mood',
    historyHeading: 'Recent sessions',
    articlesHeading: 'Featured articles',
    shortcuts: [
      { label: 'Movies to cry to',      balloons: 'cry,heartstring,solo',       emoji: '💧' },
      { label: 'Feel-good comedies',    balloons: 'laugh,friday-night,friends', emoji: '😂' },
      { label: 'Short classics <90min', balloons: 'light,bedtime,heal',         emoji: '⏱️' },
      { label: 'Sci-Fi solo night',     balloons: 'think,scifi-theme,solo',     emoji: '🚀' },
      { label: 'Family movie night',    balloons: 'heal,family-watch,light',    emoji: '👪' },
      { label: 'Horror night in',       balloons: 'scared,solo,winter-night',   emoji: '👻' },
    ],
    historyTime: (ts: number) => new Date(ts).toLocaleString('en-US'),
  },
  mood: {
    title: 'Pick Your Mood | mood-cinema',
    description: 'Tap 2–6 mood bubbles and find the perfect movie for tonight.',
    heading: 'How are you feeling tonight?',
    subheading: (min: number, max: number) => `Tap ${min}–${max} bubbles that match your mood`,
    randomBtn: '↺ Random pick',
    trayLabel: 'Selected moods',
    trayRemove: (label: string) => `Remove ${label}`,
    submitReady: (n: number) => `Find movies for these ${n} →`,
    submitNotReady: (n: number) => `Pick ${n} more`,
  },
  result: {
    heading: "Tonight's top 5 picks",
    summarySep: ' · ',
    loading: 'Loading…',
    noResults: 'No results found. Try changing your mood selection.',
    devHint: 'Set VITE_TMDB_TOKEN in .env.local.',
    relatedHeading: 'Related articles',
    relatedReadMore: 'Read article →',
    retryBtn: 'Tweak my mood & retry',
    retryBtnFull: 'Start over',
  },
  articles: {
    title: 'Movie Articles | mood-cinema',
    description:
      'Curated movie lists by mood and situation — tearjerkers, date night picks, horror nights, and more.',
    heading: 'Featured Articles',
  },
  article: {
    notFound: 'Article not found',
    published: (date: string) => `Published: ${date}`,
    breadHome: 'Home',
    breadArticles: 'Articles',
    ctaBtn: 'See movie results for this list',
    diagnosisBtn: 'Take the mood quiz',
  },
  balloonLabel: {
    cry: 'Want to cry',
    laugh: 'Want to laugh',
    think: 'Want to think',
    heartstring: 'Bittersweet',
    excited: 'Get pumped',
    scared: 'Get scared',
    'rainy-night': 'Rainy night',
    'friday-night': 'Friday night',
    'sunday-afternoon': 'Sunday afternoon',
    bedtime: 'Bedtime',
    'winter-night': 'Cold night',
    dense: 'Heavy',
    light: 'Light',
    epic: 'Epic',
    heartbreak: 'Heartbreak',
    family: 'Family',
    society: 'Social issues',
    'scifi-theme': 'Sci-Fi',
    'mystery-theme': 'Mystery',
    life: 'Life story',
    mature: 'Mature',
    artsy: 'Arthouse',
    noir: 'Noir',
    romantic: 'Romantic',
    solo: 'Solo',
    partner: 'With partner',
    'family-watch': 'With family',
    friends: 'With friends',
  } as Record<string, string>,
  getCombinationName(ids: string[]): string {
    const MOOD: Record<string, string> = {
      cry: 'Tearjerker', laugh: 'Comedy', think: 'Thought-provoking',
      heal: 'Healing', excited: 'Action-packed', scared: 'Horror',
      heartstring: 'Bittersweet', heartbreak: 'Heartbreak',
    };
    const SCENE: Record<string, string> = {
      solo: 'Solo', partner: 'Date night', friends: "Friends' night",
      family: 'Family time', 'family-watch': 'Family time',
      'rainy-night': 'Rainy night', 'friday-night': 'Friday night',
      'winter-night': 'Cold night', 'sunday-afternoon': 'Sunday afternoon',
      bedtime: 'Bedtime',
    };
    const mood = ids.find(id => MOOD[id]);
    const scene = ids.find(id => SCENE[id]);
    if (mood && scene) return `${SCENE[scene]} ${MOOD[mood]}`;
    if (mood)  return `${MOOD[mood]} picks`;
    if (scene) return `${SCENE[scene]} picks`;
    return "Tonight's picks";
  },
  shareDefault: 'I tried the mood-based movie quiz!',
  shareText: (emojis: string, labels: string) =>
    `${emojis} Feeling "${labels}" — found my perfect movie picks`,
  tmdbLanguage: 'en-US',
  locale: 'en-US',
};
