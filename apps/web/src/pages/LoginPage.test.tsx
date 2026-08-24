import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { renderWithProviders } from '../test/renderWithProviders';

// 与 @vibe/shared SafeUser 一致
const USER = {
  id: 'u1',
  email: 'a@b.c',
  displayName: '小明',
  roles: ['buyer'],
  avatarUrl: null,
  ratingAvg: 0,
  ratingCount: 0,
  isAdmin: false,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('LoginPage（Epic #1）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders the login form and a link to register', () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<h1>Vibe Coding Marketplace</h1>} />
      </Routes>,
      '/login',
    );
    expect(screen.getByRole('heading', { name: '登录' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去注册' })).toBeInTheDocument();
  });

  it('shows validation error for invalid email', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<h1>Vibe Coding Marketplace</h1>} />
      </Routes>,
      '/login',
    );
    await userEvent.type(screen.getByLabelText('邮箱'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('密码'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('邮箱格式不正确')).toBeInTheDocument();
  });

  it('logs in via POST /api/auth/login and navigates home on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user: USER, token: 'jwt' }));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<h1>Vibe Coding Marketplace</h1>} />
      </Routes>,
      '/login',
    );
    await userEvent.type(screen.getByLabelText('邮箱'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('密码'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
    });
    // 成功 → 跳转首页（登录态保持）
    expect(await screen.findByRole('heading', { name: 'Vibe Coding Marketplace' })).toBeInTheDocument();
  });

  it('shows error banner with server message when login fails（错误态）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: 'UNAUTHORIZED', message: '邮箱或密码错误' } }, 401),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<h1>Vibe Coding Marketplace</h1>} />
      </Routes>,
      '/login',
    );
    await userEvent.type(screen.getByLabelText('邮箱'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('密码'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('登录失败')).toBeInTheDocument();
    expect(screen.getByText(/邮箱或密码错误/)).toBeInTheDocument();
  });
});
