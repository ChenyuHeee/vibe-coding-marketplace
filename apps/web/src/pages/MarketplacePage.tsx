/**
 * MarketplacePage —— 作品列表页（DESIGN_SYSTEM 区域 1 · PRD 区域 1）
 *
 * - 分类筛选（sticky 顶部，PROJECT_CATEGORIES 从 shared 导入）+ 搜索框 +
 *   排序（评分/最新/价格升/价格降）+ 分页；筛选同步 URL search params
 *   （链接他人设备可打开，PRD §7；RequireAuth 回跳保留 query 同款思路）；
 * - 卡片网格（桌面 4 列），MarketplaceCard（§8 #1）；
 * - 四状态齐全：骨架屏加载 / 空态「暂无作品」+ 按钮 / 错误横幅 + 重试 / 成功网格。
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PROJECT_CATEGORIES, type ProjectCategory } from '@vibe/shared';
import { Search, SlidersHorizontal, Store } from 'lucide-react';
import { projectApi } from '../api/marketplace';
import type { ProjectListQuery, ProjectSummary } from '../types/marketplace';
import { MarketplaceCard } from '../components/MarketplaceCard';
import { SkeletonCard } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';

const SORT_OPTIONS: { value: ProjectListQuery['sort']; label: string }[] = [
  { value: 'rating', label: '评分最高' },
  { value: 'newest', label: '最新上架' },
  { value: 'price_asc', label: '价格从低到高' },
  { value: 'price_desc', label: '价格从高到低' },
];

const PAGE_SIZE = 12;

const CATEGORY_LABELS: Record<ProjectCategory, string> = {
  game: '游戏',
  tool: '工具',
  art: '艺术',
  animation: '动画',
  webapp: '网页应用',
  other: '其他',
};

export function MarketplacePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const category = (searchParams.get('category') as ProjectCategory | null) ?? '';
  const q = searchParams.get('q') ?? '';
  const sort = (searchParams.get('sort') as ProjectListQuery['sort']) ?? 'newest';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(q);

  // 搜索框草稿与 URL 同步（URL 变化（如回退）时回填）
  useEffect(() => setSearchDraft(q), [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await projectApi.list({ category, q, sort, page, pageSize: PAGE_SIZE });
      setProjects(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载作品列表失败。');
      setProjects([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [category, q, sort, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateParams = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '' || value === 1) {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    }
    // 筛选变更回到第 1 页
    if (patch.category !== undefined || patch.q !== undefined || patch.sort !== undefined) {
      next.delete('page');
    }
    setSearchParams(next, { replace: false });
  };

  const hasFilter = Boolean(category || q);

  return (
    <div className="page marketplace-page">
      <div className="marketplace-page__head">
        <h1 className="text-h1 page__title">Marketplace</h1>
        <p className="text-body-sm text-secondary marketplace-page__sub">
          交易「能运行的作品」——详情页免登录直接试玩。
        </p>
      </div>

      {/* 筛选栏：sticky（§9 区域 1 要点 1） */}
      <div className="marketplace-filters" data-testid="marketplace-filters">
        <div className="marketplace-filters__row">
          <form
            className="marketplace-filters__search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              updateParams({ q: searchDraft.trim() });
            }}
          >
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              className="marketplace-filters__search-input"
              placeholder="搜索作品…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              aria-label="搜索作品"
            />
          </form>

          <label className="marketplace-filters__sort">
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span className="visually-hidden">排序方式</span>
            <select
              className="marketplace-filters__select"
              value={sort}
              onChange={(e) => updateParams({ sort: e.target.value })}
              aria-label="排序方式"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="marketplace-filters__cats" role="group" aria-label="分类筛选">
          <button
            type="button"
            className={`chip${category === '' ? ' chip--active' : ''}`}
            onClick={() => updateParams({ category: undefined })}
            aria-pressed={category === ''}
          >
            全部
          </button>
          {PROJECT_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`chip${category === cat ? ' chip--active' : ''}`}
              onClick={() => updateParams({ category: cat })}
              aria-pressed={category === cat}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* 四状态：加载 / 错误 / 空 / 成功 */}
      {loading ? (
        <div className="marketplace-grid" aria-busy="true" data-testid="marketplace-loading">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : error ? (
        <ErrorBanner
          title="加载作品列表失败"
          reason={error}
          nextStep="点击重试，或检查网络后再试。"
          actions={[{ label: '重试', onClick: () => void load() }]}
        />
      ) : projects.length === 0 ? (
        <div data-testid="marketplace-empty">
          <EmptyState
            icon={Store}
            tone="info"
            title="暂无作品"
            description={hasFilter ? '换个分类或关键词试试。' : '现在还没有上架的作品，稍后再来看看。'}
            actionLabel={hasFilter ? '清空筛选' : '回首页看看'}
            onAction={() => (hasFilter ? updateParams({ category: undefined, q: undefined, page: undefined }) : navigate('/'))}
          />
        </div>
      ) : (
        <>
          <p className="text-caption text-tertiary marketplace-page__count" role="status">
            共 {total} 个作品
          </p>
          <div className="marketplace-grid" data-testid="marketplace-grid">
            {projects.map((project) => (
              <MarketplaceCard key={project.id} project={project} />
            ))}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={(p) => updateParams({ page: p })} />
        </>
      )}
    </div>
  );
}
