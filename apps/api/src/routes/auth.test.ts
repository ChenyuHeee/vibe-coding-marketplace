import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { getDb } from '../db';

function testApp() {
  return createApp({ dbPath: ':memory:' });
}

function registerBody(overrides: Record<string, unknown> = {}) {
  return {
    email: 'new.user@example.com',
    password: 'secret123',
    displayName: '新用户',
    ...overrides,
  };
}

describe('POST /api/auth/register', () => {
  it('注册成功：返回 user + token，默认角色 ["buyer"]', async () => {
    const res = await request(testApp()).post('/api/auth/register').send(registerBody());
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('new.user@example.com');
    expect(res.body.user.displayName).toBe('新用户');
    expect(res.body.user.roles).toEqual(['buyer']);
    expect(res.body.user.isAdmin).toBe(false);
    expect(typeof res.body.token).toBe('string');
  });

  it('可指定并存角色（D4）', async () => {
    const res = await request(testApp())
      .post('/api/auth/register')
      .send(registerBody({ roles: ['buyer', 'seller'] }));
    expect(res.status).toBe(201);
    expect(res.body.user.roles).toEqual(['buyer', 'seller']);
  });

  it('注册即自动创建钱包（1:1，余额 0）', async () => {
    const app = testApp();
    const res = await request(app).post('/api/auth/register').send(registerBody());
    expect(res.status).toBe(201);
    const wallet = getDb(app)
      .prepare('SELECT balance_cr FROM wallets WHERE user_id = ?')
      .get(res.body.user.id) as { balance_cr: number } | undefined;
    expect(wallet).toBeDefined();
    expect(wallet!.balance_cr).toBe(0);
  });

  it('邮箱格式不正确 → 400 VALIDATION', async () => {
    const res = await request(testApp())
      .post('/api/auth/register')
      .send(registerBody({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('密码少于 8 位 → 400 VALIDATION（D3）', async () => {
    const res = await request(testApp())
      .post('/api/auth/register')
      .send(registerBody({ password: 'short' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('重复邮箱 → 409 CONFLICT', async () => {
    const app = testApp();
    const first = await request(app).post('/api/auth/register').send(registerBody());
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/auth/register').send(registerBody());
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });

  it('非法角色 → 400 VALIDATION', async () => {
    const res = await request(testApp())
      .post('/api/auth/register')
      .send(registerBody({ roles: ['hacker'] }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});

describe('POST /api/auth/login', () => {
  it('登录成功：返回 user + token', async () => {
    const res = await request(testApp())
      .post('/api/auth/login')
      .send({ email: 'buyer@vibes.local', password: 'demo1234' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('buyer@vibes.local');
    expect(res.body.user.roles).toContain('buyer');
    expect(typeof res.body.token).toBe('string');
  });

  it('密码错误 → 401 UNAUTHORIZED', async () => {
    const res = await request(testApp())
      .post('/api/auth/login')
      .send({ email: 'buyer@vibes.local', password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('邮箱不存在 → 401 UNAUTHORIZED', async () => {
    const res = await request(testApp())
      .post('/api/auth/login')
      .send({ email: 'nobody@vibes.local', password: 'demo1234' });
    expect(res.status).toBe(401);
  });

  it('演示 admin 账号：isAdmin=true', async () => {
    const res = await request(testApp())
      .post('/api/auth/login')
      .send({ email: 'admin@vibes.local', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.user.isAdmin).toBe(true);
  });
});

describe('GET /api/auth/me', () => {
  async function loginToken(app: ReturnType<typeof testApp>, email: string, password: string) {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    return res.body.token as string;
  }

  it('带 token → 返回当前用户', async () => {
    const app = testApp();
    const token = await loginToken(app, 'seller@vibes.local', 'demo1234');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('seller@vibes.local');
    expect(res.body.user.roles).toEqual(['seller', 'buyer']);
  });

  it('无 token → 401（requireAuth 拦截）', async () => {
    const res = await request(testApp()).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('伪造 token → 401', async () => {
    const res = await request(testApp())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('非法 Authorization 头（非 Bearer）→ 401', async () => {
    const res = await request(testApp()).get('/api/auth/me').set('Authorization', 'Basic abc');
    expect(res.status).toBe(401);
  });
});
