/**
 * ErrorBanner —— 错误横幅（DESIGN_SYSTEM §3.3 / §8 #10）
 *
 * 三件事：① 出了什么错 ② 为什么 ③ 下一步怎么办（平实语言，禁止黑话主文案）。
 * 模板：[icon] {出了什么错}。{为什么}。下一步：{怎么办}。  [动作按钮 1–2 个]
 * 错误横幅必须含图标（AlertCircle/AlertTriangle），不靠红字。
 */
import { AlertCircle, AlertTriangle } from 'lucide-react';

export interface ErrorAction {
  label: string;
  onClick: () => void;
  /** 主按钮 = 「下一步怎么办」的直接动作（默认第一个为 primary） */
  variant?: 'primary' | 'secondary';
}

interface ErrorBannerProps {
  /** ① 出了什么错 */
  title: string;
  /** ② 为什么（平实语言） */
  reason: string;
  /** ③ 下一步怎么办（可缺省，此时按钮承担该角色） */
  nextStep?: string;
  /** 动作按钮 1–2 个 */
  actions?: ErrorAction[];
  /** 错误/警告语义（默认 error） */
  tone?: 'error' | 'warning';
}

export function ErrorBanner({
  title,
  reason,
  nextStep,
  actions = [],
  tone = 'error',
}: ErrorBannerProps) {
  const Icon = tone === 'warning' ? AlertTriangle : AlertCircle;
  const actionsLimited = actions.slice(0, 2);

  return (
    <div
      className={`error-banner error-banner--${tone}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="error-banner__icon">
        <Icon size={20} aria-hidden="true" />
      </div>
      <div className="error-banner__body">
        <p className="error-banner__text text-body-sm">
          <strong>{title}</strong>。{reason}
          {nextStep ? `下一步：${nextStep}。` : ''}
        </p>
        {actionsLimited.length > 0 && (
          <div className="error-banner__actions">
            {actionsLimited.map((action, i) => (
              <button
                key={action.label}
                type="button"
                className={`btn btn-sm ${action.variant === 'secondary' || i > 0 ? 'btn-secondary' : 'btn-primary'}`}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
