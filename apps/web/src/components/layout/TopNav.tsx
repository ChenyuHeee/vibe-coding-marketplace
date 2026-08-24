/**
 * TopNav —— 桌面顶栏（DESIGN_SYSTEM §5.1 全局导航）
 *
 * `[Logo] [Marketplace] [需求板] [钱包] [My Library] [头像]`
 * —— **My Library 永远渲染在顶栏可视区**，不折叠进汉堡菜单、不随页面滚动隐藏
 *    （任意页面 ≤ 2 次点击回 My Library 的校验标准）。
 * 移动端隐藏，由 TabBar 承担导航。
 */
import { Link, NavLink } from 'react-router-dom';
import { LayoutGrid, LibraryBig, ShoppingCart, UserRound, Wallet } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

const NAV_ITEMS = [
  { to: '/marketplace', label: 'Marketplace', icon: LayoutGrid },
  { to: '/commissions', label: '需求板', icon: ShoppingCart },
  { to: '/wallet', label: '钱包', icon: Wallet },
];

export function TopNav() {
  return (
    <header className="topnav">
      <div className="topnav__inner">
        <Link to="/" className="topnav__logo" aria-label="Vibe Coding Marketplace 首页">
          <span className="topnav__logo-mark" aria-hidden="true">
            <LayoutGrid size={20} />
          </span>
          <span className="topnav__logo-text">Vibe Marketplace</span>
        </Link>

        <nav className="topnav__nav" aria-label="主导航">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `topnav__link${isActive ? ' topnav__link--active' : ''}`}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
          {/* My Library 永远可见（§5.1），不折叠 */}
          <NavLink
            to="/library"
            className={({ isActive }) => `topnav__link topnav__link--library${isActive ? ' topnav__link--active' : ''}`}
          >
            <LibraryBig size={16} aria-hidden="true" />
            My Library
          </NavLink>
        </nav>

        <div className="topnav__actions">
          <ThemeToggle />
          <Link to="/profile" className="topnav__avatar" aria-label="我的（个人中心）">
            <UserRound size={20} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
