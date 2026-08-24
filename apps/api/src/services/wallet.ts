import { randomUUID } from 'node:crypto';
import {
  CURRENCY,
  TOPUP_CONFIRM_THRESHOLD_CR,
  TRANSACTION_TYPES,
  WITHDRAWAL_ETA_MAX_DAYS,
  WITHDRAWAL_ETA_MIN_DAYS,
  type Cr,
  type EscrowItem,
  type EscrowStatus,
  type Paginated,
  type TransactionDirection,
  type TransactionItem,
  type TransactionStatus,
  type TransactionType,
  type WalletSummary,
  type WithdrawalItem,
  type WithdrawalStatus,
} from '@vibe/shared';
import type { Db } from '../db';
import { ApiError } from '../lib/errors';
import { isPositiveInt } from '../lib/money';

// ---------------------------------------------------------------------------
// 行类型（DB 列 → API 字段）
// ---------------------------------------------------------------------------

interface TransactionRow {
  id: string;
  type: TransactionType;
  direction: TransactionDirection;
  amount_cr: number;
  balance_after_cr: number;
  ref_type: string | null;
  ref_id: string | null;
  status: TransactionStatus;
  note: string | null;
  created_at: string;
}

interface WithdrawalRow {
  id: string;
  amount_cr: number;
  bank_info: string;
  status: WithdrawalStatus;
  eta_days: number;
  created_at: string;
}

interface OrderEscrowRow {
  id: string;
  total_cr: number;
  escrow_status: EscrowStatus;
  buyer_id: string;
  seller_id: string;
  created_at: string;
}

interface ContractEscrowRow {
  id: string;
  agreed_amount_cr: number;
  escrow_status: EscrowStatus;
  buyer_id: string;
  contractor_id: string;
  created_at: string;
}

function toTransactionItem(row: TransactionRow): TransactionItem {
  return {
    id: row.id,
    type: row.type,
    direction: row.direction,
    amountCr: row.amount_cr,
    balanceAfterCr: row.balance_after_cr,
    refType: row.ref_type,
    refId: row.ref_id,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
  };
}

function toWithdrawalItem(row: WithdrawalRow): WithdrawalItem {
  const bank = JSON.parse(row.bank_info) as { bankName?: string; cardLast4?: string; holderName?: string };
  return {
    id: row.id,
    amountCr: row.amount_cr,
    status: row.status,
    etaDays: row.eta_days,
    bankName: bank.bankName ?? '',
    cardLast4: bank.cardLast4 ?? '',
    holderName: bank.holderName ?? '',
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// 查询
// ---------------------------------------------------------------------------

export function getBalanceCr(db: Db, userId: string): Cr {
  const row = db
    .prepare('SELECT balance_cr FROM wallets WHERE user_id = ?')
    .get(userId) as { balance_cr: number } | undefined;
  if (!row) throw ApiError.notFound('钱包不存在');
  return row.balance_cr;
}

/** 托管中（escrow held）涉及我的钱：作为买家已付 + 作为卖家/接单者待收 */
function getEscrowHeldCr(db: Db, userId: string): Cr {
  const order = db
    .prepare(
      `SELECT COALESCE(SUM(total_cr), 0) AS s FROM orders
       WHERE escrow_status = 'held' AND (buyer_id = ? OR seller_id = ?)`,
    )
    .get(userId, userId) as { s: number };
  const contract = db
    .prepare(
      `SELECT COALESCE(SUM(agreed_amount_cr), 0) AS s FROM contracts
       WHERE escrow_status = 'held' AND (buyer_id = ? OR contractor_id = ?)`,
    )
    .get(userId, userId) as { s: number };
  return order.s + contract.s;
}

function getPendingWithdrawalCr(db: Db, userId: string): Cr {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount_cr), 0) AS s FROM withdrawals
       WHERE user_id = ? AND status = 'withdrawal pending'`,
    )
    .get(userId) as { s: number };
  return row.s;
}

/** GET /api/wallet：余额 / 托管中 / 提现中，一眼可见「钱在谁手里」 */
export function getWalletSummary(db: Db, userId: string): WalletSummary {
  return {
    balanceCr: getBalanceCr(db, userId),
    escrowHeldCr: getEscrowHeldCr(db, userId),
    currency: CURRENCY,
    pendingWithdrawalCr: getPendingWithdrawalCr(db, userId),
  };
}

// ---------------------------------------------------------------------------
// 记账（每次资金变动必走：更新余额 + 写台账，调用方须包在 db.transaction 内）
// ---------------------------------------------------------------------------

export interface LedgerEntry {
  type: TransactionType;
  direction: TransactionDirection;
  amountCr: Cr;
  status?: TransactionStatus;
  note?: string;
  refType?: string | null;
  refId?: string | null;
}

export function recordLedger(
  db: Db,
  userId: string,
  entry: LedgerEntry,
): { balanceAfterCr: Cr; transactionId: string } {
  const balance = getBalanceCr(db, userId);
  const balanceAfter = entry.direction === 'credit' ? balance + entry.amountCr : balance - entry.amountCr;
  if (balanceAfter < 0) throw ApiError.insufficientBalance();

  const transactionId = randomUUID();
  const now = new Date().toISOString();
  db.prepare('UPDATE wallets SET balance_cr = ?, updated_at = ? WHERE user_id = ?').run(
    balanceAfter,
    now,
    userId,
  );
  db.prepare(
    `INSERT INTO transactions (id, user_id, type, direction, amount_cr, balance_after_cr, ref_type, ref_id, status, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    transactionId,
    userId,
    entry.type,
    entry.direction,
    entry.amountCr,
    balanceAfter,
    entry.refType ?? null,
    entry.refId ?? null,
    entry.status ?? 'completed',
    entry.note ?? null,
    now,
  );
  return { balanceAfterCr: balanceAfter, transactionId };
}

// ---------------------------------------------------------------------------
// 充值（模拟支付：直接成功入账；A1 大额 ≥100 CR 必须 confirm: true）
// ---------------------------------------------------------------------------

export function topup(
  db: Db,
  userId: string,
  amountCr: unknown,
  confirm: boolean,
): { balanceAfterCr: Cr; transaction: TransactionItem } {
  if (!isPositiveInt(amountCr)) {
    throw ApiError.badRequest('VALIDATION', '充值金额必须是正整数（CR）');
  }
  if (amountCr >= TOPUP_CONFIRM_THRESHOLD_CR && confirm !== true) {
    throw ApiError.badRequest(
      'VALIDATION',
      `单次充值 ≥ ${TOPUP_CONFIRM_THRESHOLD_CR} CR 需二次确认（confirm: true）`,
      { thresholdCr: TOPUP_CONFIRM_THRESHOLD_CR },
    );
  }

  const run = db.transaction(() => {
    const { balanceAfterCr, transactionId } = recordLedger(db, userId, {
      type: 'topup',
      direction: 'credit',
      amountCr,
      note: `模拟支付充值 ${amountCr} CR 入账`,
    });
    const row = db
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .get(transactionId) as TransactionRow;
    return { balanceAfterCr, transaction: toTransactionItem(row) };
  });
  return run();
}

// ---------------------------------------------------------------------------
// 台账列表（分页 + type/direction 筛选）
// ---------------------------------------------------------------------------

const DIRECTIONS: readonly TransactionDirection[] = ['credit', 'debit'];

export function listTransactions(
  db: Db,
  userId: string,
  opts: { type?: unknown; direction?: unknown; page?: number; pageSize?: number },
): Paginated<TransactionItem> {
  const where: string[] = ['user_id = ?'];
  const params: unknown[] = [userId];

  if (opts.type !== undefined) {
    if (!TRANSACTION_TYPES.includes(opts.type as TransactionType)) {
      throw ApiError.badRequest('VALIDATION', `type 只能是：${TRANSACTION_TYPES.join(' / ')}`);
    }
    where.push('type = ?');
    params.push(opts.type);
  }
  if (opts.direction !== undefined) {
    if (!DIRECTIONS.includes(opts.direction as TransactionDirection)) {
      throw ApiError.badRequest('VALIDATION', 'direction 只能是 credit / debit');
    }
    where.push('direction = ?');
    params.push(opts.direction);
  }

  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
  const whereSql = where.join(' AND ');

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM transactions WHERE ${whereSql}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT * FROM transactions WHERE ${whereSql} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as TransactionRow[];

  return { items: rows.map(toTransactionItem), page, pageSize, total };
}

// ---------------------------------------------------------------------------
// 提现（模拟身份+银行卡校验；A4 到账 1–3 个工作日）
// ---------------------------------------------------------------------------

const CARD_LAST4_RE = /^\d{4}$/;

export interface WithdrawalInput {
  amountCr?: unknown;
  bankName?: unknown;
  cardLast4?: unknown;
  holderName?: unknown;
}

export function createWithdrawal(db: Db, userId: string, input: WithdrawalInput): WithdrawalItem {
  const { amountCr, bankName, cardLast4, holderName } = input;

  if (!isPositiveInt(amountCr)) {
    throw ApiError.badRequest('VALIDATION', '提现金额必须是正整数（CR）');
  }
  if (typeof bankName !== 'string' || bankName.trim() === '') {
    throw ApiError.badRequest('VALIDATION', '开户行不能为空');
  }
  if (typeof holderName !== 'string' || holderName.trim() === '') {
    throw ApiError.badRequest('VALIDATION', '持卡人姓名不能为空');
  }
  if (typeof cardLast4 !== 'string' || !CARD_LAST4_RE.test(cardLast4)) {
    throw ApiError.badRequest('VALIDATION', '银行卡后四位需为 4 位数字');
  }

  const etaDays =
    WITHDRAWAL_ETA_MIN_DAYS +
    Math.floor(Math.random() * (WITHDRAWAL_ETA_MAX_DAYS - WITHDRAWAL_ETA_MIN_DAYS + 1)); // 1–3
  const withdrawalId = randomUUID();
  const now = new Date().toISOString();
  const bankInfo = JSON.stringify({
    bankName: bankName.trim(),
    cardLast4: cardLast4.trim(),
    holderName: holderName.trim(),
  });

  db.transaction(() => {
    recordLedger(db, userId, {
      type: 'withdrawal',
      direction: 'debit',
      amountCr,
      note: `提现申请：${bankName.trim()} ****${cardLast4.trim()}，预计 ${etaDays} 个工作日到账`,
      refType: 'withdrawal',
      refId: withdrawalId,
    });
    db.prepare(
      `INSERT INTO withdrawals (id, user_id, amount_cr, bank_info, status, eta_days, created_at)
       VALUES (?, ?, ?, ?, 'withdrawal pending', ?, ?)`,
    ).run(withdrawalId, userId, amountCr, bankInfo, etaDays, now);
  })();

  return {
    id: withdrawalId,
    amountCr,
    status: 'withdrawal pending',
    etaDays,
    bankName: bankName.trim(),
    cardLast4: cardLast4.trim(),
    holderName: holderName.trim(),
    createdAt: now,
  };
}

const WITHDRAWAL_STATUSES: readonly WithdrawalStatus[] = [
  'withdrawal pending',
  'withdrawal completed',
  'withdrawal failed',
];

export function listWithdrawals(
  db: Db,
  userId: string,
  opts: { status?: unknown; page?: number; pageSize?: number },
): Paginated<WithdrawalItem> {
  const where: string[] = ['user_id = ?'];
  const params: unknown[] = [userId];

  if (opts.status !== undefined) {
    if (!WITHDRAWAL_STATUSES.includes(opts.status as WithdrawalStatus)) {
      throw ApiError.badRequest(
        'VALIDATION',
        'status 只能是：withdrawal pending / withdrawal completed / withdrawal failed',
      );
    }
    where.push('status = ?');
    params.push(opts.status);
  }

  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
  const whereSql = where.join(' AND ');

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM withdrawals WHERE ${whereSql}`).get(...params) as {
      c: number;
    }
  ).c;
  const rows = db
    .prepare(
      `SELECT * FROM withdrawals WHERE ${whereSql} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as WithdrawalRow[];

  return { items: rows.map(toWithdrawalItem), page, pageSize, total };
}

// ---------------------------------------------------------------------------
// 托管总览（钱在谁手里 / 何时到账，一眼可见）
// ---------------------------------------------------------------------------

function escrowEta(party: 'buyer' | 'payee', status: EscrowStatus): string {
  if (status === 'held') {
    return party === 'buyer' ? '退款窗口内可申请退回' : '验收通过后即时到账';
  }
  if (status === 'released') {
    return party === 'buyer' ? '已放款给收款方' : '已到账（进入余额）';
  }
  return '已退回买家余额';
}

export function listEscrow(db: Db, userId: string): EscrowItem[] {
  const orders = db
    .prepare(
      `SELECT id, total_cr, escrow_status, buyer_id, seller_id, created_at FROM orders
       WHERE escrow_status != 'none' AND (buyer_id = ? OR seller_id = ?)
       ORDER BY created_at DESC`,
    )
    .all(userId, userId) as OrderEscrowRow[];
  const contracts = db
    .prepare(
      `SELECT id, agreed_amount_cr, escrow_status, buyer_id, contractor_id, created_at FROM contracts
       WHERE escrow_status != 'none' AND (buyer_id = ? OR contractor_id = ?)
       ORDER BY created_at DESC`,
    )
    .all(userId, userId) as ContractEscrowRow[];

  const entries: { ts: string; item: EscrowItem }[] = [];

  for (const o of orders) {
    const iAmBuyer = o.buyer_id === userId;
    entries.push({
      ts: o.created_at,
      item: {
        refType: 'order',
        refId: o.id,
        direction: iAmBuyer ? 'in' : 'out',
        amountCr: o.total_cr,
        escrowStatus: o.escrow_status,
        party: iAmBuyer ? '我(买家)' : '我(卖家/接单者)',
        eta: escrowEta(iAmBuyer ? 'buyer' : 'payee', o.escrow_status),
      },
    });
  }
  for (const c of contracts) {
    const iAmBuyer = c.buyer_id === userId;
    entries.push({
      ts: c.created_at,
      item: {
        refType: 'contract',
        refId: c.id,
        direction: iAmBuyer ? 'in' : 'out',
        amountCr: c.agreed_amount_cr,
        escrowStatus: c.escrow_status,
        party: iAmBuyer ? '我(买家)' : '我(卖家/接单者)',
        eta: escrowEta(iAmBuyer ? 'buyer' : 'payee', c.escrow_status),
      },
    });
  }

  entries.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return entries.map((e) => e.item);
}
