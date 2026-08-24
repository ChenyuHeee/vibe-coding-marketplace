/**
 * 应用路由（Phase 1）：
 * - 全局框架 AppLayout（TopNav + TabBar）；
 * - 首页 / Marketplace / 需求板 / Library / 钱包 / 个人中心占位；
 * - /design-system 为组件演示页（不在导航中，供 Reviewer/QA 验收）；
 * - 认证页在 PR-F2 接入（/login、/register + 路由守卫）。
 */
import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { HomePage } from './pages/HomePage';
import {
  CommissionsPage,
  LibraryPage,
  MarketplacePage,
  WalletPage,
} from './pages/PlaceholderPages';
import { ProfilePage } from './pages/ProfilePage';
import { DesignSystemDemoPage } from './pages/DesignSystemDemoPage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/commissions" element={<CommissionsPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/design-system" element={<DesignSystemDemoPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
