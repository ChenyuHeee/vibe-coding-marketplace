/**
 * Q1 意图解析（§4.1）—— 演示级规则解析器。
 *
 * Phase 1 只做前端交互骨架（3 示例 chip + ≤2 澄清追问 + 确认步骤），
 * 解析为规则匹配（关键词 + 正则），Phase 2 接入真实意图理解时可整体替换。
 * 金额单位统一 CR（DECISIONS D2：界面 `N CR` 格式，不使用 ¥/$）。
 */
import type { IntentKind, ParsedIntent } from '../types';

export interface ClarifyingQuestion {
  /** 参数 key（与 ParsedIntent.params 的 key 对应） */
  id: string;
  title: string;
  /** 2–4 个选项 chip */
  options: string[];
  /** 是否允许「其他（自由输入）」，默认 true */
  allowFree?: boolean;
}

export interface ParseResult {
  intent: ParsedIntent;
  /** 仍缺失的关键参数 id（按优先级排序，最多触发 2 个追问） */
  missing: string[];
}

export const MAX_CLARIFYING_QUESTIONS = 2;

/** Q1 输入框内 3 个可点击示例（§4.1 ①，真实产品场景；金额一律 CR，DECISIONS D2） */
export const DEFAULT_EXAMPLES = [
  '找一个 200 CR 以内、能离线玩的益智小游戏',
  '买一个 Markdown 笔记工具，支持导出 PDF',
  '发布需求：7 天内做一个打卡小程序，预算 500–800 CR',
];

const BUDGET_RE = /(\d+(?:\.\d+)?)\s*(?:CR|元)/g;
const TIMELINE_RE = /(\d+)\s*天/;
const KNOWN_CATEGORIES = [
  '益智小游戏',
  '打卡小程序',
  '笔记工具',
  '小游戏',
  '效率工具',
  '课堂小游戏',
  '工具',
  '艺术',
  '动画',
  '网页应用',
  'web 应用',
  '其他',
];

function detectKind(input: string): IntentKind {
  if (/发布需求|帮我做|我想做|做.{0,8}(小程序|应用|网站|工具)/.test(input)) {
    return 'commission';
  }
  if (/买|找|想要|购买/.test(input)) {
    return 'purchase';
  }
  return 'unknown';
}

function extractCategory(input: string): string | null {
  return KNOWN_CATEGORIES.find((c) => input.includes(c)) ?? null;
}

function extractBudget(input: string): string | null {
  const matches = Array.from(input.matchAll(BUDGET_RE));
  if (matches.length === 0) return null;
  if (matches.length >= 2) {
    // 区间：如「500–800 CR」
    return `${matches[0][1]}–${matches[1][1]} CR`;
  }
  return `${matches[0][1]} CR`;
}

function extractTimeline(input: string): string | null {
  const m = input.match(TIMELINE_RE);
  return m ? `${m[1]} 天` : null;
}

const KIND_LABEL: Record<IntentKind, string> = {
  purchase: '购买作品',
  commission: '发布需求',
  unknown: '未识别',
};

/** 每类意图的澄清问题配置（一次只问 1 题，最多 2 题） */
export const CLARIFYING_QUESTIONS: Record<Exclude<IntentKind, 'unknown'>, ClarifyingQuestion[]> = {
  purchase: [
    { id: 'budget', title: '预算大概多少？', options: ['100 CR 以内', '200 CR 以内', '500 CR 以内', '不限'] },
    { id: 'category', title: '想要什么类型的作品？', options: ['益智小游戏', '效率工具', '艺术动画', '其他'] },
  ],
  commission: [
    { id: 'budget', title: '预算区间是多少？', options: ['200–500 CR', '500–800 CR', '800–1200 CR', '不限'] },
    { id: 'timeline', title: '希望多久完成？', options: ['3 天内', '7 天内', '14 天内', '30 天内'] },
    { id: 'category', title: '需要做什么类型？', options: ['打卡小程序', '课堂小游戏', '效率工具', '其他'] },
  ],
};

export function parseIntent(input: string): ParseResult {
  const kind = detectKind(input);
  if (kind === 'unknown') {
    return {
      intent: {
        kind,
        kindLabel: KIND_LABEL[kind],
        params: [],
        actionSummary: '我还没有完全理解你的意图，请补充更多信息（比如想买什么，或想做什么）。',
      },
      missing: [],
    };
  }

  const category = extractCategory(input);
  const budget = extractBudget(input);
  const timeline = extractTimeline(input);
  const offline = /离线/.test(input) ? '是' : null;

  const params: { key: string; value: string }[] = [];
  if (category) params.push({ key: '品类', value: category });
  if (budget) params.push({ key: '预算', value: budget });
  if (timeline) params.push({ key: '时间线', value: timeline });
  if (offline) params.push({ key: '可离线', value: offline });

  let actionSummary: string;
  const missing: string[] = [];

  if (kind === 'purchase') {
    if (!budget) missing.push('budget');
    if (!category) missing.push('category');
    actionSummary =
      `为你检索并下单符合条件的${category ?? '作品'}，价格不超过 ${budget ?? '预算'}，` +
      `${offline === '是' ? '支持离线运行，' : ''}下单前会展示含手续费的实付总额。`;
  } else {
    if (!budget) missing.push('budget');
    if (!timeline) missing.push('timeline');
    if (!category) missing.push('category');
    actionSummary =
      `为你发布一条需求：${category ?? '待确认类型'}，` +
      `时间线 ${timeline ?? '待确认'}，预算 ${budget ?? '待确认'}，` +
      '发布后接单者会来投标。';
  }

  return {
    intent: { kind, kindLabel: KIND_LABEL[kind], params, actionSummary },
    missing,
  };
}

/** 根据已收集的答案补齐意图参数（缺失且不再追问的用默认值并标注假设，§4.1 ②） */
export function buildFinalIntent(
  result: ParseResult,
  answers: Record<string, string>,
): { intent: ParsedIntent; assumptions: string[] } {
  const { intent } = result;
  const params = [...intent.params];
  const assumptions: string[] = [];

  const keyToDisplay: Record<string, string> = { budget: '预算', timeline: '时间线', category: '品类' };
  const defaults: Record<string, string> = { budget: '不限', timeline: '30 天内', category: '任意类型' };

  for (const key of result.missing) {
    const answer = answers[key];
    const value = answer ?? defaults[key];
    params.push({ key: keyToDisplay[key], value });
    if (!answer) {
      assumptions.push(`我按「${value}」理解${key === 'budget' ? '，可在确认页修改' : ''}`);
    }
  }

  const find = (k: string) => params.find((p) => p.key === k)?.value;

  let actionSummary = intent.actionSummary;
  if (intent.kind === 'purchase') {
    actionSummary =
      `为你检索并下单符合条件的${find('品类') ?? '作品'}，` +
      `价格不超过 ${find('预算') ?? '不限'}，下单前会展示含手续费的实付总额。`;
  } else if (intent.kind === 'commission') {
    actionSummary =
      `为你发布一条需求：${find('品类') ?? '任意类型'}，` +
      `时间线 ${find('时间线') ?? '30 天内'}，预算 ${find('预算') ?? '不限'}，发布后接单者会来投标。`;
  }

  return {
    intent: { ...intent, params, actionSummary },
    assumptions,
  };
}
