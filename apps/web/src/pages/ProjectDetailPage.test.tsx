import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectDetailPage } from './ProjectDetailPage';
import { renderWithProviders } from '../test/renderWithProviders';
import type { ProjectDetail } from '../types/marketplace';

const USER = {
  id: 'u1',
  email: 'buyer@vibes.local',
  displayName: '小明',
  roles: ['buyer'],
  avatarUrl: null,
  ratingAvg: 0,
  ratingCount: 0,
  isAdmin: false,
};

const DETAIL: ProjectDetail = {
  id: 'p1',
  title: '贪吃蛇 3D',
  description: '一个 3D 贪吃蛇小游戏。',
  category: 'game',
  priceCr: 9900,
  trialScope: '前 3 关可玩',
  coverUrl: '/api/files/p1/cover.png',
  playUrl: '/play/p1',
  seller: { id: 'u2', displayName: '老张', email: 'seller@vibes.local' },
  avgRating: 4.8,
  ratingCount: 21,
  status: 'approved',
  reviews: [{ id: 'r1', rating: 5, comment: '好玩', user: { id: 'u9', displayName: '小红' }, createdAt: '2026-08-01T00:00:00Z' }],
  isPurchased: false,
  canDownload: false,
  existingOrder: null,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface RouteEntry {
  match: (url: string) => boolean;
  method?: string;
  respond: (url: string, init?: RequestInit) => Response;
}

/** 可断言的 fetch mock（按 URL/方法路由） */
function mockApi(routes: RouteEntry[]) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const hit = routes.find((r) => r.match(url) && (r as { method?: string }).method === undefined);
    const methodHit = routes.find(
      (r) => r.match(url) && (r as { method?: string }).method === method,
    );
    const route = methodHit ?? hit;
    if (!route) return Promise.reject(new Error(`unmocked: ${method} ${url}`));
    return Promise.resolve(route.respond(url, init));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderDetail(path = '/project/p1', withUser = false) {
  if (withUser) {
    localStorage.setItem('vibe.token', 'jwt');
  }
  return renderWithProviders(
    <Routes>
      <Route path="/project/:id" element={<ProjectDetailPage />} />
      <Route path="/login" element={<h1>登录</h1>} />
      <Route path="/wallet" element={<h1>钱包</h1>} />
      <Route path="/library" element={<h1>My Library</h1>} />
    </Routes>,
    path,
  );
}

describe('ProjectDetailPage（区域 1 详情页）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders info area + play area + action row + reviews on success（成功态）', async () => {
    mockApi([
      {
        match: (u) => u === '/api/projects/p1',
        respond: () => jsonResponse(DETAIL),
      },
    ]);
    renderDetail();
    // 信息区
    expect(await screen.findByRole('heading', { name: '贪吃蛇 3D' })).toBeInTheDocument();
    expect(screen.getByText('老张')).toBeInTheDocument();
    // 价格可能同时出现在信息区与购买区报价行 → 至少一处
    expect(screen.getAllByText('9900 CR').length).toBeGreaterThan(0);
    expect(screen.getByText(/试用范围：/)).toBeInTheDocument();
    expect(screen.getByText('前 3 关可玩')).toBeInTheDocument();
    // 试玩区 iframe（安全参数断言见 PlayFrame.test）
    expect(screen.getByTestId('playframe-iframe')).toHaveAttribute('src', '/play/p1');
    // 操作行常驻：联系卖家（mailto）/ 举报 / ···
    const contact = screen.getByRole('link', { name: /联系卖家/ });
    expect(contact).toHaveAttribute('href', expect.stringContaining('mailto:seller@vibes.local'));
    expect(screen.getByRole('button', { name: /举报/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更多操作' })).toBeInTheDocument();
    // 评论区
    expect(screen.getByText('小红')).toBeInTheDocument();
    expect(screen.getByText('好玩')).toBeInTheDocument();
  });

  it('shows 404-style empty state for missing project（404）', async () => {
    mockApi([
      {
        match: (u) => u === '/api/projects/nope',
        respond: () => jsonResponse({ error: { code: 'NOT_FOUND', message: '作品不存在' } }, 404),
      },
    ]);
    renderDetail('/project/nope');
    expect(await screen.findByText('作品不存在')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '去 Marketplace' })).toBeInTheDocument();
  });

  it('shows error banner with retry on other failures（错误态）', async () => {
    const fetchMock = mockApi([
      {
        match: (u) => u === '/api/projects/p1',
        respond: () => jsonResponse({ error: { code: 'INTERNAL', message: '服务器开小差了' } }, 500),
      },
    ]);
    renderDetail();
    expect(await screen.findByText('加载作品详情失败')).toBeInTheDocument();
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(DETAIL)));
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByRole('heading', { name: '贪吃蛇 3D' })).toBeInTheDocument();
  });

  it('report flow: opens dialog → submits reason → toast + closes（举报）', async () => {
    const fetchMock = mockApi([
      { match: (u) => u === '/api/projects/p1', respond: () => jsonResponse(DETAIL) },
      {
        match: (u) => u === '/api/projects/p1/report',
        method: 'POST',
        respond: () => jsonResponse({ ok: true, reportId: 'rep1' }, 201),
      },
    ]);
    renderDetail();
    await screen.findByRole('heading', { name: '贪吃蛇 3D' });

    await userEvent.click(screen.getByRole('button', { name: /举报/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/举报《贪吃蛇 3D》/)).toBeInTheDocument();

    await userEvent.selectOptions(within(dialog).getByLabelText('举报理由（必填）'), '内容不实或与描述不符');
    await userEvent.click(within(dialog).getByRole('button', { name: '提交举报' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/p1/report',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    // 成功：Toast + 关闭弹窗
    expect(await screen.findByTestId('toast')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('report error shows inside the form（举报错误态在表单内）', async () => {
    mockApi([
      { match: (u) => u === '/api/projects/p1', respond: () => jsonResponse(DETAIL) },
      {
        match: (u) => u === '/api/projects/p1/report',
        method: 'POST',
        respond: () => jsonResponse({ error: { code: 'VALIDATION', message: '理由太短了' } }, 400),
      },
    ]);
    renderDetail();
    await screen.findByRole('heading', { name: '贪吃蛇 3D' });
    await userEvent.click(screen.getByRole('button', { name: /举报/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('举报理由（必填）'), '内容不实或与描述不符');
    await userEvent.click(within(dialog).getByRole('button', { name: '提交举报' }));
    expect(await within(dialog).findByText('理由太短了')).toBeInTheDocument();
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('logged-out purchase guides to login（未登录引导登录）', async () => {
    mockApi([{ match: (u) => u === '/api/projects/p1', respond: () => jsonResponse(DETAIL) }]);
    renderDetail();
    await screen.findByRole('heading', { name: '贪吃蛇 3D' });
    expect(screen.getByText('登录后购买')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /登录后购买/ }));
    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument();
  });

  it('purchase flow: quote fallback → order → confirm → pay → success（下单/支付）', async () => {
    const fetchMock = mockApi([
      { match: (u) => u === '/api/auth/me', respond: () => jsonResponse({ user: USER }) },
      { match: (u) => u === '/api/projects/p1', respond: () => jsonResponse(DETAIL) },
      {
        match: (u) => u === '/api/projects/p1/quote',
        respond: () => jsonResponse({ error: { code: 'NOT_FOUND', message: '未实现' } }, 404),
      },
      { match: (u) => u === '/api/wallet', respond: () => jsonResponse({ balanceCr: 50000, escrowHeldCr: 0, currency: 'CR', pendingWithdrawalCr: 0 }) },
      {
        match: (u) => u === '/api/orders',
        method: 'POST',
        respond: () =>
          jsonResponse(
            {
              order: { id: 'o1', orderNo: 'VCM1', priceCr: 9900, feeCr: 495, totalCr: 10395, status: 'pending payment', escrowStatus: 'none', createdAt: '2026-08-24T00:00:00Z', paidAt: null },
            },
            201,
          ),
      },
      {
        match: (u) => u === '/api/orders/o1/pay',
        method: 'POST',
        respond: () =>
          jsonResponse({
            order: { id: 'o1', orderNo: 'VCM1', priceCr: 9900, feeCr: 495, totalCr: 10395, status: 'paid', escrowStatus: 'held', createdAt: '2026-08-24T00:00:00Z', paidAt: '2026-08-24T00:00:00Z' },
            balanceAfterCr: 39605,
          }),
      },
    ]);
    renderDetail('/project/p1', true);
    await screen.findByRole('heading', { name: '贪吃蛇 3D' });

    // 报价：接口 404 → 前端 5% 预览
    const quote = await screen.findByTestId('purchase-quote');
    expect(within(quote).getByText('9900 CR')).toBeInTheDocument();
    expect(within(quote).getByText('495 CR')).toBeInTheDocument();
    expect(within(quote).getByText('10395 CR')).toBeInTheDocument();

    // 下单 → 二次确认弹窗（余额变化两数并列）
    await userEvent.click(screen.getByRole('button', { name: /立即购买 10395 CR/ }));
    const confirm = await screen.findByTestId('purchase-confirm');
    expect(within(confirm).getByText('当前余额')).toBeInTheDocument();
    expect(within(confirm).getByText('50000 CR')).toBeInTheDocument();
    expect(within(confirm).getByText('支付后余额')).toBeInTheDocument();
    expect(within(confirm).getByText('39605 CR')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '确认支付 10395 CR' }));

    // 支付成功面板（§3.4：给结果一个去处）
    expect(await screen.findByText('支付成功')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /去 My Library 运行/ })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/orders', expect.objectContaining({ method: 'POST' }));
      expect(fetchMock).toHaveBeenCalledWith('/api/orders/o1/pay', expect.objectContaining({ method: 'POST' }));
    });
  });

  it('shows 已在 My Library for purchased project（已购态）', async () => {
    mockApi([
      { match: (u) => u === '/api/auth/me', respond: () => jsonResponse({ user: USER }) },
      {
        match: (u) => u === '/api/projects/p1',
        respond: () => jsonResponse({ ...DETAIL, isPurchased: true, canDownload: true }),
      },
    ]);
    renderDetail('/project/p1', true);
    expect(await screen.findByText('已在 My Library')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /去 My Library/ })).toBeInTheDocument();
  });

  it('shows reviews empty state when no reviews（评论空态）', async () => {
    mockApi([
      {
        match: (u) => u === '/api/projects/p1',
        respond: () => jsonResponse({ ...DETAIL, reviews: [], ratingCount: 0, avgRating: null }),
      },
    ]);
    renderDetail();
    expect(await screen.findByText(/还没有评论/)).toBeInTheDocument();
  });
});
