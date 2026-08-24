/**
 * TopNav —— 桌面顶栏（DESIGN_SYSTEM §5.1 全局导航）
 *
 * `[Logo] [Marketplace] [需求板] [钱包] [My Library] [头像]`
 * —— **My Library 永远渲染在顶栏可视区**，不折叠进汉堡菜单、不随页面滚动隐藏
 *    （任意页面 ≤ 2 次点击回 My Library 的校验标准）。
 * 登录后头像区显示当前角色徽章（D4 导航按当前角色呈现）；未登录显示「登录」。
 * 移动端隐藏，由 TabBar 承担导航。
 */
import { Link, NavLink } from 'react-router-dom';
import { LayoutGrid, LibraryBig, LogIn, ShoppingCart, UserRound, Wallet } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABELS, useCurrentRole } from '../../context/RoleContext';

const NAV_ITEMS = [
  { to: '/marketplace', label: 'Marketplace', icon: LayoutGrid },
  { to: '/commissions', label: '需求板', icon: ShoppingCart },
  { to: '/wallet', label: '钱包', icon: Wallet },
];

export function TopNav() {
  const { user } = useAuth();
  const currentRole = useCurrentRole();

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
            className={({ isActive }) =>
              `topnav__link topnav__link--library${isActive ? ' topnav__link--active' : ''}`
            }
          >
            <LibraryBig size={16} aria-hidden="true" />
            My Library
          </NavLink>
        </nav>

        <div className="topnav__actions">
          <ThemeToggle />
          {user ? (
            <Link
              to="/profile"
              className="topnav__user"
              aria-label={`个人中心（${user.displayName}）`}
            >
              <span className="topnav__avatar" aria-hidden="true">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" width={20} height={20} />
                ) : (
                  <UserRound size={20} />
                )}
              </span>
              <span className="topnav__user-name">{user.displayName}</span>
              <span className="badge badge--brand topnav__role-badge">
                {ROLE_LABELS[currentRole]}
              </span>
            </Link>
          ) : (
            <Link to="/login" className="btn btn-secondary btn-sm">
              <LogIn size={16} aria-hidden="true" />
              登录
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
