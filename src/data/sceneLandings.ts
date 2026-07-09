export interface SceneLanding {
  slug:        string;
  title:       string;
  h1:          string;
  description: string;
  balloonIds:  string[];
}

export const SCENE_LANDINGS: SceneLanding[] = [
  { slug: 'heartbreak-solo',
    title: '失恋した夜にひとりで泣ける映画 5 選 | Scene Studio',
    h1: '失恋した夜、ひとりで泣きたい',
    description: '別れの夜に観たい泣ける映画をバルーン診断で厳選。感情を解放してくれる名作 5 本。',
    balloonIds: ['cry', 'heartstring', 'heartbreak', 'solo'] },
  { slug: 'friday-friends',
    title: '金曜の夜に友達と笑える映画 5 選 | Scene Studio',
    h1: '金曜の夜、友達と笑いたい',
    description: '週末スタートに最高の笑える映画を。みんなで盛り上がれるコメディ名作 5 本。',
    balloonIds: ['laugh', 'friday-night', 'friends', 'light'] },
  { slug: 'rainy-night-solo',
    title: '雨の夜にひとりで観る映画 5 選 | Scene Studio',
    h1: '雨の夜、ひとりでゆっくり観たい',
    description: '静かな雨の夜に合う、切なくて深い映画を厳選。ひとりの夜を豊かにする 5 本。',
    balloonIds: ['rainy-night', 'solo', 'heartstring', 'think'] },
  { slug: 'couple-romantic',
    title: '恋人とロマンチックな映画を観たい 5 選 | Scene Studio',
    h1: '恋人と、ロマンチックな夜に',
    description: 'デートムードを高める感動ロマンス映画。恋人と観たいおすすめ 5 本。',
    balloonIds: ['romantic', 'partner', 'cry', 'friday-night'] },
  { slug: 'family-sunday',
    title: '家族で日曜に観たい映画 5 選 | Scene Studio',
    h1: '家族みんなで、日曜の昼に',
    description: '子どもから大人まで楽しめる温かい映画を診断。家族団らんにおすすめの 5 本。',
    balloonIds: ['family', 'family-watch', 'sunday-afternoon', 'light'] },
  { slug: 'scary-night',
    title: '夜に一人で観るホラー映画 5 選 | Scene Studio',
    h1: '夜ひとり、怖がりたい',
    description: '本当に怖いと評判のホラー映画を厳選。鳥肌が立つ隠れた名作 5 本。',
    balloonIds: ['scared', 'solo', 'winter-night', 'dense'] },
  { slug: 'think-arty',
    title: '深く考えさせられる映画 5 選 | Scene Studio',
    h1: '今夜は、脳を使いながら観たい',
    description: '観終わった後も余韻に浸れる哲学的・社会派映画の傑作 5 本。',
    balloonIds: ['think', 'artsy', 'society', 'mature'] },
  { slug: 'epic-adventure',
    title: '壮大なアドベンチャー・SF映画 5 選 | Scene Studio',
    h1: 'スクリーンいっぱいの壮大な世界へ',
    description: '圧倒的スケール感のアクション・SF名作を診断。興奮必至の 5 本。',
    balloonIds: ['epic', 'excited', 'scifi-theme', 'dense'] },
  { slug: 'heal-winter',
    title: '寒い夜に癒される映画 5 選 | Scene Studio',
    h1: '寒い夜、温かい映画に包まれたい',
    description: 'ほっとして眠れる、心が溶ける温かい映画の名作 5 本。',
    balloonIds: ['winter-night', 'heal', 'light', 'family-watch'] },
  { slug: 'noir-mature',
    title: '大人が楽しむノワール・クライム映画 5 選 | Scene Studio',
    h1: '大人の夜、渋くて深いやつを',
    description: '犯罪・スリラーの中の隠れた傑作。渋い大人の映画体験 5 本。',
    balloonIds: ['noir', 'mature', 'think', 'dense'] },
];

export const SCENE_MAP: Record<string, SceneLanding> =
  Object.fromEntries(SCENE_LANDINGS.map(s => [s.slug, s]));
