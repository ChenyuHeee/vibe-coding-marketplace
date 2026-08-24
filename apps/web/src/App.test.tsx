import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App', () => {
  beforeEach(() => {
    // 测试环境无后端，fetch 直接失败 → 页面进入 error 态（四状态之一）
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no server'))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the marketplace title', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Vibe Coding Marketplace' })).toBeInTheDocument();
    // 等待 fetch 副作用落定，避免 act 警告
    await screen.findByText(/API 状态：不可用/);
  });

  it('shows the error state when the API is unreachable', async () => {
    render(<App />);
    expect(await screen.findByText(/API 状态：不可用/)).toBeInTheDocument();
  });
});
