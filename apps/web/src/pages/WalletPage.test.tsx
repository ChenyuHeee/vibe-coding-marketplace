import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WalletPage } from './WalletPage';
import { renderWithProviders } from '../test/renderWithProviders';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SUMMARY = { balanceCr: 5000, escrowHeldCr: 525, currency: 'CR', pendingWithdrawalCr: 0 };

const TX = {
  id: 't1',
  type: 'topup',
  direction: 'credit',
  amountCr: 100,
  balanceAfterCr: 5100,
  refType: null,
  refId: null,
  status: 'completed',
  note: '模拟支付充值 100 CR 入账',
  createdAt: '2026-08-24T00:00:00Z',
};

const WD = {
  id: 'w1',
  amountCr: 200,
  status: 'withdrawal pending',
  etaDays: 2,
  bankName: '测试银行',
  cardLast4: '1234',
  holderName: '小明',
  createdAt: '2026-08-24T00:00:00Z',
};

const ESCROW = {
  items: [
    {
      refType: 'order',
      refId: 'ord_demo_1',
      direction: 'in',
      amountCr: 525,
      escrowStatus: 'held',
      party: '我(买家)',
      eta: '退款窗口内可申请退回',
    },
  ],
};

function mockApi(routes: { match: (u: string) => boolean; method?: string; respond: () => Response }[]) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    // 先找方法精确匹配（如 POST 提现），再回退到不限定方法的路由（GET 类）
    const exact = routes.find((r) => r.match(url) && r.method === method);
    const any = routes.find((r) => r.match(url) && r.method === undefined);
    const route = exact ?? any;
    if (!route) return Promise.reject(new Error(`unmocked: ${method} ${url}`));
    return Promise.resolve(route.respond());
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function defaultRoutes() {
  return [
    { match: (u: string) => u === '/api/wallet', respond: () => jsonResponse(SUMMARY) },
    {
      match: (u: string) => u.startsWith('/api/wallet/transactions'),
      respond: () => jsonResponse({ items: [TX], page: 1, pageSize: 10, total: 1 }),
    },
    {
      match: (u: string) => u.startsWith('/api/wallet/withdrawals'),
      respond: () => jsonResponse({ items: [WD], page: 1, pageSize: 10, total: 1 }),
    },
    { match: (u: string) => u === '/api/wallet/escrow', respond: () => jsonResponse(ESCROW) },
  ];
}

describe('WalletPage（区域 6 钱包）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders balance card with two questions one-glance（§8 #4 钱在谁手里/何时到账）', async () => {
    mockApi(defaultRoutes());
    renderWithProviders(<WalletPage />, '/wallet');
    const card = await screen.findByTestId('wallet-balance');
    expect(within(card).getByText('钱在谁手里')).toBeInTheDocument();
    expect(within(card).getByText('何时到账')).toBeInTheDocument();
    expect(within(card).getByText(/托管中/)).toBeInTheDocument();
    expect(within(card).getByText(/可提现/)).toBeInTheDocument();
    expect(within(card).getByText(/1–3 个工作日/)).toBeInTheDocument();
    // 余额大字 tabular-nums（金额可能同时出现在「可提现」行 → 用 aria-label 精确定位）
    expect(within(card).getByLabelText('可用余额 5000 CR')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '充值' })).toBeInTheDocument();
  });

  it('renders summary error banner（错误态）', async () => {
    mockApi([
      { match: (u: string) => u === '/api/wallet', respond: () => jsonResponse({ error: { code: 'INTERNAL', message: '服务器开小差了' } }, 500) },
    ]);
    renderWithProviders(<WalletPage />, '/wallet');
    expect(await screen.findByText(/加载余额失败/)).toBeInTheDocument();
  });

  it('small topup submits directly with confirm:false（小额直提）', async () => {
    const fetchMock = mockApi([
      ...defaultRoutes(),
      {
        match: (u: string) => u === '/api/wallet/topup',
        method: 'POST',
        respond: () => jsonResponse({ balanceAfterCr: 5050, transaction: TX }),
      },
    ]);
    renderWithProviders(<WalletPage />, '/wallet');
    await screen.findByTestId('wallet-balance');

    await userEvent.type(screen.getByLabelText('充值金额'), '50');
    await userEvent.click(
      within(screen.getByTestId('topup-section')).getByRole('button', { name: '充值' }),
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/wallet/topup',
        expect.objectContaining({ body: JSON.stringify({ amountCr: 50, confirm: false }) }),
      );
    });
    expect(await screen.findByTestId('toast')).toBeInTheDocument();
  });

  it('large topup shows confirm dialog with balance change, then submits confirm:true（大额二次确认）', async () => {
    const fetchMock = mockApi([
      ...defaultRoutes(),
      {
        match: (u: string) => u === '/api/wallet/topup',
        method: 'POST',
        respond: () => jsonResponse({ balanceAfterCr: 5500, transaction: TX }),
      },
    ]);
    renderWithProviders(<WalletPage />, '/wallet');
    await screen.findByTestId('wallet-balance');

    await userEvent.type(screen.getByLabelText('充值金额'), '500');
    await userEvent.click(
      within(screen.getByTestId('topup-section')).getByRole('button', { name: '充值' }),
    );

    // 二次确认弹窗：当前余额 / 充值金额 / 充值后余额 两数并列
    const confirm = await screen.findByTestId('topup-confirm');
    expect(within(confirm).getByText('当前余额')).toBeInTheDocument();
    expect(within(confirm).getByText('5000 CR')).toBeInTheDocument();
    expect(within(confirm).getByText('充值金额')).toBeInTheDocument();
    expect(within(confirm).getByText('500 CR')).toBeInTheDocument();
    expect(within(confirm).getByText('充值后余额')).toBeInTheDocument();
    expect(within(confirm).getByText('5500 CR')).toBeInTheDocument();

    // 确认按钮文案含金额
    await userEvent.click(screen.getByRole('button', { name: '确认充值 500 CR' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/wallet/topup',
        expect.objectContaining({ body: JSON.stringify({ amountCr: 500, confirm: true }) }),
      );
    });
    expect(await screen.findByTestId('toast')).toBeInTheDocument();
  });

  it('renders transactions with note and signed amount（收支记录）', async () => {
    mockApi(defaultRoutes());
    renderWithProviders(<WalletPage />, '/wallet');
    const list = await screen.findByTestId('tx-list');
    expect(within(list).getByText('充值')).toBeInTheDocument();
    expect(within(list).getByText(/模拟支付充值 100 CR 入账/)).toBeInTheDocument();
    expect(within(list).getByText('+100 CR')).toBeInTheDocument();
  });

  it('withdrawal validates cardLast4（4 位数字校验）', async () => {
    mockApi(defaultRoutes());
    renderWithProviders(<WalletPage />, '/wallet');
    await screen.findByTestId('wallet-balance');

    await userEvent.type(screen.getByLabelText(/提现金额/), '200');
    await userEvent.type(screen.getByLabelText(/开户行/), '测试银行');
    await userEvent.type(screen.getByLabelText(/持卡人姓名/), '小明');
    await userEvent.type(screen.getByLabelText(/银行卡号后四位/), '12ab');
    await userEvent.click(screen.getByRole('button', { name: '提现' }));

    expect(await screen.findByText('银行卡后四位需为 4 位数字。')).toBeInTheDocument();
    expect(screen.queryByTestId('withdraw-confirm')).not.toBeInTheDocument();
  });

  it('withdrawal flow: confirm dialog shows amount/actual/ETA then POST（提现二次确认）', async () => {
    const fetchMock = mockApi([
      ...defaultRoutes(),
      {
        match: (u: string) => u === '/api/wallet/withdrawals',
        method: 'POST',
        respond: () => jsonResponse({ withdrawal: WD }, 201),
      },
    ]);
    renderWithProviders(<WalletPage />, '/wallet');
    await screen.findByTestId('wallet-balance');

    await userEvent.type(screen.getByLabelText(/提现金额/), '200');
    await userEvent.type(screen.getByLabelText(/开户行/), '测试银行');
    await userEvent.type(screen.getByLabelText(/持卡人姓名/), '小明');
    await userEvent.type(screen.getByLabelText(/银行卡号后四位/), '1234');
    await userEvent.click(screen.getByRole('button', { name: '提现' }));

    const confirm = await screen.findByTestId('withdraw-confirm');
    expect(within(confirm).getByText('提现金额')).toBeInTheDocument();
    expect(within(confirm).getByText('实际到账')).toBeInTheDocument();
    expect(within(confirm).getByText('到账时间')).toBeInTheDocument();
    expect(within(confirm).getByText(/1–3 个工作日/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '确认提现' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/wallet/withdrawals',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByTestId('toast')).toBeInTheDocument();
  });

  it('renders withdrawal list with pending badge（提现记录状态徽章）', async () => {
    mockApi(defaultRoutes());
    renderWithProviders(<WalletPage />, '/wallet');
    const list = await screen.findByTestId('wd-list');
    expect(within(list).getByText(/测试银行/)).toBeInTheDocument();
    expect(within(list).getByText('提现处理中')).toBeInTheDocument();
  });

  it('renders escrow overview with who/eta fields（托管总览）', async () => {
    mockApi(defaultRoutes());
    renderWithProviders(<WalletPage />, '/wallet');
    const list = await screen.findByTestId('escrow-list');
    expect(within(list).getByText('我(买家)')).toBeInTheDocument();
    expect(within(list).getByText('托管中')).toBeInTheDocument();
    expect(within(list).getByText('退款窗口内可申请退回')).toBeInTheDocument();
    expect(within(list).getByText('525 CR')).toBeInTheDocument();
  });
});
