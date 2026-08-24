/**
 * TabBar —— 移动端底部导航（DESIGN_SYSTEM §5.1）
 * 五项：Marketplace / 需求板 / Library / 钱包 / 我的，Library 固定位置。
 * 桌面端隐藏（由 TopNav 承担）。
 */
import { NavLink } from 'react-router-dom';
import { LayoutGrid, LibraryBig, ShoppingCart, UserRound, Wallet } from 'lucide-react';

const TABS = [
  { to: '/marketplace', label: 'Marketplace', icon: LayoutGrid },
  { to: '/commissions', label: '需求板', icon: ShoppingCart },
  { to: '/library', label: 'Library', icon: LibraryBig },
  { to: '/wallet', label: '钱包', icon: Wallet },
  { to: '/profile', label: '我的', icon: UserRound },
];

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="底部导航">
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `tabbar__item${isActive ? ' tabbar__item--active' : ''}`}
        >
          <Icon size={20} aria-hidden="true" />
          <span className="tabbar__label text-caption">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
