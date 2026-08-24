/**
 * 个人中心（PR-F2 / Epic #1，D4）
 * - 登录态展示（头像/昵称/邮箱/角色集合，与后端一致，issue #1 验收项）；
 * - **角色切换器**：当前角色上下文（buyer/seller/contractor），导航与首页
 *   按当前角色呈现（PRD §1；Phase 1 为切换器 + 导航高亮，各角色页面内容后续任务）；
 * - 退出登录（登出可逆一步可达，issue #1 验收项）。
 */
import { useNavigate } from 'react-router-dom';
import { LogOut, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ROLE_CTAS, ROLE_LABELS, useRole } from '../context/RoleContext';
import type { Role } from '../types';
import { EmptyState } from '../components/EmptyState';

export function ProfilePage() {
  const { user, logout } = useAuth();
  const { currentRole, availableRoles, setCurrentRole } = useRole();
  const navigate = useNavigate();

  // 理论上受 RequireAuth 保护不会出现；兜底空态（四状态）
  if (!user) {
    return (
      <div className="page">
        <EmptyState
          icon={UserRound}
          tone="brand"
          title="登录后查看个人中心"
          description="注册时可选择主角色，一个账号可并存买家 / 卖家 / 接单者三种角色。"
          actionLabel="去登录 / 注册"
          onAction={() => navigate('/login')}
        />
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="page profile-page">
      <h1 className="text-h1 page__title">个人中心</h1>

      <div className="card profile-card">
        <div className="profile-card__header">
          <span className="profile-card__avatar" aria-hidden="true">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" width={48} height={48} />
            ) : (
              <UserRound size={24} />
            )}
          </span>
          <div>
            <p className="profile-card__name text-h3">{user.displayName}</p>
            <p className="profile-card__meta text-body-sm text-secondary">
              {user.email}
              {user.ratingCount > 0 && (
                <span className="num">
                  {' '}
                  · 评分 {user.ratingAvg?.toFixed(1)}（{user.ratingCount} 条）
                </span>
              )}
            </p>
          </div>
        </div>

        <div
          className="profile-card__roles"
          role="group"
          aria-label="我的角色（可并存，点击切换当前角色）"
        >
          {availableRoles.map((role: Role) => (
            <button
              key={role}
              type="button"
              className={`chip role-switch${currentRole === role ? ' is-selected' : ''}`}
              aria-pressed={currentRole === role}
              onClick={() => setCurrentRole(role)}
            >
              {ROLE_LABELS[role]}
              {currentRole === role && (
                <span className="text-caption role-switch__current">当前</span>
              )}
            </button>
          ))}
        </div>

        <div className="profile-card__role-info">
          <p className="text-body-sm">
            <strong>当前以「{ROLE_LABELS[currentRole]}」身份使用平台：</strong>
            {ROLE_CTAS[currentRole].description}
          </p>
          <p className="text-caption text-tertiary">
            同一页面将按当前角色呈现不同内容（PRD §1）；各角色专属页面在 Phase 2 落地。
          </p>
        </div>

        <div className="profile-card__actions">
          <button type="button" className="btn btn-danger-ghost" onClick={handleLogout}>
            <LogOut size={16} aria-hidden="true" />
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
