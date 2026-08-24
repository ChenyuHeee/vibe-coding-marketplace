/**
 * Rating —— 评分展示（图标 + 数字，DESIGN_SYSTEM §8 #1 价格/评分位）
 *
 * - 图标（Star）+ 数字成对（§2.7 颜色不是唯一载体）；
 * - 无评分时展示「暂无评分」而非 0.0（避免误导）；
 * - 数字 tabular-nums。
 */
import { Star } from 'lucide-react';

interface RatingProps {
  /** 平均评分（null = 尚无评分） */
  avgRating: number | null;
  /** 评分人数 */
  ratingCount?: number;
  /** 尺寸变体（默认 sm） */
  size?: 'sm' | 'md';
}

export function Rating({ avgRating, ratingCount = 0, size = 'sm' }: RatingProps) {
  if (avgRating === null || avgRating <= 0) {
    return (
      <span className={`rating rating--${size}`} aria-label="暂无评分">
        <Star className="rating__star rating__star--empty" size={size === 'md' ? 16 : 14} aria-hidden="true" />
        <span className="rating__text text-caption text-tertiary">暂无评分</span>
      </span>
    );
  }

  return (
    <span
      className={`rating rating--${size}`}
      aria-label={`评分 ${avgRating.toFixed(1)} 分，共 ${ratingCount} 人评分`}
    >
      <Star className="rating__star" size={size === 'md' ? 16 : 14} aria-hidden="true" />
      <span className="rating__value num">{avgRating.toFixed(1)}</span>
      {ratingCount > 0 && <span className="rating__count text-caption text-tertiary">({ratingCount})</span>}
    </span>
  );
}
