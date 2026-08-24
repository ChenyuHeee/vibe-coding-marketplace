/**
 * WalletPage —— 钱包页（DESIGN_SYSTEM 区域 6 · PRD 区域 6）
 *
 * - WalletBalanceCard（§8 #4）：顶部两栏「钱在谁手里 / 何时到账」一眼可见；
 * - 充值：金额输入；**≥100 CR 二次确认**（§5.2：当前余额 → 充值金额 →
 *   充值后余额两数并列，确认按钮含金额如「确认充值 500 CR」）→
 *   POST /api/wallet/topup（confirm: true）；小额直接提交；阈值用
 *   shared TOPUP_CONFIRM_THRESHOLD_CR；
 * - 收支记录：type/direction 筛选 + 分页 + 金额 tabular-nums + note 人话；
 * - 提现：表单（cardLast4 4 位数字校验等）+ **到账时间明示（1–3 个工作日）** +
 *   二次确认弹窗（金额/实际到账/到账时间）→ POST /api/wallet/withdrawals；
 *   提现记录列表（状态徽章：withdrawal pending 带 spinner）；
 * - 托管总览：GET /api/wallet/escrow —— 钱在谁手里/何时到账字段直接展示；
 * - 四状态齐全：骨架 / 空态 / 错误横幅 / 成功。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Landmark,
  Loader2,
  Lock,
  PlusCircle,
  RefreshCcw,
  Wallet,
} from 'lucide-react';
import {
  TOPUP_CONFIRM_THRESHOLD_CR,
  TRANSACTION_TYPES,
  WITHDRAWAL_ETA_MAX_DAYS,
  WITHDRAWAL_ETA_MIN_DAYS,
  type EscrowItem,
  type Paginated,
  type TransactionDirection,
  type TransactionItem,
  type TransactionType,
  type WalletSummary,
  type WithdrawalItem,
} from '@vibe/shared';
import { walletApi } from '../api/wallet';
import { WalletBalanceCard } from '../components/WalletBalanceCard';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorBanner } from '../components/ErrorBanner';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { Pagination } from '../components/Pagination';
import { useToast } from '../components/Toast';
import { formatCr, formatSignedCr } from '../lib/format';

const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  topup: '充值',
  withdrawal: '提现',
  order_payment: '订单支付',
  escrow_hold: '托管',
  escrow_release: '放款',
  payout: '结算',
  refund: '退款',
  fee: '手续费',
};

const DIRECTION_LABELS: Record<TransactionDirection, string> = {
  credit: '入账',
  debit: '出账',
};

const CARD_LAST4_RE = /^\d{4}$/;

/** 托管状态 → 词汇表规范词（STATUS_VOCABULARY §4：escrow held/released；refunded 走订单流） */
function escrowStatusWord(status: EscrowItem['escrowStatus']): string {
  if (status === 'held') return 'escrow held';
  if (status === 'released') return 'escrow released';
  return 'refunded';
}

export function WalletPage() {
  const { showToast } = useToast();

  // ---- 余额总览 ----
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // ---- 充值 ----
  const [topupDraft, setTopupDraft] = useState('');
  const [topupConfirmOpen, setTopupConfirmOpen] = useState(false);
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  const [topupError, setTopupError] = useState<string | null>(null);

  // ---- 收支记录 ----
  const [txFilter, setTxFilter] = useState<{ type: '' | TransactionType; direction: '' | TransactionDirection }>({
    type: '',
    direction: '',
  });
  const [txPage, setTxPage] = useState(1);
  const [transactions, setTransactions] = useState<Paginated<TransactionItem> | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // ---- 提现 ----
  const [wdForm, setWdForm] = useState({ amountCr: '', bankName: '', holderName: '', cardLast4: '' });
  const [wdErrors, setWdErrors] = useState<Record<string, string>>({});
  const [wdConfirmOpen, setWdConfirmOpen] = useState(false);
  const [wdSubmitting, setWdSubmitting] = useState(false);
  const [withdrawals, setWithdrawals] = useState<Paginated<WithdrawalItem> | null>(null);

  // ---- 托管总览 ----
  const [escrow, setEscrow] = useState<EscrowItem[]>([]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const s = await walletApi.summary();
      setSummary(s);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : '加载余额失败。');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    setTxError(null);
    try {
      const res = await walletApi.transactions({
        type: txFilter.type || undefined,
        direction: txFilter.direction || undefined,
        page: txPage,
        pageSize: 10,
      });
      setTransactions(res);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : '加载收支记录失败。');
    }
  }, [txFilter.type, txFilter.direction, txPage]);

  const loadWithdrawals = useCallback(async () => {
    try {
      const res = await walletApi.withdrawals({ page: 1, pageSize: 10 });
      setWithdrawals(res);
    } catch {
      // 提现记录加载失败不阻塞页面（空列表 + 可重试入口）
      setWithdrawals({ items: [], page: 1, pageSize: 10, total: 0 });
    }
  }, []);

  const loadEscrow = useCallback(async () => {
    try {
      const res = await walletApi.escrow();
      setEscrow(res.items);
    } catch {
      setEscrow([]);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    void loadWithdrawals();
  }, [loadWithdrawals]);

  useEffect(() => {
    void loadEscrow();
  }, [loadEscrow]);

  const refreshAll = useCallback(() => {
    void loadSummary();
    void loadTransactions();
    void loadWithdrawals();
    void loadEscrow();
  }, [loadSummary, loadTransactions, loadWithdrawals, loadEscrow]);

  // ---- 充值 ----
  const topupAmountCr = useMemo(() => {
    const n = Number(topupDraft);
    return Number.isInteger(n) && n > 0 ? n : 0;
  }, [topupDraft]);

  const submitTopup = async () => {
    if (topupAmountCr <= 0) {
      setTopupError('请输入大于 0 的整数金额（CR）。');
      return;
    }
    setTopupSubmitting(true);
    setTopupError(null);
    try {
      const { balanceAfterCr } = await walletApi.topup(topupAmountCr, true);
      showToast(`充值成功，当前余额 ${formatCr(balanceAfterCr)}。`, { tone: 'success' });
      setTopupDraft('');
      setTopupConfirmOpen(false);
      refreshAll();
    } catch (err) {
      setTopupError(err instanceof Error ? err.message : '充值失败，请稍后重试。');
    } finally {
      setTopupSubmitting(false);
    }
  };

  const onTopupClick = () => {
    setTopupError(null);
    if (topupAmountCr <= 0) {
      setTopupError('请输入大于 0 的整数金额（CR）。');
      return;
    }
    if (topupAmountCr >= TOPUP_CONFIRM_THRESHOLD_CR) {
      setTopupConfirmOpen(true); // 大额二次确认（§5.2）
    } else {
      setTopupSubmitting(true);
      walletApi
        .topup(topupAmountCr, false)
        .then(({ balanceAfterCr }) => {
          showToast(`充值成功，当前余额 ${formatCr(balanceAfterCr)}。`, { tone: 'success' });
          setTopupDraft('');
          refreshAll();
        })
        .catch((err: unknown) =>
          setTopupError(err instanceof Error ? err.message : '充值失败，请稍后重试。'),
        )
        .finally(() => setTopupSubmitting(false));
    }
  };

  // ---- 提现 ----
  const validateWithdrawal = (): boolean => {
    const errors: Record<string, string> = {};
    const amount = Number(wdForm.amountCr);
    if (!Number.isInteger(amount) || amount <= 0) errors.amountCr = '提现金额必须是正整数（CR）。';
    if (wdForm.bankName.trim() === '') errors.bankName = '开户行不能为空。';
    if (wdForm.holderName.trim() === '') errors.holderName = '持卡人姓名不能为空。';
    if (!CARD_LAST4_RE.test(wdForm.cardLast4.trim())) errors.cardLast4 = '银行卡后四位需为 4 位数字。';
    setWdErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const onWithdrawClick = () => {
    if (!validateWithdrawal()) return;
    setWdConfirmOpen(true); // 二次确认（§5.2：金额/实际到账/到账时间）
  };

  const confirmWithdraw = async () => {
    const amount = Number(wdForm.amountCr);
    setWdSubmitting(true);
    try {
      const { withdrawal } = await walletApi.createWithdrawal({
        amountCr: amount,
        bankName: wdForm.bankName.trim(),
        holderName: wdForm.holderName.trim(),
        cardLast4: wdForm.cardLast4.trim(),
      });
      showToast(
        `提现申请已提交，${withdrawal.etaDays} 个工作日内到账（${formatCr(withdrawal.amountCr)}）。`,
        { tone: 'success' },
      );
      setWdConfirmOpen(false);
      setWdForm({ amountCr: '', bankName: '', holderName: '', cardLast4: '' });
      refreshAll();
    } catch (err) {
      setWdErrors({ form: err instanceof Error ? err.message : '提现申请失败，请稍后重试。' });
      setWdConfirmOpen(false);
    } finally {
      setWdSubmitting(false);
    }
  };

  const balanceCr = summary?.balanceCr ?? 0;
  const wdAmount = Number(wdForm.amountCr) || 0;

  return (
    <div className="page wallet-page">
      <div className="wallet-page__head">
        <h1 className="text-h1 page__title">钱包</h1>
      </div>

      {/* 余额卡 */}
      {summaryLoading ? (
        <div aria-busy="true" data-testid="wallet-loading">
          <Skeleton variant="card" height={180} />
        </div>
      ) : summaryError ? (
        <ErrorBanner
          title="加载余额失败"
          reason={summaryError}
          nextStep="点击重试。"
          actions={[{ label: '重试', onClick: () => void loadSummary() }]}
        />
      ) : (
        <WalletBalanceCard summary={summary} onTopup={() => document.getElementById('topup-amount')?.focus()} />
      )}

      {/* 充值 */}
      <section className="wallet-section" aria-label="充值" data-testid="topup-section">
        <h2 className="text-h2">充值</h2>
        <p className="text-caption text-tertiary">
          模拟支付，即时到账；单次 ≥ {TOPUP_CONFIRM_THRESHOLD_CR} CR 需二次确认。
        </p>
        <div className="wallet-topup__row">
          <label className="wallet-topup__label text-body-sm" htmlFor="topup-amount">
            充值金额（CR）
          </label>
          <input
            id="topup-amount"
            className="form-input wallet-topup__input"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            placeholder="如 100"
            value={topupDraft}
            onChange={(e) => setTopupDraft(e.target.value)}
            aria-label="充值金额"
            aria-invalid={Boolean(topupError)}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={onTopupClick}
            disabled={topupSubmitting}
          >
            {topupSubmitting ? (
              <>
                <Loader2 className="badge__spinner" size={16} aria-hidden="true" />
                充值中…
              </>
            ) : (
              <>
                <PlusCircle size={16} aria-hidden="true" />
                充值
              </>
            )}
          </button>
        </div>
        {topupError && (
          <p className="form-error" role="alert">
            <AlertCircle size={14} aria-hidden="true" />
            <span>{topupError}</span>
          </p>
        )}
      </section>

      {/* 收支记录 */}
      <section className="wallet-section" aria-label="收支记录" data-testid="transactions-section">
        <h2 className="text-h2">收支记录</h2>
        <div className="wallet-filters">
          <label className="text-body-sm">
            类型
            <select
              className="marketplace-filters__select"
              value={txFilter.type}
              onChange={(e) => {
                setTxFilter((f) => ({ ...f, type: e.target.value as '' | TransactionType }));
                setTxPage(1);
              }}
              aria-label="台账类型筛选"
            >
              <option value="">全部</option>
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TRANSACTION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-body-sm">
            方向
            <select
              className="marketplace-filters__select"
              value={txFilter.direction}
              onChange={(e) => {
                setTxFilter((f) => ({ ...f, direction: e.target.value as '' | TransactionDirection }));
                setTxPage(1);
              }}
              aria-label="台账方向筛选"
            >
              <option value="">全部</option>
              <option value="credit">入账</option>
              <option value="debit">出账</option>
            </select>
          </label>
        </div>

        {txError ? (
          <ErrorBanner
            title="加载收支记录失败"
            reason={txError}
            nextStep="点击重试。"
            actions={[{ label: '重试', onClick: () => void loadTransactions() }]}
          />
        ) : !transactions ? (
          <Skeleton width="100%" height={120} />
        ) : transactions.items.length === 0 ? (
          <EmptyState
            icon={Wallet}
            tone="info"
            title="还没有收支记录"
            description="充值与消费记录会显示在这里。"
            actionLabel="去充值"
            onAction={() => document.getElementById('topup-amount')?.focus()}
          />
        ) : (
          <>
            <ul className="tx-list" data-testid="tx-list">
              {transactions.items.map((tx) => (
                <li key={tx.id} className="tx-item">
                  <div className="tx-item__main">
                    <p className="tx-item__type text-body-sm">
                      <strong>{TRANSACTION_TYPE_LABELS[tx.type]}</strong>
                      <span className="badge badge--neutral tx-item__dir">
                        {DIRECTION_LABELS[tx.direction]}
                      </span>
                    </p>
                    {tx.note && <p className="tx-item__note text-caption text-tertiary">{tx.note}</p>}
                    <time className="text-caption text-tertiary">
                      {new Date(tx.createdAt).toLocaleString('zh-CN')}
                    </time>
                  </div>
                  <div className="tx-item__amounts">
                    <p
                      className={`tx-item__amount num ${tx.direction === 'credit' ? 'tx-item__amount--credit' : 'tx-item__amount--debit'}`}
                    >
                      {formatSignedCr(tx.amountCr, tx.direction)}
                    </p>
                    <p className="tx-item__balance text-caption text-tertiary">
                      余额 {formatCr(tx.balanceAfterCr)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination
              page={transactions.page}
              pageSize={transactions.pageSize}
              total={transactions.total}
              onPageChange={setTxPage}
            />
          </>
        )}
      </section>

      {/* 提现 */}
      <section className="wallet-section" aria-label="提现" data-testid="withdraw-section">
        <h2 className="text-h2">提现到银行卡</h2>
        <p className="text-caption text-tertiary">
          到账时间：<strong>{WITHDRAWAL_ETA_MIN_DAYS}–{WITHDRAWAL_ETA_MAX_DAYS} 个工作日</strong>
          （课程演示为模拟提现，填写演示信息即可）
        </p>
        <div className="wallet-withdraw__form">
          <div className="form-field">
            <label className="form-label" htmlFor="wd-amount">
              提现金额（CR）<span className="text-warning">*</span>
            </label>
            <input
              id="wd-amount"
              className="form-input"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={wdForm.amountCr}
              onChange={(e) => setWdForm((f) => ({ ...f, amountCr: e.target.value }))}
              aria-invalid={Boolean(wdErrors.amountCr)}
            />
            {wdErrors.amountCr && (
              <p className="form-error">
                <AlertCircle size={14} aria-hidden="true" />
                <span>{wdErrors.amountCr}</span>
              </p>
            )}
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="wd-bank">
              开户行 <span className="text-warning">*</span>
            </label>
            <input
              id="wd-bank"
              className="form-input"
              value={wdForm.bankName}
              onChange={(e) => setWdForm((f) => ({ ...f, bankName: e.target.value }))}
              placeholder="如：测试银行"
              aria-invalid={Boolean(wdErrors.bankName)}
            />
            {wdErrors.bankName && (
              <p className="form-error">
                <AlertCircle size={14} aria-hidden="true" />
                <span>{wdErrors.bankName}</span>
              </p>
            )}
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="wd-holder">
              持卡人姓名 <span className="text-warning">*</span>
            </label>
            <input
              id="wd-holder"
              className="form-input"
              value={wdForm.holderName}
              onChange={(e) => setWdForm((f) => ({ ...f, holderName: e.target.value }))}
              placeholder="如：小明"
              aria-invalid={Boolean(wdErrors.holderName)}
            />
            {wdErrors.holderName && (
              <p className="form-error">
                <AlertCircle size={14} aria-hidden="true" />
                <span>{wdErrors.holderName}</span>
              </p>
            )}
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="wd-card">
              银行卡号后四位 <span className="text-warning">*</span>
            </label>
            <input
              id="wd-card"
              className="form-input"
              inputMode="numeric"
              maxLength={4}
              value={wdForm.cardLast4}
              onChange={(e) => setWdForm((f) => ({ ...f, cardLast4: e.target.value.replace(/\D/g, '') }))}
              placeholder="如：1234"
              aria-invalid={Boolean(wdErrors.cardLast4)}
            />
            {wdErrors.cardLast4 && (
              <p className="form-error">
                <AlertCircle size={14} aria-hidden="true" />
                <span>{wdErrors.cardLast4}</span>
              </p>
            )}
          </div>
          {wdErrors.form && (
            <p className="form-error" role="alert">
              <AlertCircle size={14} aria-hidden="true" />
              <span>{wdErrors.form}</span>
            </p>
          )}
          <button type="button" className="btn btn-danger" onClick={onWithdrawClick} disabled={wdSubmitting}>
            <Landmark size={16} aria-hidden="true" />
            提现
          </button>
        </div>

        {/* 提现记录 */}
        <h3 className="text-h3 wallet-section__sub">提现记录</h3>
        {withdrawals && withdrawals.items.length > 0 ? (
          <ul className="wd-list" data-testid="wd-list">
            {withdrawals.items.map((wd) => (
              <li key={wd.id} className="wd-item">
                <div className="wd-item__main">
                  <p className="text-body-sm">
                    <strong className="num">{formatCr(wd.amountCr)}</strong> → {wd.bankName}（****
                    {wd.cardLast4}）
                  </p>
                  <p className="text-caption text-tertiary">
                    {wd.holderName} · 预计 {wd.etaDays} 个工作日到账 ·{' '}
                    {new Date(wd.createdAt).toLocaleDateString('zh-CN')}
                  </p>
                </div>
                <StatusBadge status={wd.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-tertiary">暂无提现记录。</p>
        )}
      </section>

      {/* 托管总览 */}
      <section className="wallet-section" aria-label="托管总览" data-testid="escrow-section">
        <h2 className="text-h2">托管总览</h2>
        <p className="text-caption text-tertiary">
          谁的钱、在哪里、何时到账 —— 一目了然（词汇表 §4/§5）。
        </p>
        {escrow.length === 0 ? (
          <EmptyState
            icon={Lock}
            tone="info"
            title="暂无托管资金"
            description="下单或接单后，涉及托管的资金会显示在这里。"
            actionLabel="去 Marketplace"
            onAction={() => (window.location.href = '/marketplace')}
          />
        ) : (
          <ul className="escrow-list" data-testid="escrow-list">
            {escrow.map((item, i) => (
              <li key={`${item.refType}-${item.refId}-${i}`} className="escrow-item">
                <div className="escrow-item__main">
                  <p className="text-body-sm">
                    <strong className="num">{formatCr(item.amountCr)}</strong>
                    <span className="badge badge--neutral escrow-item__party">{item.party}</span>
                    <StatusBadge status={escrowStatusWord(item.escrowStatus)} />
                  </p>
                  <p className="text-caption text-tertiary">
                    {item.refType === 'order' ? '订单' : '合同'} {item.refId.slice(0, 8)} ·{' '}
                    {item.direction === 'in' ? '我的钱进入托管' : '托管将放给我'}
                  </p>
                </div>
                <p className="escrow-item__eta text-body-sm" aria-label="何时到账">
                  <RefreshCcw size={14} aria-hidden="true" />
                  {item.eta}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 大额充值二次确认（§5.2：当前余额 → 充值金额 → 充值后余额） */}
      <ConfirmDialog
        open={topupConfirmOpen}
        title="确认充值"
        consequences={
          <div data-testid="topup-confirm">
            <dl className="purchase-panel__quote-lines">
              <div>
                <dt>当前余额</dt>
                <dd className="num">{formatCr(balanceCr)}</dd>
              </div>
              <div>
                <dt>充值金额</dt>
                <dd className="num">{formatCr(topupAmountCr)}</dd>
              </div>
              <div>
                <dt>充值后余额</dt>
                <dd className="num">{formatCr(balanceCr + topupAmountCr)}</dd>
              </div>
            </dl>
            <p className="text-caption text-tertiary">模拟支付，确认后即时到账。</p>
          </div>
        }
        confirmLabel={`确认充值 ${formatCr(topupAmountCr)}`}
        confirmTone="brand"
        confirmDisabled={topupSubmitting}
        onConfirm={() => void submitTopup()}
        onCancel={() => setTopupConfirmOpen(false)}
      />

      {/* 提现二次确认（§5.2：金额/实际到账/到账时间） */}
      <ConfirmDialog
        open={wdConfirmOpen}
        title="确认提现"
        consequences={
          <div data-testid="withdraw-confirm">
            <dl className="purchase-panel__quote-lines">
              <div>
                <dt>提现金额</dt>
                <dd className="num">{formatCr(wdAmount)}</dd>
              </div>
              <div>
                <dt>实际到账</dt>
                <dd className="num">{formatCr(wdAmount)}</dd>
              </div>
              <div>
                <dt>到账时间</dt>
                <dd>{WITHDRAWAL_ETA_MIN_DAYS}–{WITHDRAWAL_ETA_MAX_DAYS} 个工作日</dd>
              </div>
            </dl>
            <p className="text-body-sm">
              将提现到 {wdForm.bankName}（****{wdForm.cardLast4}，{wdForm.holderName}），
              提交后不可撤回。
            </p>
          </div>
        }
        confirmLabel="确认提现"
        confirmTone="danger"
        confirmDisabled={wdSubmitting}
        onConfirm={() => void confirmWithdraw()}
        onCancel={() => setWdConfirmOpen(false)}
      />
    </div>
  );
}
