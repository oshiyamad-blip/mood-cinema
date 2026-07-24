import { Routes, Route, Link, NavLink, useLocation, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import Mood from './pages/Mood';
import Hako from './pages/Hako';
import Account from './pages/Account';
import Result from './pages/Result';
import SceneLanding from './pages/SceneLanding';
import Article from './pages/Article';
import ArticleList from './pages/ArticleList';
import Privacy from './pages/Privacy';
import About from './pages/About';
import Contact from './pages/Contact';
import NotFound from './pages/NotFound';
import { I18nContext, translations } from './i18n';
import type { Lang } from './i18n';
import { useAuth } from './lib/auth';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function LangSwitcher({ lang, prefix }: { lang: Lang; prefix: string }) {
  const { pathname } = useLocation();
  const t = translations[lang];
  // Strip current prefix to get bare path, then attach opposite prefix
  const barePath = prefix ? pathname.replace(new RegExp(`^${prefix}`), '') || '/' : pathname;
  const otherHref = lang === 'ja' ? `/en${barePath}` : barePath;

  return (
    <a href={otherHref} className="lang-switch">
      {t.nav.langSwitch}
    </a>
  );
}

/** ヘッダーのログイン導線。Supabase 未設定なら何も出さない（縮退動作）。 */
function AccountNav({ lang, prefix }: { lang: Lang; prefix: string }) {
  const { configured, user } = useAuth();
  const t = translations[lang];
  if (!configured) return null;
  return (
    <NavLink to={`${prefix}/account`} className="site-nav__account">
      {user ? (user.email ?? t.nav.login) : t.nav.login}
    </NavLink>
  );
}

function AppShell({ lang, prefix }: { lang: Lang; prefix: string }) {
  const t = translations[lang];
  const value = { lang, t, prefix };

  return (
    <I18nContext.Provider value={value}>
      <ScrollToTop />
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to={`${prefix}/`} className="brand" aria-label="Tsumugi トップへ">
            <span className="brand__mark" aria-hidden>
              <svg viewBox="6 28 114 66" width="40" height="23" fill="none">
                <g transform="rotate(-13 60 60)">
                  <path
                    fill="#ffa830"
                    fillRule="evenodd"
                    d="M 12 60 C 17.28 35 94.72 35 100 60 C 94.72 85 17.28 85 12 60 Z M 38 60 C 44.44 49.5 77.56 49.5 84 60 C 77.56 70.5 44.44 70.5 38 60 Z"
                  />
                  <path
                    d="M12 60 C 17.28 85 94.72 85 100 60"
                    fill="none"
                    stroke="#d9770a"
                    strokeWidth="5"
                    strokeLinecap="round"
                    opacity="0.92"
                  />
                  <rect x="45" y="55.5" width="30" height="9" rx="4.5" fill="#d9770a" />
                  <line x1="51" y1="53.5" x2="51" y2="66.5" stroke="#ffc266" strokeWidth="2.6" strokeLinecap="round" />
                  <line x1="57" y1="53.5" x2="57" y2="66.5" stroke="#ffc266" strokeWidth="2.6" strokeLinecap="round" />
                  <line x1="63" y1="53.5" x2="63" y2="66.5" stroke="#ffc266" strokeWidth="2.6" strokeLinecap="round" />
                  <line x1="69" y1="53.5" x2="69" y2="66.5" stroke="#ffc266" strokeWidth="2.6" strokeLinecap="round" />
                </g>
                <path d="M97 50 C 108 55 110 70 103 82" fill="none" stroke="#d9770a" strokeWidth="4.5" strokeLinecap="round" />
                <circle cx="103" cy="82" r="3.6" fill="#ffa830" />
              </svg>
            </span>
            <span className="brand__name">Tsumugi</span>
            <span className="brand__jp" aria-hidden>紬</span>
          </Link>
          <nav className="site-nav">
            <NavLink to={`${prefix}/hako`}>{t.nav.hako}</NavLink>
            <NavLink to={`${prefix}/mood`}>{t.nav.diagnose}</NavLink>
            <NavLink to={`${prefix}/articles`}>{t.nav.articles}</NavLink>
            <NavLink to={`${prefix}/about`}>{t.nav.about}</NavLink>
            <AccountNav lang={lang} prefix={prefix} />
            <LangSwitcher lang={lang} prefix={prefix} />
          </nav>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/mood" element={<Mood />} />
          <Route path="/hako" element={<Hako />} />
          <Route path="/account" element={<Account />} />
          <Route path="/quiz" element={<Navigate to={`${prefix}/mood`} replace />} />
          <Route path="/result" element={<Result />} />
          <Route path="/scene/:slug" element={<SceneLanding />} />
          <Route path="/articles" element={<ArticleList />} />
          <Route path="/article/:slug" element={<Article />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="site-footer">
        <div className="container">
          <nav className="site-footer__nav">
            <Link to={`${prefix}/about`}>{t.footer.about}</Link>
            <Link to={`${prefix}/privacy`}>{t.footer.privacy}</Link>
            <Link to={`${prefix}/contact`}>{t.footer.contact}</Link>
          </nav>
          <p className="site-footer__meta">
            {t.footer.tmdb}<br />
            © {new Date().getFullYear()} Tsumugi
          </p>
        </div>
      </footer>
    </I18nContext.Provider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/en/*" element={<AppShell lang="en" prefix="/en" />} />
      <Route path="/*"    element={<AppShell lang="ja" prefix=""    />} />
    </Routes>
  );
}
