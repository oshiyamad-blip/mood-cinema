import { Link } from 'react-router-dom';
import { useSeo } from '../lib/seo';
import { useI18n } from '../i18n';

export default function Home() {
  const { t, prefix, lang } = useI18n();

  useSeo({
    title: t.home.title,
    description: t.home.description,
    canonicalPath: `${prefix}/`,
    lang,
  });

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
          <Link to={`${prefix}/hako`} className="btn btn--primary">{t.home.heroCta}</Link>
        </div>
      </section>

      <section className="section">
        <h2>{t.home.workspaceHeading}</h2>
        <Link to={`${prefix}/hako`} className="shortcut-item">
          <span className="shortcut-item__emoji">📝</span>
          <span>{t.hako.heading}<small className="shortcut-item__sub">{t.hako.sub}</small></span>
        </Link>
        <Link to={`${prefix}/gyaku`} className="shortcut-item">
          <span className="shortcut-item__emoji">🎬</span>
          <span>{t.gyaku.heading}<small className="shortcut-item__sub">{t.home.gyakuSub}</small></span>
        </Link>
      </section>
    </div>
  );
}
