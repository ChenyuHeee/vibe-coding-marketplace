import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { ROLES, type Role } from '@vibe/shared';
import { ApiError, asyncHandler } from '../lib/errors';
import { getSafeUser } from '../lib/users';
import { loadAuthUser, requireAuth, signToken } from '../middleware/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LEN = 8;

interface RegisterBody {
  email?: unknown;
  password?: unknown;
  displayName?: unknown;
  roles?: unknown;
}

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

const router = Router();

// POST /api/auth/register —— 公开（D3：邮箱+密码注册，免邮箱验证）
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as RegisterBody;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';

    if (!EMAIL_RE.test(email)) {
      throw ApiError.badRequest('VALIDATION', '邮箱格式不正确');
    }
    if (password.length < PASSWORD_MIN_LEN) {
      throw ApiError.badRequest('VALIDATION', `密码长度至少 ${PASSWORD_MIN_LEN} 位`);
    }
    if (!displayName) {
      throw ApiError.badRequest('VALIDATION', '昵称不能为空');
    }

    // 角色：默认 ["buyer"]（D4：注册时选择主角色，可并存）
    let roles: Role[] = ['buyer'];
    if (body.roles !== undefined) {
      if (!Array.isArray(body.roles) || body.roles.length === 0) {
        throw ApiError.badRequest('VALIDATION', 'roles 必须是非空数组');
      }
      const parsed = body.roles.map((r) => String(r)) as Role[];
      const allValid = parsed.every((r) => (ROLES as readonly string[]).includes(r));
      if (!allValid) {
        throw ApiError.badRequest('VALIDATION', `roles 只能是：${ROLES.join(' / ')}`);
      }
      roles = parsed;
    }

    const existing = req.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      throw ApiError.conflict('该邮箱已注册');
    }

    const userId = randomUUID();
    const passwordHash = bcrypt.hashSync(password, 10);
    const now = new Date().toISOString();

    const create = req.db.transaction(() => {
      req.db
        .prepare(
          `INSERT INTO users (id, email, password_hash, display_name, roles, is_admin, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .run(userId, email, passwordHash, displayName, JSON.stringify(roles), now, now);
      // 注册即建钱包（1:1）
      req.db
        .prepare(
          `INSERT INTO wallets (id, user_id, balance_cr, created_at, updated_at)
           VALUES (?, ?, 0, ?, ?)`,
        )
        .run(randomUUID(), userId, now, now);
    });
    create();

    const user = loadAuthUser(req.db, userId);
    if (!user) throw ApiError.notFound('用户创建失败');
    res.status(201).json({ user: getSafeUser(req.db, userId), token: signToken(user) });
  }),
);

// POST /api/auth/login —— 公开
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as LoginBody;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const row = req.db
      .prepare('SELECT id, password_hash FROM users WHERE email = ?')
      .get(email) as { id: string; password_hash: string } | undefined;
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      throw ApiError.unauthorized('邮箱或密码错误');
    }

    const user = loadAuthUser(req.db, row.id);
    if (!user) throw ApiError.unauthorized('账号不存在或已被删除');
    res.json({ user: getSafeUser(req.db, row.id), token: signToken(user) });
  }),
);

// GET /api/auth/me —— 登录
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: getSafeUser(req.db, req.user!.id) });
});

export default router;
