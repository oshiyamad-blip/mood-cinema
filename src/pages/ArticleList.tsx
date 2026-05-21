import { Link } from 'react-router-dom';
import { ARTICLES } from '../data/articles';
import { ARTICLES_EN } from '../data/articles.en';
import { useSeo } from '../lib/seo';
import { useI18n } from '../i18n';

export default function ArticleList() {
  const { t, prefix, lang } = useI18n();
  const articles = lang === 'en' ? ARTICLES_EN : ARTICLES;

  useSeo({
    title: t.articles.title,
    description: t.articles.description,
    canonicalPath: `${prefix}/articles`,
    lang,
  });

  return (
    <div className="container section">
      <h1 style={{ fontSize: '1.5rem', marginTop: 24 }}>{t.articles.heading}</h1>
      <div className="article-list" style={{ marginTop: 16 }}>
        {articles.map((a) => (
          <Link key={a.slug} to={`${prefix}/article/${a.slug}`} className="article-list-item">
            <h3>{a.title}</h3>
            <p>{a.summary}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
