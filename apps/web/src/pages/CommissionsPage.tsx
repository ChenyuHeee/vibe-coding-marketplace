/**
 * CommissionsPage —— 需求板（区域 4，公开可浏览）
 *
 * - 筛选：状态（chip）/ 预算上限（≤ X CR）/ 搜索 + 排序（newest / budget_asc）+ 分页；
 *   筛选同步 URL search params（链接可分享，PRD §7）；
 * - CommissionCard（标题/预算区间/时间线/投标数/状态徽章）；
 * - 四状态齐全：骨架屏 / 错误横幅+重试 / 空态（「还没有需求，发布第一个」→ 引导发布）/ 成功网格。
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardPlus, Search, SlidersHorizontal } from 'lucide-react';
import type { CommissionStatus } from '@vibe/shared';
import { commissionApi } from '../api/commission';
import type { CommissionListItem } from '../types/commission';
import { CommissionCard } from '../components/CommissionCard';
import { SkeletonCard } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';

const PAGE_SIZE = 12;

const STATUS_OPTIONS: { value: CommissionStatus | ''; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'open', label: '开放中' },
  { value: 'in progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

const SORT_OPTIONS: { value: 'newest' | 'budget_asc'; label: string }[] = [
  { value: 'newest', label: '最新发布' },
  { value: 'budget_asc', label: '预算从低到高' },
];

export function CommissionsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const status = (searchParams.get('status') as CommissionStatus | null) ?? '';
  const budgetMaxLte = Number(searchParams.get('budgetMaxLte')) || undefined;
  const q = searchParams.get('q') ?? '';
  const sort = (searchParams.get('sort') as 'newest' | 'budget_asc' | null) ?? 'newest';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const [items, setItems] = useState<CommissionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(q);

  useEffect(() => setSearchDraft(q), [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await commissionApi.list({
        status: status || '',
        budgetMaxLte,
        q,
        sort,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载需求列表失败。');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [status, budgetMaxLte, q, sort, page]);

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
    if (patch.status !== undefined || patch.q !== undefined || patch.sort !== undefined || patch.budgetMaxLte !== undefined) {
      next.delete('page');
    }
    setSearchParams(next, { replace: false });
  };

  const hasFilter = Boolean(status || budgetMaxLte || q);

  return (
    <div className="page commissions-page">
      <div className="commissions-page__head">
        <h1 className="text-h1 page__title">需求板</h1>
        <p className="text-body-sm text-secondary">
          发布你的需求，接单者会来投标；验收标准发布时即锁定。
        </p>
      </div>

      {/* 筛选栏 */}
      <div className="commission-filters" data-testid="commission-filters">
        <div className="commission-filters__row">
          <form
            className="commission-filters__search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              updateParams({ q: searchDraft.trim() });
            }}
          >
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              className="commission-filters__search-input"
              placeholder="搜索需求…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              aria-label="搜索需求"
            />
          </form>

          <label className="commission-filters__budget">
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span className="visually-hidden">预算上限</span>
            <input
              type="number"
              min={1}
              className="commission-filters__select"
              placeholder="预算上限（CR）"
              value={budgetMaxLte ?? ''}
              onChange={(e) => updateParams({ budgetMaxLte: e.target.value ? Number(e.target.value) : undefined })}
              aria-label="预算上限（CR）"
            />
          </label>

          <label className="commission-filters__sort">
            <span className="visually-hidden">排序方式</span>
            <select
              className="commission-filters__select"
              value={sort}
              onChange={(e) => updateParams({ sort: e.target.value as 'newest' | 'budget_asc' })}
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

        <div className="commission-filters__status" role="group" aria-label="状态筛选">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`chip${status === opt.value ? ' chip--active' : ''}`}
              onClick={() => updateParams({ status: opt.value })}
              aria-pressed={status === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 四状态 */}
      {loading ? (
        <div className="commission-grid" aria-busy="true" data-testid="commission-loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : error ? (
        <ErrorBanner
          title="加载需求列表失败"
          reason={error}
          nextStep="点击重试，或检查网络后再试。"
          actions={[{ label: '重试', onClick: () => void load() }]}
        />
      ) : items.length === 0 ? (
        <div data-testid="commission-empty">
          <EmptyState
            icon={ClipboardPlus}
            tone="brand"
            title="还没有需求"
            description={hasFilter ? '换个筛选条件试试。' : '发布你的第一个需求，接单者会来投标。'}
            actionLabel={hasFilter ? '清空筛选' : '发布第一个需求'}
            onAction={() =>
              hasFilter
                ? updateParams({ status: undefined, q: undefined, budgetMaxLte: undefined, page: undefined })
                : navigate('/commissions/new')
            }
          />
        </div>
      ) : (
        <>
          <p className="text-caption text-tertiary commissions-page__count" role="status">
            共 {total} 个需求
          </p>
          <div className="commission-grid" data-testid="commission-grid">
            {items.map((c) => (
              <CommissionCard key={c.id} commission={c} />
            ))}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={(p) => updateParams({ page: p })} />
        </>
      )}
    </div>
  );
}
