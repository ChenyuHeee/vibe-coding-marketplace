/**
 * MarketplaceCard —— 作品卡（DESIGN_SYSTEM §8 #1）
 *
 * - 封面（16:9，可点即进详情）、标题、作者、价格（`X CR` 或「免费」）、
 *   评分（图标+数字）、状态徽章；
 * - 整卡可点击 → **focus ring**（§7.1，:focus-visible 可见）；
 * - 价格 tabular-nums（.num）。
 */
import { Link } from 'react-router-dom';
import { ImageOff, UserRound } from 'lucide-react';
import type { ProjectSummary } from '../types/marketplace';
import { StatusBadge } from './StatusBadge';
import { Rating } from './Rating';
import { formatPriceCr } from '../lib/format';

interface MarketplaceCardProps {
  project: ProjectSummary;
}

export function MarketplaceCard({ project }: MarketplaceCardProps) {
  return (
    <Link
      to={`/project/${project.id}`}
      className="marketplace-card"
      aria-label={`查看作品《${project.title}》详情`}
    >
      <div className="marketplace-card__cover">
        {project.coverUrl ? (
          <img src={project.coverUrl} alt={`《${project.title}》封面`} loading="lazy" />
        ) : (
          <span className="marketplace-card__cover-fallback" aria-hidden="true">
            <ImageOff size={28} />
          </span>
        )}
      </div>

      <div className="marketplace-card__body">
        <h3 className="marketplace-card__title text-h3" title={project.title}>
          {project.title}
        </h3>
        <p className="marketplace-card__meta text-caption text-tertiary">
          <UserRound size={12} aria-hidden="true" />
          {project.seller.displayName}
        </p>
        <div className="marketplace-card__footer">
          <span className={`marketplace-card__price num ${project.priceCr === 0 ? 'marketplace-card__price--free' : ''}`}>
            {formatPriceCr(project.priceCr)}
          </span>
          <Rating avgRating={project.avgRating} ratingCount={project.ratingCount} />
        </div>
        {project.status !== 'approved' && (
          <div className="marketplace-card__status">
            <StatusBadge status={project.status} />
          </div>
        )}
      </div>
    </Link>
  );
}
