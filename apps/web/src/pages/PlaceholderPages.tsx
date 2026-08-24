/**
 * Phase 1/2 占位页集合（真实页面在 Phase 2 各区域任务中实现）。
 * Marketplace / 详情页已由 PR-F2-A 替换为真实页面；Library / 钱包由 PR-F2-B 替换。
 * 每个占位页都满足四状态中的「空态」配方（§3.1）。
 */
import { useNavigate } from 'react-router-dom';
import { ClipboardPlus, LibraryBig, Wallet } from 'lucide-react';
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

export function LibraryPage() {
  const navigate = useNavigate();
  return (
    <PlaceholderPage
      title="My Library"
      emptyTitle="还没有已购作品"
      icon={LibraryBig}
      tone="info"
      description="Phase 2 将上线：在线运行、下载、退款入口。先去 Marketplace 逛逛。"
      actionLabel="去逛逛 Marketplace"
      onAction={() => navigate('/marketplace')}
    />
  );
}

export function WalletPage() {
  const navigate = useNavigate();
  return (
    <PlaceholderPage
      title="钱包"
      emptyTitle="钱包正在建设中"
      icon={Wallet}
      tone="info"
      description="Phase 2 将上线：余额、充值、收支记录、提现与托管状态。"
      actionLabel="回首页看看"
      onAction={() => navigate('/')}
    />
  );
}
