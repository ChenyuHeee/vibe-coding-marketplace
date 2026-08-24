/**
 * CommissionNewPage 测试 —— 发布需求（区域 4）：
 * Q1 示例 chip / 表单校验 / 验收标准锁定提示 / 提交成功页（给结果一个去处）。
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommissionNewPage } from './CommissionNewPage';
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
    contractApi: actual.contractApi,
  };
});

vi.mock('../api/marketplace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/marketplace')>();
  return { ...actual, projectApi: { ...actual.projectApi, list: vi.fn() } };
});

import { commissionApi } from '../api/commission';

const mockedCreate = commissionApi.create as ReturnType<typeof vi.fn>;

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
              id: 'u-buyer',
              email: 'buyer@vibes.local',
              displayName: '演示买家',
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

function makeCommission(id: string): CommissionDetail {
  return {
    id,
    title: '帮我做一个课堂小游戏',
    description: '可运行、有计分',
    budgetMinCr: 1000,
    budgetMaxCr: 3000,
    timelineDays: 7,
    status: 'open',
    bidCount: 0,
    buyer: { id: 'u-buyer', displayName: '演示买家' },
    createdAt: '2026-08-24T10:00:00Z',
    acceptanceCriteria: '1) 可运行 2) 有计分',
    criteriaHash: 'sha256:abc',
    referenceProjects: [],
    bids: [],
  };
}

describe('CommissionNewPage（发布需求）', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('无 buyer 角色 → 引导开通', async () => {
    loginAs(['contractor']);
    renderWithProviders(<CommissionNewPage />, '/commissions/new');
    expect(await screen.findByText('开通 buyer 角色后可发布需求')).toBeInTheDocument();
  });

  it('Q1：3 个可点击示例 chip 点击即填入描述', async () => {
    loginAs(['buyer']);
    const user = userEvent.setup();
    renderWithProviders(<CommissionNewPage />, '/commissions/new');
    await screen.findByRole('heading', { level: 1, name: '发布需求' });

    const chip = screen.getByRole('button', { name: '7 天内做一个课堂小游戏，要有计分，最好手机也能玩' });
    expect(chip).toBeInTheDocument();
    await user.click(chip);
    const desc = screen.getByLabelText('描述你想做的事 （必填）') as HTMLTextAreaElement;
    expect(desc.value).toContain('课堂小游戏');
  });

  it('表单校验：缺字段提交 → 就地错误（图标+文字）', async () => {
    loginAs(['buyer']);
    const user = userEvent.setup();
    renderWithProviders(<CommissionNewPage />, '/commissions/new');
    await screen.findByRole('heading', { level: 1, name: '发布需求' });

    await user.click(screen.getByRole('button', { name: '发布需求' }));
    expect(screen.getByText('标题不能为空。')).toBeInTheDocument();
    expect(screen.getByText('验收标准不能为空（发布后不可修改）。')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('验收标准锁定提示（表单内说明「发布后不可修改」）', async () => {
    loginAs(['buyer']);
    renderWithProviders(<CommissionNewPage />, '/commissions/new');
    expect(await screen.findByText(/验收标准是之后验收与纠纷的源头/)).toBeInTheDocument();
    expect(screen.getByText(/发布后不可修改/)).toBeInTheDocument();
  });

  it('提交成功 → 成功页（查看需求 / 复制链接分享 / 再发一个）+ 入参正确', async () => {
    loginAs(['buyer']);
    mockedCreate.mockResolvedValue({ commission: makeCommission('c-new') });
    const user = userEvent.setup();
    renderWithProviders(<CommissionNewPage />, '/commissions/new');
    await screen.findByRole('heading', { level: 1, name: '发布需求' });

    await user.type(screen.getByLabelText('标题 （必填）'), '帮我做一个课堂小游戏');
    await user.type(screen.getByLabelText('描述你想做的事 （必填）'), '可运行、有计分，手机能用');
    await user.type(screen.getByLabelText('预算下限（CR）'), '1000');
    await user.type(screen.getByLabelText('预算上限（CR）'), '3000');
    await user.type(screen.getByLabelText('验收标准 （必填 · 发布即锁定）'), '1) 可运行 2) 有计分');
    await user.click(screen.getByRole('button', { name: '发布需求' }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    const input = mockedCreate.mock.calls[0][0] as { title: string; budgetMinCr: number; budgetMaxCr: number; timelineDays: number; acceptanceCriteria: string };
    expect(input.title).toBe('帮我做一个课堂小游戏');
    expect(input.budgetMinCr).toBe(1000);
    expect(input.budgetMaxCr).toBe(3000);
    expect(input.acceptanceCriteria).toContain('有计分');

    // 成功页：给结果一个去处（§3.4）
    expect(await screen.findByText('需求已发布')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看需求' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /复制链接分享/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再发一个' })).toBeInTheDocument();
  });

  it('预算区间校验：下限大于上限 → 就地错误', async () => {
    loginAs(['buyer']);
    const user = userEvent.setup();
    renderWithProviders(<CommissionNewPage />, '/commissions/new');
    await screen.findByRole('heading', { level: 1, name: '发布需求' });

    await user.type(screen.getByLabelText('标题 （必填）'), '测试');
    await user.type(screen.getByLabelText('描述你想做的事 （必填）'), '描述');
    await user.type(screen.getByLabelText('预算下限（CR）'), '5000');
    await user.type(screen.getByLabelText('预算上限（CR）'), '1000');
    await user.type(screen.getByLabelText('验收标准 （必填 · 发布即锁定）'), 'ok');
    await user.click(screen.getByRole('button', { name: '发布需求' }));

    expect(await screen.findByText('预算上限不能低于下限。')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});
