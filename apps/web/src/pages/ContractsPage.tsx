/**
 * ContractsPage —— 我的合同列表（区域 5）
 *
 * - 角色视图切换：买家「我发布的」（role=buyer）/ contractor「我接的」（role=contractor）；
 * - 状态筛选 + 分页；每行：需求标题 / 对方 / 中标金额（num）/ 合同状态徽章 / 托管状态；
 * - 四状态齐全：骨架 / 错误横幅 / 空态 / 列表；
 * - 买卖双方看到同一状态词（StatusBadge 查表渲染，PRD 区域 5）。
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, Coins, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorBanner } from '../components/ErrorBanner';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { Pagination } from '../components/Pagination';
import { contractApi } from '../api/commission';
import type { ContractItem } from '../types/commission';
import { formatCr } from '../lib/format';

const PAGE_SIZE = 10;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'selected', label: '被选中' },
  { value: 'in progress', label: '进行中' },
  { value: 'milestone submission', label: '里程碑提交' },
  { value: 'buyer acceptance', label: '买家验收' },
  { value: 'payout', label: '结算' },
];

export function ContractsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const role = (searchParams.get('role') as 'buyer' | 'contractor' | null) ?? 'buyer';
  const status = searchParams.get('status') ?? '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const [items, setItems] = useState<ContractItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await contractApi.list({ role, status, page, pageSize: PAGE_SIZE });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载合同列表失败。');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [role, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateParams = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    if (patch.role !== undefined || patch.status !== undefined) next.delete('page');
    setSearchParams(next, { replace: false });
  };

  return (
    <div className="page contracts-page">
      <h1 className="text-h1 page__title">我的合同</h1>
      <p className="text-body-sm text-secondary contracts-page__sub">
        同一笔交易的双方看到同一个状态词。
      </p>

      {/* 角色视图切换 + 状态筛选 */}
      <div className="contracts-filters">
        <div className="contracts-filters__roles" role="group" aria-label="合同视角">
          <button
            type="button"
            className={`chip${role === 'buyer' ? ' chip--active' : ''}`}
            aria-pressed={role === 'buyer'}
            onClick={() => updateParams({ role: 'buyer' })}
          >
            我发布的
          </button>
          <button
            type="button"
            className={`chip${role === 'contractor' ? ' chip--active' : ''}`}
            aria-pressed={role === 'contractor'}
            onClick={() => updateParams({ role: 'contractor' })}
            disabled={!user?.roles.includes('contractor')}
            title={user?.roles.includes('contractor') ? undefined : '需要 contractor 角色'}
          >
            我接的
          </button>
        </div>
        <div className="contracts-filters__status" role="group" aria-label="状态筛选">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`chip${status === opt.value ? ' chip--active' : ''}`}
              aria-pressed={status === opt.value}
              onClick={() => updateParams({ status: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div aria-busy="true" className="contracts-list">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card contracts-list__skeleton">
              <Skeleton width="50%" />
              <Skeleton width="30%" />
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorBanner
          title="加载合同列表失败"
          reason={error}
          nextStep="点击重试，或检查网络后再试。"
          actions={[{ label: '重试', onClick: () => void load() }]}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          tone="info"
          title={role === 'buyer' ? '还没有发布的合同' : '还没有接的合同'}
          description={
            role === 'buyer'
              ? '发布需求并选中投标后，合同会出现在这里。'
              : '去需求板投标，中标后合同会出现在这里。'
          }
          actionLabel={role === 'buyer' ? '发布需求' : '去需求板'}
          onAction={() => (role === 'buyer' ? navigate('/commissions/new') : navigate('/commissions'))}
        />
      ) : (
        <>
          <ul className="contracts-list" data-testid="contracts-list">
            {items.map((c) => (
              <li key={c.id}>
                <Link to={`/contracts/${c.id}`} className="card contracts-list__item">
                  <div className="contracts-list__main">
                    <p className="text-body contracts-list__title">{c.commission.title}</p>
                    <p className="text-caption text-tertiary">
                      {role === 'buyer' ? (
                        <>
                          <UserRound size={13} aria-hidden="true" /> 接单者：{c.contractor.displayName}
                        </>
                      ) : (
                        <>
                          <UserRound size={13} aria-hidden="true" /> 买家：{c.buyer.displayName}
                        </>
                      )}
                      <span className="num"> · 中标金额 {formatCr(c.agreedAmountCr)}</span>
                    </p>
                  </div>
                  <div className="contracts-list__badges">
                    <StatusBadge status={c.status} />
                    <span className="text-caption text-tertiary escrow-tag">
                      <Coins size={13} aria-hidden="true" /> 托管：{c.escrowStatus}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={(p) => updateParams({ page: p })} />
        </>
      )}
    </div>
  );
}
