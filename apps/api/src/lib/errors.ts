import type { NextFunction, Request, Response } from 'express';

/**
 * 业务错误：携带 HTTP 状态码 + 稳定错误码。
 * 响应统一为 { error: { code, message, details? } }（docs/API.md 约定）。
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(code: string, message: string, details?: unknown): ApiError {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = '未登录或登录已过期'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = '没有权限执行该操作'): ApiError {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(message = '资源不存在'): ApiError {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, 'CONFLICT', message);
  }

  static insufficientBalance(): ApiError {
    return new ApiError(400, 'INSUFFICIENT_BALANCE', '余额不足');
  }
}

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** 包装 async 路由，把 reject 交给统一错误处理中间件 */
export function asyncHandler(fn: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    const body: Record<string, unknown> = { code: err.code, message: err.message };
    if (err.details !== undefined) body.details = err.details;
    res.status(err.status).json({ error: body });
    return;
  }

  // body-parser 的 JSON 解析失败（express.json() 抛 SyntaxError）
  if (err instanceof SyntaxError && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'VALIDATION', message: '请求体不是合法的 JSON' } });
    return;
  }

  console.error('[vibe-api] unhandled error:', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}
