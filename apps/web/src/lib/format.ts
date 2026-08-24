/**
 * 金额展示辅助 —— DESIGN_SYSTEM §2.3（Num 层级 + tabular-nums）。
 *
 * 平台币 Credits（CR，DECISIONS.md D2）：整数，展示为 `X CR`；
 * 价格为 0 的作品展示「免费」（§8 #1 MarketplaceCard 价格位）。
 * 数字一律加 .num class（tabular-nums），由 CSS 保证不跳动。
 */
import { CURRENCY, type Cr } from '@vibe/shared';

/** 格式化金额：`500 CR` */
export function formatCr(cr: Cr): string {
  return `${cr} ${CURRENCY}`;
}

/** 作品价格展示：0 → 「免费」，否则 `X CR` */
export function formatPriceCr(priceCr: Cr): string {
  return priceCr === 0 ? '免费' : formatCr(priceCr);
}

/** 带符号金额（收支记录）：入账 +X CR / 出账 -X CR */
export function formatSignedCr(cr: Cr, direction: 'credit' | 'debit'): string {
  const sign = direction === 'credit' ? '+' : '-';
  return `${sign}${formatCr(cr)}`;
}
