/**
 * 需求线服务（PR-B3-A）：发布需求 / 需求板 / 详情 / 更新 / 取消 / 投标 / 选中。
 * 状态词一律使用 docs/STATUS_VOCABULARY.md §3 规范字符串。
 *
 * ⚠️ 验收标准锁定（PRD 区域 4）：acceptance_criteria + criteria_hash 发布即锁定，
 * 任何 update 端点都拒绝修改（400 VALIDATION）；有 submitted/selected 投标后整体冻结（409 CONFLICT）。
 *
 * 设计说明（任务要求自行设计并注释）：
 * - commission.status 在选中投标后保持 `open`，「进行中」语义由 contract.status（合同六词）
 *   承担；合同结算（payout）时 commission → `completed`。这与 ARCHITECTURE §4.5 草案
 *   （选中→in progress）略有偏差，按任务指示以 contract 承担 in progress 语义。
 * - 一旦为需求创建了合同（select 成功），投标即关闭（409），避免同一需求产生多份合同。
 * - 「一人一单一标」按词汇表 §3 `rejected`（可对同一需求重新投标）实现：
 *   仅当存在 submitted/selected 投标时拒绝重复投标（rejected/withdrawn/cancelled 不阻止）。
 * - 需求取消时按词汇表 §3 把未决投标标记为 `cancelled`（需求取消）。
 */
import { randomUUID } from 'node:crypto';
import {
  type BidStatus,
  type CommissionBidItem,
  type CommissionDetail,
  type CommissionListItem,
  type CommissionStatus,
  type Cr,
  type MyBidItem,
  type Paginated,
} from '@vibe/shared';
import type { Db } from '../db';
import { ApiError } from '../lib/errors';
import { hashCriteria } from '../lib/criteria';
import { isPositiveInt } from '../lib/money';
import type { AuthUser } from '../middleware/auth';

// ---------------------------------------------------------------------------
// 常量（词汇表 §3）
// ---------------------------------------------------------------------------

export const COMMISSION_STATUSES: readonly CommissionStatus[] = [
  'open',
  'in progress',
  'completed',
  'cancelled',
];

/** 投标状态（词汇表 §3：submitted/selected/rejected/withdrawn/cancelled（需求取消）） */
export const BID_STATUSES: readonly BidStatus[] = [
  'submitted',
  'selected',
  'rejected',
  'withdrawn',
  'cancelled',
];

// ---------------------------------------------------------------------------
// 行类型与映射
// ---------------------------------------------------------------------------

interface CommissionRow {
  id: string;
  buyer_id: string;
  title: string;
  description: string;
  budget_min_cr: number;
  budget_max_cr: number;
  timeline_days: number;
  acceptance_criteria: string;
  criteria_hash: string;
  reference_project_ids: string;
  status: CommissionStatus;
  created_at: string;
  updated_at: string;
  buyer_display_name: string;
}

function getCommissionRow(db: Db, commissionId: string): CommissionRow {
  const row = db
    .prepare(
      `SELECT c.*, u.display_name AS buyer_display_name
       FROM commissions c JOIN users u ON u.id = c.buyer_id
       WHERE c.id = ?`,
    )
    .get(commissionId) as CommissionRow | undefined;
  if (!row) throw ApiError.notFound('需求不存在');
  return row;
}

interface BidRow {
  id: string;
  commission_id: string;
  contractor_id: string;
  amount_cr: number;
  proposal: string;
  status: BidStatus;
  created_at: string;
  contractor_display_name: string;
}

function getBidRow(db: Db, bidId: string): BidRow {
  const row = db
    .prepare(
      `SELECT b.*, u.display_name AS contractor_display_name
       FROM bids b JOIN users u ON u.id = b.contractor_id
       WHERE b.id = ?`,
    )
    .get(bidId) as BidRow | undefined;
  if (!row) throw ApiError.notFound('投标不存在');
  return row;
}

function toCommissionBidItem(row: BidRow): CommissionBidItem {
  return {
    id: row.id,
    contractor: { id: row.contractor_id, displayName: row.contractor_display_name },
    amountCr: row.amount_cr,
    proposal: row.proposal,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toCommissionListItem(row: CommissionRow, bidCount: number): CommissionListItem {
  return {
    id: row.id,
    title: row.title,
    budgetMinCr: row.budget_min_cr,
    budgetMaxCr: row.budget_max_cr,
    timelineDays: row.timeline_days,
    status: row.status,
    bidCount,
    buyer: { id: row.buyer_id, displayName: row.buyer_display_name },
    createdAt: row.created_at,
  };
}

/** 需求详情中的投标列表可见性：登录用户可见（不泄露联系方式），匿名返回空数组 */
function listDetailBids(db: Db, commissionId: string, user: AuthUser | null): CommissionBidItem[] {
  if (!user) return [];
  const rows = db
    .prepare(
      `SELECT b.*, u.display_name AS contractor_display_name
       FROM bids b JOIN users u ON u.id = b.contractor_id
       WHERE b.commission_id = ? AND b.status IN ('submitted','selected','rejected')
       ORDER BY b.created_at ASC, b.rowid ASC`,
    )
    .all(commissionId) as BidRow[];
  return rows.map(toCommissionBidItem);
}

function listReferenceProjects(db: Db, ids: string[]): { id: string; title: string }[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT id, title FROM projects WHERE id IN (${placeholders})`)
    .all(...ids) as { id: string; title: string }[];
  return rows;
}

/** 作者视角的最小 AuthUser（需求详情投标列表仅按登录态展示，不依赖角色） */
function viewerOf(userId: string): AuthUser {
  return { id: userId, email: '', displayName: '', roles: [], isAdmin: false };
}

// ---------------------------------------------------------------------------
// 校验辅助
// ---------------------------------------------------------------------------

function validateReferenceProjectIds(db: Db, value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw ApiError.badRequest('VALIDATION', 'referenceProjectIds 必须是作品 id 数组');
  }
  if (value.length > 10) {
    throw ApiError.badRequest('VALIDATION', '参考作品最多 10 个');
  }
  const ids = value.map((v) => String(v).trim()).filter((v) => v !== '');
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const found = db
    .prepare(`SELECT COUNT(*) AS c FROM projects WHERE id IN (${placeholders})`)
    .get(...ids) as { c: number };
  if (found.c !== ids.length) {
    throw ApiError.badRequest('VALIDATION', 'referenceProjectIds 中存在不存在的作品');
  }
  return ids;
}

// ---------------------------------------------------------------------------
// 发布（POST /api/commissions，buyer；验收标准发布即锁定）
// ---------------------------------------------------------------------------

export interface CommissionCreateInput {
  title?: unknown;
  description?: unknown;
  budgetMinCr?: unknown;
  budgetMaxCr?: unknown;
  timelineDays?: unknown;
  acceptanceCriteria?: unknown;
  referenceProjectIds?: unknown;
}

export function createCommission(db: Db, buyerId: string, input: CommissionCreateInput): CommissionDetail {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title === '') throw ApiError.badRequest('VALIDATION', '标题不能为空');
  if (title.length > 120) throw ApiError.badRequest('VALIDATION', '标题最长 120 字');

  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description === '') throw ApiError.badRequest('VALIDATION', '描述不能为空');

  if (!isPositiveInt(input.budgetMinCr)) {
    throw ApiError.badRequest('VALIDATION', 'budgetMinCr 必须是正整数（CR）');
  }
  if (!isPositiveInt(input.budgetMaxCr)) {
    throw ApiError.badRequest('VALIDATION', 'budgetMaxCr 必须是正整数（CR）');
  }
  if (input.budgetMinCr >= input.budgetMaxCr) {
    throw ApiError.badRequest('VALIDATION', '预算区间不合法：budgetMinCr 必须小于 budgetMaxCr');
  }
  if (!isPositiveInt(input.timelineDays)) {
    throw ApiError.badRequest('VALIDATION', 'timelineDays 必须是 ≥1 的整数（天）');
  }

  const acceptanceCriteria =
    typeof input.acceptanceCriteria === 'string' ? input.acceptanceCriteria.trim() : '';
  if (acceptanceCriteria === '') {
    throw ApiError.badRequest('VALIDATION', '验收标准不能为空（发布后锁定，不可修改）');
  }
  if (acceptanceCriteria.length > 5000) {
    throw ApiError.badRequest('VALIDATION', '验收标准最长 5000 字');
  }

  const referenceProjectIds = validateReferenceProjectIds(db, input.referenceProjectIds);

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO commissions (id, buyer_id, title, description, budget_min_cr, budget_max_cr, timeline_days, acceptance_criteria, criteria_hash, reference_project_ids, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
  ).run(
    id,
    buyerId,
    title,
    description,
    input.budgetMinCr,
    input.budgetMaxCr,
    input.timelineDays,
    acceptanceCriteria,
    hashCriteria(acceptanceCriteria),
    JSON.stringify(referenceProjectIds),
    now,
    now,
  );
  return getCommissionDetail(db, id, viewerOf(buyerId));
}

// ---------------------------------------------------------------------------
// 需求板（GET /api/commissions，公开）
// ---------------------------------------------------------------------------

export type CommissionSort = 'newest' | 'budget_asc';

const SORTS: readonly CommissionSort[] = ['newest', 'budget_asc'];

export function listCommissions(
  db: Db,
  opts: {
    status?: unknown;
    budgetMaxLte?: unknown;
    q?: unknown;
    sort?: unknown;
    page?: number;
    pageSize?: number;
  },
): Paginated<CommissionListItem> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.status !== undefined && opts.status !== '') {
    const status = String(opts.status);
    if (!COMMISSION_STATUSES.includes(status as CommissionStatus)) {
      throw ApiError.badRequest('VALIDATION', `status 只能是：${COMMISSION_STATUSES.join(' / ')}`);
    }
    where.push('c.status = ?');
    params.push(status);
  }
  if (opts.budgetMaxLte !== undefined && opts.budgetMaxLte !== '') {
    const budgetMaxLte = Number(opts.budgetMaxLte);
    if (!Number.isInteger(budgetMaxLte) || budgetMaxLte < 0) {
      throw ApiError.badRequest('VALIDATION', 'budgetMaxLte 必须是非负整数（CR）');
    }
    where.push('c.budget_max_cr <= ?');
    params.push(budgetMaxLte);
  }
  if (opts.q !== undefined && String(opts.q).trim() !== '') {
    const q = String(opts.q).trim().replace(/[%_\\]/g, (ch) => `\\${ch}`);
    where.push("(c.title LIKE ? ESCAPE '\\' OR c.description LIKE ? ESCAPE '\\')");
    params.push(`%${q}%`, `%${q}%`);
  }

  const sort = opts.sort === undefined || opts.sort === '' ? 'newest' : String(opts.sort);
  if (!SORTS.includes(sort as CommissionSort)) {
    throw ApiError.badRequest('VALIDATION', `sort 只能是：${SORTS.join(' / ')}`);
  }
  const orderBy: Record<CommissionSort, string> = {
    newest: 'c.created_at DESC, c.rowid DESC',
    budget_asc: 'c.budget_min_cr ASC, c.created_at DESC',
  };

  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM commissions c ${whereSql}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT c.*, u.display_name AS buyer_display_name,
              (SELECT COUNT(*) FROM bids b
               WHERE b.commission_id = c.id AND b.status IN ('submitted','selected')) AS bid_count
       FROM commissions c JOIN users u ON u.id = c.buyer_id
       ${whereSql} ORDER BY ${orderBy[sort as CommissionSort]} LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as (CommissionRow & { bid_count: number })[];

  return {
    items: rows.map((r) => toCommissionListItem(r, r.bid_count)),
    page,
    pageSize,
    total,
  };
}

// ---------------------------------------------------------------------------
// 详情（GET /api/commissions/:id，公开；bids 仅登录用户可见）
// ---------------------------------------------------------------------------

export function getCommissionDetail(db: Db, commissionId: string, user: AuthUser | null): CommissionDetail {
  const row = getCommissionRow(db, commissionId);
  const referenceIds = JSON.parse(row.reference_project_ids) as string[];
  const bidCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM bids
         WHERE commission_id = ? AND status IN ('submitted','selected')`,
      )
      .get(commissionId) as { c: number }
  ).c;
  return {
    ...toCommissionListItem(row, bidCount),
    description: row.description,
    acceptanceCriteria: row.acceptance_criteria,
    criteriaHash: row.criteria_hash,
    referenceProjects: listReferenceProjects(db, referenceIds),
    bids: listDetailBids(db, commissionId, user),
  };
}

// ---------------------------------------------------------------------------
// 更新（PUT /api/commissions/:id，作者；验收标准不可改；有投标整体冻结）
// ---------------------------------------------------------------------------

export function updateCommission(
  db: Db,
  commissionId: string,
  authorId: string,
  body: Record<string, unknown>,
): CommissionDetail {
  const commission = getCommissionRow(db, commissionId);
  if (commission.buyer_id !== authorId) {
    throw ApiError.forbidden('只有需求发布者可以编辑需求');
  }
  // 验收标准锁定：任何情况（含冻结前）都拒绝修改 acceptance_criteria / criteria_hash
  if (
    Object.prototype.hasOwnProperty.call(body, 'acceptanceCriteria') ||
    Object.prototype.hasOwnProperty.call(body, 'criteriaHash')
  ) {
    throw ApiError.badRequest('VALIDATION', '验收标准在发布时锁定，不可修改');
  }
  // 有 submitted/selected 投标 → 整体冻结（PRD 4：一旦有人接单，不可单方面修改）
  const active = db
    .prepare(
      `SELECT COUNT(*) AS c FROM bids
       WHERE commission_id = ? AND status IN ('submitted','selected')`,
    )
    .get(commissionId) as { c: number };
  if (active.c > 0) {
    throw ApiError.conflict('该需求已有投标，字段已整体冻结，不可修改');
  }

  const description =
    body.description === undefined ? undefined : String(body.description).trim();
  if (description !== undefined && description === '') {
    throw ApiError.badRequest('VALIDATION', '描述不能为空');
  }

  let budgetMinCr: number | undefined;
  let budgetMaxCr: number | undefined;
  if (body.budgetMinCr !== undefined || body.budgetMaxCr !== undefined) {
    const min = body.budgetMinCr === undefined ? commission.budget_min_cr : Number(body.budgetMinCr);
    const max = body.budgetMaxCr === undefined ? commission.budget_max_cr : Number(body.budgetMaxCr);
    if (!isPositiveInt(min) || !isPositiveInt(max)) {
      throw ApiError.badRequest('VALIDATION', '预算必须是正整数（CR）');
    }
    if (min >= max) {
      throw ApiError.badRequest('VALIDATION', '预算区间不合法：budgetMinCr 必须小于 budgetMaxCr');
    }
    budgetMinCr = min;
    budgetMaxCr = max;
  }

  let timelineDays: number | undefined;
  if (body.timelineDays !== undefined) {
    timelineDays = Number(body.timelineDays);
    if (!isPositiveInt(timelineDays)) {
      throw ApiError.badRequest('VALIDATION', 'timelineDays 必须是 ≥1 的整数（天）');
    }
  }

  let referenceProjectIds: string[] | undefined;
  if (body.referenceProjectIds !== undefined) {
    referenceProjectIds = validateReferenceProjectIds(db, body.referenceProjectIds);
  }

  db.prepare(
    `UPDATE commissions
     SET description = COALESCE(?, description),
         budget_min_cr = COALESCE(?, budget_min_cr),
         budget_max_cr = COALESCE(?, budget_max_cr),
         timeline_days = COALESCE(?, timeline_days),
         reference_project_ids = COALESCE(?, reference_project_ids),
         updated_at = ?
     WHERE id = ?`,
  ).run(
    description ?? null,
    budgetMinCr ?? null,
    budgetMaxCr ?? null,
    timelineDays ?? null,
    referenceProjectIds === undefined ? null : JSON.stringify(referenceProjectIds),
    new Date().toISOString(),
    commissionId,
  );
  return getCommissionDetail(db, commissionId, viewerOf(authorId));
}

// ---------------------------------------------------------------------------
// 取消（POST /api/commissions/:id/cancel，作者；仅 open；有合同拒绝）
// ---------------------------------------------------------------------------

export function cancelCommission(db: Db, commissionId: string, authorId: string) {
  const commission = getCommissionRow(db, commissionId);
  if (commission.buyer_id !== authorId) {
    throw ApiError.forbidden('只有需求发布者可以取消需求');
  }
  if (commission.status !== 'open') {
    throw ApiError.conflict(`当前状态 ${commission.status} 不可取消（仅 open）`);
  }
  const contract = db
    .prepare('SELECT COUNT(*) AS c FROM contracts WHERE commission_id = ?')
    .get(commissionId) as { c: number };
  if (contract.c > 0) {
    throw ApiError.conflict('该需求已有进行中的合同，不可取消');
  }
  db.transaction(() => {
    // 词汇表 §3：需求取消 → 未决投标标记 cancelled
    db.prepare(
      `UPDATE bids SET status = 'cancelled' WHERE commission_id = ? AND status = 'submitted'`,
    ).run(commissionId);
    db.prepare(`UPDATE commissions SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      commissionId,
    );
  })();
  return getCommissionDetail(db, commissionId, viewerOf(authorId));
}

// ---------------------------------------------------------------------------
// 投标（POST /api/commissions/:id/bids，contractor；一人一单一标）
// ---------------------------------------------------------------------------

export interface BidCreateInput {
  amountCr?: unknown;
  proposal?: unknown;
}

export function createBid(db: Db, commissionId: string, contractorId: string, input: BidCreateInput) {
  const commission = getCommissionRow(db, commissionId);
  if (commission.status !== 'open') {
    throw ApiError.conflict(`当前状态 ${commission.status} 不可投标（仅 open）`);
  }
  if (commission.buyer_id === contractorId) {
    throw ApiError.badRequest('VALIDATION', '不能投标自己发布的需求');
  }
  // 已有合同（含 selected）→ 投标关闭，避免同一需求产生多份合同（设计说明见文件头）
  const contract = db
    .prepare('SELECT COUNT(*) AS c FROM contracts WHERE commission_id = ?')
    .get(commissionId) as { c: number };
  if (contract.c > 0) {
    throw ApiError.conflict('该需求已进入接单流程（已有合同），不再接受投标');
  }

  const amountCr = input.amountCr;
  if (!isPositiveInt(amountCr)) {
    throw ApiError.badRequest('VALIDATION', 'amountCr 必须是正整数（CR）');
  }
  if (amountCr < commission.budget_min_cr || amountCr > commission.budget_max_cr) {
    throw ApiError.badRequest(
      'VALIDATION',
      `报价必须在预算区间（${commission.budget_min_cr}–${commission.budget_max_cr} CR）内`,
    );
  }
  const proposal = typeof input.proposal === 'string' ? input.proposal.trim() : '';
  if (proposal.length > 1000) {
    throw ApiError.badRequest('VALIDATION', 'proposal 最长 1000 字');
  }

  // 一人一单一标：存在 submitted/selected 投标即拒绝（rejected/withdrawn/cancelled 不阻止，
  // 词汇表 §3：rejected 可对同一需求重新投标）
  const existing = db
    .prepare(
      `SELECT COUNT(*) AS c FROM bids
       WHERE commission_id = ? AND contractor_id = ? AND status IN ('submitted','selected')`,
    )
    .get(commissionId, contractorId) as { c: number };
  if (existing.c > 0) {
    throw ApiError.conflict('你已对该需求投过标（一人一单一标）');
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO bids (id, commission_id, contractor_id, amount_cr, proposal, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'submitted', ?)`,
  ).run(id, commissionId, contractorId, amountCr, proposal, now);
  return { id, commissionId, amountCr, proposal, status: 'submitted' as BidStatus, createdAt: now };
}

// ---------------------------------------------------------------------------
// 我的投标（GET /api/bids/mine，contractor）
// ---------------------------------------------------------------------------

export function listMyBids(
  db: Db,
  contractorId: string,
  opts: { status?: unknown; page?: number; pageSize?: number },
): Paginated<MyBidItem> {
  const where: string[] = ['b.contractor_id = ?'];
  const params: unknown[] = [contractorId];

  if (opts.status !== undefined && opts.status !== '') {
    const status = String(opts.status);
    if (!BID_STATUSES.includes(status as BidStatus)) {
      throw ApiError.badRequest('VALIDATION', `status 只能是：${BID_STATUSES.join(' / ')}`);
    }
    where.push('b.status = ?');
    params.push(status);
  }

  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
  const whereSql = where.join(' AND ');

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM bids b WHERE ${whereSql}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT b.id, b.commission_id, b.amount_cr, b.proposal, b.status, b.created_at,
              c.title AS commission_title, c.status AS commission_status
       FROM bids b JOIN commissions c ON c.id = b.commission_id
       WHERE ${whereSql} ORDER BY b.created_at DESC, b.rowid DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as {
    id: string;
    commission_id: string;
    amount_cr: number;
    proposal: string;
    status: BidStatus;
    created_at: string;
    commission_title: string;
    commission_status: CommissionStatus;
  }[];

  return {
    items: rows.map((r) => ({
      id: r.id,
      commission: { id: r.commission_id, title: r.commission_title, status: r.commission_status },
      amountCr: r.amount_cr,
      proposal: r.proposal,
      status: r.status,
      createdAt: r.created_at,
    })),
    page,
    pageSize,
    total,
  };
}

// ---------------------------------------------------------------------------
// 选中（POST /api/commissions/:id/select，buyer）：submitted→selected，
// 其余 submitted→rejected，创建 contract（selected / escrow none）
// ---------------------------------------------------------------------------

export interface SelectResult {
  contract: {
    id: string;
    commissionId: string;
    buyerId: string;
    contractorId: string;
    bidId: string;
    agreedAmountCr: Cr;
    status: 'selected';
    escrowStatus: 'none';
  };
}

export function selectBid(db: Db, commissionId: string, buyerId: string, bidId: unknown): SelectResult {
  const commission = getCommissionRow(db, commissionId);
  if (commission.buyer_id !== buyerId) {
    throw ApiError.forbidden('只有需求发布者可以选中投标');
  }
  if (commission.status !== 'open') {
    throw ApiError.conflict(`当前状态 ${commission.status} 不可选中投标（仅 open）`);
  }
  const contract = db
    .prepare('SELECT COUNT(*) AS c FROM contracts WHERE commission_id = ?')
    .get(commissionId) as { c: number };
  if (contract.c > 0) {
    throw ApiError.conflict('该需求已有合同，不能重复选中');
  }
  if (typeof bidId !== 'string' || bidId.trim() === '') {
    throw ApiError.badRequest('VALIDATION', 'bidId 不能为空');
  }
  const bid = getBidRow(db, bidId);
  if (bid.commission_id !== commissionId) {
    throw ApiError.badRequest('VALIDATION', '投标不属于该需求');
  }
  if (bid.status !== 'submitted') {
    throw ApiError.conflict(`该投标当前状态 ${bid.status} 不可选中（仅 submitted）`);
  }

  const contractId = randomUUID();
  const now = new Date().toISOString();
  db.transaction(() => {
    // 选中投标 → selected；其余 submitted 投标 → rejected
    db.prepare(`UPDATE bids SET status = 'selected' WHERE id = ?`).run(bidId);
    db.prepare(
      `UPDATE bids SET status = 'rejected'
       WHERE commission_id = ? AND status = 'submitted'`,
    ).run(commissionId);
    // 创建合同（合同级六词 `selected`；escrow none；commission 保持 open，见文件头设计说明）
    db.prepare(
      `INSERT INTO contracts (id, commission_id, buyer_id, contractor_id, bid_id, agreed_amount_cr, status, escrow_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'selected', 'none', ?, ?)`,
    ).run(
      contractId,
      commissionId,
      commission.buyer_id,
      bid.contractor_id,
      bidId,
      bid.amount_cr,
      now,
      now,
    );
  })();

  return {
    contract: {
      id: contractId,
      commissionId,
      buyerId: commission.buyer_id,
      contractorId: bid.contractor_id,
      bidId,
      agreedAmountCr: bid.amount_cr,
      status: 'selected',
      escrowStatus: 'none',
    },
  };
}
