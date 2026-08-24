/**
 * PurchasePanel —— 详情页购买区（DESIGN_SYSTEM 区域 1 要点 4 + §5.1/§5.2）
 *
 * - **下单前总价一屏可见**：作品价 + 手续费（注明费率 5%）+ 实付总价；
 *   报价优先 GET /api/projects/:id/quote（API.md §4），后端未实现时回退
 *   前端按共享常量 FEE_RATE 预览（api/quote.ts 注释）；
 * - 已购用户 → 「已在 My Library」+ 去 Library 入口；
 * - 未登录点购买 → 引导登录（RequireAuth 同款：记住来源路径回跳）；
 * - 下单 → 支付为高风险动作（钱离开余额进托管）：**二次确认弹窗**，
 *   展示 作品价/手续费/实付总价 + 当前余额/支付后余额（§5.2 余额变化）；
 * - 支付成功 → §3.4 成功面板：主动作「去 My Library 运行」+「下载到本地」；
 * - 余额不足 → 错误横幅 + [去充值]（下一步怎么办，§3.3）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, CreditCard, LogIn, PackageOpen } from 'lucide-react';
import type { Cr } from '@vibe/shared';
import type { Order, ProjectDetail, Quote } from '../types/marketplace';
import type { User } from '../types';
import { orderApi } from '../api/marketplace';
import { walletApi } from '../api/wallet';
import { downloadProjectZip } from '../api/download';
import { formatCr, formatPriceCr } from '../lib/format';
import { ConfirmDialog } from './ConfirmDialog';
import { ErrorBanner } from './ErrorBanner';
import { Skeleton } from './Skeleton';

interface PurchasePanelProps {
  project: ProjectDetail;
  user: User | null;
}

type PurchasePhase = 'idle' | 'creating' | 'created' | 'paying' | 'paid';

export function PurchasePanel({ project, user }: PurchasePanelProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [balanceCr, setBalanceCr] = useState<Cr | null>(null);
  const [phase, setPhase] = useState<PurchasePhase>('idle');
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 待支付订单恢复路径（去支付 / 一步取消 / 查看订单）
  const [pendingPayOpen, setPendingPayOpen] = useState(false);
  const [pendingBusy, setPendingBusy] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);

  const loadQuote = useCallback(async () => {
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const q = await orderApi.quote(project.id, project.priceCr);
      setQuote(q);
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : '报价加载失败，请稍后重试。');
    } finally {
      setQuoteLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    void loadQuote();
  }, [loadQuote]);

  // 登录用户拉余额（供二次确认弹窗展示「支付后余额」；失败不阻塞购买）
  useEffect(() => {
    if (!user) {
      setBalanceCr(null);
      return;
    }
    walletApi
      .summary()
      .then((s) => setBalanceCr(s.balanceCr))
      .catch(() => setBalanceCr(null));
  }, [user]);

  const paidTotal = useMemo(
    () => (quote ? quote.totalCr : project.priceCr + Math.round(project.priceCr * 0.05)),
    [quote, project.priceCr],
  );

  // ---- 已购态 ----
  if (project.isPurchased) {
    return (
      <section className="purchase-panel" aria-label="购买区" data-testid="purchase-purchased">
        <div className="purchase-panel__purchased">
          <CheckCircle2 size={20} aria-hidden="true" />
          <div>
            <p className="text-body">
              <strong>已在 My Library</strong>，可随时在线运行或下载。
            </p>
            <Link to="/library" className="btn btn-primary btn-sm purchase-panel__cta">
              <PackageOpen size={16} aria-hidden="true" />
              去 My Library
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // ---- 未登录：展示总价 + 登录引导 ----
  if (!user) {
    return (
      <section className="purchase-panel" aria-label="购买区" data-testid="purchase-login">
        {quoteLoading ? (
          <QuoteSkeleton />
        ) : (
          <QuoteLines
            priceCr={project.priceCr}
            feeCr={quote?.feeCr ?? Math.round(project.priceCr * 0.05)}
            totalCr={paidTotal}
            preview={!quote}
          />
        )}
        <button
          type="button"
          className="btn btn-primary purchase-panel__buy"
          onClick={() => navigate('/login', { state: { from: location.pathname } })}
        >
          <LogIn size={16} aria-hidden="true" />
          登录后购买
        </button>
        <p className="text-caption text-tertiary">登录即可下单支付；试玩不需要登录。</p>
      </section>
    );
  }

  // ---- 支付成功（§3.4：给结果一个去处）----
  if (phase === 'paid' && order) {
    return (
      <section className="purchase-panel" aria-label="购买区" data-testid="purchase-success">
        <div className="purchase-panel__success">
          <CheckCircle2 size={28} aria-hidden="true" />
          <h3 className="text-h3">支付成功</h3>
          <p className="text-body-sm text-secondary">
            {formatCr(order.totalCr)} 已支付，作品《{project.title}》已加入 My Library。
          </p>
          <div className="purchase-panel__success-actions">
            <Link to="/library" className="btn btn-primary">
              <PackageOpen size={16} aria-hidden="true" />
              去 My Library 运行
            </Link>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void downloadProjectZip(project.id, `${project.title}.zip`)}
            >
              下载到本地
            </button>
            <Link to="/library" className="btn btn-ghost">
              查看订单与退款政策
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const busy = phase === 'creating' || phase === 'paying';

  const startOrder = async () => {
    setError(null);
    setPhase('creating');
    try {
      const { order: created } = await orderApi.create(project.id);
      setOrder(created);
      setPhase('created');
      setConfirmOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '下单失败，请稍后重试。');
      setPhase('idle');
    }
  };

  const confirmPay = async () => {
    if (!order) return;
    setConfirmOpen(false);
    setError(null);
    setPhase('paying');
    try {
      const { order: paid } = await orderApi.pay(order.id);
      setOrder(paid);
      setPhase('paid');
    } catch (err) {
      setError(err instanceof Error ? err.message : '支付失败，请稍后重试。');
      setPhase('created');
    }
  };

  // ---- 已有未完成订单（待支付）：订单恢复路径（去支付 / 一步取消 / 查看订单）----
  const activeOrder = project.existingOrder;

  const confirmPendingPay = async () => {
    if (!activeOrder) return;
    setPendingPayOpen(false);
    setPendingBusy(true);
    setPendingError(null);
    try {
      const { order: paid } = await orderApi.pay(activeOrder.id);
      setOrder(paid);
      setPhase('paid');
    } catch (err) {
      setPendingError(err instanceof Error ? err.message : '支付失败，请稍后重试。');
    } finally {
      setPendingBusy(false);
    }
  };

  const cancelPendingOrder = async () => {
    if (!activeOrder) return;
    setPendingBusy(true);
    setPendingError(null);
    try {
      await orderApi.cancel(activeOrder.id);
      // 一步取消（PRD §4：不追问原因）；刷新后详情重新拉取，恢复购买按钮
      window.location.reload();
    } catch (err) {
      setPendingError(err instanceof Error ? err.message : '取消失败，请稍后重试。');
      setPendingBusy(false);
    }
  };

  // ---- 已有待支付订单：展示「去支付/取消/查看订单」，不再显示购买按钮 ----
  if (activeOrder && activeOrder.status === 'pending payment') {
    return (
      <section className="purchase-panel" aria-label="购买区" data-testid="purchase-pending-order">
        <div className="purchase-panel__pending">
          <AlertCircle size={20} aria-hidden="true" />
          <div>
            <p className="text-body">
              <strong>你有一笔待支付订单</strong>
              <span className="text-caption text-tertiary">（单号 {activeOrder.id.slice(0, 8)}…，{formatCr(paidTotal)}）</span>
            </p>
            <p className="text-body-sm text-secondary">完成支付后作品将加入 My Library；也可取消订单后重新下单。</p>
          </div>
        </div>

        {pendingError && (
          <ErrorBanner
            title="操作未完成"
            reason={pendingError}
            nextStep="可稍后重试，或在 My Library 查看订单状态。"
            actions={[{ label: '去 My Library 查看订单', onClick: () => navigate('/library') }]}
          />
        )}

        <div className="purchase-panel__pending-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setPendingPayOpen(true)}
            disabled={pendingBusy}
          >
            <CreditCard size={16} aria-hidden="true" />
            {pendingBusy ? '处理中…' : `去支付 ${formatCr(paidTotal)}`}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void cancelPendingOrder()}
            disabled={pendingBusy}
          >
            取消订单
          </button>
          <Link to="/library" className="btn btn-ghost btn-sm">
            查看订单
          </Link>
        </div>

        <ConfirmDialog
          open={pendingPayOpen}
          title="确认支付"
          consequences={
            <div className="purchase-panel__confirm" data-testid="purchase-confirm">
              <p className="text-body-sm">
                将支付 <strong className="num">{formatCr(paidTotal)}</strong> 完成订单《{project.title}》。
                支付后资金进入平台托管（DESIGN_SYSTEM §5.2 高风险动作）。
              </p>
              <dl className="purchase-panel__quote-lines">
                <div>
                  <dt>实付总价</dt>
                  <dd className="num">{formatCr(paidTotal)}</dd>
                </div>
                {balanceCr !== null && (
                  <>
                    <div>
                      <dt>当前余额</dt>
                      <dd className="num">{formatCr(balanceCr)}</dd>
                    </div>
                    <div>
                      <dt>支付后余额</dt>
                      <dd className="num">{formatCr(Math.max(0, balanceCr - paidTotal))}</dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
          }
          confirmLabel={`确认支付 ${formatCr(paidTotal)}`}
          confirmTone="brand"
          onConfirm={() => void confirmPendingPay()}
          onCancel={() => setPendingPayOpen(false)}
        />
      </section>
    );
  }

  return (
    <section className="purchase-panel" aria-label="购买区" data-testid="purchase-active">
      {quoteLoading ? (
        <QuoteSkeleton />
      ) : (
        <QuoteLines
          priceCr={project.priceCr}
          feeCr={quote?.feeCr ?? Math.round(project.priceCr * 0.05)}
          totalCr={paidTotal}
          preview={!quote}
        />
      )}

      {quoteError && !quote && (
        <ErrorBanner
          title="报价加载失败"
          reason={quoteError}
          nextStep="点击重试重新获取报价。"
          actions={[{ label: '重试', onClick: () => void loadQuote() }]}
        />
      )}

      {error && (
        <ErrorBanner
          title={error.includes('余额') ? '余额不足' : '操作未完成'}
          reason={error}
          nextStep={error.includes('余额') ? '前往钱包充值后再来购买。' : '点击重试，或检查网络后再试。'}
          actions={
            error.includes('余额')
              ? [{ label: '去充值', onClick: () => navigate('/wallet') }, { label: '重试', onClick: () => void startOrder() }]
              : [{ label: '重试', onClick: () => void startOrder() }]
          }
        />
      )}

      <button
        type="button"
        className="btn btn-primary purchase-panel__buy"
        onClick={() => void startOrder()}
        disabled={busy}
      >
        <CreditCard size={16} aria-hidden="true" />
        {busy ? '处理中…' : `立即购买 ${formatCr(paidTotal)}`}
      </button>
      <p className="text-caption text-tertiary">
        支付后资金进入平台托管，确认收货后放款给卖家；14 天内可申请退款。
      </p>

      <ConfirmDialog
        open={confirmOpen}
        title="确认支付"
        consequences={
          <div className="purchase-panel__confirm" data-testid="purchase-confirm">
            <p className="text-body-sm">
              将支付 <strong className="num">{formatCr(paidTotal)}</strong> 购买《{project.title}》。
              支付后资金进入平台托管（DESIGN_SYSTEM §5.2 高风险动作）。
            </p>
            <dl className="purchase-panel__quote-lines">
              <div>
                <dt>作品价</dt>
                <dd className="num">{formatPriceCr(project.priceCr)}</dd>
              </div>
              <div>
                <dt>手续费（5%）</dt>
                <dd className="num">{formatCr(quote?.feeCr ?? Math.round(project.priceCr * 0.05))}</dd>
              </div>
              <div>
                <dt>实付总价</dt>
                <dd className="num">{formatCr(paidTotal)}</dd>
              </div>
              {balanceCr !== null && (
                <>
                  <div>
                    <dt>当前余额</dt>
                    <dd className="num">{formatCr(balanceCr)}</dd>
                  </div>
                  <div>
                    <dt>支付后余额</dt>
                    <dd className="num">{formatCr(Math.max(0, balanceCr - paidTotal))}</dd>
                  </div>
                </>
              )}
            </dl>
          </div>
        }
        confirmLabel={`确认支付 ${formatCr(paidTotal)}`}
        confirmTone="brand"
        onConfirm={() => void confirmPay()}
        onCancel={() => {
          setConfirmOpen(false);
          setPhase('created');
        }}
      />
    </section>
  );
}

function QuoteLines({
  priceCr,
  feeCr,
  totalCr,
  preview,
}: {
  priceCr: Cr;
  feeCr: Cr;
  totalCr: Cr;
  preview: boolean;
}) {
  return (
    <dl className="purchase-panel__quote-lines" data-testid="purchase-quote">
      <div>
        <dt>作品价</dt>
        <dd className="num">{formatPriceCr(priceCr)}</dd>
      </div>
      <div>
        <dt>手续费（5%）</dt>
        <dd className="num">{formatCr(feeCr)}</dd>
      </div>
      <div className="purchase-panel__total">
        <dt>实付总价</dt>
        <dd className="num">{formatCr(totalCr)}</dd>
      </div>
      {preview && <p className="text-caption text-tertiary">* 预估价：报价接口未启用，按 5% 费率估算。</p>}
    </dl>
  );
}

function QuoteSkeleton() {
  return (
    <div className="purchase-panel__skeleton" aria-busy="true">
      <Skeleton width="40%" height={16} />
      <Skeleton width="60%" height={16} />
      <Skeleton width="50%" height={20} />
    </div>
  );
}
