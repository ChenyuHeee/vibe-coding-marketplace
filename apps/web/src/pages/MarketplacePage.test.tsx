import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketplacePage } from './MarketplacePage';
import { renderWithProviders } from '../test/renderWithProviders';
import type { ProjectSummary } from '../types/marketplace';

const ITEMS: ProjectSummary[] = [
  {
    id: 'p1',
    title: '贪吃蛇 3D',
    category: 'game',
    priceCr: 9900,
    coverUrl: '/api/files/p1/cover.png',
    seller: { id: 'u2', displayName: '老张' },
    avgRating: 4.8,
    ratingCount: 21,
    status: 'approved',
  },
  {
    id: 'p2',
    title: 'Markdown 便签',
    category: 'tool',
    priceCr: 0,
    coverUrl: null,
    seller: { id: 'u3', displayName: '小李' },
    avgRating: null,
    ratingCount: 0,
    status: 'approved',
  },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 按 URL 子串路由的 fetch mock */
function mockApi(routes: { match: string; respond: () => Response | Promise<Response> }[]) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const hit = routes.find((r) => url.includes(r.match));
    if (!hit) return Promise.reject(new Error(`unmocked: ${url}`));
    return Promise.resolve(hit.respond());
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const listResponse = (items: ProjectSummary[], total = items.length) =>
  jsonResponse({ items, page: 1, pageSize: 12, total });

describe('MarketplacePage（区域 1 列表页）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows skeleton while loading（进行中态）', () => {
    mockApi([{ match: '/api/projects', respond: () => new Promise<Response>(() => {}) }]);
    renderWithProviders(<MarketplacePage />, '/marketplace');
    expect(screen.getByTestId('marketplace-loading')).toBeInTheDocument();
  });

  it('shows error banner with retry when list fails（错误态）', async () => {
    const fetchMock = mockApi([
      {
        match: '/api/projects',
        respond: () => jsonResponse({ error: { code: 'NETWORK', message: '服务器开小差了' } }, 500),
      },
    ]);
    renderWithProviders(<MarketplacePage />, '/marketplace');
    expect(await screen.findByText('加载作品列表失败')).toBeInTheDocument();
    expect(screen.getByText(/服务器开小差了/)).toBeInTheDocument();

    // 重试 → 再次请求并成功
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ items: ITEMS, page: 1, pageSize: 12, total: 2 })),
    );
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('贪吃蛇 3D')).toBeInTheDocument();
  });

  it('shows empty state with 清空筛选 when filters active（空态）', async () => {
    mockApi([
      {
        match: '/api/projects',
        respond: () => listResponse([]),
      },
    ]);
    renderWithProviders(<MarketplacePage />, '/marketplace?category=game');
    const empty = await screen.findByTestId('marketplace-empty');
    expect(within(empty).getByText('暂无作品')).toBeInTheDocument();
    const clearBtn = within(empty).getByRole('button', { name: '清空筛选' });
    await userEvent.click(clearBtn);
    // 清空后重新请求（category 从 URL 移除）
    await waitFor(() => {
      expect(screen.getByTestId('marketplace-empty')).toBeInTheDocument();
    });
  });

  it('renders project grid on success（成功态：卡片网格 + 计数）', async () => {
    mockApi([{ match: '/api/projects', respond: () => listResponse(ITEMS) }]);
    renderWithProviders(<MarketplacePage />, '/marketplace');
    expect(await screen.findByText('贪吃蛇 3D')).toBeInTheDocument();
    expect(screen.getByText('Markdown 便签')).toBeInTheDocument();
    expect(screen.getByText(/共 2 个作品/)).toBeInTheDocument();
    expect(screen.getByTestId('marketplace-grid').children.length).toBe(2);
  });

  it('category chip updates URL and refetches（分类筛选 sticky）', async () => {
    const fetchMock = mockApi([{ match: '/api/projects', respond: () => listResponse(ITEMS) }]);
    renderWithProviders(<MarketplacePage />, '/marketplace');
    await screen.findByText('贪吃蛇 3D');

    await userEvent.click(screen.getByRole('button', { name: '游戏' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/projects'),
        expect.objectContaining({ method: 'GET' }),
      );
      const lastCall = fetchMock.mock.calls.at(-1)![0] as string;
      expect(lastCall).toContain('category=game');
    });
  });

  it('sort select refetches with sort param（排序：评分/最新/价格升降）', async () => {
    const fetchMock = mockApi([{ match: '/api/projects', respond: () => listResponse(ITEMS) }]);
    renderWithProviders(<MarketplacePage />, '/marketplace');
    await screen.findByText('贪吃蛇 3D');

    await userEvent.selectOptions(screen.getByLabelText('排序方式'), 'price_asc');
    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)![0] as string;
      expect(lastCall).toContain('sort=price_asc');
    });
  });

  it('search form refetches with q param（搜索框）', async () => {
    const fetchMock = mockApi([{ match: '/api/projects', respond: () => listResponse(ITEMS) }]);
    renderWithProviders(<MarketplacePage />, '/marketplace');
    await screen.findByText('贪吃蛇 3D');

    await userEvent.type(screen.getByLabelText('搜索作品'), '贪吃蛇');
    await userEvent.click(screen.getByRole('search').querySelector('input')!);
    // 回车提交
    await userEvent.keyboard('{Enter}');
    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)![0] as string;
      expect(lastCall).toContain('q=%E8%B4%AA%E5%90%83%E8%9B%87');
    });
  });

  it('pagination renders and requests next page', async () => {
    const fetchMock = mockApi([{ match: '/api/projects', respond: () => listResponse(ITEMS, 30) }]);
    renderWithProviders(<MarketplacePage />, '/marketplace');
    await screen.findByText('贪吃蛇 3D');

    const nextBtn = screen.getByRole('button', { name: '下一页' });
    await userEvent.click(nextBtn);
    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)![0] as string;
      expect(lastCall).toContain('page=2');
    });
  });
});
