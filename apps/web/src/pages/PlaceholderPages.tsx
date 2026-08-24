/**
 * Phase 1/2 占位页集合（真实页面在 Phase 2 各区域任务中实现）。
 * Marketplace / 详情页（PR-F2-A）、Library / 钱包（PR-F2-B）已替换为真实页面；
 * 需求板（Commissions）由后续需求线任务实现。
 * 每个占位页都满足四状态中的「空态」配方（§3.1）。
 */
import { useNavigate } from 'react-router-dom';
import { ClipboardPlus } from 'lucide-react';
import { PlaceholderPage } from '../components/PlaceholderPage';

export function CommissionsPage() {
  const navigate = useNavigate();
  return (
    <PlaceholderPage
      title="需求板"
      emptyTitle="需求板正在建设中"
      icon={ClipboardPlus}
      tone="brand"
      description="Phase 2 将上线：发布需求、接单者投标、验收标准发布即锁定。"
      actionLabel="回首页看看"
      onAction={() => navigate('/')}
    />
  );
}
