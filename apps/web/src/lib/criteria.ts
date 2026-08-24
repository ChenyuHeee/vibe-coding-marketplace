/**
 * 验收标准工具 —— 需求线（区域 4/5）共用。
 *
 * 验收标准为逐行文本（发布时锁定，写入 criteria_hash），展示为 checklist 行：
 * 需求详情锁定展示、接单交付的买家验收对照面板共用。
 */
export function criteriaLines(criteria: string): string[] {
  return criteria
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}
