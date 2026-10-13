import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { checkProject } from '../core/schedule';
import { useProject } from '../store/projects';
import { Empty, IssueCount } from '../ui/ui';
import { AssetsPage } from './AssetsPage';
import { DayPage } from './DayPage';
import { ImportPage } from './ImportPage';
import { KobanPage } from './KobanPage';
import { SchedulePage } from './SchedulePage';
import { SettingsPage } from './SettingsPage';
import { SharePage } from './SharePage';
import { Link } from 'react-router-dom';

export function ProjectLayout() {
  const { pid } = useParams();
  const p = useProject(pid);
  if (!p) {
    return (
      <Empty title="作品が見つかりません">
        <p>
          <Link to="/">作品の一覧へ戻る</Link>
        </p>
      </Empty>
    );
  }
  const issues = checkProject(p);
  const base = `/p/${p.id}`;
  return (
    <>
      <div className="page-head">
        <h1>{p.title}</h1>
        {p.deletedAt != null && <span className="manual">ゴミ箱の中</span>}
      </div>
      <nav className="pnav no-print" aria-label="作品の画面">
        <NavLink to={`${base}/import`}>取り込み</NavLink>
        <NavLink to={`${base}/koban`}>香盤表</NavLink>
        <NavLink to={`${base}/assets`}>人物・ロケ地</NavLink>
        <NavLink to={`${base}/schedule`}>
          総スケ <IssueCount issues={issues} />
        </NavLink>
        <NavLink to={`${base}/days`}>日々スケ</NavLink>
        <NavLink to={`${base}/share`}>配布と確認</NavLink>
        <NavLink to={`${base}/settings`}>作品の設定</NavLink>
      </nav>
      <Routes>
        <Route path="import" element={<ImportPage project={p} />} />
        <Route path="koban" element={<KobanPage project={p} />} />
        <Route path="assets" element={<AssetsPage project={p} />} />
        <Route path="schedule" element={<SchedulePage project={p} />} />
        <Route path="days" element={<DayPage project={p} />} />
        <Route path="days/:did" element={<DayPage project={p} />} />
        <Route path="share" element={<SharePage project={p} />} />
        <Route path="share/:did" element={<SharePage project={p} />} />
        <Route path="settings" element={<SettingsPage project={p} />} />
        <Route path="*" element={<Navigate to={`${base}/schedule`} replace />} />
      </Routes>
    </>
  );
}
