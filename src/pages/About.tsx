import { useSeo } from '../lib/seo';

export default function About() {
  useSeo({
    title: '運営者情報 | mood-cinema',
    description: 'mood-cinema の運営者情報。サイトコンセプトと運営方針を掲載しています。',
  });
  return (
    <div className="container article">
      <h1>運営者情報</h1>
      <div className="article__body">
        <h2>サイトについて</h2>
        <p>
          mood-cinema は「今の気分」から映画・海外ドラマを 5 本おすすめする診断 Web アプリです。気分・誰と観るか・視聴時間などの 5 つの質問に答えるだけで、ぴったりの作品が見つかります。
        </p>

        <h2>運営方針</h2>
        <ul>
          <li>すべての作品データは <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB (The Movie Database)</a> の公式 API より取得しています。</li>
          <li>当サイトは TMDB の認定サービスではありません。</li>
          <li>収益は広告配信・アフィリエイトプログラムからのものです。</li>
        </ul>

        <h2>運営者</h2>
        <p>個人運営 / mood-cinema 運営チーム</p>

        <h2>お問い合わせ</h2>
        <p>サイトに関するご意見・ご要望は <a href="/contact">お問い合わせフォーム</a> よりお寄せください。</p>
      </div>
    </div>
  );
}
