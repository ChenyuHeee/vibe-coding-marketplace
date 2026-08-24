import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ShoppingCart } from 'lucide-react';
import { EmptyState } from './EmptyState';

describe('EmptyState（§3.1 空态配方）', () => {
  it('renders icon + one-sentence title + description + ONE primary button', () => {
    const { container } = render(
      <EmptyState
        icon={ShoppingCart}
        tone="info"
        title="购物车还是空的"
        description="把喜欢的作品加进来，下单后可在 My Library 在线运行或下载。"
        actionLabel="去逛逛 Marketplace"
        onAction={() => undefined}
      />,
    );

    expect(screen.getByText('购物车还是空的')).toBeInTheDocument();
    expect(screen.getByText(/把喜欢的作品加进来/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '去逛逛 Marketplace' })).toBeInTheDocument();
    // 48px 圆底图标存在
    expect(container.querySelector('.empty-state__icon--info')).not.toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('fires onAction when the button is clicked', async () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        icon={ShoppingCart}
        title="还没有需求"
        description="发布你的第一个需求，接单者会来投标。"
        actionLabel="发布需求"
        onAction={onAction}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '发布需求' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('optionally renders a ghost help link', () => {
    render(
      <EmptyState
        icon={ShoppingCart}
        title="购物车还是空的"
        description="去逛逛 Marketplace。"
        actionLabel="去逛逛 Marketplace"
        onAction={() => undefined}
        helpHref="/help"
      />,
    );
    expect(screen.getByRole('link', { name: '查看帮助' })).toHaveAttribute('href', '/help');
  });
});
