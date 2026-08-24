/**
 * 个人中心占位（Phase 1）。PR-F2 将替换为：登录态展示、角色并存/切换（D4）。
 */
import { Link } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export function ProfilePage() {
  return (
    <div className="page">
      <h1 className="text-h1 page__title">个人中心</h1>
      <EmptyState
        icon={UserRound}
        tone="brand"
        title="登录后查看角色"
        description="注册时可选择主角色，一个账号可并存买家 / 卖家 / 接单者三种角色。"
        actionLabel="去登录 / 注册"
        onAction={() => undefined}
      />
      <p className="text-caption text-tertiary page__note">
        认证与角色切换在 Phase 1 第二棒（PR-F2）落地：<Link to="/login">去登录</Link> ·{' '}
        <Link to="/register">去注册</Link>
      </p>
    </div>
  );
}
