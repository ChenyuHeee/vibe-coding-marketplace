/**
 * @vibe/shared —— 前后端共享类型与常量。
 *
 * ⚠️ 业务状态词汇表的**唯一权威来源**是 docs/STATUS_VOCABULARY.md（PM 产出）。
 * 本文件的状态词必须与其一字不差（大小写、空格均敏感）。
 * 金额约定（DECISIONS.md D2）：平台币 Credits（CR），一律**整数**，字段命名 `*Cr`。
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
// 货币与金额（DECISIONS.md D2）
// ---------------------------------------------------------------------------

/** 平台币 Credits —— 金额一律为整数（1 单位最小粒度），字段命名 `*Cr` */
export type Cr = number;

/** 平台币展示符号 */
export const CURRENCY = 'CR' as const;

// ---------------------------------------------------------------------------
// 角色（DECISIONS.md D4：一个账号可并存多种角色，roles 为数组）
// ---------------------------------------------------------------------------

export type Role = 'buyer' | 'seller' | 'contractor';

export const ROLES: readonly Role[] = ['buyer', 'seller', 'contractor'];

// ---------------------------------------------------------------------------
// 业务状态词（docs/STATUS_VOCABULARY.md —— 唯一来源，一字不差）
// ---------------------------------------------------------------------------

/** 订单与支付流（词汇表 §2） */
export type OrderStatus =
  | 'pending payment'
  | 'paid'
  | 'delivered'
  | 'completed'
  | 'refund requested'
  | 'refunded'
  | 'cancelled'
  | 'disputed';

/** 托管状态（订单与合同共用，词汇表 §2/§3） */
export type EscrowStatus = 'none' | 'held' | 'released' | 'refunded';

/** 作品审核流（词汇表 §1） */
export type ProjectReviewStatus =
  | 'draft'
  | 'submitted'
  | 'under review'
  | 'approved'
  | 'rejected'
  | 'delisted';

/** 接单交付合同级状态（PRD 第 5 节规范六词 + 词汇表 §3，不得改名） */
export type ContractStatus =
  | 'bid'
  | 'selected'
  | 'in progress'
  | 'milestone submission'
  | 'buyer acceptance'
  | 'payout';

/** 需求板状态（词汇表 §3） */
export type CommissionStatus = 'open' | 'in progress' | 'completed' | 'cancelled';

/** 投标状态（词汇表 §3） */
export type BidStatus = 'submitted' | 'selected' | 'rejected' | 'withdrawn';

/** 钱包与托管流 · 提现状态（词汇表 §4） */
export type WithdrawalStatus = 'withdrawal pending' | 'withdrawal completed' | 'withdrawal failed';

/** 收支台账记录状态（词汇表 §4 / ARCHITECTURE §6） */
export type TransactionStatus = 'pending' | 'completed' | 'failed';

/** 里程碑子状态（ARCHITECTURE §6） */
export type MilestoneStatus = 'submitted' | 'approved' | 'revision requested';

// ---------------------------------------------------------------------------
// 业务常量（DECISIONS.md A1–A5 / ARCHITECTURE §5，集中配置）
// ---------------------------------------------------------------------------

/** A1：大额充值二次确认阈值（单次充值 ≥ 100 CR 必须 confirm: true） */
export const TOPUP_CONFIRM_THRESHOLD_CR: Cr = 100;

/** A5：平台手续费费率（5%，集中配置） */
export const FEE_RATE = 0.05;

/** A2：作品订单退款窗口（天） */
export const REFUND_WINDOW_DAYS = 14;

/** A3：接单类验收期，到期自动确认（天） */
export const ACCEPTANCE_AUTO_CONFIRM_DAYS = 7;

/** A4：提现到账时间范围（1–3 个工作日） */
export const WITHDRAWAL_ETA_MIN_DAYS = 1;
export const WITHDRAWAL_ETA_MAX_DAYS = 3;

// ---------------------------------------------------------------------------
// 作品分类（ARCHITECTURE §3.2）
// ---------------------------------------------------------------------------

export const PROJECT_CATEGORIES = ['game', 'tool', 'art', 'animation', 'webapp', 'other'] as const;

export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// 台账类型（ARCHITECTURE §3.5 transactions.type）
// ---------------------------------------------------------------------------

export type TransactionType =
  | 'topup'
  | 'withdrawal'
  | 'order_payment'
  | 'escrow_hold'
  | 'escrow_release'
  | 'payout'
  | 'refund'
  | 'fee';

export const TRANSACTION_TYPES: readonly TransactionType[] = [
  'topup',
  'withdrawal',
  'order_payment',
  'escrow_hold',
  'escrow_release',
  'payout',
  'refund',
  'fee',
];

export type TransactionDirection = 'credit' | 'debit';

// ---------------------------------------------------------------------------
// API DTO（前后端共享的接口形状）
// ---------------------------------------------------------------------------

/** 用户公开信息（脱敏） */
export interface SafeUser {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  avatarUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  isAdmin: boolean;
}

/** 认证响应（register / login） */
export interface AuthResponse {
  user: SafeUser;
  token: string;
}

/** 钱包总览（API.md §7 GET /api/wallet，字段按 D2 用 *Cr） */
export interface WalletSummary {
  balanceCr: Cr;
  /** 托管中的钱（涉及我的 escrow held 合计 —— 一眼可见「钱在谁手里」） */
  escrowHeldCr: Cr;
  currency: typeof CURRENCY;
  /** 提现处理中的金额（已从余额划出，在银行通道） */
  pendingWithdrawalCr: Cr;
}

/** 台账条目 */
export interface TransactionItem {
  id: string;
  type: TransactionType;
  direction: TransactionDirection;
  amountCr: Cr;
  balanceAfterCr: Cr;
  refType: string | null;
  refId: string | null;
  status: TransactionStatus;
  note: string | null;
  createdAt: string;
}

/** 提现条目 */
export interface WithdrawalItem {
  id: string;
  amountCr: Cr;
  status: WithdrawalStatus;
  etaDays: number;
  bankName: string;
  cardLast4: string;
  holderName: string;
  createdAt: string;
}

/** 托管总览条目（API.md §7 GET /api/wallet/escrow） */
export interface EscrowItem {
  refType: 'order' | 'contract';
  refId: string;
  /** in = 我的钱进入托管（买家视角）；out = 托管中的钱将放给我（卖家/接单者视角） */
  direction: 'in' | 'out';
  amountCr: Cr;
  escrowStatus: EscrowStatus;
  /** 人话：`我(买家)` / `我(卖家/接单者)` */
  party: string;
  /** 何时到我的账户（人话） */
  eta: string;
}

/** 统一分页响应（API.md 约定） */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

// ---------------------------------------------------------------------------
// 作品线 DTO（API.md §2/§3/§4，字段按 D2 用 *Cr）
// ---------------------------------------------------------------------------

/** 作品详情/列表中卖家公开信息 */
export interface ProjectSeller {
  id: string;
  displayName: string;
  ratingAvg: number;
}

/** 市场列表条目（GET /api/projects；只列 approved） */
export interface ProjectListItem {
  id: string;
  title: string;
  category: ProjectCategory;
  priceCr: Cr;
  coverUrl: string | null;
  trialScope: string;
  playUrl: string;
  seller: ProjectSeller;
  avgRating: number;
  ratingCount: number;
  status: ProjectReviewStatus;
  publishedAt: string | null;
  createdAt: string;
}

/** 评价条目 */
export interface ReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  user: { id: string; displayName: string };
  createdAt: string;
}

/** 作品详情（GET /api/projects/:id） */
export interface ProjectDetail extends ProjectListItem {
  description: string;
  reviews: ReviewItem[];
  isPurchased: boolean;
  canDownload: boolean;
  reviewNote: string | null;
}

/** 审核进度（GET /api/projects/:id/review） */
export interface ReviewEventItem {
  event: string;
  note: string | null;
  createdAt: string;
}

export interface ProjectReviewProgress {
  status: ProjectReviewStatus;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  delistedAt: string | null;
  history: ReviewEventItem[];
}

/** 订单条目（GET /api/orders） */
export interface OrderItem {
  id: string;
  orderNo: string;
  project: {
    id: string;
    title: string;
    coverUrl: string | null;
    playUrl: string;
    status: ProjectReviewStatus;
  };
  priceCr: Cr;
  feeCr: Cr;
  totalCr: Cr;
  status: OrderStatus;
  escrowStatus: EscrowStatus;
  createdAt: string;
  paidAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  refundedAt: string | null;
  cancelledAt: string | null;
}

/** 下单前总价预览（GET /api/projects/:id/quote 与 GET /api/orders/:id/quote） */
export interface OrderQuote {
  orderId: string | null;
  projectId: string;
  projectTitle: string;
  priceCr: Cr;
  feeCr: Cr;
  totalCr: Cr;
}

/** My Library 条目（GET /api/library；含已下架已购） */
export interface LibraryItem {
  project: {
    id: string;
    title: string;
    coverUrl: string | null;
    playUrl: string;
    priceCr: Cr;
    status: ProjectReviewStatus;
  };
  orderId: string;
  orderStatus: OrderStatus;
  purchasedAt: string;
}

/** 举报条目（POST /api/projects/:id/report） */
export interface ReportItem {
  id: string;
  projectId: string;
  reporterId: string;
  reason: string;
  createdAt: string;
}

/** 管理端审核队列条目（GET /api/admin/projects） */
export interface AdminProjectItem {
  id: string;
  title: string;
  category: ProjectCategory;
  priceCr: Cr;
  status: ProjectReviewStatus;
  seller: ProjectSeller;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}
