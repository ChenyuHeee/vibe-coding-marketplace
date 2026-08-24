import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBanner } from './ErrorBanner';

describe('ErrorBanner（§3.3 三件事 + 图标）', () => {
  it('renders 出了什么错 + 为什么 + 下一步怎么办 with an icon', () => {
    const { container } = render(
      <ErrorBanner
        title="加载作品列表失败"
        reason="网络连接不稳定，服务器没有响应。"
        nextStep="点击重试，或检查网络后再试。"
        actions={[{ label: '重试', onClick: () => undefined }]}
      />,
    );

    expect(screen.getByText(/加载作品列表失败/)).toBeInTheDocument();
    expect(screen.getByText(/网络连接不稳定/)).toBeInTheDocument();
    expect(screen.getByText(/点击重试，或检查网络后再试/)).toBeInTheDocument();
    // 图标必须存在（§2.7 颜色非唯一载体）
    expect(container.querySelector('.error-banner__icon svg')).not.toBeNull();
    expect(container.querySelector('.error-banner--error')).not.toBeNull();
  });

  it('fires action buttons (max 2)', async () => {
    const onRetry = vi.fn();
    const onView = vi.fn();
    render(
      <ErrorBanner
        title="支付未完成"
        reason="你的支付方式拒绝了这笔扣款。"
        actions={[
          { label: '换卡支付', onClick: onRetry },
          { label: '查看订单', variant: 'secondary', onClick: onView },
          { label: '第三个', onClick: vi.fn() }, // 应被截断，最多 2 个
        ]}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: '换卡支付' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: '查看订单' }));
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it('supports warning tone with alert semantics', () => {
    const { container } = render(
      <ErrorBanner tone="warning" title="上传失败" reason="文件超过 50MB 上限。" />,
    );
    expect(container.querySelector('.error-banner--warning')).not.toBeNull();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
