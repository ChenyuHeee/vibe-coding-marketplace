import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryPage } from './LibraryPage';
import { renderWithProviders } from '../test/renderWithProviders';
import type { LibraryItem, OrderItem } from '../types/marketplace';

const ITEM: LibraryItem = {
  project: {
    id: 'p1',
    title: '贪吃蛇 3D',
    coverUrl: '/api/files/p1/cover.png',
    playUrl: '/play/p1',
    seller: { id: 'u2', displayName: '老张' },
    status: 'approved',
  },
  orderId: 'o1',
  orderNo: 'VCM202608240001',
  priceCr: 9900,
  totalCr: 10395,
  purchasedAt: '2026-08-20T00:00:00Z',
  status: 'delivered',
  escrowStatus: 'held',
  refundable: true,
};

const DELISTED_ITEM: LibraryItem = {
  ...ITEM,
  orderId: 'o2',
  project: { ...ITEM.project, id: 'p9', title: '已下架作品', status: 'delisted' },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockApi(routes: { match: (u: string) => boolean; method?: string; respond: () => Response | Promise<Response> }[]) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    // 先找方法精确匹配（如 POST 退款），再回退到不限定方法的路由（GET 类）
    const exact = routes.find((r) => r.match(url) && r.method === method);
    const any = routes.find((r) => r.match(url) && r.method === undefined);
    const route = exact ?? any;
    // 「我的订单」列表请求未显式 mock 时默认返回空（Library 页会拉取订单）
    if (!route && url.startsWith('/api/orders?')) {
      return Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }));
    }
    if (!route) return Promise.reject(new Error(`unmocked: ${method} ${url}`));
    return Promise.resolve(route.respond());
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderLibrary() {
  return renderWithProviders(
    <Routes>
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/marketplace" element={<h1>Marketplace</h1>} />
    </Routes>,
    '/library',
  );
}

describe('LibraryPage（区域 3 My Library）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // 还原 URL.createObjectURL / revokeObjectURL（jsdom 无实现，测试注入的 mock）
    (URL as unknown as { createObjectURL?: unknown }).createObjectURL = undefined;
    (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL = undefined;
  });

  it('shows skeleton while loading（加载态）', () => {
    mockApi([{ match: (u) => u === '/api/library', respond: () => new Promise<Response>(() => {}) }]);
    renderLibrary();
    expect(screen.getByTestId('library-loading')).toBeInTheDocument();
  });

  it('shows error banner with retry（错误态）', async () => {
    const fetchMock = mockApi([
      {
        match: (u) => u === '/api/library',
        respond: () => jsonResponse({ error: { code: 'INTERNAL', message: '服务器开小差了' } }, 500),
      },
    ]);
    renderLibrary();
    expect(await screen.findByText('加载已购作品失败')).toBeInTheDocument();
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ items: [ITEM] })));
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('贪吃蛇 3D')).toBeInTheDocument();
  });

  it('shows empty state with 去逛逛 Marketplace CTA（空态）', async () => {
    mockApi([{ match: (u) => u === '/api/library', respond: () => jsonResponse({ items: [] }) }]);
    renderLibrary();
    const empty = await screen.findByTestId('library-empty');
    expect(within(empty).getByText('还没有已购作品')).toBeInTheDocument();
    await userEvent.click(within(empty).getByRole('button', { name: '去逛逛 Marketplace' }));
    expect(await screen.findByRole('heading', { name: 'Marketplace' })).toBeInTheDocument();
  });

  it('renders purchased list with status badge, actions and delisted note（成功态）', async () => {
    mockApi([
      { match: (u) => u === '/api/library', respond: () => jsonResponse({ items: [ITEM, DELISTED_ITEM] }) },
    ]);
    renderLibrary();
    expect(await screen.findByText('贪吃蛇 3D')).toBeInTheDocument();
    expect(screen.getByText('已下架作品')).toBeInTheDocument();
    // 状态徽章（交付中）与下架保留访问权说明
    expect(screen.getAllByText('已交付').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/已下架（保留访问权）/)).toBeInTheDocument();
    // 两个动作直接可见
    expect(screen.getAllByRole('button', { name: /在线运行/ }).length).toBe(2);
    expect(screen.getAllByRole('button', { name: /^下载$/ }).length).toBe(2);
    // 退款路径常驻
    expect(screen.getAllByRole('button', { name: /申请退款/ }).length).toBe(2);
    expect(screen.getAllByRole('button', { name: /退款政策/ }).length).toBe(2);
  });

  it('在线运行 opens dialog with play iframe via run endpoint', async () => {
    const fetchMock = mockApi([
      { match: (u) => u === '/api/library', respond: () => jsonResponse({ items: [ITEM] }) },
      { match: (u) => u === '/api/library/p1/run', respond: () => jsonResponse({ playUrl: '/play/p1?order=o1' }) },
    ]);
    renderLibrary();
    await screen.findByText('贪吃蛇 3D');

    await userEvent.click(screen.getByRole('button', { name: /在线运行/ }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/library/p1/run', expect.anything());
    });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/在线运行《贪吃蛇 3D》/)).toBeInTheDocument();
    expect(await within(dialog).findByTestId('playframe-iframe')).toHaveAttribute(
      'src',
      '/play/p1?order=o1',
    );
  });

  it('下载 triggers zip download endpoint', async () => {
    // jsdom 未实现 URL.createObjectURL → 注入 mock（测试结束还原为 undefined）
    URL.createObjectURL = vi.fn(() => 'blob:fake') as never;
    URL.revokeObjectURL = vi.fn() as never;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const fetchMock = mockApi([
      { match: (u) => u === '/api/library', respond: () => jsonResponse({ items: [ITEM] }) },
      {
        match: (u) => u === '/api/projects/p1/download',
        respond: () => new Response(new Blob(['zip-data'], { type: 'application/zip' })),
      },
    ]);
    renderLibrary();
    await screen.findByText('贪吃蛇 3D');

    await userEvent.click(screen.getByRole('button', { name: /^下载$/ }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/p1/download',
        expect.objectContaining({ headers: expect.anything() }),
      );
    });
    expect(screen.getByText(/已开始下载/)).toBeInTheDocument();
  });

  it('退款政策 opens policy dialog（退款路径可被找到）', async () => {
    mockApi([{ match: (u) => u === '/api/library', respond: () => jsonResponse({ items: [ITEM] }) }]);
    renderLibrary();
    await screen.findByText('贪吃蛇 3D');

    await userEvent.click(screen.getAllByRole('button', { name: /退款政策/ })[0]);
    const dialog = await screen.findByTestId('policy-dialog');
    expect(within(dialog).getByText('退款政策')).toBeInTheDocument();
    expect(within(dialog).getByText(/可申请全额退款/)).toBeInTheDocument();
  });

  it('申请退款 flow: confirm dialog → POST refund → success toast + status updated', async () => {
    const fetchMock = mockApi([
      { match: (u) => u === '/api/library', respond: () => jsonResponse({ items: [ITEM] }) },
      {
        match: (u) => u === '/api/orders/o1/refund',
        method: 'POST',
        respond: () => jsonResponse({ order: { id: 'o1' }, refundedCr: 10395, balanceAfterCr: 5000 }),
      },
    ]);
    renderLibrary();
    await screen.findByText('贪吃蛇 3D');

    await userEvent.click(screen.getByRole('button', { name: /申请退款/ }));
    const confirm = await screen.findByTestId('refund-confirm');
    expect(within(confirm).getByText(/10395 CR/)).toBeInTheDocument();
    expect(within(confirm).getByText(/14 天内可申请/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '确认退款' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/orders/o1/refund', expect.objectContaining({ method: 'POST' }));
    });
    // 成功 Toast + 徽章变为已退款
    expect(await screen.findByTestId('toast')).toBeInTheDocument();
    expect(await screen.findByText('已退款')).toBeInTheDocument();
  });

  // ---- 我的订单（进行中）—— 订单恢复路径 ----

  const PENDING_ORDER: OrderItem = {
    id: 'o-pending',
    orderNo: 'VCM202608249999',
    project: { id: 'p1', title: '贪吃蛇 3D', coverUrl: null, playUrl: '/play/p1', status: 'approved' },
    priceCr: 9900,
    feeCr: 495,
    totalCr: 10395,
    status: 'pending payment',
    escrowStatus: 'none',
    createdAt: '2026-08-24T00:00:00Z',
    paidAt: null,
    deliveredAt: null,
    completedAt: null,
    refundedAt: null,
    cancelledAt: null,
  };

  const PAID_ORDER: OrderItem = {
    ...PENDING_ORDER,
    id: 'o-paid',
    orderNo: 'VCM202608240001',
    status: 'paid',
    escrowStatus: 'held',
    paidAt: '2026-08-24T01:00:00Z',
  };

  it('我的订单：待支付订单显示 去支付/取消订单，取消一步完成（不追问）', async () => {
    const fetchMock = mockApi([
      { match: (u) => u === '/api/library', respond: () => jsonResponse({ items: [] }) },
      {
        match: (u) => u.startsWith('/api/orders?'),
        respond: () => jsonResponse({ items: [PENDING_ORDER], page: 1, pageSize: 20, total: 1 }),
      },
      {
        match: (u) => u === '/api/orders/o-pending/cancel',
        method: 'POST',
        respond: () => jsonResponse({ order: { ...PENDING_ORDER, status: 'cancelled' } }),
      },
    ]);
    renderLibrary();
    const section = await screen.findByTestId('library-orders');
    expect(within(section).getByText('我的订单（进行中）')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: /去支付/ })).toBeInTheDocument();

    await userEvent.click(within(section).getByRole('button', { name: /取消订单/ }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/orders/o-pending/cancel',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByTestId('toast')).toBeInTheDocument();
  });

  it('我的订单：去支付 → 二次确认弹窗（总价）→ POST pay', async () => {
    const fetchMock = mockApi([
      { match: (u) => u === '/api/library', respond: () => jsonResponse({ items: [] }) },
      {
        match: (u) => u.startsWith('/api/orders?'),
        respond: () => jsonResponse({ items: [PENDING_ORDER], page: 1, pageSize: 20, total: 1 }),
      },
      {
        match: (u) => u === '/api/orders/o-pending/pay',
        method: 'POST',
        respond: () =>
          jsonResponse({ order: { ...PENDING_ORDER, status: 'paid', escrowStatus: 'held' }, balanceAfterCr: 5000 }),
      },
    ]);
    renderLibrary();
    const section = await screen.findByTestId('library-orders');
    await userEvent.click(within(section).getByRole('button', { name: /去支付/ }));
    const dialog = await screen.findByTestId('order-pay-confirm');
    expect(within(dialog).getByText(/10395 CR/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /确认支付/ }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/orders/o-pending/pay',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByTestId('toast')).toBeInTheDocument();
  });

  it('我的订单：确认收货必须先查看交付物（未勾选禁用 + 附说明，PRD §4）', async () => {
    const fetchMock = mockApi([
      { match: (u) => u === '/api/library', respond: () => jsonResponse({ items: [] }) },
      {
        match: (u) => u.startsWith('/api/orders?'),
        respond: () => jsonResponse({ items: [PAID_ORDER], page: 1, pageSize: 20, total: 1 }),
      },
      {
        match: (u) => u === '/api/orders/o-paid/confirm',
        method: 'POST',
        respond: () =>
          jsonResponse({ order: { ...PAID_ORDER, status: 'completed', escrowStatus: 'released' } }),
      },
    ]);
    renderLibrary();
    const section = await screen.findByTestId('library-orders');
    await userEvent.click(within(section).getByRole('button', { name: /确认收货/ }));

    const receipt = await screen.findByTestId('order-confirm-receipt');
    const confirmBtn = screen.getByRole('button', { name: '确认收货并放款' });
    // 未查看交付物 → 禁用且附说明（禁用 ≠ 看不见）
    expect(confirmBtn).toBeDisabled();
    expect(screen.getByText(/未预览不可放款/)).toBeInTheDocument();
    expect(within(receipt).getByTestId('playframe-iframe')).toBeInTheDocument();

    // 勾选「我已查看交付物」→ 放款可用
    await userEvent.click(within(receipt).getByRole('checkbox'));
    expect(confirmBtn).toBeEnabled();
    await userEvent.click(confirmBtn);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/orders/o-paid/confirm',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByTestId('toast')).toBeInTheDocument();
  });
});
