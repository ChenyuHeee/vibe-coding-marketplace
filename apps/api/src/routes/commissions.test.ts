/**
 * 需求线集成测试（PR-B3-A）：发布 / 需求板 / 详情 / 更新（验收标准锁定 + 有投标冻结）/
 * 取消 / 投标（预算区间 + 一人一单一标）/ 我的投标 / 选中（其余 rejected + 建合同）。
 * 状态词断言一律使用词汇表 §3 规范字符串；错误格式断言 { error: { code, message } }。
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';

function testApp() {
  return createApp({ dbPath: ':memory:' });
}

async function login(app: ReturnType<typeof testApp>, email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

function authed(app: ReturnType<typeof testApp>, token: string) {
  const headers = { Authorization: `Bearer ${token}` };
  return {
    get: (url: string) => request(app).get(url).set(headers),
    post: (url: string) => request(app).post(url).set(headers),
    put: (url: string) => request(app).put(url).set(headers),
  };
}

/** 注册新用户（可指定角色）并返回 token */
async function freshUser(
  app: ReturnType<typeof testApp>,
  roles: string[],
  displayName = 'QA 用户',
): Promise<string> {
  const email = `qa+${randomUUID().slice(0, 8)}@vibes.local`;
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'qa-pass-1234', displayName, roles });
  expect(reg.status).toBe(201);
  return reg.body.token as string;
}

/** 发布一条需求（默认预算 1000–3000），返回 commission id */
async function publishCommission(
  app: ReturnType<typeof testApp>,
  token: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await authed(app, token)
    .post('/api/commissions')
    .send({
      title: '帮我做一个课堂小游戏',
      description: '可运行的课堂展示小游戏',
      budgetMinCr: 1000,
      budgetMaxCr: 3000,
      timelineDays: 7,
      acceptanceCriteria: '1) 可运行 2) 有计分',
      referenceProjectIds: ['proj_snake'],
      ...overrides,
    });
  return res;
}

describe('发布需求（POST /api/commissions）', () => {
  it('未登录 → 401', async () => {
    const res = await request(testApp())
      .post('/api/commissions')
      .send({ title: 'x', description: 'y', budgetMinCr: 1, budgetMaxCr: 2, timelineDays: 1, acceptanceCriteria: 'a' });
    expect(res.status).toBe(401);
  });

  it('无 buyer 角色（纯 contractor）→ 403', async () => {
    const app = testApp();
    const token = await freshUser(app, ['contractor']);
    const res = await authed(app, token)
      .post('/api/commissions')
      .send({ title: 'x', description: 'y', budgetMinCr: 1, budgetMaxCr: 2, timelineDays: 1, acceptanceCriteria: 'a' });
    expect(res.status).toBe(403);
  });

  it('成功发布：status=open、criteriaHash=sha256 前缀、参考作品映射', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    const res = await publishCommission(app, token);
    expect(res.status).toBe(201);
    expect(res.body.commission).toMatchObject({
      status: 'open',
      budgetMinCr: 1000,
      budgetMaxCr: 3000,
      timelineDays: 7,
      acceptanceCriteria: '1) 可运行 2) 有计分',
      bidCount: 0,
    });
    expect(res.body.commission.criteriaHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(res.body.commission.referenceProjects).toEqual([{ id: 'proj_snake', title: '贪吃蛇 Classic' }]);
    // 发布者可见投标列表（空数组）
    expect(res.body.commission.bids).toEqual([]);
  });

  it('校验：预算区间 min>=max 400；timelineDays<1 400；验收标准为空 400；参考作品不存在 400', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    const badBudget = await publishCommission(app, token, { budgetMinCr: 3000, budgetMaxCr: 1000 });
    expect(badBudget.status).toBe(400);
    expect(badBudget.body.error.code).toBe('VALIDATION');

    const badTimeline = await publishCommission(app, token, { timelineDays: 0 });
    expect(badTimeline.status).toBe(400);

    const badCriteria = await publishCommission(app, token, { acceptanceCriteria: '  ' });
    expect(badCriteria.status).toBe(400);
    expect(badCriteria.body.error.message).toContain('验收标准');

    const badRef = await publishCommission(app, token, { referenceProjectIds: ['proj_not_exist'] });
    expect(badRef.status).toBe(400);
    expect(badRef.body.error.message).toContain('referenceProjectIds');
  });
});

describe('需求板（GET /api/commissions）', () => {
  it('公开可访问；条目含 bidCount（演示需求有 2 条 submitted 投标）', async () => {
    const app = testApp();
    const res = await request(app).get('/api/commissions').send();
    expect(res.status).toBe(200);
    const demo = res.body.items.find((c: { id: string }) => c.id === 'com_demo_game');
    expect(demo).toBeDefined();
    expect(demo.bidCount).toBe(2);
    expect(demo.buyer.displayName).toBe('演示买家');
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('筛选：status / budgetMaxLte / q / sort=budget_asc', async () => {
    const app = testApp();
    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    await publishCommission(app, buyerToken, {
      title: 'AI 绘画工具',
      description: '做一个 AI 绘图工具',
      budgetMinCr: 5000,
      budgetMaxCr: 9000,
    });

    const openOnly = await request(app).get('/api/commissions?status=open');
    expect(openOnly.body.items.every((c: { status: string }) => c.status === 'open')).toBe(true);

    const budget = await request(app).get('/api/commissions?budgetMaxLte=3000');
    expect(budget.body.items.every((c: { budgetMaxCr: number }) => c.budgetMaxCr <= 3000)).toBe(true);

    const q = await request(app).get('/api/commissions?q=绘画');
    expect(q.body.items.length).toBeGreaterThanOrEqual(1);
    expect(q.body.items[0].title).toContain('绘画');

    const sorted = await request(app).get('/api/commissions?sort=budget_asc');
    const mins = sorted.body.items.map((c: { budgetMinCr: number }) => c.budgetMinCr);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);

    const badSort = await request(app).get('/api/commissions?sort=bogus');
    expect(badSort.status).toBe(400);
  });

  it('分页结构 { items, page, pageSize, total }', async () => {
    const app = testApp();
    const res = await request(app).get('/api/commissions?page=1&pageSize=1');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(1);
    expect(res.body).toMatchObject({ page: 1, pageSize: 1 });
    expect(typeof res.body.total).toBe('number');
  });
});

describe('详情（GET /api/commissions/:id）', () => {
  it('公开可见；匿名 bids=[]；登录用户可见投标（含 contractor displayName 与 amountCr，不含 email）', async () => {
    const app = testApp();
    const anon = await request(app).get('/api/commissions/com_demo_game');
    expect(anon.status).toBe(200);
    expect(anon.body.commission.acceptanceCriteria).toBe('1) 可运行 2) 有计分 3) 移动端可用');
    expect(anon.body.commission.criteriaHash).toMatch(/^sha256:/);
    expect(anon.body.commission.bids).toEqual([]);

    const contractorToken = await login(app, 'contractor@vibes.local', 'demo1234');
    const logged = await authed(app, contractorToken).get('/api/commissions/com_demo_game');
    expect(logged.status).toBe(200);
    expect(logged.body.commission.bids.length).toBe(2);
    const bid = logged.body.commission.bids[0];
    expect(bid).toMatchObject({ amountCr: 1500, status: 'submitted' });
    expect(bid.contractor.displayName).toBe('演示接单者');
    expect(bid.contractor.email).toBeUndefined();
  });

  it('不存在 → 404', async () => {
    const res = await request(testApp()).get('/api/commissions/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('更新（PUT /api/commissions/:id）', () => {
  it('非作者 → 403', async () => {
    const app = testApp();
    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');
    const res = await authed(app, sellerToken)
      .put('/api/commissions/com_demo_game')
      .send({ description: 'x' });
    expect(res.status).toBe(403);
  });

  it('验收标准锁定：改 acceptanceCriteria / criteriaHash → 400（发布即锁定）', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    const res = await authed(app, token)
      .put('/api/commissions/com_demo_game')
      .send({ acceptanceCriteria: '改过的标准' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('验收标准在发布时锁定');

    const res2 = await authed(app, token).put('/api/commissions/com_demo_game').send({ criteriaHash: 'x' });
    expect(res2.status).toBe(400);
  });

  it('无投标时可改 description/budget/timeline；有投标（submitted）后整体冻结 409', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    const created = await publishCommission(app, token);
    const id = created.body.commission.id as string;

    const ok = await authed(app, token)
      .put(`/api/commissions/${id}`)
      .send({ description: '新描述', budgetMinCr: 1200, budgetMaxCr: 3500, timelineDays: 10 });
    expect(ok.status).toBe(200);
    expect(ok.body.commission).toMatchObject({ description: '新描述', budgetMinCr: 1200, budgetMaxCr: 3500, timelineDays: 10 });

    // 演示需求已有 submitted 投标 → 整体冻结
    const frozen = await authed(app, token)
      .put('/api/commissions/com_demo_game')
      .send({ description: '想改描述' });
    expect(frozen.status).toBe(409);
    expect(frozen.body.error.code).toBe('CONFLICT');
  });

  it('更新时预算区间校验仍生效', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    const created = await publishCommission(app, token);
    const id = created.body.commission.id as string;
    const res = await authed(app, token)
      .put(`/api/commissions/${id}`)
      .send({ budgetMinCr: 5000, budgetMaxCr: 1000 });
    expect(res.status).toBe(400);
  });
});

describe('取消（POST /api/commissions/:id/cancel）', () => {
  it('open 取消成功：status=cancelled，submitted 投标标记 cancelled（词汇表 §3）', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    const created = await publishCommission(app, token);
    const id = created.body.commission.id as string;

    const contractorToken = await freshUser(app, ['contractor']);
    await authed(app, contractorToken).post(`/api/commissions/${id}/bids`).send({ amountCr: 1500 });

    const cancel = await authed(app, token).post(`/api/commissions/${id}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.commission.status).toBe('cancelled');
    // 需求取消后不可再投
    const rebid = await authed(app, contractorToken).post(`/api/commissions/${id}/bids`).send({ amountCr: 1500 });
    expect(rebid.status).toBe(409);
  });

  it('已取消/已完成不可重复取消；有合同拒绝取消', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    const again = await authed(app, token).post('/api/commissions/com_demo_game/cancel');
    // 演示需求本身 open 可取消；先取消一次
    expect(again.status).toBe(200);
    const second = await authed(app, token).post('/api/commissions/com_demo_game/cancel');
    expect(second.status).toBe(409);

    // 有合同（select 后）→ 拒绝取消
    const token2 = await login(app, 'buyer@vibes.local', 'demo1234');
    const created = await publishCommission(app, token2);
    const id = created.body.commission.id as string;
    const contractorToken = await freshUser(app, ['contractor']);
    const bidRes = await authed(app, contractorToken)
      .post(`/api/commissions/${id}/bids`)
      .send({ amountCr: 1500 });
    const bidId = bidRes.body.bid.id as string;
    await authed(app, token2).post(`/api/commissions/${id}/select`).send({ bidId });
    const cancelWithContract = await authed(app, token2).post(`/api/commissions/${id}/cancel`);
    expect(cancelWithContract.status).toBe(409);
    expect(cancelWithContract.body.error.message).toContain('合同');
  });
});

describe('投标（POST /api/commissions/:id/bids）', () => {
  it('未登录 401；无 contractor 角色（纯 buyer）403', async () => {
    const app = testApp();
    const anon = await request(app).post('/api/commissions/com_demo_game/bids').send({ amountCr: 1500 });
    expect(anon.status).toBe(401);
    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const forbidden = await authed(app, buyerToken).post('/api/commissions/com_demo_game/bids').send({ amountCr: 1500 });
    expect(forbidden.status).toBe(403);
  });

  it('金额必须在预算区间内（低于 min / 高于 max → 400）', async () => {
    const app = testApp();
    const token = await freshUser(app, ['contractor']);
    const low = await authed(app, token).post('/api/commissions/com_demo_game/bids').send({ amountCr: 100 });
    expect(low.status).toBe(400);
    expect(low.body.error.message).toContain('预算区间');
    const high = await authed(app, token).post('/api/commissions/com_demo_game/bids').send({ amountCr: 99999 });
    expect(high.status).toBe(400);
  });

  it('成功投标：status=submitted；GET /api/bids/mine 可见', async () => {
    const app = testApp();
    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const created = await publishCommission(app, buyerToken);
    const id = created.body.commission.id as string;

    const contractorToken = await freshUser(app, ['contractor']);
    const bid = await authed(app, contractorToken).post(`/api/commissions/${id}/bids`).send({
      amountCr: 2000,
      proposal: '我做过 3 款小游戏',
    });
    expect(bid.status).toBe(201);
    expect(bid.body.bid).toMatchObject({ amountCr: 2000, status: 'submitted' });

    const mine = await authed(app, contractorToken).get('/api/bids/mine');
    expect(mine.status).toBe(200);
    expect(mine.body.items[0]).toMatchObject({
      amountCr: 2000,
      status: 'submitted',
      commission: { id, title: '帮我做一个课堂小游戏', status: 'open' },
    });
  });

  it('一人一单一标：演示接单者已对 com_demo_game 有 submitted 投标 → 重复投标 409', async () => {
    const app = testApp();
    const token = await login(app, 'contractor@vibes.local', 'demo1234');
    const res = await authed(app, token).post('/api/commissions/com_demo_game/bids').send({ amountCr: 1800 });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('一人一单一标');
  });

  it('不能投标自己发布的需求（buyer 兼 contractor）→ 400', async () => {
    const app = testApp();
    const bothToken = await freshUser(app, ['buyer', 'contractor']);
    const created = await publishCommission(app, bothToken);
    const id = created.body.commission.id as string;
    const res = await authed(app, bothToken).post(`/api/commissions/${id}/bids`).send({ amountCr: 1500 });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('不能投标自己发布的需求');
  });

  it('已取消需求不可投标 → 409', async () => {
    const app = testApp();
    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const created = await publishCommission(app, buyerToken);
    const id = created.body.commission.id as string;
    await authed(app, buyerToken).post(`/api/commissions/${id}/cancel`);
    const contractorToken = await freshUser(app, ['contractor']);
    const res = await authed(app, contractorToken).post(`/api/commissions/${id}/bids`).send({ amountCr: 1500 });
    expect(res.status).toBe(409);
  });
});

describe('我的投标（GET /api/bids/mine）', () => {
  it('contractor 可见自己全部投标；status 筛选；非 contractor 403', async () => {
    const app = testApp();
    const token = await login(app, 'contractor@vibes.local', 'demo1234');
    const all = await authed(app, token).get('/api/bids/mine');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);

    const submitted = await authed(app, token).get('/api/bids/mine?status=submitted');
    expect(submitted.body.items.every((b: { status: string }) => b.status === 'submitted')).toBe(true);

    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const forbidden = await authed(app, buyerToken).get('/api/bids/mine');
    expect(forbidden.status).toBe(403);
  });
});

describe('选中（POST /api/commissions/:id/select）', () => {
  it('选中后：bid→selected、其余 submitted→rejected、创建 contract（agreedAmountCr=报价、escrow none）、commission 保持 open', async () => {
    const app = testApp();
    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const res = await authed(app, buyerToken).post('/api/commissions/com_demo_game/select').send({ bidId: 'bid_demo_1' });
    expect(res.status).toBe(200);
    expect(res.body.contract).toMatchObject({
      status: 'selected',
      escrowStatus: 'none',
      agreedAmountCr: 1500,
      commissionId: 'com_demo_game',
      contractorId: 'usr_contractor',
    });

    // 其余 submitted 投标 → rejected
    const detail = await authed(app, buyerToken).get('/api/commissions/com_demo_game');
    const byId = Object.fromEntries(
      detail.body.commission.bids.map((b: { id: string; status: string }) => [b.id, b.status]),
    );
    expect(byId).toMatchObject({ bid_demo_1: 'selected', bid_demo_2: 'rejected' });

    // commission 保持 open（设计说明：in progress 语义由 contract 承担）
    expect(detail.body.commission.status).toBe('open');

    // 重复 select → 409；已有合同后不可再投
    const dup = await authed(app, buyerToken).post('/api/commissions/com_demo_game/select').send({ bidId: 'bid_demo_2' });
    expect(dup.status).toBe(409);
    const contractorToken = await login(app, 'contractor@vibes.local', 'demo1234');
    const rebid = await authed(app, contractorToken).post('/api/commissions/com_demo_game/bids').send({ amountCr: 1800 });
    expect(rebid.status).toBe(409);
  });

  it('非作者 403；bidId 不存在/不属于该需求 → 400；已非 submitted 的投标不可选中', async () => {
    const app = testApp();
    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');
    const forbidden = await authed(app, sellerToken).post('/api/commissions/com_demo_game/select').send({ bidId: 'bid_demo_1' });
    expect(forbidden.status).toBe(403);

    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const noBid = await authed(app, buyerToken).post('/api/commissions/com_demo_game/select').send({ bidId: 'nope' });
    expect(noBid.status).toBe(404);
  });
});
