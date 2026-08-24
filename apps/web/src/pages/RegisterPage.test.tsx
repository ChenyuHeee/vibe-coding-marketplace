import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterPage } from './RegisterPage';
import { renderWithProviders } from '../test/renderWithProviders';

// 与 @vibe/shared SafeUser 一致（后端 getSafeUser 返回 ratingAvg: 0 / isAdmin: false）
const USER = {
  id: 'u1',
  email: 'a@b.c',
  displayName: '小明',
  roles: ['buyer', 'seller'],
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

describe('RegisterPage（Epic #1 / D3/D4）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders the form with role multi-select（主角色 buyer 固定，可勾选 seller/contractor）', () => {
    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<h1>Vibe Coding Marketplace</h1>} />
      </Routes>,
      '/register',
    );
    expect(screen.getByRole('heading', { name: '注册' })).toBeInTheDocument();

    // D4：主角色 buyer 默认且固定
    expect(screen.getByRole('button', { name: '主角色：买家（固定）' })).toBeDisabled();
    // 可选角色可勾选
    const sellerBtn = screen.getByRole('button', { name: '卖家' });
    expect(sellerBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '接单者' })).toBeInTheDocument();
  });

  it('shows validation error for short password（D3：≥8 位）', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<h1>Vibe Coding Marketplace</h1>} />
      </Routes>,
      '/register',
    );
    await userEvent.type(screen.getByLabelText('邮箱'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('密码'), '123');
    await userEvent.type(screen.getByLabelText('昵称'), '小明');
    await userEvent.click(screen.getByRole('button', { name: '注册' }));

    expect(await screen.findByText('密码太短')).toBeInTheDocument();
    expect(screen.getByText(/密码至少需要 8 位/)).toBeInTheDocument();
  });

  it('submits POST /api/auth/register with roles [buyer, ...selected] and navigates home on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user: USER, token: 'jwt' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<h1>Vibe Coding Marketplace</h1>} />
      </Routes>,
      '/register',
    );
    await userEvent.type(screen.getByLabelText('邮箱'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('密码'), 'secret123');
    await userEvent.type(screen.getByLabelText('昵称'), '小明');
    await userEvent.click(screen.getByRole('button', { name: '卖家' })); // 并存勾选 seller
    await userEvent.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({ method: 'POST' }));
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.email).toBe('a@b.c');
    expect(body.roles).toEqual(['buyer', 'seller']);

    // 成功 → 存 token 并跳转首页（成功态有去处）
    expect(await screen.findByRole('heading', { name: 'Vibe Coding Marketplace' })).toBeInTheDocument();
  });

  it('shows error banner when register fails（四状态中的错误态）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: 'CONFLICT', message: '该邮箱已注册' } }, 409),
      ),
    );
    renderWithProviders(<RegisterPage />, '/register');
    await userEvent.type(screen.getByLabelText('邮箱'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('密码'), 'secret123');
    await userEvent.type(screen.getByLabelText('昵称'), '小明');
    await userEvent.click(screen.getByRole('button', { name: '注册' }));

    expect(await screen.findByText('注册失败')).toBeInTheDocument();
    expect(screen.getByText(/该邮箱已注册/)).toBeInTheDocument();
  });
});
