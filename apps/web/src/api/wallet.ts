/**
 * 钱包 API（docs/API.md §7）—— 已合并后端（feat(api): 钱包与托管 #20）。
 * 字段以 @vibe/shared `*Cr` 为准（余额/托管/提现中/台账/提现/托管总览）。
 */
import type {
  Cr,
  EscrowItem,
  Paginated,
  TransactionDirection,
  TransactionItem,
  TransactionType,
  WalletSummary,
  WithdrawalItem,
} from '@vibe/shared';
import { api } from './client';

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const walletApi = {
  /** GET /api/wallet —— 余额 / 托管中 / 提现中（钱在谁手里，一眼可见） */
  summary: () => api.get<WalletSummary>('/wallet'),

  /** POST /api/wallet/topup —— 模拟支付；A1 单次 ≥100 CR 必须 confirm: true */
  topup: (amountCr: Cr, confirm: boolean) =>
    api.post<{ balanceAfterCr: Cr; transaction: TransactionItem }>('/wallet/topup', {
      amountCr,
      confirm,
    }),

  /** GET /api/wallet/transactions —— 收支台账（type/direction 筛选 + 分页） */
  transactions: (params: {
    type?: TransactionType;
    direction?: TransactionDirection;
    page?: number;
    pageSize?: number;
  }) =>
    api.get<Paginated<TransactionItem>>(
      `/wallet/transactions${toQuery({
        type: params.type,
        direction: params.direction,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 10,
      })}`,
    ),

  /** POST /api/wallet/withdrawals —— 提现（模拟身份 + 银行卡校验） */
  createWithdrawal: (input: {
    amountCr: Cr;
    bankName: string;
    cardLast4: string;
    holderName: string;
  }) => api.post<{ withdrawal: WithdrawalItem }>('/wallet/withdrawals', input),

  /** GET /api/wallet/withdrawals —— 提现记录（status 筛选 + 分页） */
  withdrawals: (params: { status?: string; page?: number; pageSize?: number }) =>
    api.get<Paginated<WithdrawalItem>>(
      `/wallet/withdrawals${toQuery({
        status: params.status,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 10,
      })}`,
    ),

  /** GET /api/wallet/escrow —— 托管总览（钱在谁手里 / 何时到账） */
  escrow: () => api.get<{ items: EscrowItem[] }>('/wallet/escrow'),
};
