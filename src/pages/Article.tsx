import { Link, useParams } from 'react-router-dom';
import { ARTICLE_MAP } from '../data/articles';
import { useSeo, buildArticleJsonLd, buildBreadcrumbJsonLd } from '../lib/seo';
import AdBanner from '../components/AdBanner';
import NotFound from './NotFound';

export default function Article() {
  const { slug } = useParams();
  const article = slug ? ARTICLE_MAP[slug] : undefined;

  const jsonLd = article
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          buildArticleJsonLd({
            title: article.title,
            description: article.summary,
            slug: article.slug,
            publishedAt: article.publishedAt,
          }),
          buildBreadcrumbJsonLd([
            { name: 'ホーム', path: '/' },
            { name: '特集記事', path: '/articles' },
            { name: article.title, path: `/article/${article.slug}` },
          ]),
        ],
      }
    : undefined;

  useSeo({
    title: article ? `${article.title} | mood-cinema` : '記事が見つかりません',
    description: article?.summary,
    canonicalPath: article ? `/article/${article.slug}` : undefined,
    jsonLd,
  });

  if (!article) return <NotFound />;

  return (
    <div className="container article">
      <nav aria-label="パンくずリスト" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 16 }}>
        <Link to="/">ホーム</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <Link to="/articles">特集記事</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span>{article.title}</span>
      </nav>

      <h1 style={{ marginTop: 16 }}>{article.title}</h1>
      <p className="article__meta">公開: {article.publishedAt}</p>

      <div className="article__body">
        {article.sections.map((s, i) => (
          <section key={i}>
            {s.heading && <h2>{s.heading}</h2>}
            {s.body.map((p, j) => (
              <p key={j}>{p}</p>
            ))}
          </section>
        ))}
      </div>

      <AdBanner />

      <div className="result__retry">
        {article.ctaQuery && (
          <Link to={`/result?${article.ctaQuery}`} className="btn btn--primary">
            この特集の診断結果を見る
          </Link>
        )}
        <Link to="/quiz" className="btn btn--secondary">自分で診断してみる</Link>
      </div>
    </div>
  );
}
