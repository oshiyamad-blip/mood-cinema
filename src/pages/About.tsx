import { useSeo } from '../lib/seo';

export default function About() {
  useSeo({
    title: '運営者情報 | Scene Studio',
    description: 'Scene Studio の運営者情報。サービスコンセプトと運営方針を掲載しています。',
  });
  return (
    <div className="container article">
      <h1>運営者情報</h1>
      <div className="article__body">
        <h2>サービスについて</h2>
        <p>
          Scene Studio は、脚本開発をスムーズにする統合エディタです。アイデア・人物・参考作品といった「素材」はそのまま置いておき、シーンの箱を並べたタイムラインの上で、まとめてコントロールして一本の脚本に組み立てます。動画編集ソフトのように、素材を束ねて作品にする発想を脚本に持ち込んでいます。
        </p>
        <p>
          あわせて、書いている物語のトーンに近い作品を気分から引く「参考作品ファインダー」を備えています。すべてブラウザ上で完結し、データはこの端末に保存されます。
        </p>

        <h2>運営方針</h2>
        <ul>
          <li>参考作品の作品データは <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB (The Movie Database)</a> の公式 API より取得しています。</li>
          <li>当サービスは TMDB の認定サービスではありません。</li>
          <li>収益は広告配信・アフィリエイトプログラムからのものです。</li>
        </ul>

        <h2>運営者</h2>
        <p>個人運営 / Scene Studio 運営チーム</p>

        <h2>お問い合わせ</h2>
        <p>サイトに関するご意見・ご要望は <a href="/contact">お問い合わせフォーム</a> よりお寄せください。</p>
      </div>
    </div>
  );
}
