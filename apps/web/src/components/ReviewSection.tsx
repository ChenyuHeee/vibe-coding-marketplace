/**
 * ReviewSection —— 详情页评论区（DESIGN_SYSTEM 区域 1 要点 5）
 *
 * - 顶部：总评分（图标+数字+人数）；
 * - 评论列表（评分星标 + 评论 + 用户 + 时间）；空则空态
 *   （「还没有评论」+ 说明，§3.1 配方）；
 * - 评论为空但已购用户可见「买下后可以来评价」提示（成功态去向）。
 */
import { MessageSquareText, Star } from 'lucide-react';
import type { Review } from '../types/marketplace';

interface ReviewSectionProps {
  reviews: Review[];
  avgRating: number | null;
  ratingCount: number;
  isPurchased: boolean;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function ReviewSection({ reviews, avgRating, ratingCount, isPurchased }: ReviewSectionProps) {
  return (
    <section className="review-section" aria-label="评论区" data-testid="review-section">
      <h2 className="text-h2 review-section__title">评论与评分</h2>

      <div className="review-section__summary">
        <Star className="review-section__summary-star" size={18} aria-hidden="true" />
        <span className="num text-h3">
          {avgRating && avgRating > 0 ? avgRating.toFixed(1) : '暂无'}
        </span>
        {ratingCount > 0 && <span className="text-body-sm text-tertiary">（{ratingCount} 人评分）</span>}
      </div>

      {reviews.length === 0 ? (
        <div className="review-section__empty" data-testid="reviews-empty">
          <MessageSquareText size={20} aria-hidden="true" />
          <p className="text-body-sm text-secondary">
            还没有评论。
            {isPurchased ? '你已经拥有它，可以去订单页留下第一条评价。' : '购买后可以来评价。'}
          </p>
        </div>
      ) : (
        <ul className="review-section__list">
          {reviews.map((review) => (
            <li key={review.id} className="review-item">
              <div className="review-item__head">
                <span className="review-item__user text-body-sm">
                  <strong>{review.user.displayName}</strong>
                </span>
                <span className="review-item__rating" aria-label={`评分 ${review.rating} 分`}>
                  <Star size={12} aria-hidden="true" />
                  <span className="num text-caption">{review.rating}</span>
                </span>
              </div>
              {review.comment && <p className="review-item__comment text-body-sm">{review.comment}</p>}
              <time className="review-item__date text-caption text-tertiary">
                {formatDate(review.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
