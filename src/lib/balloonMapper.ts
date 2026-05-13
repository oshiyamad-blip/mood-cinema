import type { Balloon, BalloonCategory, MoodKey, AtmosphereKey } from '../data/balloons';
import { MOOD_CONFIG } from '../data/moodMapping';
import type { DiscoverParams, MappingResult } from '../data/moodMapping';

function dailyPage(): number {
  return (Math.floor(Date.now() / 86_400_000) % 3) + 1;
}

export function buildParamsFromBalloons(balloons: Balloon[]): MappingResult {
  if (balloons.length === 0) {
    return {
      params: { sort_by: 'vote_average.desc', 'vote_count.gte': 200, 'vote_count.lte': 50000, 'vote_average.gte': 6.8, language: 'ja-JP', region: 'JP', include_adult: false, page: dailyPage() },
      labels: [],
      moodReason: '',
    };
  }

  // 1. moods 合算 → 主気分
  const moodScore: Partial<Record<MoodKey, number>> = {};
  for (const b of balloons) {
    for (const [k, v] of Object.entries(b.weights.moods ?? {})) {
      const key = k as MoodKey;
      moodScore[key] = (moodScore[key] ?? 0) + (v as number);
    }
  }
  const dominantMood = Object.entries(moodScore)
    .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] as MoodKey | undefined;

  // 2. 主気分の基本ジャンルを初期セットに
  const genreScore: Record<number, number> = {};
  const moodCfg = dominantMood ? MOOD_CONFIG[dominantMood] : undefined;
  for (const gid of (moodCfg?.withGenres ?? [])) {
    genreScore[gid] = (genreScore[gid] ?? 0) + 3;
  }

  // 3. バルーン側 genres を加算
  for (const b of balloons) {
    for (const [gid, v] of Object.entries(b.weights.genres ?? {})) {
      const id = Number(gid);
      genreScore[id] = (genreScore[id] ?? 0) + (v as number);
    }
  }
  const topGenres = Object.entries(genreScore)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 3)
    .map(([k]) => Number(k));

  // 4. excludeGenres
  const excludeSet = new Set<number>(moodCfg?.withoutGenres ?? []);
  for (const b of balloons) {
    for (const gid of b.weights.excludeGenres ?? []) excludeSet.add(gid);
  }
  // exclude が with_genres と被ったら除外リストから外す
  for (const gid of topGenres) excludeSet.delete(gid);

  // 5. runtime 多数決（short 優先）
  const runtimeVotes: Record<string, number> = {};
  for (const b of balloons) {
    if (b.weights.runtime) runtimeVotes[b.weights.runtime] = (runtimeVotes[b.weights.runtime] ?? 0) + 1;
  }
  const maxVotes = Math.max(0, ...Object.values(runtimeVotes));
  const runtime = maxVotes > 0
    ? (['short', 'mid', 'long'] as const).find(r => runtimeVotes[r] === maxVotes)
    : undefined;

  // 6. familyFriendly
  const familyFriendly = balloons.some(b => b.weights.familyFriendly);

  // 7. atmosphere 多数決
  const atmoVotes: Partial<Record<AtmosphereKey, number>> = {};
  for (const b of balloons) {
    if (b.weights.atmosphere) {
      const a = b.weights.atmosphere;
      atmoVotes[a] = (atmoVotes[a] ?? 0) + 1;
    }
  }
  const atmosphere = Object.entries(atmoVotes)
    .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] as AtmosphereKey | undefined;

  // 8. voteAverageBoost
  const boost = balloons.reduce((s, b) => s + (b.weights.voteAverageBoost ?? 0), 0);
  const voteAvgMin = Math.min(6.8 + boost, 8.5);

  // 9. vote_count.lte（atmosphere で補正）
  let voteCountMax = 50_000;
  if (atmosphere === 'epic') voteCountMax = 200_000;
  if (atmosphere === 'arty' || atmosphere === 'mature') voteCountMax = 30_000;

  // params 組立
  const params: DiscoverParams = {
    sort_by: 'vote_average.desc',
    'vote_count.gte': 200,
    'vote_count.lte': voteCountMax,
    'vote_average.gte': voteAvgMin,
    language: 'ja-JP',
    region: 'JP',
    include_adult: false,
    page: dailyPage(),
  };

  if (topGenres.length) params.with_genres = topGenres.join(',');
  if (excludeSet.size) params.without_genres = [...excludeSet].join(',');
  if (runtime === 'short') { params['with_runtime.lte'] = 90; }
  if (runtime === 'mid')   { params['with_runtime.gte'] = 90; params['with_runtime.lte'] = 150; }
  if (runtime === 'long')  { params['with_runtime.gte'] = 150; }
  if (familyFriendly) {
    params.certification_country = 'US';
    params['certification.lte'] = 'PG-13';
  }

  // labels（選択バルーンの絵文字+ラベル）
  const labels = balloons.map(b => `${b.emoji}${b.label}`);

  // 推薦理由テキスト
  const sceneLabels = balloons
    .filter(b => b.category === 'scene' || b.category === 'with')
    .map(b => b.label);
  const reasonBase = moodCfg?.reasonTemplate ?? '';
  const moodReason = sceneLabels.length
    ? `${sceneLabels.join('・')}に観たい、${reasonBase}`
    : reasonBase;

  return { params, labels, moodReason };
}

export function buildBalloonShareText(balloons: Balloon[]): string {
  if (balloons.length === 0) return '気分で選ぶ映画診断、やってみた';
  const emojis = balloons.slice(0, 4).map(b => b.emoji).join('');
  const labels = balloons.slice(0, 3).map(b => b.label).join('・');
  return `今夜の気分 ${emojis}「${labels}」の映画を診断してみた`;
}

export function pickRandomBalloons(allBalloons: Balloon[]): string[] {
  const byCategory = (cat: string) => allBalloons.filter(b => b.category === cat);
  const pick = (arr: Balloon[]) => arr[Math.floor(Math.random() * arr.length)]?.id;

  const ids: string[] = [];
  // 気分から1個必ず
  const moodPick = pick(byCategory('mood'));
  if (moodPick) ids.push(moodPick);

  // 残カテゴリからランダム2個
  const otherCats = (['scene', 'intensity', 'theme', 'atmosphere', 'with'] as BalloonCategory[])
    .sort(() => Math.random() - 0.5)
    .slice(0, 2);
  for (const cat of otherCats) {
    const p = pick(byCategory(cat));
    if (p) ids.push(p);
  }
  return ids;
}
