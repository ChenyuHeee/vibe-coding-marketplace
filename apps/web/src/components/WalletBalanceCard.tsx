/**
 * WalletBalanceCard —— 钱包余额卡（DESIGN_SYSTEM §8 #4）
 *
 * **顶部两栏，两个问题一眼可见**：
 * - 左「钱在谁手里」：托管中 X CR / 可提现 X CR（带图标）；
 * - 右「何时到账」：托管资金「验收通过后即时到账」、提现中「1–3 个工作日」；
 * - 下方余额大字（--text-num + tabular-nums）+ [充值] 按钮；
 * - 文字明确（§8 #4：「谁手里/何时到账」必须文字，不靠图标猜）。
 */
import { Landmark, Lock, PlusCircle, Wallet } from 'lucide-react';
import {
  WITHDRAWAL_ETA_MAX_DAYS,
  WITHDRAWAL_ETA_MIN_DAYS,
  type WalletSummary,
} from '@vibe/shared';
import { formatCr } from '../lib/format';

interface WalletBalanceCardProps {
  summary: WalletSummary | null;
  /** [充值] 点击（滚动/打开充值表单） */
  onTopup: () => void;
}

export function WalletBalanceCard({ summary, onTopup }: WalletBalanceCardProps) {
  const balanceCr = summary?.balanceCr ?? 0;
  const escrowHeldCr = summary?.escrowHeldCr ?? 0;
  const pendingWithdrawalCr = summary?.pendingWithdrawalCr ?? 0;
  const withdrawableCr = Math.max(0, balanceCr - pendingWithdrawalCr);

  return (
    <section className="wallet-balance" aria-label="钱包余额" data-testid="wallet-balance">
      {/* 顶部两栏：钱在谁手里 / 何时到账 */}
      <div className="wallet-balance__questions">
        <div className="wallet-balance__col">
          <h3 className="wallet-balance__q text-body-sm">钱在谁手里</h3>
          <p className="wallet-balance__row">
            <Lock size={16} aria-hidden="true" />
            <span>
              托管中 <strong className="num">{formatCr(escrowHeldCr)}</strong>
              <span className="text-caption text-tertiary">（平台托管账户）</span>
            </span>
          </p>
          <p className="wallet-balance__row">
            <Wallet size={16} aria-hidden="true" />
            <span>
              可提现 <strong className="num">{formatCr(withdrawableCr)}</strong>
            </span>
          </p>
          {pendingWithdrawalCr > 0 && (
            <p className="wallet-balance__row">
              <Landmark size={16} aria-hidden="true" />
              <span>
                提现中 <strong className="num">{formatCr(pendingWithdrawalCr)}</strong>
                <span className="text-caption text-tertiary">（已在银行通道）</span>
              </span>
            </p>
          )}
        </div>

        <div className="wallet-balance__col">
          <h3 className="wallet-balance__q text-body-sm">何时到账</h3>
          <p className="wallet-balance__row wallet-balance__row--eta">
            <Lock size={16} aria-hidden="true" />
            托管资金：验收通过后即时到账
          </p>
          <p className="wallet-balance__row wallet-balance__row--eta">
            <Landmark size={16} aria-hidden="true" />
            提现到账：
            {WITHDRAWAL_ETA_MIN_DAYS}–{WITHDRAWAL_ETA_MAX_DAYS} 个工作日
          </p>
        </div>
      </div>

      {/* 余额大字 + 充值 */}
      <div className="wallet-balance__bottom">
        <div className="wallet-balance__balance">
          <p className="text-caption text-tertiary wallet-balance__balance-label">可用余额</p>
          <p className="wallet-balance__amount num" aria-label={`可用余额 ${formatCr(balanceCr)}`}>
            {formatCr(balanceCr)}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onTopup}>
          <PlusCircle size={16} aria-hidden="true" />
          充值
        </button>
      </div>
    </section>
  );
}
