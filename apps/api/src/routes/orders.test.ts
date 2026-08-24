/**
 * 订单 / 支付 / 退款 / My Library / 评分 集成测试（PR-B2-B）。
 * 金额断言：整数 CR，手续费 = Math.floor(priceCr * 0.05)（A5）；台账 balanceAfterCr 逐条核对。
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { getDb } from '../db';

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
  };
}

/** 注册新买家并充值（余额可控，用于余额不足/退款窗口测试） */
async function freshBuyer(app: ReturnType<typeof testApp>, balanceCr: number) {
  const email = `qa+${randomUUID().slice(0, 8)}@vibes.local`;
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'qa-pass-1234', displayName: 'QA 买家', roles: ['buyer'] });
  expect(reg.status).toBe(201);
  const token = reg.body.token as string;
  if (balanceCr > 0) {
    const topup = await authed(app, token)
      .post('/api/wallet/topup')
      .send({ amountCr: balanceCr, confirm: balanceCr >= 100 });
    expect(topup.status).toBe(200);
  }
  return token;
}

/** 卖家新建并上架一个作品（价格可指定） */
async function createApprovedProject(app: ReturnType<typeof testApp>, priceCr: number, title = '测试作品') {
  const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');
  const created = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${sellerToken}`)
    .field('title', title)
    .field('description', '测试描述')
    .field('category', 'game')
    .field('priceCr', String(priceCr))
    .field('trialScope', '完整版')
    .attach('file', Buffer.from('<h1>test</h1>'), 'game.html');
  expect(created.status).toBe(201);
  const id = created.body.project.id as string;
  await authed(app, sellerToken).post(`/api/projects/${id}/submit`);
  const adminToken = await login(app, 'admin@vibes.local', 'admin123');
  const approved = await authed(app, adminToken).post(`/api/admin/projects/${id}/approve`);
  expect(approved.status).toBe(200);
  return id;
}

describe('下单（POST /api/orders）', () => {
  it('未登录 → 401', async () => {
    const res = await request(testApp()).post('/api/orders').send({ projectId: 'proj_breakout' });
    expect(res.status).toBe(401);
  });

  it('无 buyer 角色（纯 contractor）→ 403', async () => {
    const app = testApp();
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: `c+${randomUUID().slice(0, 8)}@vibes.local`, password: 'qa-pass-1234', displayName: 'C', roles: ['contractor'] });
    const res = await authed(app, reg.body.token).post('/api/orders').send({ projectId: 'proj_breakout' });
    expect(res.status).toBe(403);
  });

  it('成功下单：总价 = price + fee(5% 取整)，status=pending payment，escrow=none', async () => {
    const app = testApp();
    const token = await freshBuyer(app, 0);
    const res = await authed(app, token).post('/api/orders').send({ projectId: 'proj_breakout' });
    expect(res.status).toBe(201);
    expect(res.body.order.priceCr).toBe(600);
    expect(res.body.order.feeCr).toBe(30); // floor(600 * 0.05)
    expect(res.body.order.totalCr).toBe(630);
    expect(res.body.order.status).toBe('pending payment');
    expect(res.body.order.escrowStatus).toBe('none');
    expect(res.body.order.orderNo).toMatch(/^VCM\d{12}$/);
  });

  it('不能购买自己的作品；未上架作品 CONFLICT；重复下单 CONFLICT', async () => {
    const app = testApp();
    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');
    const own = await authed(app, sellerToken).post('/api/orders').send({ projectId: 'proj_snake' });
    expect(own.status).toBe(400);

    const draftId = await createDraftProject(app);
    const buyerToken = await freshBuyer(app, 0);
    const draftOrder = await authed(app, buyerToken).post('/api/orders').send({ projectId: draftId });
    expect(draftOrder.status).toBe(409);

    // buyer 已有演示订单（paid）购买 proj_snake → 重复下单 409
    const buyerDemo = await login(app, 'buyer@vibes.local', 'demo1234');
    const dup = await authed(app, buyerDemo).post('/api/orders').send({ projectId: 'proj_snake' });
    expect(dup.status).toBe(409);
  });

  it('quote：下单后查看实际应付总额；非本人 403', async () => {
    const app = testApp();
    const token = await freshBuyer(app, 0);
    const created = await authed(app, token).post('/api/orders').send({ projectId: 'proj_markdown' });
    const orderId = created.body.order.id;
    const quote = await authed(app, token).get(`/api/orders/${orderId}/quote`);
    expect(quote.status).toBe(200);
    expect(quote.body).toMatchObject({ projectId: 'proj_markdown', priceCr: 300, feeCr: 15, totalCr: 315 });

    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');
    const forbidden = await authed(app, sellerToken).get(`/api/orders/${orderId}/quote`);
    expect(forbidden.status).toBe(403);
  });
});

describe('支付（POST /api/orders/:id/pay）', () => {
  it('余额不足 → 400 INSUFFICIENT_BALANCE', async () => {
    const app = testApp();
    const token = await freshBuyer(app, 100); // 100 < 630
    const created = await authed(app, token).post('/api/orders').send({ projectId: 'proj_breakout' });
    const pay = await authed(app, token).post(`/api/orders/${created.body.order.id}/pay`);
    expect(pay.status).toBe(400);
    expect(pay.body.error.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('支付成功：扣款进托管、台账 balanceAfterCr 连续、支付即交付 delivered', async () => {
    const app = testApp();
    const token = await freshBuyer(app, 1000);
    const created = await authed(app, token).post('/api/orders').send({ projectId: 'proj_breakout' });
    const orderId = created.body.order.id;

    const pay = await authed(app, token).post(`/api/orders/${orderId}/pay`);
    expect(pay.status).toBe(200);
    expect(pay.body.order.status).toBe('delivered'); // 支付即交付
    expect(pay.body.order.escrowStatus).toBe('held');
    expect(pay.body.order.paidAt).toBeTruthy();
    expect(pay.body.order.deliveredAt).toBeTruthy();
    expect(pay.body.balanceAfterCr).toBe(370); // 1000 - 630

    // 台账：escrow_hold debit 630，余额连续
    const tx = await authed(app, token).get('/api/wallet/transactions?type=escrow_hold');
    const hold = tx.body.items.find((t: { refId: string }) => t.refId === orderId);
    expect(hold).toBeTruthy();
    expect(hold.direction).toBe('debit');
    expect(hold.amountCr).toBe(630);
    expect(hold.balanceAfterCr).toBe(370);

    // 钱包总览：余额 370、托管 630
    const wallet = await authed(app, token).get('/api/wallet');
    expect(wallet.body.balanceCr).toBe(370);
    expect(wallet.body.escrowHeldCr).toBe(630);

    // 重复支付 → 409
    const again = await authed(app, token).post(`/api/orders/${orderId}/pay`);
    expect(again.status).toBe(409);
  });

  it('免费作品（priceCr=0）：支付直接 completed，escrow=none，无台账', async () => {
    const app = testApp();
    const projectId = await createApprovedProject(app, 0, '免费小工具');
    const token = await freshBuyer(app, 0);
    const created = await authed(app, token).post('/api/orders').send({ projectId });
    expect(created.body.order.totalCr).toBe(0);
    const pay = await authed(app, token).post(`/api/orders/${created.body.order.id}/pay`);
    expect(pay.status).toBe(200);
    expect(pay.body.order.status).toBe('completed');
    expect(pay.body.order.escrowStatus).toBe('none');
    const tx = await authed(app, token).get('/api/wallet/transactions');
    expect(tx.body.items).toHaveLength(0); // 免费无资金流动
  });
});

describe('取消（POST /api/orders/:id/cancel）', () => {
  it('未付款一步取消 → cancelled；余额无变化；已支付不可取消', async () => {
    const app = testApp();
    const token = await freshBuyer(app, 0);
    const created = await authed(app, token).post('/api/orders').send({ projectId: 'proj_pixel' });
    const orderId = created.body.order.id;
    const cancelled = await authed(app, token).post(`/api/orders/${orderId}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.order.status).toBe('cancelled');
    expect(cancelled.body.order.cancelledAt).toBeTruthy();

    const again = await authed(app, token).post(`/api/orders/${orderId}/cancel`);
    expect(again.status).toBe(409);

    // 取消后可重新下单
    const reorder = await authed(app, token).post('/api/orders').send({ projectId: 'proj_pixel' });
    expect(reorder.status).toBe(201);
  });
});

describe('退款（POST /api/orders/:id/refund）', () => {
  it('14 天内退款：escrow held→refunded，全额退回，台账 refund credit', async () => {
    const app = testApp();
    const token = await freshBuyer(app, 1000);
    const created = await authed(app, token).post('/api/orders').send({ projectId: 'proj_markdown' });
    const orderId = created.body.order.id;
    await authed(app, token).post(`/api/orders/${orderId}/pay`);
    expect((await authed(app, token).get('/api/wallet')).body.balanceCr).toBe(685); // 1000-315

    const refund = await authed(app, token).post(`/api/orders/${orderId}/refund`);
    expect(refund.status).toBe(200);
    expect(refund.body.order.status).toBe('refunded');
    expect(refund.body.order.escrowStatus).toBe('refunded');
    expect(refund.body.refundedCr).toBe(315);
    expect(refund.body.balanceAfterCr).toBe(1000);

    const tx = await authed(app, token).get('/api/wallet/transactions?type=refund');
    const row = tx.body.items.find((t: { refId: string }) => t.refId === orderId);
    expect(row.direction).toBe('credit');
    expect(row.amountCr).toBe(315);
    expect(row.balanceAfterCr).toBe(1000);

    // 退款后失去访问权
    const lib = await authed(app, token).get('/api/library');
    expect(lib.body.items.some((i: { orderId: string }) => i.orderId === orderId)).toBe(false);
  });

  it('超过 14 天退款窗口 → 409；未付款订单不可退款', async () => {
    const app = testApp();
    const token = await freshBuyer(app, 1000);
    const created = await authed(app, token).post('/api/orders').send({ projectId: 'proj_markdown' });
    const orderId = created.body.order.id;
    await authed(app, token).post(`/api/orders/${orderId}/pay`);

    // 把订单创建时间改为 15 天前
    const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    getDb(app).prepare('UPDATE orders SET created_at = ? WHERE id = ?').run(old, orderId);
    const late = await authed(app, token).post(`/api/orders/${orderId}/refund`);
    expect(late.status).toBe(409);
    expect(late.body.error.message).toContain('14 天');

    // 未付款订单不可退款
    const created2 = await authed(app, token).post('/api/orders').send({ projectId: 'proj_pixel' });
    const unpaid = await authed(app, token).post(`/api/orders/${created2.body.order.id}/refund`);
    expect(unpaid.status).toBe(409);
  });
});

describe('确认收货（POST /api/orders/:id/confirm）', () => {
  it('delivered→completed：escrow released，卖家余额入账 priceCr（fee 归平台）', async () => {
    const app = testApp();
    const token = await freshBuyer(app, 1000);
    const created = await authed(app, token).post('/api/orders').send({ projectId: 'proj_breakout' });
    const orderId = created.body.order.id;
    await authed(app, token).post(`/api/orders/${orderId}/pay`);

    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');
    expect((await authed(app, sellerToken).get('/api/wallet')).body.balanceCr).toBe(1500);

    const confirm = await authed(app, token).post(`/api/orders/${orderId}/confirm`);
    expect(confirm.status).toBe(200);
    expect(confirm.body.order.status).toBe('completed');
    expect(confirm.body.order.escrowStatus).toBe('released');
    expect(confirm.body.sellerBalanceAfterCr).toBe(2100); // 1500 + 600（fee 30 归平台）

    // 卖家台账 escrow_release credit 600
    const tx = await authed(app, sellerToken).get('/api/wallet/transactions?type=escrow_release');
    const row = tx.body.items.find((t: { refId: string }) => t.refId === orderId);
    expect(row.direction).toBe('credit');
    expect(row.amountCr).toBe(600);
    expect(row.balanceAfterCr).toBe(2100);

    // 买家托管释放
    const wallet = await authed(app, token).get('/api/wallet');
    expect(wallet.body.balanceCr).toBe(370);
    expect(wallet.body.escrowHeldCr).toBe(0);
  });
});

describe('订单列表（GET /api/orders）', () => {
  it('buyer / seller 视角与 status 筛选', async () => {
    const app = testApp();
    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');

    // buyer 视角：含演示订单 ord_demo_1
    const buyerList = await authed(app, buyerToken).get('/api/orders');
    expect(buyerList.status).toBe(200);
    expect(buyerList.body.items.some((o: { id: string }) => o.id === 'ord_demo_1')).toBe(true);
    expect(buyerList.body.items[0]).toHaveProperty('totalCr');

    // seller 视角：售出订单
    const sellerList = await authed(app, sellerToken).get('/api/orders?role=seller');
    expect(sellerList.body.items.some((o: { id: string }) => o.id === 'ord_demo_1')).toBe(true);

    // status 筛选：demo 订单是 paid
    const paidOnly = await authed(app, buyerToken).get('/api/orders?status=paid');
    expect(paidOnly.body.items.every((o: { status: string }) => o.status === 'paid')).toBe(true);

    // 非法 role / status → 400
    expect((await authed(app, buyerToken).get('/api/orders?role=admin')).status).toBe(400);
    expect((await authed(app, buyerToken).get('/api/orders?status=weird')).status).toBe(400);
  });

  it('订单详情：买卖双方可见，无关用户 403', async () => {
    const app = testApp();
    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');
    const contractorToken = await login(app, 'contractor@vibes.local', 'demo1234');

    expect((await authed(app, buyerToken).get('/api/orders/ord_demo_1')).status).toBe(200);
    expect((await authed(app, sellerToken).get('/api/orders/ord_demo_1')).status).toBe(200);
    expect((await authed(app, contractorToken).get('/api/orders/ord_demo_1')).status).toBe(403);
  });
});

describe('My Library（GET /api/library）', () => {
  it('已购列表含 delisted 作品；run 返回 playUrl；未购 403', async () => {
    const app = testApp();
    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');

    const lib = await authed(app, buyerToken).get('/api/library');
    expect(lib.status).toBe(200);
    expect(lib.body.items.some((i: { project: { id: string } }) => i.project.id === 'proj_snake')).toBe(true);

    const run = await authed(app, buyerToken).get('/api/library/proj_snake/run');
    expect(run.status).toBe(200);
    expect(run.body.playUrl).toBe('/play/proj_snake');

    // 下架后：library 仍含该作品（已购买家保留访问权），run 仍可用
    await authed(app, sellerToken).post('/api/projects/proj_snake/delist').send({ reason: '测试下架' });
    const after = await authed(app, buyerToken).get('/api/library');
    expect(after.body.items.some((i: { project: { id: string } }) => i.project.id === 'proj_snake')).toBe(true);
    expect((await authed(app, buyerToken).get('/api/library/proj_snake/run')).status).toBe(200);

    // 未购用户 run → 403
    const contractorToken = await login(app, 'contractor@vibes.local', 'demo1234');
    expect((await authed(app, contractorToken).get('/api/library/proj_snake/run')).status).toBe(403);
  });
});

describe('评分（POST /api/projects/:id/reviews）', () => {
  it('未购 403；rating 越界 400；成功更新作品与卖家聚合评分；一人一作一评 409', async () => {
    const app = testApp();
    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const contractorToken = await login(app, 'contractor@vibes.local', 'demo1234');
    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');

    // 未购 → 403（contractor 有 buyer 角色但未购买 proj_snake）
    expect(
      (await authed(app, contractorToken).post('/api/projects/proj_snake/reviews').send({ rating: 5 })).status,
    ).toBe(403);

    // 越界评分 → 400
    for (const bad of [0, 6, 1.5, 'x']) {
      const res = await authed(app, buyerToken).post('/api/projects/proj_snake/reviews').send({ rating: bad });
      expect(res.status).toBe(400);
    }

    // 成功评分
    const review = await authed(app, buyerToken)
      .post('/api/projects/proj_snake/reviews')
      .send({ rating: 5, comment: '很好玩，值得购买！' });
    expect(review.status).toBe(201);
    expect(review.body.review.rating).toBe(5);
    expect(review.body.review.user.displayName).toBe('演示买家');

    // 作品聚合更新
    const detail = await request(app).get('/api/projects/proj_snake');
    expect(detail.body.avgRating).toBe(5);
    expect(detail.body.ratingCount).toBe(1);
    expect(detail.body.reviews).toHaveLength(1);
    // 卖家聚合更新
    const sellerProfile = await authed(app, sellerToken).get('/api/auth/me');
    expect(sellerProfile.body.user.ratingAvg).toBe(5);
    expect(sellerProfile.body.user.ratingCount).toBe(1);

    // 重复评分 → 409
    const dup = await authed(app, buyerToken).post('/api/projects/proj_snake/reviews').send({ rating: 4 });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toContain('一人一作一评');
  });
});

/** 建一个 draft 作品（不上架），用于「未上架不可购买」测试 */
async function createDraftProject(app: ReturnType<typeof testApp>) {
  const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');
  const created = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${sellerToken}`)
    .field('title', '草稿作品')
    .field('description', 'd')
    .field('category', 'game')
    .field('priceCr', '10')
    .field('trialScope', 's')
    .attach('file', Buffer.from('<h1>draft</h1>'), 'game.html');
  expect(created.status).toBe(201);
  return created.body.project.id as string;
}
