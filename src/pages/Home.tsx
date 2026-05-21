import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useSeo } from '../lib/seo';
import { loadHistory } from '../lib/history';
import type { HistoryEntry } from '../lib/history';
import { ARTICLES } from '../data/articles';
import { ARTICLES_EN } from '../data/articles.en';
import { useI18n } from '../i18n';

export default function Home() {
  const { t, prefix, lang } = useI18n();
  const articles = lang === 'en' ? ARTICLES_EN : ARTICLES;

  useSeo({
    title: t.home.title,
    description: t.home.description,
    canonicalPath: `${prefix}/`,
    lang,
  });

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => { setHistory(loadHistory()); }, []);

  return (
    <div className="container">
      <section className="hero">
        <h1>{t.home.heroHeading.split('\n').map((line, i) => (
          i === 0 ? <span key={i}>{line}<br /></span> : <span key={i}>{line}</span>
        ))}</h1>
        <p className="lead">
          {t.home.heroSub.split('\n').map((line, i) => (
            i === 0 ? <span key={i}>{line}<br /></span> : <span key={i}>{line}</span>
          ))}
        </p>
        <div className="hero__cta">
          <Link to={`${prefix}/mood`} className="btn btn--primary">{t.home.heroCta}</Link>
        </div>
      </section>

      <section className="section">
        <h2>{t.home.shortcutsHeading}</h2>
        <div className="card-grid">
          {t.home.shortcuts.map((s) => (
            <Link key={s.balloons} to={`${prefix}/result?b=${s.balloons}`} className="shortcut-item">
              <span className="shortcut-item__emoji">{s.emoji}</span>
              <span>{s.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {history.length > 0 && (
        <section className="section">
          <h2>{t.home.historyHeading}</h2>
          <div className="history-list">
            {history.map((h) => (
              <Link key={h.ts} to={`${prefix}/result?${h.query}`} className="history-item">
                {h.labels.join(' / ') || (lang === 'en' ? 'Result' : '診断結果')}
                <time>{t.home.historyTime(h.ts)}</time>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2>{t.home.articlesHeading}</h2>
        <div className="article-list">
          {articles.slice(0, 4).map((a) => (
            <Link key={a.slug} to={`${prefix}/article/${a.slug}`} className="article-list-item">
              <h3>{a.title}</h3>
              <p>{a.summary}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
