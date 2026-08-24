/**
 * Toast —— 瞬态成功/信息反馈（DESIGN_SYSTEM §3.4 / §6 反馈三通道）
 *
 * - 成功反馈给结果一个去处：Toast 常配一个主动作（如「撤销」「去充值」）；
 * - 可逆操作成功 → Toast + 撤销按钮，5 秒窗口（§3.4 可撤销）；
 * - 自动消失（默认 4.5s）；aria-live=polite 屏幕阅读器可读；
 * - 图标 + 文字成对（§2.7 颜色不是唯一载体）。
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  tone?: 'success' | 'info' | 'warning';
  /** 主动作（给结果一个去处） */
  action?: ToastAction;
  /** 自动消失毫秒数（默认 4500；0 = 不自动消失） */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 <ToastProvider> 内使用');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, ...options }]);
      const { duration = 4500, action } = options;
      if (duration > 0) {
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
      // 视觉 + 触觉（§6.2 渐进增强：仅支持设备且需用户交互后生效）
      if (options.tone === 'success' && 'vibrate' in navigator) {
        navigator.vibrate?.(30);
      }
      if (action) {
        // 可撤销动作（§3.4）：5 秒窗口
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 5000);
      }
    },
    [],
  );

  const value = useMemo<ToastContextValue>(() => ({ showToast, dismiss }), [showToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-viewport" aria-live="polite" role="status">
          {toasts.map((toast) => {
            const Icon =
              toast.tone === 'success'
                ? CheckCircle2
                : toast.tone === 'warning'
                  ? AlertTriangle
                  : Info;
            return (
              <div
                key={toast.id}
                className={`toast toast--${toast.tone ?? 'info'}`}
                data-testid="toast"
              >
                <Icon className="toast__icon" size={18} aria-hidden="true" />
                <p className="toast__message text-body-sm">{toast.message}</p>
                {toast.action && (
                  <button
                    type="button"
                    className="toast__action btn btn-sm btn-primary"
                    onClick={() => {
                      toast.action?.onClick();
                      dismiss(toast.id);
                    }}
                  >
                    {toast.action.label}
                  </button>
                )}
                <button
                  type="button"
                  className="toast__close btn btn-ghost btn-sm"
                  onClick={() => dismiss(toast.id)}
                  aria-label="关闭提示"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
