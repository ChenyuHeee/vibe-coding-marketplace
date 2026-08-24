/**
 * 卖家工作台（区域 2 上传与上架）前端类型 —— 对应 docs/API.md §3 契约 + Issue #30。
 *
 * 类型来源：
 * - `Cr` / `Paginated` / `ProjectReviewStatus` 复用 @vibe/shared；
 * - **「我的作品」列表条目为本地定义**：契约见 Issue #30 ——
 *   `GET /api/seller/projects` → `{ items:[{ id,title,status,coverUrl,priceCr,
 *   trialScope,createdAt,reviewNote,... }], page, pageSize, total }`。
 *   ⚠️ Backend Dev 实现中（Issue #30）：等 BE 合入 shared 的 SellerProjectItem
 *   类型后，本文件改为从 @vibe/shared 导入，删除本地副本。
 */
import type { Cr, Paginated, ProjectCategory, ProjectReviewStatus } from '@vibe/shared';

/**
 * 我的作品条目（Issue #30 契约；后端实现中）。
 * 必填字段以 Issue #30 契约为准；category / 审核时间线字段为可选（BE 可能补充）。
 */
export interface SellerProjectItem {
  id: string;
  title: string;
  status: ProjectReviewStatus;
  coverUrl: string | null;
  priceCr: Cr;
  trialScope: string;
  createdAt: string;
  reviewNote: string | null;
  /** 可选：BE 可能补充（列表分类展示） */
  category?: ProjectCategory;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  publishedAt?: string | null;
  delistedAt?: string | null;
}

/** GET /api/seller/projects 分页响应（Issue #30） */
export type SellerProjectListResponse = Paginated<SellerProjectItem>;

/** 上传表单元数据（提交/草稿共用；文件单独持有） */
export interface ProjectMetaDraft {
  title: string;
  description: string;
  category: ProjectCategory | '';
  /** 0 = 免费 */
  priceCr: Cr;
  /** 是否定价（false = 免费） */
  priced: boolean;
  trialScope: string;
}

/** 草稿自动保存（Q3：输入即存 localStorage，刷新不丢） */
export interface SellerDraft {
  meta: ProjectMetaDraft;
  /** 已就绪的作品文件信息（未上传，仅本地占位） */
  file: { name: string; size: number } | null;
  updatedAt: string;
}

/** 上传进度回调（Q2：字节 + 百分比，能算百分比给百分比） */
export interface UploadProgress {
  loaded: number;
  total: number;
  /** 0–100，已封顶 */
  percent: number;
}

/** 审核进度页面需要的作品信息（作者视角） */
export interface SellerProjectView {
  id: string;
  title: string;
  status: ProjectReviewStatus;
  category: ProjectCategory;
  priceCr: Cr;
  trialScope: string;
  coverUrl: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  delistedAt: string | null;
  createdAt: string;
}

/** 审核进度（GET /api/projects/:id/review）—— 供 Stepper 映射 */
export interface ReviewProgress {
  status: ProjectReviewStatus;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  delistedAt: string | null;
  history: { event: string; note: string | null; createdAt: string }[];
}

/** 审核流 Stepper 阶段（词汇表 §1 规范词） */
export const REVIEW_STEPS: { id: string; label: string; description: string }[] = [
  { id: 'draft', label: '草稿', description: '填写作品信息，可随时保存草稿' },
  { id: 'submitted', label: '已提交', description: '已提交审核，等待进入审核队列' },
  { id: 'under review', label: '审核中', description: '平台正在检查你的作品' },
  { id: 'approved', label: '已上架', description: '审核通过，作品已公开出售' },
] as const;

/** 状态 → Stepper 当前步下标（0-based；approved/delisted = 全部完成） */
export function reviewStepIndex(status: ProjectReviewStatus): number {
  switch (status) {
    case 'draft':
      return 0;
    case 'submitted':
      return 1;
    case 'under review':
      return 2;
    case 'approved':
    case 'delisted':
      return REVIEW_STEPS.length;
    case 'rejected':
      // 驳回：停在「审核中」并展示失败卡片（可修改重提）
      return 2;
  }
}
