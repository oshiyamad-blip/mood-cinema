import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import Quiz from './pages/Quiz';
import Result from './pages/Result';
import Article from './pages/Article';
import ArticleList from './pages/ArticleList';
import Privacy from './pages/Privacy';
import About from './pages/About';
import Contact from './pages/Contact';
import NotFound from './pages/NotFound';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/" className="brand" aria-label="mood-cinema トップへ">
            <span className="brand__icon" aria-hidden>🎬</span>
            <span className="brand__name">mood-cinema</span>
          </Link>
          <nav className="site-nav">
            <Link to="/quiz">診断する</Link>
            <Link to="/articles">特集</Link>
            <Link to="/about">運営</Link>
          </nav>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/result" element={<Result />} />
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
            <Link to="/about">運営者情報</Link>
            <Link to="/privacy">プライバシーポリシー</Link>
            <Link to="/contact">お問い合わせ</Link>
          </nav>
          <p className="site-footer__meta">
            データ提供: TMDB (The Movie Database)。<br />
            © {new Date().getFullYear()} mood-cinema
          </p>
        </div>
      </footer>
    </>
  );
}
