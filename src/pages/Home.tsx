import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useSeo } from '../lib/seo';
import { loadHistory } from '../lib/history';
import type { HistoryEntry } from '../lib/history';
import { ARTICLES } from '../data/articles';

const SHORTCUTS: { label: string; query: string; emoji: string }[] = [
  { label: '泣ける映画', query: '?mood=cry', emoji: '😢' },
  { label: '笑えるコメディ', query: '?mood=laugh', emoji: '😂' },
  { label: '90分以内で観れる名作', query: '?mood=cry&runtime=short', emoji: '⏱️' },
  { label: 'ひとりで観たい SF', query: '?mood=think&with=solo', emoji: '🧠' },
  { label: '家族で観れるアニメ', query: '?mood=heal&with=family', emoji: '🌿' },
  { label: '怖がりたい夜に', query: '?mood=scared&with=friends', emoji: '👻' },
];

export default function Home() {
  useSeo({
    title: 'mood-cinema | 気分で選ぶ映画レコメンド診断',
    description:
      '今の気分とシチュエーションを答えるだけ。あなたに今夜ぴったりの映画・海外ドラマを5本おすすめします。',
    canonicalPath: '/',
  });

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  return (
    <div className="container">
      <section className="hero">
        <h1>今の気分から、<br />観たい映画が見つかる。</h1>
        <p className="lead">
          5 つの質問に答えるだけ。<br />
          映画・海外ドラマ 数十万作品からあなたに合う 5 本を診断します。
        </p>
        <div className="hero__cta">
          <Link to="/quiz" className="btn btn--primary">無料で診断を始める</Link>
        </div>
      </section>

      <section className="section">
        <h2>気分別ショートカット</h2>
        <div className="card-grid">
          {SHORTCUTS.map((s) => (
            <Link key={s.query} to={`/result${s.query}`} className="history-item">
              <span style={{ marginRight: 8 }}>{s.emoji}</span>
              {s.label}
            </Link>
          ))}
        </div>
      </section>

      {history.length > 0 && (
        <section className="section">
          <h2>最近の診断</h2>
          <div className="history-list">
            {history.map((h) => (
              <Link key={h.ts} to={`/result?${h.query}`} className="history-item">
                {h.labels.join(' / ') || '診断結果'}
                <time>{new Date(h.ts).toLocaleString('ja-JP')}</time>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2>特集記事</h2>
        <div className="article-list">
          {ARTICLES.slice(0, 4).map((a) => (
            <Link key={a.slug} to={`/article/${a.slug}`} className="article-list-item">
              <h3>{a.title}</h3>
              <p>{a.summary}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
