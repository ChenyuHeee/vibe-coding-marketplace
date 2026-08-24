import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from './ProfilePage';
import { renderWithProviders } from '../test/renderWithProviders';

// 与 @vibe/shared SafeUser 一致
const USER = {
  id: 'u1',
  email: 'a@b.c',
  displayName: '小明',
  roles: ['buyer', 'seller', 'contractor'],
  avatarUrl: null,
  ratingAvg: 4.7,
  ratingCount: 12,
  isAdmin: false,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ProfilePage（Epic #1：角色切换器 D4 + 登出）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads user via /api/auth/me and shows roles（并存三种角色）', async () => {
    localStorage.setItem('vibe.token', 'jwt');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ user: USER }));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/" element={<h1>Vibe Coding Marketplace</h1>} />
      </Routes>,
      '/profile',
    );

    expect(await screen.findByText('小明')).toBeInTheDocument();
    expect(screen.getByText('a@b.c')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ method: 'GET' }));

    // D4：三种角色并存展示，均可切换
    expect(screen.getByRole('button', { name: /买家/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /卖家/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /接单者/ })).toBeInTheDocument();
  });

  it('switches the current role and highlights it（导航按当前角色呈现）', async () => {
    localStorage.setItem('vibe.token', 'jwt');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ user: USER })));

    renderWithProviders(
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/" element={<h1>Vibe Coding Marketplace</h1>} />
      </Routes>,
      '/profile',
    );
    await screen.findByText('小明');

    // 默认主角色 buyer 为当前
    expect(screen.getByRole('button', { name: /买家.*当前|当前.*买家/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // 切到卖家
    await userEvent.click(screen.getByRole('button', { name: /卖家/ }));
    expect(screen.getByRole('button', { name: /卖家.*当前|当前.*卖家/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /买家/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('logs out and navigates home（登出可逆一步可达）', async () => {
    localStorage.setItem('vibe.token', 'jwt');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ user: USER })));

    renderWithProviders(
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/" element={<h1>Vibe Coding Marketplace</h1>} />
      </Routes>,
      '/profile',
    );
    await screen.findByText('小明');

    await userEvent.click(screen.getByRole('button', { name: /退出登录/ }));
    expect(await screen.findByRole('heading', { name: 'Vibe Coding Marketplace' })).toBeInTheDocument();
  });
});
