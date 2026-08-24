/**
 * 作品交易线（区域 1/3）前端类型 —— 对应 docs/API.md §2/§4 契约。
 *
 * 命名约定（DECISIONS.md D2 + @vibe/shared）：金额一律整数、字段命名 `*Cr`，
 * 与后端 `*Cr` 字段对齐（API.md 草案中的 `*Cents` 以 shared `*Cr` 为准）。
 * 状态词与 shared / STATUS_VOCABULARY.md 一致（一字不差）。
 *
 * ⚠️ 后端 Phase 2（projects/orders/library 端点）实现中：字段形状按 API.md 契约
 * 定义，联调在最后阶段进行；如后端字段有出入，以 shared 类型为准修正本文件。
 */
import type {
  Cr,
  EscrowStatus,
  OrderStatus,
  Paginated,
  ProjectCategory,
  ProjectReviewStatus,
  SafeUser,
} from '@vibe/shared';

/** 卖家公开信息（email 供「联系卖家」mailto 使用；API.md 草案 seller {...} 的扩展） */
export interface SellerPublic {
  id: string;
  displayName: string;
  /** 演示简化：详情接口返回卖家邮箱用于 mailto；Phase 3 可升级站内消息 */
  email?: string;
}

/** 作品列表项（API.md §2 GET /api/projects） */
export interface ProjectSummary {
  id: string;
  title: string;
  category: ProjectCategory;
  priceCr: Cr;
  coverUrl: string | null;
  seller: SellerPublic;
  avgRating: number | null;
  ratingCount: number;
  status: ProjectReviewStatus;
}

/** 评论（API.md §2 GET /api/projects/:id 内嵌） */
export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  user: Pick<SafeUser, 'id' | 'displayName'>;
  createdAt: string;
}

/** 作品详情（API.md §2） */
export interface ProjectDetail extends ProjectSummary {
  description: string;
  /** 试用范围（人话，如「前 3 关可玩」）；为空则未声明范围 */
  trialScope: string | null;
  /** 试玩 iframe 地址（免登录免付款，ARCHITECTURE §3.3） */
  playUrl: string | null;
  reviews: Review[];
  /** 当前登录用户是否已购买（未登录为 false） */
  isPurchased: boolean;
  /** 当前登录用户是否可下载（已购 / 作者） */
  canDownload: boolean;
}

/** 分类列表（API.md §2 GET /api/categories） */
export interface CategoriesResponse {
  items: ProjectCategory[];
}

/** 下单前报价（API.md §4 GET /api/orders/:id/quote 或 GET /api/projects/:id/quote） */
export interface Quote {
  projectId: string;
  priceCr: Cr;
  feeCr: Cr;
  totalCr: Cr;
}

/** 下单响应（API.md §4 POST /api/orders） */
export interface Order {
  id: string;
  orderNo: string;
  priceCr: Cr;
  feeCr: Cr;
  totalCr: Cr;
  status: OrderStatus;
  escrowStatus: EscrowStatus;
  createdAt: string;
  paidAt: string | null;
}

/** 支付响应（API.md §4 POST /api/orders/:id/pay） */
export interface PayResult {
  order: Order;
  balanceAfterCr: Cr;
}

/** 举报响应（PR-B2-A：POST /api/projects/:id/report → 201 { report: {...} }） */
export interface Report {
  id: string;
  projectId: string;
  reporterId: string;
  reason: string;
  createdAt: string;
}

export interface ReportResult {
  report: Report;
}

/** 列表查询参数（GET /api/projects） */
export interface ProjectListQuery {
  category?: ProjectCategory | '';
  q?: string;
  minRating?: number;
  sort?: 'rating' | 'newest' | 'price_asc' | 'price_desc';
  page?: number;
  pageSize?: number;
}

/** 分页响应（API.md 约定；与 shared Paginated 同形） */
export type ProjectListResponse = Paginated<ProjectSummary>;
