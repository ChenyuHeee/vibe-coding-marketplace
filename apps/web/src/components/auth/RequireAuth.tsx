/**
 * RequireAuth —— 路由守卫（PR-F2 / Epic #1）。
 * 需要登录的页面（Library / 钱包 / 个人中心）重定向到登录页，并记住来源路径。
 * 加载中（/me 拉取）显示骨架屏而非闪跳。
 */
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Skeleton } from '../Skeleton';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div className="page page--loading" aria-busy="true" role="status">
        <Skeleton width={200} height={24} />
        <Skeleton width="100%" height={120} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
