/**
 * 报价预览（FEE_RATE 前端计算）—— docs/API.md §4 / DESIGN_SYSTEM §5.1
 *
 * 「下单前总价一屏可见」：作品价 + 手续费（费率 5%，DECISIONS.md A5）+
 * 实付总价。后端 Phase 2 提供 GET /api/projects/:id/quote 后，
 * orderApi.quote 优先走后端；本文件作为后端未实现时的前端预览回退
 * （费率来自 @vibe/shared FEE_RATE，集中配置，不硬编码）。
 */
import { FEE_RATE, type Cr } from '@vibe/shared';
import type { Quote } from '../types/marketplace';

/** 按共享常量 FEE_RATE 计算手续费（四舍五入到整数 CR）与实付总价 */
export function computeQuote(projectId: string, priceCr: Cr): Quote {
  const feeCr = Math.round(priceCr * FEE_RATE);
  return { projectId, priceCr, feeCr, totalCr: priceCr + feeCr };
}
