/**
 * @vibe/shared —— 前后端共享类型与常量。
 *
 * ⚠️ 状态词汇表的唯一权威来源是 docs/STATUS_VOCABULARY.md（PM 产出）。
 * 此处为 Tech Lead 依据 PRD 第 5 节整理的草案；冲突以词汇表为准，由 Orchestrator 协调。
 */

// ---------------------------------------------------------------------------
// 健康检查（脚手架首页调用后端 /api/health 展示状态）
// ---------------------------------------------------------------------------

export interface HealthResponse {
  ok: true;
  service: string;
  version: string;
}

export const HEALTH_SERVICE = 'vibe-api';
export const HEALTH_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// 角色
// ---------------------------------------------------------------------------

/** 三种角色可兼任（roles 为数组） */
export type Role = 'buyer' | 'seller' | 'contractor';

export const ROLES: readonly Role[] = ['buyer', 'seller', 'contractor'];

// ---------------------------------------------------------------------------
// 状态词（草案 —— 见文件头注释）
// ---------------------------------------------------------------------------

/** 接单交付合同级状态（PRD 第 5 节规范六词，不得改名） */
export type ContractStatus =
  | 'bid'
  | 'selected'
  | 'in progress'
  | 'milestone submission'
  | 'buyer acceptance'
  | 'payout';

/** 里程碑子状态 */
export type MilestoneStatus = 'submitted' | 'approved' | 'revision requested';

/** 作品交易订单状态 */
export type OrderStatus = 'pending' | 'paid' | 'completed' | 'cancelled' | 'refunded';

/** 托管状态（订单与合同共用） */
export type EscrowStatus = 'none' | 'held' | 'released' | 'refunded';

/** 作品审核状态 */
export type ProjectReviewStatus =
  | 'draft'
  | 'submitted'
  | 'under review'
  | 'approved'
  | 'rejected'
  | 'delisted';

/** 需求板状态 */
export type CommissionStatus = 'open' | 'in progress' | 'completed' | 'cancelled';

/** 投标状态 */
export type BidStatus = 'submitted' | 'selected' | 'rejected' | 'withdrawn';

/** 提现状态 */
export type WithdrawalStatus = 'pending' | 'paid' | 'rejected';

/** 收支台账记录状态 */
export type TransactionStatus = 'pending' | 'completed' | 'failed';

// ---------------------------------------------------------------------------
// 作品分类
// ---------------------------------------------------------------------------

export const PROJECT_CATEGORIES = ['game', 'tool', 'art', 'animation', 'webapp', 'other'] as const;

export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
