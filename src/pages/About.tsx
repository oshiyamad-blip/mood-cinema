import { useSeo } from '../lib/seo';

export default function About() {
  useSeo({
    title: '運営者情報 | Tsumugi',
    description: 'Tsumugi の運営者情報。サービスコンセプトと運営方針を掲載しています。',
  });
  return (
    <div className="container article">
      <h1>運営者情報</h1>
      <div className="article__body">
        <h2>サービスについて</h2>
        <p>
          Tsumugi は、脚本開発をスムーズにする統合エディタです。アイデア・人物・参考作品といった「素材」はそのまま置いておき、シーンの箱を並べたタイムラインの上で、まとめてコントロールして一本の脚本に組み立てます。動画編集ソフトのように、素材を束ねて作品にする発想を脚本に持ち込んでいます。
        </p>
        <p>
          あわせて、映画を一時停止しながらシーンごとにメモを取り構成を分解する「逆ハコ」を備えています。すべてブラウザ上で完結し、データはこの端末に保存されます。
        </p>

        <h2>運営方針</h2>
        <ul>
          <li>逆ハコの作品データ（タイトル・尺・配信先）は <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB (The Movie Database)</a> の公式 API より取得しています。</li>
          <li>当サービスは TMDB の認定サービスではありません。</li>
          <li>逆ハコの配信先リンクの一部はアフィリエイトリンクです。</li>
        </ul>

        <h2>運営者</h2>
        <p>個人運営 / Tsumugi 運営チーム</p>

        <h2>お問い合わせ</h2>
        <p>サイトに関するご意見・ご要望は <a href="/contact">お問い合わせフォーム</a> よりお寄せください。</p>
      </div>
    </div>
  );
}
