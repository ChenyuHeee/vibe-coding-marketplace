/**
 * 状态徽章词汇表 —— 唯一来源 docs/STATUS_VOCABULARY.md（PM 产出）。
 *
 * 铁律（DESIGN_SYSTEM §8）：StatusBadge **只渲染词汇表内的状态词**，
 * 禁止页面自行造词；同一个词全局渲染一致（icon + 文字 + 颜色三件套）。
 * 中文 label 仅用于界面文案；英文词（大小写/空格敏感）是逻辑判断与
 * title/aria 的规范字符串。
 */
import {
  Ban,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Coins,
  CreditCard,
  FileText,
  Gavel,
  Hourglass,
  Landmark,
  Lock,
  Package,
  PackagePlus,
  PlusCircle,
  Scale,
  Send,
  Undo2,
  Wallet,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

/** 徽章语义色调（对应 §2.1 语义色族 + neutral） */
export type StatusTone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'error';

export interface StatusMeta {
  /** 中文界面文案（词汇表「中文」列） */
  label: string;
  tone: StatusTone;
  icon: LucideIcon;
  /** 进行中类状态带 12px spinner（DESIGN_SYSTEM §8 #2） */
  spinner?: boolean;
}

/**
 * 全量词汇表（STATUS_VOCABULARY.md 四流 27 词）。
 * 注意：rejected/cancelled/completed/disputed 在多个流中复用同一字符串
 * （词汇表第 0 节规则 3），此处合并为单条配置 —— 这正是「同一状态词
 * 全局渲染一致」的实现。
 */
export const STATUS_VOCABULARY: Readonly<Record<string, StatusMeta>> = {
  // ---- 作品审核流 §1 ----
  draft: { label: '草稿', tone: 'neutral', icon: FileText },
  submitted: { label: '已提交', tone: 'info', icon: Send },
  'under review': { label: '审核中', tone: 'info', icon: Clock, spinner: true },
  approved: { label: '已上架', tone: 'success', icon: CheckCircle2 },
  rejected: { label: '已驳回', tone: 'error', icon: XCircle },
  delisted: { label: '已下架', tone: 'neutral', icon: Ban },

  // ---- 订单与支付流 §2 ----
  'pending payment': { label: '待支付', tone: 'warning', icon: CreditCard },
  cancelled: { label: '已取消', tone: 'neutral', icon: Ban },
  paid: { label: '已支付', tone: 'info', icon: CreditCard },
  delivered: { label: '已交付', tone: 'info', icon: Package },
  completed: { label: '已完成', tone: 'success', icon: CheckCircle2 },
  'refund requested': { label: '退款申请中', tone: 'warning', icon: Hourglass, spinner: true },
  refunded: { label: '已退款', tone: 'info', icon: Undo2 },
  disputed: { label: '争议中', tone: 'error', icon: Scale },

  // ---- 需求-接单-交付流 §3 ----
  bid: { label: '投标', tone: 'info', icon: Gavel },
  selected: { label: '被选中', tone: 'brand', icon: CheckCircle2 },
  'in progress': { label: '进行中', tone: 'brand', icon: Clock, spinner: true },
  'milestone submission': {
    label: '里程碑提交',
    tone: 'brand',
    icon: PackagePlus,
    spinner: true,
  },
  'buyer acceptance': { label: '买家验收', tone: 'warning', icon: ClipboardCheck },
  payout: { label: '结算', tone: 'success', icon: Coins },

  // ---- 钱包与托管流 §4 ----
  balance: { label: '余额', tone: 'success', icon: Wallet },
  'top-up pending': { label: '充值处理中', tone: 'info', icon: PlusCircle, spinner: true },
  'escrow held': { label: '托管中', tone: 'info', icon: Lock, spinner: true },
  'escrow released': { label: '已放款', tone: 'success', icon: Banknote },
  'withdrawal pending': { label: '提现处理中', tone: 'info', icon: Landmark, spinner: true },
  'withdrawal completed': { label: '已到账', tone: 'success', icon: Banknote },
  'withdrawal failed': { label: '提现失败', tone: 'error', icon: XCircle },
};

/** 查词：词汇表内有定义才返回；没有返回 undefined（调用方禁止自造展示） */
export function getStatusMeta(word: string): StatusMeta | undefined {
  return STATUS_VOCABULARY[word];
}

/** 词汇表内的全部规范词（供测试与筛选使用） */
export const STATUS_WORDS = Object.keys(STATUS_VOCABULARY);
