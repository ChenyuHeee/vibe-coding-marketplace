/**
 * ReportDialog —— 举报弹窗表单（DESIGN_SYSTEM §5.1 联系卖家/举报常驻）
 *
 * - 详情页操作行 [联系卖家] [举报] [···] 中「举报」点击弹出；
 * - 表单：理由（必填）→ POST /api/projects/:id/report；
 * - 四状态齐全：填写（空态）→ 提交中（按钮 spinner + 禁用）→
 *   成功（Toast + 关闭弹窗）/ 失败（ErrorBanner 就地显示在表单内）；
 * - Esc 关闭；焦点入弹窗（首个输入框）。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Flag, Loader2, X } from 'lucide-react';
import { reportApi } from '../api/marketplace';
import { useToast } from './Toast';

interface ReportDialogProps {
  open: boolean;
  projectId: string;
  projectTitle: string;
  onClose: () => void;
}

const REASON_OPTIONS = [
  '内容不实或与描述不符',
  '涉嫌侵权（抄袭 / 盗用）',
  '违规内容（色情 / 暴力 / 违法）',
  '恶意软件或危险链接',
  '其他问题',
];

export function ReportDialog({ open, projectId, projectTitle, onClose }: ReportDialogProps) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const { showToast } = useToast();

  // 打开时焦点入弹窗（首个输入）
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const effectiveReason = reason === '其他问题' ? customReason.trim() : reason;
  const canSubmit = effectiveReason.length > 0 && !submitting;

  const reset = () => {
    setReason('');
    setCustomReason('');
    setError(null);
    setSubmitting(false);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await reportApi.submit(projectId, { reason: effectiveReason });
      showToast('举报已提交，我们会尽快处理。', { tone: 'success' });
      reset();
      onClose();
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : '举报提交失败，请稍后重试。';
      setError(message);
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="confirm-dialog__overlay" role="presentation">
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
      >
        <div className="confirm-dialog__header">
          <h3 id="report-dialog-title" className="confirm-dialog__title text-h3">
            <Flag size={18} aria-hidden="true" className="report-dialog__title-icon" />
            举报《{projectTitle}》
          </h3>
          <button
            type="button"
            className="confirm-dialog__close btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form
          className="report-dialog__form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="form-label" htmlFor="report-reason">
            举报理由（必填）
          </label>
          <select
            id="report-reason"
            ref={firstFieldRef}
            className="form-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          >
            <option value="" disabled>
              请选择举报理由…
            </option>
            {REASON_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>

          {reason === '其他问题' && (
            <textarea
              className="form-input report-dialog__textarea"
              placeholder="请描述具体问题…"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              rows={3}
              aria-label="其他问题描述"
            />
          )}

          {error && (
            <div className="form-error" role="alert">
              <AlertCircle size={14} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="confirm-dialog__actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="badge__spinner" size={16} aria-hidden="true" />
                  提交中…
                </>
              ) : (
                '提交举报'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
