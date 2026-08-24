/**
 * PlaceholderPage —— Phase 1 占位页（空态配方，§3.1）。
 * 后续 Phase 2 各区域任务将逐个替换为真实页面。
 */
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface PlaceholderPageProps {
  title: string;
  emptyTitle: string;
  icon: LucideIcon;
  description: string;
  actionLabel: string;
  onAction: () => void;
  tone?: 'brand' | 'info' | 'success' | 'warning' | 'error';
}

export function PlaceholderPage({
  title,
  emptyTitle,
  icon,
  description,
  actionLabel,
  onAction,
  tone = 'info',
}: PlaceholderPageProps) {
  return (
    <div className="page page--placeholder">
      <h1 className="text-h1 page__title">{title}</h1>
      <EmptyState
        icon={icon}
        tone={tone}
        title={emptyTitle}
        description={description}
        actionLabel={actionLabel}
        onAction={onAction}
      />
    </div>
  );
}
