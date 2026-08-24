/**
 * CommissionsPage 测试 —— 需求板（区域 4）：列表 / 空态 / 错误 / 骨架 + 筛选。
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommissionsPage } from './CommissionsPage';
import { renderWithProviders } from '../test/renderWithProviders';
import type { CommissionListItem } from '../types/commission';

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
    contractApi: actual.contractApi,
  };
});

import { commissionApi } from '../api/commission';

const mockedList = commissionApi.list as ReturnType<typeof vi.fn>;

const ITEMS: CommissionListItem[] = [
  {
    id: 'c1',
    title: '帮我做一个课堂小游戏',
    budgetMinCr: 1000,
    budgetMaxCr: 3000,
    timelineDays: 7,
    status: 'open',
    bidCount: 2,
    buyer: { id: 'u1', displayName: '小明' },
    createdAt: '2026-08-24T10:00:00Z',
  },
  {
    id: 'c2',
    title: 'Markdown 笔记工具',
    budgetMinCr: 500,
    budgetMaxCr: 1500,
    timelineDays: 14,
    status: 'in progress',
    bidCount: 3,
    buyer: { id: 'u2', displayName: '小红' },
    createdAt: '2026-08-23T10:00:00Z',
  },
];

describe('CommissionsPage（需求板）', () => {
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('骨架屏加载（进行中态）', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<CommissionsPage />, '/commissions');
    expect(screen.getByTestId('commission-loading')).toBeInTheDocument();
  });

  it('列表渲染：预算区间 num / 时间线 / 投标数 / 状态徽章（词汇表）', async () => {
    mockedList.mockResolvedValue({ items: ITEMS, page: 1, pageSize: 12, total: 2 });
    renderWithProviders(<CommissionsPage />, '/commissions');
    expect(await screen.findByText('帮我做一个课堂小游戏')).toBeInTheDocument();
    expect(screen.getByText('1000 CR – 3000 CR')).toBeInTheDocument();
    expect(screen.getAllByText('7 天').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/个投标/).length).toBeGreaterThan(0);
    expect(screen.getByTitle('open')).toBeInTheDocument();
    expect(screen.getByTitle('in progress')).toBeInTheDocument();
    expect(screen.getByText('共 2 个需求')).toBeInTheDocument();
  });

  it('错误态：横幅 + 重试成功', async () => {
    mockedList.mockRejectedValueOnce(new Error('服务器没有响应。'));
    renderWithProviders(<CommissionsPage />, '/commissions');
    expect(await screen.findByText('加载需求列表失败')).toBeInTheDocument();

    mockedList.mockResolvedValue({ items: ITEMS, page: 1, pageSize: 12, total: 2 });
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('帮我做一个课堂小游戏')).toBeInTheDocument();
  });

  it('空态：还没有需求 → 发布第一个需求（引导 /commissions/new）', async () => {
    mockedList.mockResolvedValue({ items: [], page: 1, pageSize: 12, total: 0 });
    renderWithProviders(<CommissionsPage />, '/commissions');
    expect(await screen.findByText('还没有需求')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布第一个需求' })).toBeInTheDocument();
  });

  it('筛选：点击状态 chip → 携带 status 参数重新请求', async () => {
    mockedList.mockResolvedValue({ items: [], page: 1, pageSize: 12, total: 0 });
    renderWithProviders(<CommissionsPage />, '/commissions');
    await screen.findByText('还没有需求');

    await userEvent.click(screen.getByRole('button', { name: '开放中' }));
    await new Promise((r) => setTimeout(r, 50));
    const lastCall = mockedList.mock.calls[mockedList.mock.calls.length - 1][0] as { status: string };
    expect(lastCall.status).toBe('open');
  });
});
