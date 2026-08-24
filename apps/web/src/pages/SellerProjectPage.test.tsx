/**
 * SellerProjectPage 测试 —— 审核进度 / 驳回三出路 / 下架二次确认（理由必填）。
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SellerProjectPage } from './SellerProjectPage';
import { renderWithProviders } from '../test/renderWithProviders';
import type { Role } from '../types';
import type { ProjectDetail } from '../types/marketplace';
import type { ReviewProgress } from '../types/seller';

vi.mock('../api/seller', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/seller')>();
  return {
    ...actual,
    sellerApi: {
      mine: vi.fn(),
      detail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      submit: vi.fn(),
      review: vi.fn(),
      delist: vi.fn(),
    },
  };
});

import { sellerApi } from '../api/seller';

const mocked = sellerApi as unknown as {
  detail: ReturnType<typeof vi.fn>;
  review: ReturnType<typeof vi.fn>;
  submit: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delist: ReturnType<typeof vi.fn>;
};

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
              id: 'u-seller',
              email: 'seller@vibes.local',
              displayName: '演示卖家',
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

function makeDetail(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: 'p1',
    title: '贪吃蛇 3D',
    description: '一个可运行的课堂小游戏。',
    category: 'game',
    priceCr: 500,
    coverUrl: null,
    trialScope: '前 3 关可玩',
    playUrl: '/play/p1',
    seller: { id: 'u-seller', displayName: '演示卖家' },
    avgRating: null,
    ratingCount: 0,
    status: 'under review',
    reviews: [],
    isPurchased: false,
    canDownload: true,
    ...overrides,
  };
}

function makeReview(overrides: Partial<ReviewProgress> = {}): ReviewProgress {
  return {
    status: 'under review',
    reviewNote: null,
    submittedAt: '2026-08-24T10:00:00Z',
    reviewedAt: null,
    delistedAt: null,
    history: [{ event: 'submitted', note: null, createdAt: '2026-08-24T10:00:00Z' }],
    ...overrides,
  };
}

describe('SellerProjectPage（审核进度）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('审核中：Stepper 显示当前步 + 状态徽章 + 历史事件', async () => {
    loginAs(['seller']);
    mocked.detail.mockResolvedValue(makeDetail());
    mocked.review.mockResolvedValue(makeReview());
    renderWithProviders(
      <Routes>
        <Route path="/sell/:id" element={<SellerProjectPage />} />
      </Routes>,
      '/sell/p1',
    );

    expect(await screen.findByText('贪吃蛇 3D')).toBeInTheDocument();
    // StatusBadge（词汇表查表渲染：title 为规范状态词）
    expect(screen.getByTitle('under review')).toBeInTheDocument();
    // Stepper 四步标签齐全
    expect(screen.getByText('草稿')).toBeInTheDocument();
    expect(screen.getAllByText('已提交').length).toBeGreaterThan(0);
    expect(screen.getAllByText('审核中').length).toBeGreaterThan(0);
    expect(screen.getByText('已上架')).toBeInTheDocument();
    // 历史事件徽章（submitted 事件）
    expect(screen.getByTitle('submitted')).toBeInTheDocument();
  });

  it('驳回态：FailureRecoveryCard 展示驳回理由 + 三出路（重试=重新提交）', async () => {
    loginAs(['seller']);
    mocked.detail.mockResolvedValue(makeDetail({ status: 'rejected' }));
    mocked.review.mockResolvedValue(makeReview({ status: 'rejected', reviewNote: '入口页加载失败，请检查后重提', reviewedAt: '2026-08-24T12:00:00Z' }));
    mocked.submit.mockResolvedValue({ project: { id: 'p1', title: '贪吃蛇 3D', status: 'under review', submittedAt: 'x' } });

    renderWithProviders(
      <Routes>
        <Route path="/sell/:id" element={<SellerProjectPage />} />
      </Routes>,
      '/sell/p1',
    );
    expect(await screen.findByText(/审核失败/)).toBeInTheDocument();
    expect(screen.getByText(/入口页加载失败，请检查后重提/)).toBeInTheDocument();
    // 三出路：重试 primary / 换一种方式 secondary / 手动编辑 ghost
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '换一种方式' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '手动编辑' })).toBeInTheDocument();
    // 已保留内容
    expect(screen.getByText('已保留的内容')).toBeInTheDocument();

    // 重试 → 重新提交
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(mocked.submit).toHaveBeenCalledWith('p1'));
  });

  it('驳回态：手动编辑 → 进入编辑态（status 只读徽章 + 保存调用 PUT）', async () => {
    loginAs(['seller']);
    mocked.detail.mockResolvedValue(makeDetail({ status: 'rejected' }));
    mocked.review.mockResolvedValue(makeReview({ status: 'rejected', reviewNote: 'x', reviewedAt: 't' }));
    mocked.update.mockReturnValue({ promise: Promise.resolve({ project: makeDetail() }), abort: vi.fn() });

    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/sell/:id" element={<SellerProjectPage />} />
      </Routes>,
      '/sell/p1',
    );
    await screen.findByText(/审核失败/);
    await user.click(screen.getByRole('button', { name: '手动编辑' }));

    expect(screen.getByText('编辑作品')).toBeInTheDocument();
    expect(screen.getByText(/状态只读/)).toBeInTheDocument();
    // 修改标题后保存
    const titleInput = screen.getByLabelText(/标题/);
    await user.clear(titleInput);
    await user.type(titleInput, '改过的标题');
    await user.click(screen.getByRole('button', { name: '保存修改' }));
    await waitFor(() => expect(mocked.update).toHaveBeenCalledTimes(1));
    const fd = mocked.update.mock.calls[0][1] as FormData;
    expect(fd.get('title')).toBe('改过的标题');
  });

  it('已上架：显示去详情页 + 下架按钮；下架须理由（ConfirmDialog 二次确认）', async () => {
    loginAs(['seller']);
    mocked.detail.mockResolvedValue(makeDetail({ status: 'approved' }));
    mocked.review.mockResolvedValue(makeReview({ status: 'approved', reviewedAt: 't' }));
    mocked.delist.mockResolvedValue({ project: { id: 'p1', title: '贪吃蛇 3D', status: 'delisted', delistedAt: 't' } });

    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/sell/:id" element={<SellerProjectPage />} />
      </Routes>,
      '/sell/p1',
    );
    await screen.findByText('贪吃蛇 3D');

    expect(screen.getByRole('button', { name: '去详情页' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下架' }));

    // 二次确认弹窗：后果说明 + 理由必填
    expect(screen.getByRole('dialog', { name: '确认下架作品' })).toBeInTheDocument();
    expect(
      screen.getAllByText((_content, el) => el?.textContent?.includes('已购买家保留访问权') ?? false)
        .length,
    ).toBeGreaterThan(0);
    const confirmBtn = screen.getByRole('button', { name: '确认下架' });
    expect(confirmBtn).toBeDisabled();
    expect(screen.getByText(/请选择下架理由/)).toBeInTheDocument();

    // 未选理由不发送
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(mocked.delist).not.toHaveBeenCalled();

    // 重新打开 → 选择理由 → 确认下架
    await user.click(screen.getByRole('button', { name: '下架' }));
    await user.click(screen.getByLabelText('版权 / 内容问题，需要下架重做'));
    await user.click(screen.getByRole('button', { name: '确认下架' }));
    await waitFor(() => expect(mocked.delist).toHaveBeenCalledWith('p1', '版权 / 内容问题，需要下架重做'));
  });

  it('?action=delist 直达下架弹窗（列表页入口）', async () => {
    loginAs(['seller']);
    mocked.detail.mockResolvedValue(makeDetail({ status: 'approved' }));
    mocked.review.mockResolvedValue(makeReview({ status: 'approved', reviewedAt: 't' }));
    renderWithProviders(
      <Routes>
        <Route path="/sell/:id" element={<SellerProjectPage />} />
      </Routes>,
      '/sell/p1?action=delist',
    );
    expect(await screen.findByRole('dialog', { name: '确认下架作品' })).toBeInTheDocument();
  });
});
