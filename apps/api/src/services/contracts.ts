/**
 * 接单交付服务（PR-B3-B）：合同启动（预算进托管）/ 里程碑提交 / 验收（approve / revision）/
 * 最终验收 / 结算放款 / 合同列表与详情 / 验收期自动确认（A3）。
 *
 * 状态机（词汇表 §3 ★ 合同级六词，不得改名）：
 *   selected ──start(预算进托管 escrow=held)──▶ in progress
 *       │                                          │
 *       │◀──────────── 非最终里程碑 approve（回 in progress）
 *       ▼                                          ▼
 *   payout ◀── buyer acceptance ◀── milestone submission（contractor 提交里程碑）
 *   （escrow released + contractor 入账）   （approve 最终里程碑 / accept 进入 buyer acceptance）
 *
 * 里程碑子状态：submitted → approved / revision requested（feedback 必填）；
 *   revision requested 后 contractor 提交新版本（新 seq）。
 *
 * 资金语义（与 services/orders.ts 的台账模式一致）：
 *   start：buyer 扣 agreedAmountCr → escrow_hold debit（refType=contract）
 *   payout：contractor 入账 agreedAmountCr → payout credit（refType=contract）
 *   两笔台账同额同 ref 对账；payout 时 commission → completed。
 *
 * A3 验收期自动确认：合同进入 buyer acceptance（accepted_at）满 ACCEPTANCE_AUTO_CONFIRM_DAYS(7) 天
 *   未操作 → 自动 payout。实现为惰性检查（任何合同读取路径先跑 autoSettleExpiredAcceptances），
 *   亦可启动时调用；测试覆盖惰性路径。
 */
import { randomUUID } from 'node:crypto';
import {
  ACCEPTANCE_AUTO_CONFIRM_DAYS,
  type CommissionStatus,
  type ContractDetail,
  type ContractItem,
  type ContractMilestoneItem,
  type ContractParty,
  type ContractStatus,
  type Cr,
  type EscrowStatus,
  type MilestoneStatus,
  type Paginated,
} from '@vibe/shared';
import type { Db } from '../db';
import { ApiError } from '../lib/errors';
import { recordLedger } from './wallet';

// ---------------------------------------------------------------------------
// 行类型与映射
// ---------------------------------------------------------------------------

interface ContractRow {
  id: string;
  commission_id: string;
  buyer_id: string;
  contractor_id: string;
  bid_id: string;
  agreed_amount_cr: number;
  status: ContractStatus;
  escrow_status: EscrowStatus;
  accepted_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  commission_title: string;
  commission_status: CommissionStatus;
  buyer_display_name: string;
  contractor_display_name: string;
}

interface MilestoneRow {
  id: string;
  contract_id: string;
  seq: number;
  title: string;
  description: string;
  deliverable_path: string | null;
  entry_file: string;
  is_final: number;
  feedback: string | null;
  status: MilestoneStatus;
  submitted_at: string | null;
  approved_at: string | null;
}

const CONTRACT_QUERY = `
  SELECT k.*, c.title AS commission_title, c.status AS commission_status,
         ub.display_name AS buyer_display_name, uc.display_name AS contractor_display_name
  FROM contracts k
  JOIN commissions c ON c.id = k.commission_id
  JOIN users ub ON ub.id = k.buyer_id
  JOIN users uc ON uc.id = k.contractor_id
`;

function getContractRow(db: Db, contractId: string): ContractRow {
  const row = db.prepare(`${CONTRACT_QUERY} WHERE k.id = ?`).get(contractId) as ContractRow | undefined;
  if (!row) throw ApiError.notFound('合同不存在');
  return row;
}

function getMilestoneRow(db: Db, milestoneId: string): MilestoneRow {
  const row = db
    .prepare('SELECT * FROM milestones WHERE id = ?')
    .get(milestoneId) as MilestoneRow | undefined;
  if (!row) throw ApiError.notFound('里程碑不存在');
  return row;
}

function toParty(id: string, displayName: string): ContractParty {
  return { id, displayName };
}

function toMilestoneItem(row: MilestoneRow): ContractMilestoneItem {
  return {
    id: row.id,
    seq: row.seq,
    title: row.title,
    description: row.description,
    deliverableUrl: row.deliverable_path
      ? `/api/milestones/${row.id}/files/${row.entry_file || 'index.html'}`
      : null,
    isFinal: Boolean(row.is_final),
    status: row.status,
    feedback: row.feedback,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
  };
}

function listMilestones(db: Db, contractId: string): ContractMilestoneItem[] {
  const rows = db
    .prepare('SELECT * FROM milestones WHERE contract_id = ? ORDER BY seq ASC, rowid ASC')
    .all(contractId) as MilestoneRow[];
  return rows.map(toMilestoneItem);
}

function toContractItem(row: ContractRow): ContractItem {
  return {
    id: row.id,
    commission: { id: row.commission_id, title: row.commission_title, status: row.commission_status },
    buyer: toParty(row.buyer_id, row.buyer_display_name),
    contractor: toParty(row.contractor_id, row.contractor_display_name),
    bidId: row.bid_id,
    agreedAmountCr: row.agreed_amount_cr,
    status: row.status,
    escrowStatus: row.escrow_status,
    acceptedAt: row.accepted_at,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toContractDetailWith(db: Db, row: ContractRow): ContractDetail {
  return { ...toContractItem(row), milestones: listMilestones(db, row.id) };
}

// ---------------------------------------------------------------------------
// A3 验收期自动确认（惰性检查：任何合同读取路径先执行）
// ---------------------------------------------------------------------------

/**
 * 扫描进入 buyer acceptance 满 7 天（accepted_at / updated_at）的合同，系统自动放款。
 * 幂等：payout 后 status='payout'，不再被扫到。返回本次自动结算数量。
 * 注释：任务允许「启动时扫描 + 按需惰性检查均可」——这里采用惰性检查，
 * 在 GET /api/contracts(/:id) 等读取路径先执行，保证展示前状态已收敛；
 * app.ts 启动时亦可调用一次（已挂载）。
 */
export function autoSettleExpiredAcceptances(db: Db): number {
  const cutoff = new Date(Date.now() - ACCEPTANCE_AUTO_CONFIRM_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT id FROM contracts
       WHERE status = 'buyer acceptance' AND COALESCE(accepted_at, updated_at) <= ?`,
    )
    .all(cutoff) as { id: string }[];
  let settled = 0;
  for (const r of rows) {
    payoutContract(db, r.id, null); // actorId=null → 系统自动结算
    settled += 1;
  }
  return settled;
}

// ---------------------------------------------------------------------------
// 启动合同（POST /api/contracts/:id/start，buyer）：selected → in progress，预算进托管
// ---------------------------------------------------------------------------

export interface StartResult {
  contract: ContractDetail;
  balanceAfterCr: Cr;
}

export function startContract(db: Db, contractId: string, buyerId: string): StartResult {
  const contract = getContractRow(db, contractId);
  if (contract.buyer_id !== buyerId) {
    throw ApiError.forbidden('只有合同买家可以启动合同');
  }
  if (contract.status !== 'selected') {
    throw ApiError.conflict(`当前状态 ${contract.status} 不可启动（仅 selected）`);
  }
  if (contract.escrow_status !== 'none') {
    throw ApiError.conflict(`当前托管状态 ${contract.escrow_status} 不可启动`);
  }
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    // 预算进托管：buyer 扣 agreedAmountCr → escrow_hold debit（台账，余额连续性）
    const { balanceAfterCr } = recordLedger(db, buyerId, {
      type: 'escrow_hold',
      direction: 'debit',
      amountCr: contract.agreed_amount_cr,
      note: `接单《${contract.commission_title}》预算进托管（合同启动）`,
      refType: 'contract',
      refId: contractId,
    });
    db.prepare(
      `UPDATE contracts SET status = 'in progress', escrow_status = 'held', updated_at = ? WHERE id = ?`,
    ).run(now, contractId);
    return balanceAfterCr;
  });
  const balanceAfterCr = tx();
  return { contract: toContractDetailWith(db, getContractRow(db, contractId)), balanceAfterCr };
}

// ---------------------------------------------------------------------------
// 里程碑提交（POST /api/contracts/:id/milestones，contractor，multipart）
// 交付物文件存储由路由层完成（uploads/milestones/<contractId>/<seq>/，zip 安全解压），
// 这里先分配 seq（beginMilestoneSubmission），路由存完文件后落库（createMilestone）。
// ---------------------------------------------------------------------------

/** 校验合同+接单者，返回下一个里程碑 seq（路由层先算目录再存文件） */
export function beginMilestoneSubmission(
  db: Db,
  contractId: string,
  contractorId: string,
): { contractId: string; seq: number } {
  const contract = getContractRow(db, contractId);
  if (contract.contractor_id !== contractorId) {
    throw ApiError.forbidden('只有合同接单者可以提交里程碑');
  }
  if (contract.status !== 'in progress' && contract.status !== 'milestone submission') {
    throw ApiError.conflict(
      `当前状态 ${contract.status} 不可提交里程碑（仅 in progress / milestone submission）`,
    );
  }
  const max = db
    .prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM milestones WHERE contract_id = ?')
    .get(contractId) as { s: number };
  return { contractId, seq: max.s + 1 };
}

export interface MilestoneCreateInput {
  seq: number;
  title?: unknown;
  description?: unknown;
  isFinal?: unknown;
}

/** 落库里程碑（status=submitted），合同 → milestone submission */
export function createMilestone(
  db: Db,
  contractId: string,
  contractorId: string,
  input: MilestoneCreateInput,
  deliverablePath: string,
  entryFile: string,
): ContractMilestoneItem {
  const contract = getContractRow(db, contractId);
  if (contract.contractor_id !== contractorId) {
    throw ApiError.forbidden('只有合同接单者可以提交里程碑');
  }
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title === '') throw ApiError.badRequest('VALIDATION', '里程碑标题不能为空');
  if (title.length > 120) throw ApiError.badRequest('VALIDATION', '里程碑标题最长 120 字');
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  // final 字段：'true'/'1'/'yes' 视为最终里程碑（approve 后合同进入 buyer acceptance）
  const isFinal =
    input.isFinal === true || input.isFinal === 'true' || input.isFinal === '1' || input.isFinal === 'yes';

  const id = randomUUID();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO milestones (id, contract_id, seq, title, description, deliverable_path, entry_file, is_final, status, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?)`,
    ).run(id, contractId, input.seq, title, description, deliverablePath, entryFile, isFinal ? 1 : 0, now);
    // 合同 → milestone submission（词汇表 §3：contractor 提交里程碑）
    db.prepare(`UPDATE contracts SET status = 'milestone submission', updated_at = ? WHERE id = ?`).run(
      now,
      contractId,
    );
  })();
  return toMilestoneItem(getMilestoneRow(db, id));
}

// ---------------------------------------------------------------------------
// 验收（POST /api/milestones/:id/approve 与 /request-revision，buyer）
// ---------------------------------------------------------------------------

/**
 * 里程碑验收通过：submitted → approved。
 * - 非最终里程碑 → 合同回 in progress（可继续提交后续里程碑）
 * - 最终里程碑（final:true）→ 合同 → buyer acceptance（accepted_at 起算 7 天自动确认）
 */
export function approveMilestone(db: Db, milestoneId: string, buyerId: string): ContractDetail {
  const milestone = getMilestoneRow(db, milestoneId);
  const contract = getContractRow(db, milestone.contract_id);
  if (contract.buyer_id !== buyerId) {
    throw ApiError.forbidden('只有合同买家可以验收里程碑');
  }
  if (milestone.status !== 'submitted') {
    throw ApiError.conflict(`里程碑当前状态 ${milestone.status} 不可验收（仅 submitted）`);
  }
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`UPDATE milestones SET status = 'approved', approved_at = ? WHERE id = ?`).run(now, milestoneId);
    if (milestone.is_final) {
      db.prepare(
        `UPDATE contracts SET status = 'buyer acceptance', accepted_at = ?, updated_at = ? WHERE id = ?`,
      ).run(now, now, contract.id);
    } else {
      db.prepare(
        `UPDATE contracts SET status = 'in progress', accepted_at = NULL, updated_at = ? WHERE id = ?`,
      ).run(now, contract.id);
    }
  })();
  return toContractDetailWith(db, getContractRow(db, contract.id));
}

/** 打回：submitted → revision requested，**必须带修改意见**（feedback）；合同保持 milestone submission */
export function requestMilestoneRevision(
  db: Db,
  milestoneId: string,
  buyerId: string,
  feedback: unknown,
): ContractDetail {
  const milestone = getMilestoneRow(db, milestoneId);
  const contract = getContractRow(db, milestone.contract_id);
  if (contract.buyer_id !== buyerId) {
    throw ApiError.forbidden('只有合同买家可以打回里程碑');
  }
  if (milestone.status !== 'submitted') {
    throw ApiError.conflict(`里程碑当前状态 ${milestone.status} 不可打回（仅 submitted）`);
  }
  const feedbackStr = typeof feedback === 'string' ? feedback.trim() : '';
  if (feedbackStr === '') {
    throw ApiError.badRequest('VALIDATION', '打回必须填写修改意见（feedback）');
  }
  if (feedbackStr.length > 2000) {
    throw ApiError.badRequest('VALIDATION', '修改意见最长 2000 字');
  }
  db.prepare(
    `UPDATE milestones SET status = 'revision requested', feedback = ? WHERE id = ?`,
  ).run(feedbackStr, milestoneId);
  // 合同保持 milestone submission（contractor 可再提交新版本，见文件头说明）
  return toContractDetailWith(db, getContractRow(db, contract.id));
}

// ---------------------------------------------------------------------------
// 最终验收（POST /api/contracts/:id/accept，buyer）：milestone submission → buyer acceptance
// ---------------------------------------------------------------------------

/**
 * 最终验收。正常流程中 approve 最终里程碑已自动进入 buyer acceptance，
 * 本端点作为显式确认（幂等：已处于 buyer acceptance 直接返回）。
 * 前提：至少一个里程碑已 approved（最终验收语义以 final:true 里程碑为准）。
 */
export function acceptContract(db: Db, contractId: string, buyerId: string): ContractDetail {
  const contract = getContractRow(db, contractId);
  if (contract.buyer_id !== buyerId) {
    throw ApiError.forbidden('只有合同买家可以执行最终验收');
  }
  if (contract.status === 'buyer acceptance') {
    return toContractDetailWith(db, contract); // 幂等
  }
  if (contract.status !== 'milestone submission') {
    throw ApiError.conflict(
      `当前状态 ${contract.status} 不可最终验收（仅 milestone submission / buyer acceptance）`,
    );
  }
  const approved = db
    .prepare(
      `SELECT COUNT(*) AS c FROM milestones
       WHERE contract_id = ? AND status = 'approved'`,
    )
    .get(contractId) as { c: number };
  if (approved.c === 0) {
    throw ApiError.conflict('请先批准（最终）里程碑再进入最终验收');
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE contracts SET status = 'buyer acceptance', accepted_at = ?, updated_at = ? WHERE id = ?`,
  ).run(now, now, contractId);
  return toContractDetailWith(db, getContractRow(db, contractId));
}

// ---------------------------------------------------------------------------
// 结算放款（POST /api/contracts/:id/payout，buyer / 系统）：buyer acceptance → payout
// ---------------------------------------------------------------------------

export interface PayoutResult {
  contract: ContractDetail;
  contractorBalanceAfterCr: Cr;
}

/**
 * 放款：escrow held → released；contractor 钱包入账 agreedAmountCr（payout credit）；
 * 与原 escrow_hold debit（同额同 ref）对账；commission → completed。
 * actorId 为 null 表示系统自动结算（A3）。
 */
export function payoutContract(db: Db, contractId: string, actorId: string | null): PayoutResult {
  const contract = getContractRow(db, contractId);
  if (actorId !== null && contract.buyer_id !== actorId) {
    throw ApiError.forbidden('只有合同买家可以结算');
  }
  if (contract.status !== 'buyer acceptance') {
    throw ApiError.conflict(`当前状态 ${contract.status} 不可结算（仅 buyer acceptance）`);
  }
  if (contract.escrow_status !== 'held') {
    throw ApiError.conflict(`当前托管状态 ${contract.escrow_status} 不可放款`);
  }
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const { balanceAfterCr } = recordLedger(db, contract.contractor_id, {
      type: 'payout',
      direction: 'credit',
      amountCr: contract.agreed_amount_cr,
      note: `接单《${contract.commission_title}》结算入账（验收通过）`,
      refType: 'contract',
      refId: contractId,
    });
    db.prepare(
      `UPDATE contracts SET status = 'payout', escrow_status = 'released', paid_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now, now, contractId);
    // 合同结算完成 → 需求板状态 completed（设计说明见 services/commissions.ts）
    db.prepare(`UPDATE commissions SET status = 'completed', updated_at = ? WHERE id = ?`).run(
      now,
      contract.commission_id,
    );
    return balanceAfterCr;
  });
  const contractorBalanceAfterCr = tx();
  return {
    contract: toContractDetailWith(db, getContractRow(db, contractId)),
    contractorBalanceAfterCr,
  };
}

// ---------------------------------------------------------------------------
// 合同列表 / 详情（买卖双方可见，同一 status 词）
// ---------------------------------------------------------------------------

export const CONTRACT_STATUSES: readonly ContractStatus[] = [
  'bid',
  'selected',
  'in progress',
  'milestone submission',
  'buyer acceptance',
  'payout',
];

export function listContracts(
  db: Db,
  userId: string,
  opts: { role?: unknown; status?: unknown; page?: number; pageSize?: number },
): Paginated<ContractItem> {
  autoSettleExpiredAcceptances(db); // A3 惰性检查
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.role !== undefined && opts.role !== '') {
    const role = String(opts.role);
    if (role !== 'buyer' && role !== 'contractor') {
      throw ApiError.badRequest('VALIDATION', 'role 只能是 buyer / contractor');
    }
    where.push(role === 'buyer' ? 'k.buyer_id = ?' : 'k.contractor_id = ?');
    params.push(userId);
  } else {
    where.push('(k.buyer_id = ? OR k.contractor_id = ?)');
    params.push(userId, userId);
  }
  if (opts.status !== undefined && opts.status !== '') {
    const status = String(opts.status);
    if (!CONTRACT_STATUSES.includes(status as ContractStatus)) {
      throw ApiError.badRequest(
        'VALIDATION',
        `status 只能是：${CONTRACT_STATUSES.join(' / ')}`,
      );
    }
    where.push('k.status = ?');
    params.push(status);
  }

  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM contracts k ${whereSql}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(`${CONTRACT_QUERY} ${whereSql} ORDER BY k.created_at DESC, k.rowid DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize) as ContractRow[];

  return { items: rows.map(toContractItem), page, pageSize, total };
}

export function getContract(db: Db, contractId: string, userId: string): ContractDetail {
  autoSettleExpiredAcceptances(db); // A3 惰性检查
  const contract = getContractRow(db, contractId);
  if (contract.buyer_id !== userId && contract.contractor_id !== userId) {
    throw ApiError.forbidden('只能查看与自己相关的合同');
  }
  return toContractDetailWith(db, contract);
}

export function getMilestone(db: Db, milestoneId: string, userId: string): ContractMilestoneItem {
  const milestone = getMilestoneRow(db, milestoneId);
  const contract = getContractRow(db, milestone.contract_id);
  if (contract.buyer_id !== userId && contract.contractor_id !== userId) {
    throw ApiError.forbidden('只能查看自己合同内的里程碑');
  }
  return toMilestoneItem(milestone);
}

/** 交付物文件服务用：校验可见性后返回存储目录信息（contractId + seq） */
export function getMilestoneDir(
  db: Db,
  milestoneId: string,
  userId: string,
): { contractId: string; seq: number } {
  const milestone = getMilestoneRow(db, milestoneId);
  const contract = getContractRow(db, milestone.contract_id);
  if (contract.buyer_id !== userId && contract.contractor_id !== userId) {
    throw ApiError.forbidden('只能查看自己合同内的里程碑');
  }
  return { contractId: contract.id, seq: milestone.seq };
}
