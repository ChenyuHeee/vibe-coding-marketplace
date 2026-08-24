/**
 * 前端本地类型定义（不修改 packages/shared —— 由后端负责对齐）。
 * 用户/认证相关类型**直接复用** @vibe/shared 的 SafeUser / AuthResponse（只读 import），
 * 避免本地副本与后端漂移（isAdmin / ratingAvg 等字段以后端为准）。
 */
import type { AuthResponse, Role, SafeUser } from '@vibe/shared';

export type { AuthResponse, Role, SafeUser };

/** 前端组件通用别名（组件代码用 User 指代登录用户，与 SafeUser 同一形状） */
export type User = SafeUser;

/** 统一错误体：{ error: { code, message, details? } }（API.md 约定） */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** 注册入参（D3/D4：邮箱+密码≥8+displayName+角色数组，主角色默认 buyer） */
export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  roles: Role[];
}

/** 登录入参 */
export interface LoginInput {
  email: string;
  password: string;
}

/** 意图输入（Q1）的类型 */
export type IntentKind = 'purchase' | 'commission' | 'unknown';

/** Q1 解析出的用户意图 */
export interface ParsedIntent {
  kind: IntentKind;
  /** 意图类型展示名 */
  kindLabel: string;
  /** 解析出的关键参数（确认卡 chips 展示） */
  params: { key: string; value: string }[];
  /** 将执行的动作描述（含费用/风险摘要） */
  actionSummary: string;
}
