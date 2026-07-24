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
          <Link to={`${prefix}/`} className="brand" aria-label="Scene Studio トップへ">
            <span className="brand__icon" aria-hidden>🎬</span>
            <span className="brand__name">Scene Studio</span>
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
            © {new Date().getFullYear()} Scene Studio
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
