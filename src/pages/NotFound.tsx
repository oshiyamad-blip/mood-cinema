import { Link } from 'react-router-dom';
import { useSeo } from '../lib/seo';

export default function NotFound() {
  useSeo({ title: '404 - ページが見つかりません | Tsumugi' });
  return (
    <div className="container" style={{ padding: '64px 16px', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: 16 }}>404</h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 24 }}>
        ページが見つかりませんでした。
      </p>
      <Link to="/" className="btn btn--primary" style={{ maxWidth: 280, margin: '0 auto' }}>
        トップに戻る
      </Link>
    </div>
  );
}
