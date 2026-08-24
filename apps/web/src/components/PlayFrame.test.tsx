import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PlayFrame, PLAY_SANDBOX } from './PlayFrame';

function renderFrame(playUrl: string | null, title = '贪吃蛇 3D') {
  return render(
    <MemoryRouter>
      <PlayFrame playUrl={playUrl} title={title} />
    </MemoryRouter>,
  );
}

describe('PlayFrame（试玩区，ARCHITECTURE §3.3）', () => {
  it('renders iframe with hardened sandbox（不给 same-origin / top-navigation）', () => {
    renderFrame('/play/p1');
    const iframe = screen.getByTestId('playframe-iframe') as HTMLIFrameElement;
    expect(iframe).toHaveAttribute('src', '/play/p1');
    const sandbox = iframe.getAttribute('sandbox') ?? '';
    expect(sandbox).toBe(PLAY_SANDBOX);
    // 安全铁律：必须不含 allow-same-origin / allow-top-navigation
    expect(sandbox).not.toContain('allow-same-origin');
    expect(sandbox).not.toContain('allow-top-navigation');
    expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('shows loading skeleton first, then ready on load（加载态 → 成功态）', () => {
    renderFrame('/play/p1');
    expect(screen.getByText(/正在加载试玩/)).toBeInTheDocument();
    fireEvent.load(screen.getByTestId('playframe-iframe'));
    expect(screen.queryByText(/正在加载试玩/)).not.toBeInTheDocument();
  });

  it('shows error banner when load fails, and retry remounts the iframe（错误态 + 重试）', () => {
    renderFrame('/play/p1');
    const iframe = screen.getByTestId('playframe-iframe');
    fireEvent.error(iframe);
    expect(screen.getByText(/作品加载失败/)).toBeInTheDocument();

    const retry = screen.getByRole('button', { name: '重试' });
    fireEvent.click(retry);
    // 重试后回到加载态（重新挂载 iframe）
    expect(screen.getByText(/正在加载试玩/)).toBeInTheDocument();
    expect(screen.getByTestId('playframe-iframe')).toHaveAttribute('src', '/play/p1');
  });

  it('renders empty state when playUrl is null（无试玩版本）', () => {
    renderFrame(null);
    expect(screen.getByText('暂不可试玩')).toBeInTheDocument();
    expect(screen.queryByTestId('playframe-iframe')).not.toBeInTheDocument();
  });
});
