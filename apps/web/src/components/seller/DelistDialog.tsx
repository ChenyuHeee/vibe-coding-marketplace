/**
 * DelistDialog —— 下架已售作品二次确认（DESIGN_SYSTEM §5.2 高风险动作 / §8 #8）
 *
 * PRD 4 / 词汇表 §1：下架已售出作品是**不可逆**动作 ——
 * - **理由必填**：单选（常见理由）+ 补充说明（textarea）；
 * - 后果说明：「已购买家保留访问权，新买家不可再购买」；
 * - 确认按钮「确认下架」在理由选择前禁用（§7.2 禁用 ≠ 看不见，附说明）。
 */
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from '../ConfirmDialog';

const DELIST_REASONS = [
  '版权 / 内容问题，需要下架重做',
  '作品已过时或不再维护',
  '转为免费或改为其他发布形式',
  '其他原因',
];

interface DelistDialogProps {
  open: boolean;
  projectTitle: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  submitting?: boolean;
}

export function DelistDialog({ open, projectTitle, onCancel, onConfirm, submitting = false }: DelistDialogProps) {
  const [reasonIndex, setReasonIndex] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const fullReason = reasonIndex === null ? '' : `${DELIST_REASONS[reasonIndex]}${note.trim() ? `：${note.trim()}` : ''}`;

  const handleCancel = () => {
    setReasonIndex(null);
    setNote('');
    onCancel();
  };

  return (
    <ConfirmDialog
      open={open}
      title="确认下架作品"
      confirmLabel={submitting ? '下架中…' : '确认下架'}
      onConfirm={() => onConfirm(fullReason)}
      onCancel={handleCancel}
      confirmTone="danger"
      confirmDisabled={submitting || reasonIndex === null}
      disabledReason={reasonIndex === null ? '请选择下架理由（下架已售作品必须填写理由）' : undefined}
      consequences={
        <div className="delist-dialog">
          <p className="text-body-sm">
            即将下架「<strong>{projectTitle}</strong>」。
          </p>
          <div className="delist-dialog__consequence" role="note">
            <AlertTriangle size={16} aria-hidden="true" />
            <p className="text-body-sm">
              已购买家<strong>保留访问权</strong>（在线运行 / 下载不受影响），
              <strong>新买家不可再购买</strong>。此操作不可撤回，重新上架需再次审核。
            </p>
          </div>

          <fieldset className="delist-dialog__reasons">
            <legend className="form-label">
              下架理由 <span className="text-tertiary">（必填）</span>
            </legend>
            {DELIST_REASONS.map((reason, i) => (
              <label key={reason} className="delist-dialog__reason">
                <input
                  type="radio"
                  name="delist-reason"
                  value={reason}
                  checked={reasonIndex === i}
                  onChange={() => setReasonIndex(i)}
                  disabled={submitting}
                />
                <span className="text-body-sm">{reason}</span>
              </label>
            ))}
          </fieldset>

          <label className="form-field">
            <span className="form-label">
              补充说明 <span className="text-tertiary">（可选）</span>
            </span>
            <textarea
              className="form-input delist-dialog__note"
              rows={3}
              value={note}
              maxLength={300}
              placeholder="例如：发现部分素材版权存疑，先下架自查…"
              onChange={(e) => setNote(e.target.value)}
              disabled={submitting}
            />
          </label>
        </div>
      }
    />
  );
}
