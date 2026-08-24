import type { Request, Response } from 'express';
import type { Role } from '@vibe/shared';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { getDb } from '../db';
import { ApiError } from '../lib/errors';
import { loadAuthUser, requireAuth, requireRole, signToken } from './auth';

describe('requireAuth 中间件', () => {
  it('合法 token：从库加载最新用户并挂到 req.user', () => {
    const app = createApp({ dbPath: ':memory:' });
    const db = getDb(app);
    const user = loadAuthUser(db, 'usr_buyer');
    expect(user).not.toBeNull();
    const token = signToken(user!);

    const req = { headers: { authorization: `Bearer ${token}` }, db } as unknown as Request;
    const next = vi.fn();
    requireAuth(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.user?.id).toBe('usr_buyer');
  });

  it('无 token：next 收到 UNAUTHORIZED', () => {
    const app = createApp({ dbPath: ':memory:' });
    const req = { headers: {}, db: getDb(app) } as unknown as Request;
    const next = vi.fn();
    requireAuth(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect((next.mock.calls[0][0] as ApiError).code).toBe('UNAUTHORIZED');
  });

  it('被删除的账号：token 有效但用户不存在 → 401', () => {
    const app = createApp({ dbPath: ':memory:' });
    const db = getDb(app);
    const token = signToken({
      id: 'ghost-user',
      email: 'ghost@vibes.local',
      displayName: 'Ghost',
      roles: ['buyer'],
      isAdmin: false,
    });
    const req = { headers: { authorization: `Bearer ${token}` }, db } as unknown as Request;
    const next = vi.fn();
    requireAuth(req, {} as Response, next);
    expect((next.mock.calls[0][0] as ApiError).code).toBe('UNAUTHORIZED');
  });
});

describe('requireRole 中间件', () => {
  function callWithRoles(roles: Role[], user?: Request['user']) {
    const req = { user } as Request;
    const res = {} as Response;
    const next = vi.fn();
    requireRole(...roles)(req, res, next);
    return next;
  }

  it('角色命中 → 放行', () => {
    const next = callWithRoles(['seller'], {
      id: 'u',
      email: 'a@b.c',
      displayName: 'A',
      roles: ['buyer', 'seller'],
      isAdmin: false,
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('角色不命中 → 403 FORBIDDEN', () => {
    const next = callWithRoles(['seller'], {
      id: 'u',
      email: 'a@b.c',
      displayName: 'A',
      roles: ['buyer'],
      isAdmin: false,
    });
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect((next.mock.calls[0][0] as ApiError).code).toBe('FORBIDDEN');
  });

  it('未登录（无 user）→ 401', () => {
    const next = callWithRoles(['seller']);
    expect((next.mock.calls[0][0] as ApiError).code).toBe('UNAUTHORIZED');
  });
});
