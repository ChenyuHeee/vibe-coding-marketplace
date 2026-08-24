import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MarketplaceCard } from './MarketplaceCard';
import type { ProjectSummary } from '../types/marketplace';

const PROJECT: ProjectSummary = {
  id: 'p1',
  title: '贪吃蛇 3D',
  category: 'game',
  priceCr: 9900,
  coverUrl: '/api/files/p1/cover.png',
  seller: { id: 'u2', displayName: '老张' },
  avgRating: 4.8,
  ratingCount: 21,
  status: 'approved',
};

function renderCard(project: ProjectSummary) {
  return render(
    <MemoryRouter>
      <MarketplaceCard project={project} />
    </MemoryRouter>,
  );
}

describe('MarketplaceCard（DESIGN_SYSTEM §8 #1）', () => {
  it('renders cover / title / author / price / rating / status badge', () => {
    renderCard(PROJECT);
    const link = screen.getByRole('link', { name: /查看作品《贪吃蛇 3D》详情/ });
    expect(link).toBeInTheDocument();
    expect(screen.getByText('贪吃蛇 3D')).toBeInTheDocument();
    expect(screen.getByText('老张')).toBeInTheDocument();
    expect(screen.getByText('9900 CR')).toBeInTheDocument();
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('(21)')).toBeInTheDocument();
    expect(link.querySelector('img')).toHaveAttribute('src', '/api/files/p1/cover.png');
  });

  it('shows 免费 for zero price and no status badge for approved（已上架不重复展示）', () => {
    renderCard({ ...PROJECT, priceCr: 0 });
    expect(screen.getByText('免费')).toBeInTheDocument();
    // approved 是列表常态，卡片不重复显示状态徽章
    expect(screen.queryByText('已上架')).not.toBeInTheDocument();
  });

  it('renders status badge when not approved', () => {
    renderCard({ ...PROJECT, status: 'delisted' });
    expect(screen.getByText('已下架')).toBeInTheDocument();
  });

  it('price uses tabular-nums（金额不跳动）', () => {
    renderCard(PROJECT);
    expect(screen.getByText('9900 CR').className).toContain('num');
  });

  it('whole card is a focusable link to detail page（整卡可点 + focus ring）', () => {
    renderCard(PROJECT);
    const link = screen.getByRole('link', { name: /查看作品/ });
    expect(link).toHaveAttribute('href', '/project/p1');
    expect(link.className).toContain('marketplace-card');
  });
});
