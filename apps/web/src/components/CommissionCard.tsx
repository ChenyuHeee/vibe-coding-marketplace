/**
 * CommissionCard —— 需求板卡片（DESIGN_SYSTEM 区域 4 要点 4 / §8 #1 同构）
 *
 * 展示：标题 / 预算区间（num tabular-nums）/ 时间线（天）/ 投标数 / 状态徽章
 * （StatusBadge 查表渲染，词汇表 §3）；整卡可点击 → /commissions/:id。
 */
import { Link } from 'react-router-dom';
import { CalendarClock, Coins, Gavel, UserRound } from 'lucide-react';
import type { CommissionListItem } from '../types/commission';
import { StatusBadge } from './StatusBadge';
import { formatCr } from '../lib/format';

export function CommissionCard({ commission }: { commission: CommissionListItem }) {
  return (
    <Link
      to={`/commissions/${commission.id}`}
      className="commission-card"
      data-testid="commission-card"
    >
      <div className="commission-card__head">
        <h3 className="commission-card__title text-h3">{commission.title}</h3>
        <StatusBadge status={commission.status} />
      </div>

      <dl className="commission-card__meta">
        <div className="commission-card__meta-item">
          <dt className="visually-hidden">预算区间</dt>
          <dd>
            <Coins size={14} aria-hidden="true" />
            <span className="num">
              {formatCr(commission.budgetMinCr)} – {formatCr(commission.budgetMaxCr)}
            </span>
          </dd>
        </div>
        <div className="commission-card__meta-item">
          <dt className="visually-hidden">时间线</dt>
          <dd>
            <CalendarClock size={14} aria-hidden="true" />
            {commission.timelineDays} 天
          </dd>
        </div>
        <div className="commission-card__meta-item">
          <dt className="visually-hidden">投标数</dt>
          <dd>
            <Gavel size={14} aria-hidden="true" />
            {commission.bidCount} 个投标
          </dd>
        </div>
        <div className="commission-card__meta-item">
          <dt className="visually-hidden">发布者</dt>
          <dd>
            <UserRound size={14} aria-hidden="true" />
            {commission.buyer.displayName}
          </dd>
        </div>
      </dl>
    </Link>
  );
}
