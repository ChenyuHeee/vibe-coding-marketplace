/**
 * AppLayout —— 全局框架：顶栏（桌面）+ 底部 TabBar（移动）+ 内容区。
 * 任意页面两步回 My Library：顶栏/TabBar 的 Library 入口常驻（§5.1）。
 */
import { Outlet } from 'react-router-dom';
import { TopNav } from './TopNav';
import { TabBar } from './TabBar';

export function AppLayout() {
  return (
    <div className="app-layout">
      <TopNav />
      <main className="app-layout__main">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
