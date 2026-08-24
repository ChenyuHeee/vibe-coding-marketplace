import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@vibe/shared';
import type { Db } from '../db';
import { ApiError } from '../lib/errors';

/** 登录用户（token 载荷 + users 表核心字段） */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  isAdmin: boolean;
}

export function jwtSecret(): string {
  return process.env.JWT_SECRET ?? 'dev-secret-change-me';
}

/** 签发 JWT（HS256，24h 过期；roles 放入载荷，ARCHITECTURE §5） */
export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, roles: user.roles }, jwtSecret(), { expiresIn: '24h' });
}

export function loadAuthUser(db: Db, id: string): AuthUser | null {
  const row = db
    .prepare('SELECT id, email, display_name, roles, is_admin FROM users WHERE id = ?')
    .get(id) as
    | { id: string; email: string; display_name: string; roles: string; is_admin: number }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    roles: JSON.parse(row.roles) as Role[],
    isAdmin: Boolean(row.is_admin),
  };
}

/** 鉴权：校验 Authorization: Bearer <jwt>，并从库里加载最新用户信息挂到 req.user */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  if (!token) {
    next(ApiError.unauthorized());
    return;
  }
  try {
    const payload = jwt.verify(token, jwtSecret()) as jwt.JwtPayload;
    const user = payload.sub ? loadAuthUser(req.db, payload.sub) : null;
    if (!user) {
      next(ApiError.unauthorized('账号不存在或已被删除'));
      return;
    }
    req.user = user;
    next();
  } catch {
    next(ApiError.unauthorized());
  }
}

/** 角色守卫：requireAuth 之后使用（D4：roles 为数组，命中任一即放行） */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      next(ApiError.unauthorized());
      return;
    }
    if (!roles.some((role) => user.roles.includes(role))) {
      next(ApiError.forbidden(`需要角色：${roles.join(' / ')}`));
      return;
    }
    next();
  };
}

/** 解析 token 但未登录不拦截（/play、作品详情等「公开但可感知登录态」的端点用） */
export function requireOptionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  if (!token) {
    next();
    return;
  }
  try {
    const payload = jwt.verify(token, jwtSecret()) as jwt.JwtPayload;
    const user = payload.sub ? loadAuthUser(req.db, payload.sub) : null;
    if (user) req.user = user;
  } catch {
    // token 无效时按未登录处理，不阻断公开访问
  }
  next();
}

/** 平台管理员守卫（requireAuth 之后使用；demo：admin@vibes.local 的 is_admin=1） */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    next(ApiError.unauthorized());
    return;
  }
  if (!user.isAdmin) {
    next(ApiError.forbidden('需要平台管理员权限'));
    return;
  }
  next();
}
