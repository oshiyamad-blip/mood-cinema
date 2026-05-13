import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useSeo } from '../lib/seo';
import { loadHistory } from '../lib/history';
import type { HistoryEntry } from '../lib/history';
import { ARTICLES } from '../data/articles';

const SHORTCUTS: { label: string; balloons: string; emoji: string }[] = [
  { label: '泣ける映画',           balloons: 'cry,heartstring,solo',          emoji: '💧' },
  { label: '笑えるコメディ',       balloons: 'laugh,friday-night,friends',    emoji: '😂' },
  { label: '短くて観やすい名作',   balloons: 'light,bedtime,heal',            emoji: '⏱️' },
  { label: 'ひとりで観たい SF',    balloons: 'think,scifi-theme,solo',        emoji: '🚀' },
  { label: '家族で観れる映画',     balloons: 'heal,family-watch,light',       emoji: '👪' },
  { label: '怖がりたい夜に',       balloons: 'scared,solo,winter-night',      emoji: '👻' },
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
          気分のバルーンを選ぶだけ。<br />
          数十万作品の中から今夜ぴったりの 5 本を診断します。
        </p>
        <div className="hero__cta">
          <Link to="/mood" className="btn btn--primary">今夜の気分を選ぶ →</Link>
        </div>
      </section>

      <section className="section">
        <h2>気分別ショートカット</h2>
        <div className="card-grid">
          {SHORTCUTS.map((s) => (
            <Link key={s.balloons} to={`/result?b=${s.balloons}`} className="shortcut-item">
              <span className="shortcut-item__emoji">{s.emoji}</span>
              <span>{s.label}</span>
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
