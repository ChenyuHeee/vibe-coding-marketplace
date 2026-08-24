/**
 * 作品交易线 API（docs/API.md §2/§4）—— 挂在统一 client 之上。
 *
 * 端点状态（联调注记）：
 * - projects / orders / library / report 端点后端 Phase 2 实现中；
 *   前端按 API.md 契约先行开发，联调在最后阶段进行；
 * - wallet 端点已合并（feat(api): 钱包与托管 #20），本模块不含钱包函数
 *   （见 api/wallet.ts）。
 */
import { api } from './client';
import type { Cr } from '@vibe/shared';
import type {
  CategoriesResponse,
  Order,
  OrderItem,
  PayResult,
  ProjectDetail,
  ProjectListQuery,
  ProjectListResponse,
  ProjectSummary,
  Quote,
  ReportResult,
} from '../types/marketplace';

export interface ReportInput {
  reason: string;
}

/** 列表页查询串（跳掉空值，后端忽略未传参数） */
function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const projectApi = {
  /** GET /api/projects —— 公开列表（分类/搜索/排序/分页） */
  list: (query: ProjectListQuery = {}) =>
    api.get<ProjectListResponse>(
      `/projects${toQuery({
        category: query.category ?? '',
        q: query.q ?? '',
        minRating: query.minRating,
        sort: query.sort ?? '',
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 12,
      })}`,
      { auth: false },
    ),

  /** GET /api/projects/:id —— 公开详情（已购字段随登录态返回） */
  detail: (id: string) => api.get<ProjectDetail>(`/projects/${id}`, { auth: false }),

  /** GET /api/categories —— 公开分类列表 */
  categories: () => api.get<CategoriesResponse>('/categories', { auth: false }),
};

export const orderApi = {
  /**
   * 下单前报价：优先 GET /api/projects/:id/quote（API.md §4）。
   * 若后端尚未实现该端点（404）或网络不可达，回退到前端按共享常量
   * FEE_RATE（5%）预览计算（fallbackPriceCr 为作品价，见 api/quote.ts）。
   */
  quote: async (projectId: string, fallbackPriceCr: Cr): Promise<Quote> => {
    try {
      return await api.get<Quote>(`/projects/${projectId}/quote`);
    } catch (err) {
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
        // 端点未实现 → 前端预览（FEE_RATE 常量，DECISIONS.md A5）
        const { computeQuote } = await import('./quote');
        return computeQuote(projectId, fallbackPriceCr);
      }
      throw err;
    }
  },

  /** POST /api/orders —— 下单（响应含含手续费总价） */
  create: (projectId: string) => api.post<{ order: Order }>('/orders', { projectId }),

  /** POST /api/orders/:id/pay —— 模拟支付（扣余额 → 托管） */
  pay: (orderId: string) => api.post<PayResult>(`/orders/${orderId}/pay`),

  /** GET /api/orders?role=buyer —— 我的订单（含未完成订单，供 Library「我的订单」区） */
  list: (opts?: { status?: string; page?: number; pageSize?: number }) => {
    const params = new URLSearchParams({ role: 'buyer' });
    if (opts?.status) params.set('status', opts.status);
    if (opts?.page) params.set('page', String(opts.page));
    if (opts?.pageSize) params.set('pageSize', String(opts.pageSize));
    return api.get<{ items: OrderItem[]; page: number; pageSize: number; total: number }>(
      `/orders?${params.toString()}`,
    );
  },

  /** POST /api/orders/:id/cancel —— 取消未付款订单（一步完成，不追问原因，PRD §4） */
  cancel: (orderId: string) => api.post<{ order: Order }>(`/orders/${orderId}/cancel`),

  /** POST /api/orders/:id/confirm —— 确认收货（放款给卖家，escrow released） */
  confirm: (orderId: string) => api.post<{ order: Order }>(`/orders/${orderId}/confirm`),
};

export const reportApi = {
  /** POST /api/projects/:id/report —— 举报（reason 必填） */
  submit: (projectId: string, input: ReportInput) =>
    api.post<ReportResult>(`/projects/${projectId}/report`, input),
};

/** 供详情页卡片网格等直接使用的轻量查询（MarketplacePage 内部也可直接用 projectApi） */
export type { ProjectSummary };
