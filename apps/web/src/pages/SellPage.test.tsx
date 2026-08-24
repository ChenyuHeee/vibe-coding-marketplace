/**
 * SellPage 测试 —— 卖家工作台（区域 2）：
 * 角色守卫 / 上传表单（草稿自动保存 + 提交）/ 我的作品列表（空态/内容）。
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SellPage } from './SellPage';
import { renderWithProviders } from '../test/renderWithProviders';
import type { Role } from '../types';
import type { SellerProjectItem } from '../types/seller';

// 上传走 XHR（fetch 无法报进度），页面测试整体 mock sellerApi
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
  mine: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  detail: ReturnType<typeof vi.fn>;
  review: ReturnType<typeof vi.fn>;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function loginAs(roles: Role[]) {
  localStorage.setItem('vibe.token', 'fake-token');
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/auth/me')) {
      return Promise.resolve(
        jsonResponse({
          user: {
            id: 'u1',
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
  });
  vi.stubGlobal('fetch', fetchMock);
}

const MINE_ITEMS: SellerProjectItem[] = [
  {
    id: 'p1',
    title: '贪吃蛇 3D',
    category: 'game',
    priceCr: 9900,
    coverUrl: null,
    trialScope: '前 3 关',
    status: 'under review',
    reviewNote: null,
    submittedAt: '2026-08-24T10:00:00Z',
    reviewedAt: null,
    publishedAt: null,
    delistedAt: null,
    createdAt: '2026-08-24T09:00:00Z',
  },
  {
    id: 'p2',
    title: 'Markdown 便签',
    category: 'tool',
    priceCr: 0,
    coverUrl: null,
    trialScope: '完整版',
    status: 'approved',
    reviewNote: null,
    submittedAt: '2026-08-23T10:00:00Z',
    reviewedAt: '2026-08-23T11:00:00Z',
    publishedAt: '2026-08-23T11:00:00Z',
    delistedAt: null,
    createdAt: '2026-08-23T09:00:00Z',
  },
];

describe('SellPage（卖家工作台）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('无 seller 角色 → 引导开通（EmptyState + 去个人中心）', async () => {
    loginAs(['buyer']);
    renderWithProviders(<SellPage />, '/sell');
    expect(await screen.findByText('开通 seller 角色后可上架')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '去个人中心查看角色' })).toBeInTheDocument();
    expect(screen.queryByText('上传新作品')).not.toBeInTheDocument();
  });

  it('seller → 渲染上传表单 + 我的作品列表（全部状态徽章 + 操作入口）', async () => {
    loginAs(['buyer', 'seller']);
    mocked.mine.mockResolvedValue({ items: MINE_ITEMS, page: 1, pageSize: 10, total: 2 });
    renderWithProviders(<SellPage />, '/sell');

    expect(await screen.findByText('上传新作品')).toBeInTheDocument();
    expect(await screen.findByText('贪吃蛇 3D')).toBeInTheDocument();
    // 状态徽章（词汇表查表渲染）
    expect(screen.getByText('审核中')).toBeInTheDocument();
    expect(screen.getByText('已上架')).toBeInTheDocument();
    // 操作入口
    expect(screen.getAllByRole('button', { name: /审核进度/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /编辑/ }).length).toBeGreaterThan(0);
    // 仅 approved 显示下架
    expect(screen.getByRole('button', { name: '下架' })).toBeInTheDocument();
  });

  it('我的作品为空 → 空态「上传你的第一个作品」引导', async () => {
    loginAs(['seller']);
    mocked.mine.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    renderWithProviders(<SellPage />, '/sell');
    expect(await screen.findByText('还没有作品')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上传第一个作品' })).toBeInTheDocument();
  });

  it('列表加载失败 → 错误横幅 + 重试', async () => {
    loginAs(['seller']);
    mocked.mine.mockRejectedValueOnce(new Error('服务器没有响应。'));
    renderWithProviders(<SellPage />, '/sell');
    expect(await screen.findByText('加载我的作品失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('表单校验：未选文件/未填字段 → 就地提示，不发请求', async () => {
    loginAs(['seller']);
    mocked.mine.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    renderWithProviders(<SellPage />, '/sell');
    await screen.findByText('上传新作品');

    await userEvent.click(screen.getByRole('button', { name: /创建并提交审核/ }));
    expect(screen.getAllByText('请先选择作品文件并填写标题 / 描述 / 分类。').length).toBeGreaterThan(0);
    expect(mocked.create).not.toHaveBeenCalled();
  });

  it('提交成功：multipart FormData 字段正确 + 清空草稿 + 跳转审核进度页', async () => {
    loginAs(['seller']);
    mocked.mine.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    mocked.create.mockReturnValue({
      promise: Promise.resolve({ project: { id: 'p-new', status: 'draft', title: '新作品' } }),
      abort: vi.fn(),
    });
    mocked.detail.mockResolvedValue({
      id: 'p-new',
      title: '新作品',
      description: '一个测试作品',
      category: 'game',
      priceCr: 0,
      coverUrl: null,
      trialScope: '完整版',
      playUrl: '/play/p-new',
      seller: { id: 'u1', displayName: '演示卖家' },
      avgRating: null,
      ratingCount: 0,
      status: 'draft',
      publishedAt: null,
      createdAt: '2026-08-24T09:00:00Z',
      reviews: [],
      isPurchased: false,
      canDownload: true,
      reviewNote: null,
    });
    mocked.review.mockResolvedValue({ status: 'draft', reviewNote: null, submittedAt: null, reviewedAt: null, delistedAt: null, history: [] });

    const user = userEvent.setup();
    renderWithProviders(<SellPage />, '/sell');
    await screen.findByText('上传新作品');

    const file = new File(['<h1>hi</h1>'], 'game.html', { type: 'text/html' });
    await user.upload(screen.getByLabelText('选择作品文件（.html / .htm / .zip）'), file);
    expect(await screen.findByTestId('dropzone-ready')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/标题/), '新作品');
    await user.type(screen.getByLabelText(/描述/), '一个测试作品');
    await user.selectOptions(screen.getByLabelText(/分类/), 'game');
    await user.click(screen.getByRole('button', { name: '创建并提交审核' }));

    await waitFor(() => expect(mocked.create).toHaveBeenCalledTimes(1));
    const fd = mocked.create.mock.calls[0][0] as FormData;
    expect(fd.get('title')).toBe('新作品');
    expect(fd.get('description')).toBe('一个测试作品');
    expect(fd.get('category')).toBe('game');
    expect(fd.get('priceCr')).toBe('0');
    expect(fd.get('trialScope')).toBe('');
    expect(fd.get('file')).toBe(file);
  });

  it('草稿自动保存：输入后 localStorage 有记录（Q3 刷新不丢）', async () => {
    loginAs(['seller']);
    mocked.mine.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    const user = userEvent.setup();
    renderWithProviders(<SellPage />, '/sell');
    await screen.findByText('上传新作品');

    await user.type(screen.getByLabelText(/标题/), '自动保存的标题');
    await waitFor(() => {
      const raw = localStorage.getItem('vibe.sell.draft.v1');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw as string).title).toBe('自动保存的标题');
    });
  });
});
