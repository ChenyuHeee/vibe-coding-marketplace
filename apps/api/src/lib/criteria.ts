import { createHash } from 'node:crypto';

/**
 * 验收标准 hash（sha256 前缀）——「发布即锁定」证明与纠纷溯源（PRD 区域 4 ⚠️）。
 * 发布需求时写入 commissions.criteria_hash，此后任何 update 端点拒绝修改该字段。
 */
export function hashCriteria(criteria: string): string {
  const hex = createHash('sha256').update(criteria).digest('hex');
  return `sha256:${hex}`;
}
