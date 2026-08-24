/**
 * 需求线（区域 4/5）前端类型 —— 对应 docs/API.md §5/§6 契约。
 *
 * 类型来源：**全部复用 @vibe/shared**（B3-A #29 与 B3-B #31 均已合入 main）：
 * CommissionListItem / CommissionDetail / CommissionBidItem / MyBidItem /
 * ContractParty / ContractMilestoneItem / ContractItem / ContractDetail。
 * 本文件只放前端侧形态（表单入参、Stepper 映射、查询参数）。
 *
 * 状态词：一律使用 docs/STATUS_VOCABULARY.md §3 规范词（StatusBadge 查表渲染）。
 */
import type { CommissionStatus, ContractStatus, Cr } from '@vibe/shared';

export type {
  CommissionBidItem,
  CommissionDetail,
  CommissionListItem,
  ContractDetail,
  ContractItem,
  ContractMilestoneItem,
  ContractParty,
  MyBidItem,
} from '@vibe/shared';

// ---------------------------------------------------------------------------
// 表单与展示辅助
// ---------------------------------------------------------------------------

/** 发布需求入参（POST /api/commissions） */
export interface CommissionCreateInput {
  title: string;
  description: string;
  budgetMinCr: Cr;
  budgetMaxCr: Cr;
  timelineDays: number;
  acceptanceCriteria: string;
  referenceProjectIds: string[];
}

/** 投标入参（POST /api/commissions/:id/bids） */
export interface BidCreateInput {
  amountCr: Cr;
  proposal: string;
}

/** 合同状态 Stepper 六步（词汇表 §3 ★ 六词，一字不差） */
export const CONTRACT_STEPS: { id: string; label: string; description: string }[] = [
  { id: 'bid', label: '投标', description: '接单者投标，买家筛选' },
  { id: 'selected', label: '被选中', description: '买家已选中你的投标' },
  { id: 'in progress', label: '进行中', description: '合同启动，预算进入托管' },
  { id: 'milestone submission', label: '里程碑提交', description: '接单者提交里程碑交付物' },
  { id: 'buyer acceptance', label: '买家验收', description: '买家验收交付物' },
  { id: 'payout', label: '结算', description: '验收通过，托管放款给接单者' },
];

/** 合同状态 → Stepper 当前步下标（0-based；payout = 全部完成） */
export function contractStepIndex(status: ContractStatus): number {
  const idx = CONTRACT_STEPS.findIndex((s) => s.id === status);
  return idx === -1 ? 0 : idx;
}

/** 需求板筛选参数（GET /api/commissions） */
export interface CommissionListQuery {
  status?: CommissionStatus | '';
  budgetMaxLte?: number;
  q?: string;
  sort?: 'newest' | 'budget_asc' | '';
  page?: number;
  pageSize?: number;
}

/** 我的合同列表查询（GET /api/contracts） */
export interface ContractListQuery {
  role: 'buyer' | 'contractor';
  status?: ContractStatus | '';
  page?: number;
  pageSize?: number;
}
