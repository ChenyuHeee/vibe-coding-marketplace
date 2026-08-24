/**
 * FailureRecoveryCard —— 失败恢复卡片（DESIGN_SYSTEM §4.3 / §8 #7，Q3 落地）
 *
 * ① 头部：错误图标 + **哪一步失败**（引用步骤条阶段名）+ **为什么**（平实语言）；
 * ② 「已保留的内容」区块：左侧 3px 竖边 + subtle 底色 + 对勾列表 + 真实内容摘要，
 *    说明「以下内容不会丢失」（失败后不整页刷新、不丢用户输入）；
 * ③ 三条出路，按钮层级不同权：重试 primary / 换一种方式 secondary / 手动编辑 ghost。
 */
import { AlertTriangle, Check } from 'lucide-react';

export interface PreservedItem {
  title: string;
  /** 真实内容摘要（不是「有内容」四个字） */
  summary: string;
}

interface FailureRecoveryCardProps {
  /** 哪一步失败，如「第 3 步『构建』」 */
  stepLabel: string;
  /** 为什么失败（平实语言，禁止黑话作主文案） */
  reason: string;
  /** 已保留的内容（对勾列表） */
  preserved: PreservedItem[];
  onRetry: () => void;
  onAlternative: () => void;
  onManualEdit: () => void;
  /** 重试按钮是否可用（如正在重试中） */
  retryDisabled?: boolean;
}

export function FailureRecoveryCard({
  stepLabel,
  reason,
  preserved,
  onRetry,
  onAlternative,
  onManualEdit,
  retryDisabled = false,
}: FailureRecoveryCardProps) {
  return (
    <div className="recovery-card" role="alert">
      <div className="recovery-card__header">
        <span className="recovery-card__icon" aria-hidden="true">
          <AlertTriangle size={20} />
        </span>
        <div>
          <p className="recovery-card__step text-body">
            <strong>{stepLabel}失败</strong>
          </p>
          <p className="recovery-card__reason text-body-sm text-secondary">{reason}</p>
        </div>
      </div>

      <div className="recovery-card__preserved">
        <p className="recovery-card__preserved-title text-body-sm">
          <strong>已保留的内容</strong>
          <span className="text-caption text-tertiary"> · 以下内容不会丢失</span>
        </p>
        <ul className="recovery-card__preserved-list">
          {preserved.map((item) => (
            <li key={item.title} className="recovery-card__preserved-item text-body-sm">
              <Check size={16} className="recovery-card__check" aria-hidden="true" />
              <span>
                <strong>{item.title}</strong>
                {item.summary && <span className="text-secondary"> —— {item.summary}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="recovery-card__actions">
        <button type="button" className="btn btn-primary" onClick={onRetry} disabled={retryDisabled}>
          重试
        </button>
        <button type="button" className="btn btn-secondary" onClick={onAlternative}>
          换一种方式
        </button>
        <button type="button" className="btn btn-ghost" onClick={onManualEdit}>
          手动编辑
        </button>
      </div>
    </div>
  );
}
