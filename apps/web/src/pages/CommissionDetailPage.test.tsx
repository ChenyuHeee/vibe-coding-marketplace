/**
 * CommissionDetailPage 测试 —— 需求详情（区域 4/5）：
 * 验收标准锁定视觉 / 投标列表 / contractor 投标（预算区间校验）/ buyer 选中（二次确认 → select+start）。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommissionDetailPage } from './CommissionDetailPage';
import { renderWithProviders } from '../test/renderWithProviders';
import type { Role } from '../types';
import type { CommissionDetail } from '../types/commission';

vi.mock('../api/commission', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/commission')>();
  return {
    ...actual,
    commissionApi: {
      list: vi.fn(),
      detail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      cancel: vi.fn(),
      bid: vi.fn(),
      select: vi.fn(),
      myBids: vi.fn(),
    },
    contractApi: { ...actual.contractApi, start: vi.fn() },
  };
});

import { commissionApi, contractApi } from '../api/commission';

const mocked = {
  detail: commissionApi.detail as ReturnType<typeof vi.fn>,
  bid: commissionApi.bid as ReturnType<typeof vi.fn>,
  select: commissionApi.select as ReturnType<typeof vi.fn>,
  start: contractApi.start as ReturnType<typeof vi.fn>,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function loginAs(roles: Role[], id = 'u1') {
  localStorage.setItem('vibe.token', 'fake-token');
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return Promise.resolve(
          jsonResponse({
            user: {
              id,
              email: `${id}@vibes.local`,
              displayName: id === 'u-buyer' ? '演示买家' : '演示接单者',
              roles,
              avatarUrl: null,
              ratingAvg: 0,
              ratingCount: 0,
              isAdmin: false,
            },
          }),
        );
      }
      return Promise.reject(new Error(`unmocked: ${url}`));
    }),
  );
}

function makeCommission(overrides: Partial<CommissionDetail> = {}): CommissionDetail {
  return {
    id: 'c1',
    title: '帮我做一个课堂小游戏',
    description: '面向编程课展示的小游戏。',
    budgetMinCr: 1000,
    budgetMaxCr: 3000,
    timelineDays: 7,
    status: 'open',
    bidCount: 1,
    buyer: { id: 'u-buyer', displayName: '演示买家' },
    createdAt: '2026-08-24T10:00:00Z',
    acceptanceCriteria: '1) 可运行\n2) 有计分\n3) 移动端可用',
    criteriaHash: 'sha256:abc123',
    referenceProjects: [{ id: 'p1', title: '贪吃蛇 Classic' }],
    bids: [
      {
        id: 'b1',
        contractor: { id: 'u-con2', displayName: '接单老王' },
        amountCr: 1500,
        proposal: '做过 3 款小游戏，先交付可玩版本。',
        status: 'submitted',
        createdAt: '2026-08-24T11:00:00Z',
      },
    ],
    ...overrides,
  };
}

function renderDetail(path: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/commissions/:id" element={<CommissionDetailPage />} />
    </Routes>,
    path,
  );
}

describe('CommissionDetailPage（需求详情）', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('验收标准锁定视觉：Lock 图标 + 已锁定 + 校验哈希 + 只读', async () => {
    loginAs(['buyer'], 'u-buyer');
    mocked.detail.mockResolvedValue({ commission: makeCommission() });
    renderDetail('/commissions/c1');

    expect(await screen.findByText('帮我做一个课堂小游戏')).toBeInTheDocument();
    expect(screen.getByText('已锁定 · 不可修改')).toBeInTheDocument();
    expect(screen.getByText(/sha256:abc123/)).toBeInTheDocument();
    expect(screen.getByText('1) 可运行')).toBeInTheDocument();
    // 参考作品链接
    expect(screen.getByRole('link', { name: /贪吃蛇 Classic/ })).toBeInTheDocument();
    // 投标列表
    expect(screen.getByText('接单老王')).toBeInTheDocument();
    expect(screen.getByText(/1500 CR/)).toBeInTheDocument();
  });

  it('buyer：选中投标 → ConfirmDialog 金额+托管说明 → select + start 串行调用', async () => {
    loginAs(['buyer'], 'u-buyer');
    mocked.detail.mockResolvedValue({ commission: makeCommission() });
    mocked.select.mockResolvedValue({
      contract: {
        id: 'k1',
        commissionId: 'c1',
        buyerId: 'u-buyer',
        contractorId: 'u-con',
        bidId: 'b1',
        agreedAmountCr: 1500,
        status: 'selected',
        escrowStatus: 'none',
      },
    });
    mocked.start.mockResolvedValue({ contract: { id: 'k1', status: 'in progress' }, balanceAfterCr: 5000 });

    const user = userEvent.setup();
    renderDetail('/commissions/c1');
    await screen.findByText('帮我做一个课堂小游戏');

    await user.click(screen.getByRole('button', { name: '选中' }));
    // 二次确认：金额 + 预算进托管说明
    const dialog = await screen.findByRole('dialog', { name: '选中该投标' });
    expect(within(dialog).getAllByText(/1500 CR/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/托管 1500 CR/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '确认选中并启动' }));
    await waitFor(() => expect(mocked.select).toHaveBeenCalledWith('c1', 'b1'));
    await waitFor(() => expect(mocked.start).toHaveBeenCalledWith('k1'));
  });

  it('contractor：投标金额须在预算区间内；超出 → 就地错误；合法 → bid 调用', async () => {
    loginAs(['contractor', 'buyer'], 'u-con');
    mocked.detail.mockResolvedValue({ commission: makeCommission() });
    mocked.bid.mockResolvedValue({ bid: { id: 'b2', commissionId: 'c1', amountCr: 2000, proposal: 'x', status: 'submitted', createdAt: 't' } });

    const user = userEvent.setup();
    renderDetail('/commissions/c1');
    await screen.findByText('帮我做一个课堂小游戏');

    // 超出预算区间（> 3000）
    await user.type(screen.getByLabelText(/报价（CR）/), '9999');
    await user.type(screen.getByLabelText(/方案说明/), '我能做');
    await user.click(screen.getByRole('button', { name: '提交投标' }));
    expect(await screen.findByText(/报价必须在预算区间/)).toBeInTheDocument();
    expect(mocked.bid).not.toHaveBeenCalled();

    // 合法金额
    const amount = screen.getByLabelText(/报价（CR）/) as HTMLInputElement;
    await user.clear(amount);
    await user.type(amount, '2000');
    await user.click(screen.getByRole('button', { name: '提交投标' }));
    await waitFor(() => expect(mocked.bid).toHaveBeenCalledWith('c1', { amountCr: 2000, proposal: '我能做' }));
  });

  it('contractor：已投过 → 显示「我的投标」徽章，不再显示投标表单', async () => {
    loginAs(['contractor', 'buyer'], 'u-con');
    mocked.detail.mockResolvedValue({
      commission: makeCommission({
        bids: [
          {
            id: 'b1',
            contractor: { id: 'u-con', displayName: '接单老王' },
            amountCr: 1500,
            proposal: '我的方案',
            status: 'submitted',
            createdAt: '2026-08-24T11:00:00Z',
          },
        ],
      }),
    });
    renderDetail('/commissions/c1');
    expect(await screen.findByText('你已对这条需求投标：')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '提交投标' })).not.toBeInTheDocument();
  });
});
