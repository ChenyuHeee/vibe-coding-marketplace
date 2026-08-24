/**
 * 需求线 API（docs/API.md §5/§6）—— 挂在统一 client 之上。
 *
 * 端点状态（PR-F3-B）：B3-A（#29）与 B3-B（#31）均已合入 main，
 * commissions / bids / contracts / milestones 全部可用；字段以 @vibe/shared 为准。
 * 里程碑交付物上传复用 seller.ts 的 startUpload（XHR 真实进度，Q2）。
 */
import { api } from './client';
import { startUpload } from './seller';
import type {
  CommissionCreateInput,
  CommissionDetail,
  CommissionListQuery,
  CommissionListItem,
  ContractDetail,
  ContractItem,
  MyBidItem,
} from '../types/commission';
import type { Paginated } from '@vibe/shared';
import type { UploadProgress } from '../types/seller';

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

/** 需求线（区域 4） */
export const commissionApi = {
  /** GET /api/commissions —— 需求板（公开；status/budgetMaxLte/q/sort/分页） */
  list: (query: CommissionListQuery = {}) =>
    api.get<Paginated<CommissionListItem>>(
      `/commissions${toQuery({
        status: query.status ?? '',
        budgetMaxLte: query.budgetMaxLte,
        q: query.q ?? '',
        sort: query.sort ?? '',
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 12,
      })}`,
      { auth: false },
    ),

  /** GET /api/commissions/:id —— 公开详情（bids 仅登录用户可见；client 自动带 token） */
  detail: (id: string) => api.get<{ commission: CommissionDetail }>(`/commissions/${id}`),

  /** POST /api/commissions —— buyer 发布（验收标准发布即锁定） */
  create: (input: CommissionCreateInput) =>
    api.post<{ commission: CommissionDetail }>('/commissions', input),

  /** PUT /api/commissions/:id —— 作者更新（criteria 锁定 400；有投标冻结 409） */
  update: (id: string, input: Partial<CommissionCreateInput>) =>
    api.put<{ commission: CommissionDetail }>(`/commissions/${id}`, input),

  /** POST /api/commissions/:id/cancel —— 作者取消（仅 open） */
  cancel: (id: string) => api.post<{ commission: CommissionDetail }>(`/commissions/${id}/cancel`),

  /** POST /api/commissions/:id/bids —— contractor 投标（预算区间 + 一人一单一标） */
  bid: (id: string, input: { amountCr: number; proposal: string }) =>
    api.post<{ bid: { id: string; commissionId: string; amountCr: number; proposal: string; status: string; createdAt: string } }>(
      `/commissions/${id}/bids`,
      input,
    ),

  /** POST /api/commissions/:id/select —— buyer 选中投标 → 生成合同（selected / escrow none） */
  select: (
    id: string,
    bidId: string,
  ) =>
    api.post<{
      contract: {
        id: string;
        commissionId: string;
        buyerId: string;
        contractorId: string;
        bidId: string;
        agreedAmountCr: number;
        status: 'selected';
        escrowStatus: 'none';
      };
    }>(`/commissions/${id}/select`, { bidId }),

  /** GET /api/bids/mine —— contractor 我的投标 */
  myBids: (params: { status?: string; page?: number; pageSize?: number } = {}) =>
    api.get<Paginated<MyBidItem>>(
      `/bids/mine${toQuery({
        status: params.status,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 10,
      })}`,
    ),
};

/** 接单交付（区域 5） */
export const contractApi = {
  /** GET /api/contracts —— 我的合同（role=buyer|contractor；买卖双方同一 status 词） */
  list: (params: { role: 'buyer' | 'contractor'; status?: string; page?: number; pageSize?: number }) =>
    api.get<Paginated<ContractItem>>(
      `/contracts${toQuery({
        role: params.role,
        status: params.status,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 10,
      })}`,
    ),

  /** GET /api/contracts/:id —— 合同详情（buyer/contractor 双方可见） */
  detail: (id: string) => api.get<{ contract: ContractDetail }>(`/contracts/${id}`),

  /** POST /api/contracts/:id/start —— buyer 启动：selected → in progress，预算进托管 */
  start: (id: string) =>
    api.post<{ contract: ContractDetail; balanceAfterCr: number }>(`/contracts/${id}/start`),

  /** POST /api/contracts/:id/milestones —— contractor 提交里程碑（multipart，XHR 进度） */
  milestones: (
    id: string,
    formData: FormData,
    onProgress?: (p: UploadProgress) => void,
  ) => startUpload<{ milestone: import('../types/commission').ContractMilestoneItem }>(
    `/contracts/${id}/milestones`,
    formData,
    onProgress,
  ),

  /** POST /api/milestones/:id/approve —— buyer 验收通过（非最终→in progress；最终→buyer acceptance） */
  approveMilestone: (id: string) => api.post<{ contract: ContractDetail }>(`/milestones/${id}/approve`),

  /** POST /api/milestones/:id/request-revision —— buyer 打回（feedback 必填） */
  requestRevision: (id: string, feedback: string) =>
    api.post<{ contract: ContractDetail }>(`/milestones/${id}/request-revision`, { feedback }),

  /** POST /api/contracts/:id/accept —— buyer 最终验收（幂等） */
  accept: (id: string) => api.post<{ contract: ContractDetail }>(`/contracts/${id}/accept`),

  /** POST /api/contracts/:id/payout —— buyer 结算放款（buyer acceptance → payout，escrow released） */
  payout: (id: string) =>
    api.post<{ contract: ContractDetail; contractorBalanceAfterCr: number }>(`/contracts/${id}/payout`),
};
