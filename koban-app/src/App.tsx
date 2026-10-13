import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { CLOUD_ENABLED } from './backend/config';
import { useSession } from './store/auth';
import { useProjects } from './store/projects';
import { onSyncStatus, startSync, syncStatus, type SyncStatus } from './store/sync';
import { AccountPage } from './pages/AccountPage';
import { HomePage } from './pages/HomePage';
import { LegalPage } from './pages/LegalPage';
import { ProjectLayout } from './pages/ProjectLayout';

const SYNC_LABEL: Record<SyncStatus, string> = {
  off: '',
  idle: 'クラウドに保存済み',
  syncing: 'クラウドに送っています…',
  error: 'クラウドに送れていません（この端末には保存済み）',
};

export function App() {
  const { saveError } = useProjects();
  const { session } = useSession();
  const [sync, setSync] = useState<SyncStatus>(syncStatus());

  useEffect(() => onSyncStatus(setSync), []);
  useEffect(() => {
    if (session) startSync();
  }, [session]);

  return (
    <div className="shell">
      <header className="topbar no-print">
        <Link to="/" className="brand">
          KOBAN
        </Link>
        <span className="save-state" aria-live="polite">
          {saveError ? '' : sync === 'off' ? 'この端末に保存済み' : SYNC_LABEL[sync]}
        </span>
        <span className="spacer" />
        {CLOUD_ENABLED ? (
          <Link to="/account" className="btn btn-sm">
            {session ? 'アカウント' : 'ログイン'}
          </Link>
        ) : (
          <Link to="/account" className="btn btn-sm">
            設定
          </Link>
        )}
      </header>
      {saveError && (
        <div className="banner banner-err" role="alert">
          {saveError}
        </div>
      )}
      {!CLOUD_ENABLED && (
        <div className="banner banner-info no-print">
          デモの状態です。作品はこの端末にだけ保存され、配布のリンクもこの端末の中でしか開けません。
        </div>
      )}
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/p/:pid/*" element={<ProjectLayout />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/legal/:doc" element={<LegalPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer no-print">
        <span>KOBAN（仮称）</span>
        <Link to="/legal/terms">利用規約</Link>
        <Link to="/legal/privacy">プライバシーポリシー</Link>
        <Link to="/legal/tokushoho">特定商取引法に基づく表記</Link>
        <Link to="/legal/external">外部送信について</Link>
      </footer>
    </div>
  );
}
