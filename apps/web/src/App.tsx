/**
 * 应用路由（Phase 1 第二棒）：
 * - 公开：首页 / Marketplace / 需求板 / 登录 / 注册 / 设计系统演示页；
 * - 需登录（RequireAuth）：My Library / 钱包 / 个人中心（未登录重定向登录页）；
 * - 全局框架 AppLayout（TopNav + TabBar），任意页面两步回 My Library（§5.1）。
 */
import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { RequireAuth } from './components/auth/RequireAuth';
import { HomePage } from './pages/HomePage';
import { CommissionsPage } from './pages/PlaceholderPages';
import { MarketplacePage } from './pages/MarketplacePage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { LibraryPage } from './pages/LibraryPage';
import { WalletPage } from './pages/WalletPage';
import { SellPage } from './pages/SellPage';
import { SellerProjectPage } from './pages/SellerProjectPage';
import { ProfilePage } from './pages/ProfilePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DesignSystemDemoPage } from './pages/DesignSystemDemoPage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* 公开 */}
        <Route index element={<HomePage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/project/:id" element={<ProjectDetailPage />} />
        <Route path="/commissions" element={<CommissionsPage />} />
        <Route path="/design-system" element={<DesignSystemDemoPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* 需登录 */}
        <Route
          path="/library"
          element={
            <RequireAuth>
              <LibraryPage />
            </RequireAuth>
          }
        />
        <Route
          path="/wallet"
          element={
            <RequireAuth>
              <WalletPage />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        {/* 卖家工作台（seller 角色守卫在页面内：无角色引导开通） */}
        <Route
          path="/sell"
          element={
            <RequireAuth>
              <SellPage />
            </RequireAuth>
          }
        />
        <Route
          path="/sell/:id"
          element={
            <RequireAuth>
              <SellerProjectPage />
            </RequireAuth>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
