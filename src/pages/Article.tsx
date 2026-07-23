import { Link, useParams } from 'react-router-dom';
import { ARTICLE_MAP } from '../data/articles';
import { ARTICLE_MAP_EN } from '../data/articles.en';
import { useSeo, buildArticleJsonLd, buildBreadcrumbJsonLd } from '../lib/seo';
import AdBanner from '../components/AdBanner';
import NotFound from './NotFound';
import { useI18n } from '../i18n';

export default function Article() {
  const { slug } = useParams();
  const { t, prefix, lang } = useI18n();
  const articleMap = lang === 'en' ? ARTICLE_MAP_EN : ARTICLE_MAP;
  const article = slug ? articleMap[slug] : undefined;

  const jsonLd = article
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          buildArticleJsonLd({
            title: article.title,
            description: article.summary,
            slug: article.slug,
            publishedAt: article.publishedAt,
            basePath: `${prefix}/article`,
          }),
          buildBreadcrumbJsonLd([
            { name: t.article.breadHome, path: `${prefix}/` },
            { name: t.articles.heading,  path: `${prefix}/articles` },
            { name: article.title,       path: `${prefix}/article/${article.slug}` },
          ]),
        ],
      }
    : undefined;

  useSeo({
    title: article ? `${article.title} | Scene Studio` : t.article.notFound,
    description: article?.summary,
    canonicalPath: article ? `${prefix}/article/${article.slug}` : undefined,
    jsonLd,
    lang,
  });

  if (!article) return <NotFound />;

  return (
    <div className="container article">
      <nav aria-label="breadcrumb" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 16 }}>
        <Link to={`${prefix}/`}>{t.article.breadHome}</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <Link to={`${prefix}/articles`}>{t.articles.heading}</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span>{article.title}</span>
      </nav>

      <h1 style={{ marginTop: 16 }}>{article.title}</h1>
      <p className="article__meta">{t.article.published(article.publishedAt)}</p>

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
          <Link to={`${prefix}/result?${article.ctaQuery}`} className="btn btn--primary">
            {t.article.ctaBtn}
          </Link>
        )}
        <Link to={`${prefix}/mood`} className="btn btn--secondary">{t.article.diagnosisBtn}</Link>
      </div>
    </div>
  );
}
