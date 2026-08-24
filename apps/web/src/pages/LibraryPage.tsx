/**
 * LibraryPage —— My Library（DESIGN_SYSTEM 区域 3 · PRD 区域 3）
 *
 * - 已购列表：封面/标题/作者/订单状态徽章/购买时间；**在线运行**与**下载**
 *   两个动作直接可见（区域 3 要点 2）；
 * - **退款路径可被找到（硬性）**：订单卡常驻「退款政策」与「申请退款」入口
 *   （弹窗说明 14 天窗口 REFUND_WINDOW_DAYS → POST /api/orders/:id/refund，
 *   二次确认 §5.2）；
 * - **含已下架（delisted）已购作品**（保留访问权，区域 3/词汇表 §1）；
 * - 四状态：骨架加载 / 空态「去逛逛 Marketplace」CTA / 错误横幅+重试 / 成功列表；
 * - 路由守卫（RequireAuth）保证登录可见。
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, LibraryBig, Play, RotateCcw, ScrollText } from 'lucide-react';
import { REFUND_WINDOW_DAYS } from '@vibe/shared';
import type { LibraryItem } from '../types/marketplace';
import { libraryApi } from '../api/library';
import { downloadProjectZip } from '../api/download';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';
import { Skeleton } from '../components/Skeleton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PlayFrame } from '../components/PlayFrame';
import { useToast } from '../components/Toast';
import { formatCr } from '../lib/format';

export function LibraryPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 运行弹窗
  const [runItem, setRunItem] = useState<LibraryItem | null>(null);
  const [runUrl, setRunUrl] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // 退款
  const [policyItem, setPolicyItem] = useState<LibraryItem | null>(null);
  const [refundItem, setRefundItem] = useState<LibraryItem | null>(null);
  const [refunding, setRefunding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await libraryApi.list();
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载已购作品失败。');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openRun = async (item: LibraryItem) => {
    setRunItem(item);
    setRunUrl(null);
    setRunLoading(true);
    setRunError(null);
    try {
      const { playUrl } = await libraryApi.run(item.project.id);
      setRunUrl(playUrl);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : '获取运行地址失败。');
    } finally {
      setRunLoading(false);
    }
  };

  const confirmRefund = async () => {
    if (!refundItem) return;
    setRefunding(true);
    try {
      const { refundedCr } = await libraryApi.refund(refundItem.orderId);
      showToast(`已退款 ${formatCr(refundedCr)}，款项已退回余额。`, { tone: 'success' });
      // 本地更新订单状态 → 徽章变「已退款」、动作禁用
      setItems((prev) =>
        prev.map((it) =>
          it.orderId === refundItem.orderId ? { ...it, status: 'refunded', refundable: false } : it,
        ),
      );
      setRefundItem(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '退款申请失败，请稍后重试。', {
        tone: 'warning',
      });
    } finally {
      setRefunding(false);
    }
  };

  const downloaded = (item: LibraryItem) => () => {
    downloadProjectZip(item.project.id, `${item.project.title}.zip`)
      .then(() => showToast('已开始下载。', { tone: 'success' }))
      .catch((err: unknown) =>
        showToast(err instanceof Error ? err.message : '下载失败，请稍后重试。', {
          tone: 'warning',
        }),
      );
  };

  const accessRevoked = (item: LibraryItem) =>
    item.status === 'refunded' || item.status === 'cancelled';

  return (
    <div className="page library-page">
      <h1 className="text-h1 page__title">My Library</h1>

      {loading ? (
        <div className="library-list" aria-busy="true" data-testid="library-loading">
          {Array.from({ length: 3 }).map((_, i) => (
            <div className="library-card library-card--skeleton" key={i}>
              <Skeleton variant="card" width={120} height={80} />
              <div className="library-card__body">
                <Skeleton width="60%" height={18} />
                <Skeleton width="40%" height={14} />
                <Skeleton width="30%" height={14} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorBanner
          title="加载已购作品失败"
          reason={error}
          nextStep="点击重试，或检查网络后再试。"
          actions={[{ label: '重试', onClick: () => void load() }]}
        />
      ) : items.length === 0 ? (
        <div data-testid="library-empty">
          <EmptyState
            icon={LibraryBig}
            tone="info"
            title="还没有已购作品"
            description="去 Marketplace 看看，喜欢的作品下单后就能在这里在线运行或下载。"
            actionLabel="去逛逛 Marketplace"
            onAction={() => navigate('/marketplace')}
          />
        </div>
      ) : (
        <ul className="library-list" data-testid="library-list">
          {items.map((item) => {
            const revoked = accessRevoked(item);
            return (
              <li key={item.orderId} className="library-card" data-testid="library-item">
                <div className="library-card__cover">
                  {item.project.coverUrl ? (
                    <img src={item.project.coverUrl} alt={`《${item.project.title}》封面`} />
                  ) : (
                    <span className="library-card__cover-fallback" aria-hidden="true">
                      <LibraryBig size={24} />
                    </span>
                  )}
                </div>

                <div className="library-card__body">
                  <div className="library-card__head">
                    <h2 className="library-card__title text-h3">
                      <Link to={`/project/${item.project.id}`}>{item.project.title}</Link>
                    </h2>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="library-card__meta text-caption text-tertiary">
                    {item.project.seller.displayName} · 购买于{' '}
                    {new Date(item.purchasedAt).toLocaleDateString('zh-CN')}
                    {item.project.status === 'delisted' && ' · 作品已下架（保留访问权）'}
                  </p>

                  {/* 两个动作直接可见（区域 3 要点 2） */}
                  <div className="library-card__actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => void openRun(item)}
                      disabled={revoked}
                      aria-disabled={revoked}
                    >
                      <Play size={16} aria-hidden="true" />
                      在线运行
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={downloaded(item)}
                      disabled={revoked}
                      aria-disabled={revoked}
                    >
                      <Download size={16} aria-hidden="true" />
                      下载
                    </button>

                    {/* 退款路径常驻（区域 3 要点 3） */}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setRefundItem(item)}
                      disabled={!item.refundable || revoked}
                      title={
                        revoked
                          ? '该订单已退款/取消，访问权已回收'
                          : item.refundable
                            ? '申请退款'
                            : `已超过 ${REFUND_WINDOW_DAYS} 天退款窗口`
                      }
                    >
                      <RotateCcw size={16} aria-hidden="true" />
                      申请退款
                    </button>
                  </div>
                  <p className="library-card__refund-note text-caption text-tertiary">
                    <button type="button" className="link-btn" onClick={() => setPolicyItem(item)}>
                      <ScrollText size={12} aria-hidden="true" />
                      退款政策
                    </button>
                    ：购买后 {REFUND_WINDOW_DAYS} 天内可申请全额退款，款项退回平台余额。
                    {revoked && '（此订单已退款）'}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 运行弹窗：PlayFrame 复用（sandbox 安全参数见 ARCHITECTURE §3.3） */}
      {runItem && (
        <div className="confirm-dialog__overlay" role="presentation" data-testid="run-dialog">
          <div
            className="confirm-dialog run-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="run-dialog-title"
          >
            <div className="confirm-dialog__header">
              <h3 id="run-dialog-title" className="confirm-dialog__title text-h3">
                在线运行《{runItem.project.title}》
              </h3>
              <button
                type="button"
                className="confirm-dialog__close btn btn-ghost btn-sm"
                onClick={() => setRunItem(null)}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            <div className="run-dialog__body">
              {runLoading && (
                <p className="text-caption text-tertiary" role="status">
                  正在获取运行地址…
                </p>
              )}
              {runError && (
                <ErrorBanner
                  title="获取运行地址失败"
                  reason={runError}
                  nextStep="点击重试。"
                  actions={[{ label: '重试', onClick: () => void openRun(runItem) }]}
                />
              )}
              {runUrl && <PlayFrame playUrl={runUrl} title={runItem.project.title} />}
            </div>
          </div>
        </div>
      )}

      {/* 退款政策说明（常驻入口，可被找到 —— 区域 3 硬性） */}
      {policyItem && (
        <div className="confirm-dialog__overlay" role="presentation" data-testid="policy-dialog">
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="policy-dialog-title"
          >
            <div className="confirm-dialog__header">
              <h3 id="policy-dialog-title" className="confirm-dialog__title text-h3">
                退款政策
              </h3>
              <button
                type="button"
                className="confirm-dialog__close btn btn-ghost btn-sm"
                onClick={() => setPolicyItem(null)}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            <div className="confirm-dialog__consequences">
              <p className="text-body-sm">
                《{policyItem.project.title}》购买后{' '}
                <strong>{REFUND_WINDOW_DAYS} 天内</strong>可申请全额退款，实付{' '}
                <strong className="num">{formatCr(policyItem.totalCr)}</strong> 将退回平台余额
                （即时到账）。
              </p>
              <p className="text-body-sm">
                退款成功后，该作品的在线运行与下载权限将收回。订单状态变为「已退款」。
              </p>
            </div>
            <div className="confirm-dialog__actions">
              <button type="button" className="btn btn-primary" onClick={() => setPolicyItem(null)}>
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 退款二次确认（§5.2：展示后果 + 不可逆提示） */}
      <ConfirmDialog
        open={refundItem !== null}
        title="申请退款"
        consequences={
          refundItem ? (
            <div data-testid="refund-confirm">
              <p className="text-body-sm">
                将退还作品《{refundItem.project.title}》实付{' '}
                <strong className="num">{formatCr(refundItem.totalCr)}</strong> 到平台余额。
              </p>
              <p className="text-body-sm">
                退款政策：购买后 {REFUND_WINDOW_DAYS} 天内可申请，款项退回余额（即时到账）。
              </p>
              <p className="text-body-sm text-warning">
                退款成功后，该作品的在线运行与下载权限将收回，此操作不可撤回。
              </p>
            </div>
          ) : null
        }
        confirmLabel="确认退款"
        confirmTone="danger"
        onConfirm={() => void confirmRefund()}
        onCancel={() => setRefundItem(null)}
        confirmDisabled={refunding}
        disabledReason={refunding ? '正在提交退款申请…' : undefined}
      />
    </div>
  );
}
