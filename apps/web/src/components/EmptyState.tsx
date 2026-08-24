/**
 * EmptyState —— 空态（DESIGN_SYSTEM §3.1 / §8 #9）
 *
 * 配方：48px 圆形语义浅底 + 24px 语义图标 + 一句说明（标题）+
 * 怎么开始（副文案）+ **1 个明确主按钮**（动词+对象）。
 * 只允许 1 个主按钮；必要时 +1 个幽灵链接「查看帮助」。
 */
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  /** 语义图标（如 ShoppingCart、ClipboardPlus） */
  icon: LucideIcon;
  /** 语义色调（决定图标/浅底颜色） */
  tone?: 'brand' | 'info' | 'success' | 'warning' | 'error';
  /** 一句说明（≤ 12 字），不解释历史，只告诉下一步 */
  title: string;
  /** 怎么开始（≤ 1 句） */
  description: string;
  /** 主按钮文案：动词+对象，如「去逛逛 Marketplace」 */
  actionLabel: string;
  onAction: () => void;
  /** 可选幽灵链接「查看帮助」 */
  helpHref?: string;
  helpLabel?: string;
}

export function EmptyState({
  icon: Icon,
  tone = 'info',
  title,
  description,
  actionLabel,
  onAction,
  helpHref,
  helpLabel = '查看帮助',
}: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <div className={`empty-state__icon empty-state__icon--${tone}`}>
        <Icon size={24} aria-hidden="true" />
      </div>
      <h3 className="empty-state__title text-h3">{title}</h3>
      <p className="empty-state__desc text-body-sm text-secondary">{description}</p>
      <div className="empty-state__actions">
        <button type="button" className="btn btn-primary" onClick={onAction}>
          {actionLabel}
        </button>
        {helpHref && (
          <a className="btn btn-ghost" href={helpHref}>
            {helpLabel}
          </a>
        )}
      </div>
    </div>
  );
}
