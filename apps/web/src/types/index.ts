/**
 * 前端本地类型定义（不修改 packages/shared —— 由后端负责对齐）。
 * 需要共享类型时只读 import @vibe/shared。
 */
import type { Role } from '@vibe/shared';

export type { Role };

/** GET /api/auth/me 返回的用户 */
export interface User {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  avatarUrl: string | null;
  ratingAvg: number | null;
  ratingCount: number;
}

/** 注册/登录响应（API.md §1） */
export interface AuthResponse {
  user: User;
  token: string;
}

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
