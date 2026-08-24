/**
 * API 客户端 —— fetch 封装（docs/API.md 约定）
 *
 * - base `/api`（Vite dev 代理 → 127.0.0.1:3001，见 vite.config.ts / DEPLOYMENT.md）
 * - JWT 从 localStorage 读取，`Authorization: Bearer <token>`
 * - 统一错误：`{ error: { code, message, details? } }` 解析后抛出 ApiError
 * - 401 处理：清除 token、广播 `vibe:unauthorized` 事件（AuthContext 监听后登出并跳登录页）
 */
import type { AuthResponse, LoginInput, RegisterInput, User } from '../types';

export const TOKEN_KEY = 'vibe.token';
export const UNAUTHORIZED_EVENT = 'vibe:unauthorized';

const BASE_URL = '/api';

/** 统一 API 错误（带 HTTP 状态与错误码） */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * 安全权衡（ARCHITECTURE §5 认证方案）：
 * JWT 存 localStorage 是课程项目的既定方案（无状态、简单）；已知权衡是
 * XSS 可窃取 token（对比 httpOnly cookie）。缓解：本应用不渲染用户注入的
 * HTML（React 默认转义）、上传作品以 sandbox iframe 隔离（Phase 2）。
 */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** 是否携带 JWT，默认 true */
  auth?: boolean;
  headers?: Record<string, string>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, headers = {} } = options;

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };
  if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (auth && token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch 只在网络层失败时抛错（后端不可达等）
    throw new ApiError(0, 'NETWORK', '网络连接不稳定，服务器没有响应。');
  }

  // 401：仅当「请求时已携带 token」才视为会话失效 —— 清凭证并广播登出。
  // 登录接口本身的 401（邮箱或密码错误）是普通业务错误，不触发登出。
  const carriedToken = auth && token;
  if (response.status === 401 && carriedToken) {
    clearToken();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  if (!response.ok) {
    if (isJson) {
      const bodyJson = (await response.json()) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } };
      const err = bodyJson?.error;
      throw new ApiError(
        response.status,
        err?.code ?? 'UNKNOWN',
        err?.message ?? `请求失败（HTTP ${response.status}）。`,
        err?.details,
      );
    }
    throw new ApiError(response.status, 'UNKNOWN', `请求失败（HTTP ${response.status}）。`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  if (isJson) {
    return (await response.json()) as T;
  }
  return (await response.text()) as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  del: <T>(path: string, options?: Omit<RequestOptions, 'method'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

/** 认证端点（API.md §1） */
export const authApi = {
  register: (input: RegisterInput) =>
    api.post<AuthResponse>('/auth/register', input, { auth: false }),
  login: (input: LoginInput) => api.post<AuthResponse>('/auth/login', input, { auth: false }),
  me: () => api.get<{ user: User }>('/auth/me'),
};
