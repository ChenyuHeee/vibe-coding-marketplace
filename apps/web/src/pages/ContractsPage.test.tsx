/**
 * ContractsPage 测试 —— 我的合同列表（区域 5）：买家/接单者视角 + 状态徽章 + 空态。
 */
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContractsPage } from './ContractsPage';
import { renderWithProviders } from '../test/renderWithProviders';
import type { Role } from '../types';
import type { ContractItem } from '../types/commission';

vi.mock('../api/commission', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/commission')>();
  return {
    ...actual,
    commissionApi: actual.commissionApi,
    contractApi: { ...actual.contractApi, list: vi.fn() },
  };
});

import { contractApi } from '../api/commission';

const mockedList = contractApi.list as ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function loginAs(roles: Role[]) {
  localStorage.setItem('vibe.token', 'fake-token');
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return Promise.resolve(
          jsonResponse({
            user: {
              id: 'u1',
              email: 'buyer@vibes.local',
              displayName: '演示用户',
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

function makeItem(overrides: Partial<ContractItem> = {}): ContractItem {
  return {
    id: 'k1',
    commission: { id: 'c1', title: '帮我做一个课堂小游戏', status: 'in progress' },
    buyer: { id: 'u1', displayName: '演示买家' },
    contractor: { id: 'u2', displayName: '接单老王' },
    bidId: 'b1',
    agreedAmountCr: 1500,
    status: 'in progress',
    escrowStatus: 'held',
    acceptedAt: null,
    paidAt: null,
    createdAt: '2026-08-24T12:00:00Z',
    updatedAt: '2026-08-24T12:00:00Z',
    ...overrides,
  };
}

describe('ContractsPage（我的合同）', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('买家视角：列表渲染 + 合同状态徽章（同一状态词）+ 托管标签', async () => {
    loginAs(['buyer']);
    mockedList.mockResolvedValue({ items: [makeItem()], page: 1, pageSize: 10, total: 1 });
    renderWithProviders(<ContractsPage />, '/contracts');

    expect(await screen.findByText('帮我做一个课堂小游戏')).toBeInTheDocument();
    expect(screen.getByText(/接单者：接单老王/)).toBeInTheDocument();
    expect(screen.getByText(/1500 CR/)).toBeInTheDocument();
    expect(screen.getByTitle('in progress')).toBeInTheDocument();
    expect(screen.getByText(/托管：held/)).toBeInTheDocument();
  });

  it('切到「我接的」视角 → role=contractor 请求', async () => {
    loginAs(['buyer', 'contractor']);
    mockedList.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    const user = (await import('@testing-library/user-event')).default;
    renderWithProviders(<ContractsPage />, '/contracts');
    await screen.findByText('我的合同');

    await user.click(screen.getByRole('button', { name: '我接的' }));
    await new Promise((r) => setTimeout(r, 50));
    const lastCall = mockedList.mock.calls[mockedList.mock.calls.length - 1][0] as { role: string };
    expect(lastCall.role).toBe('contractor');
  });

  it('空态：还没有发布的合同 → 引导发布需求', async () => {
    loginAs(['buyer']);
    mockedList.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    renderWithProviders(<ContractsPage />, '/contracts');
    expect(await screen.findByText('还没有发布的合同')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布需求' })).toBeInTheDocument();
  });

  it('错误态：横幅 + 重试', async () => {
    loginAs(['buyer']);
    mockedList.mockRejectedValueOnce(new Error('服务器没有响应。'));
    renderWithProviders(<ContractsPage />, '/contracts');
    expect(await screen.findByText('加载合同列表失败')).toBeInTheDocument();
  });
});
