/**
 * StatusBadge —— 状态徽章（DESIGN_SYSTEM §8 #2）
 *
 * 规则：
 * - **只渲染 `docs/STATUS_VOCABULARY.md` 内的规范状态词**（getStatusMeta 查表），
 *   词汇表外的词一律不渲染（console.error 提示，禁止自造展示）；
 * - 图标 + 文字 + 颜色三件套（§2.7 颜色不是信息唯一载体）；
 * - 进行中类状态（under review / in progress / 托管中 / 处理中…）带 12px spinner；
 * - 同一状态词在 Marketplace / 交易详情 / My Library 渲染完全一致（单一来源查表）。
 */
import { Loader2 } from 'lucide-react';
import { getStatusMeta } from './statusVocabulary';

interface StatusBadgeProps {
  /** 规范状态词（大小写/空格敏感，见词汇表第 0 节） */
  status: string;
  /** 可选 className 透传（如尺寸变体） */
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const meta = getStatusMeta(status);

  // 铁律：只渲染词汇表内的词，禁止自造（诊断信息保留，便于接入非法状态词时定位）
  if (!meta) {
    console.error(`[StatusBadge] 未知状态词（不在 STATUS_VOCABULARY.md）：${status}`);
    return null;
  }

  const { label, tone, spinner } = meta;
  const Icon = meta.icon;

  return (
    <span
      className={['badge', `badge--${tone}`, className].filter(Boolean).join(' ')}
      title={status}
      aria-label={`${label}（${status}）`}
    >
      {spinner ? (
        <Loader2
          className="badge__spinner"
          size={12}
          aria-hidden="true"
          data-testid="badge-spinner"
        />
      ) : (
        <Icon className="badge__icon" size={12} aria-hidden="true" />
      )}
      <span className="badge__label">{label}</span>
    </span>
  );
}
