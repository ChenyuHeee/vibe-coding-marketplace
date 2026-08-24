/**
 * 404 —— 未找到（空态 + 明确出路，§3.1）
 */
import { useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="page">
      <EmptyState
        icon={Compass}
        tone="warning"
        title="页面不存在"
        description="你访问的地址没有对应页面，回 Marketplace 逛逛吧。"
        actionLabel="去 Marketplace"
        onAction={() => navigate('/marketplace')}
      />
    </div>
  );
}
