/**
 * ConfirmDialog —— 二次确认弹窗（DESIGN_SYSTEM §5.2 / §8 #8，通用规格）
 *
 * 高风险动作（大额充值/确认放款/提现/下架）必须二次确认：
 * - 遮罩 + 居中弹窗（radius-xl）+ focus 陷阱 + Esc = 取消；
 * - 必须展示**动作后果**（余额变化 / 到账时间 / 不可逆提示）；
 * - 确认按钮文案 = 动词 + 对象（「确认放款」「确认充值 ¥500」），禁止裸「确定」。
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  /** 标题，如「确认充值」 */
  title: string;
  /** 动作后果（余额变化 / 到账时间 / 不可逆提示） */
  consequences: React.ReactNode;
  /** 确认按钮文案：动词+对象，如「确认放款」 */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** 确认按钮语义（默认 danger；低危确认可传 brand） */
  confirmTone?: 'danger' | 'brand';
  /** 确认按钮是否可用（如「未预览交付物时不可放款」） */
  confirmDisabled?: boolean;
  /** 禁用原因说明（§7.2：禁用 ≠ 看不见，必须附说明） */
  disabledReason?: string;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({
  open,
  title,
  consequences,
  confirmLabel,
  onConfirm,
  onCancel,
  confirmTone = 'danger',
  confirmDisabled = false,
  disabledReason,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // focus 管理：打开时焦点入弹窗（优先确认按钮），关闭时还原到触发元素
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const timer = window.setTimeout(() => {
      const confirmBtn = dialogRef.current?.querySelector<HTMLButtonElement>(
        '[data-confirm-dialog-confirm]',
      );
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (confirmDisabled && cancelRef.current) {
        cancelRef.current.focus();
      } else if (confirmBtn) {
        confirmBtn.focus();
      } else if (firstFocusable) {
        firstFocusable.focus();
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
      previouslyFocused?.focus?.();
    };
  }, [open, confirmDisabled]);

  // Esc = 取消；Tab 焦点陷阱
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === dialogRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    // 背景滚动锁定
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="confirm-dialog__overlay" role="presentation">
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="confirm-dialog__header">
          <h3 id="confirm-dialog-title" className="confirm-dialog__title text-h3">
            {title}
          </h3>
          <button
            ref={cancelRef}
            type="button"
            className="confirm-dialog__close btn btn-ghost btn-sm"
            onClick={onCancel}
            aria-label="关闭"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="confirm-dialog__consequences">{consequences}</div>

        <div className="confirm-dialog__actions">
          {confirmDisabled && disabledReason && (
            <p className="confirm-dialog__disabled-reason text-caption text-tertiary">
              {disabledReason}
            </p>
          )}
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            data-confirm-dialog-confirm
            className={`btn ${confirmTone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
