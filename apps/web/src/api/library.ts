/**
 * My Library API（docs/API.md §4）—— 后端 Phase 2 实现中，按契约开发。
 */
import { api } from './client';
import type { LibraryItem, RefundResult, RunResult } from '../types/marketplace';

export const libraryApi = {
  /** GET /api/library —— 已购列表（含免费/已下架作品） */
  list: () => api.get<{ items: LibraryItem[] }>('/library'),

  /** GET /api/library/:projectId/run —— 已购者在线运行地址 */
  run: (projectId: string) => api.get<RunResult>(`/library/${projectId}/run`),

  /** POST /api/orders/:id/refund —— 退款（14 天窗口内） */
  refund: (orderId: string) => api.post<RefundResult>(`/orders/${orderId}/refund`),
};
