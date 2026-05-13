import { Link } from 'react-router-dom';
import { ARTICLES } from '../data/articles';
import { useSeo } from '../lib/seo';

export default function ArticleList() {
  useSeo({
    title: '特集記事 | mood-cinema',
    description: '気分・シチュエーション別に映画の選び方を解説。失恋に効く映画、家族で観れる映画、ホラー特集など。',
  });

  return (
    <div className="container section">
      <h1 style={{ fontSize: '1.5rem', marginTop: 24 }}>特集記事</h1>
      <div className="article-list" style={{ marginTop: 16 }}>
        {ARTICLES.map((a) => (
          <Link key={a.slug} to={`/article/${a.slug}`} className="article-list-item">
            <h3>{a.title}</h3>
            <p>{a.summary}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
