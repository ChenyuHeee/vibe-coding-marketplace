import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';

function testApp() {
  return createApp({ dbPath: ':memory:' });
}

async function login(app: ReturnType<typeof testApp>, email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

/** supertest v7：request(app) 需先调用 verb（get/post）再链 .set/.query */
function authed(app: ReturnType<typeof testApp>, token: string) {
  const headers = { Authorization: `Bearer ${token}` };
  return {
    get: (url: string) => request(app).get(url).set(headers),
    post: (url: string) => request(app).post(url).set(headers),
  };
}

describe('GET /api/wallet', () => {
  it('未登录 → 401', async () => {
    const res = await request(testApp()).get('/api/wallet');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('buyer：余额 4475 / 托管 525 / 提现中 0（含演示托管订单）', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    const res = await authed(app, token).get('/api/wallet');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      balanceCr: 4475,
      escrowHeldCr: 525,
      currency: 'CR',
      pendingWithdrawalCr: 0,
    });
  });

  it('seller：余额 1500 / 托管 525（待收）/ 提现中 500', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const res = await authed(app, token).get('/api/wallet');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      balanceCr: 1500,
      escrowHeldCr: 525,
      currency: 'CR',
      pendingWithdrawalCr: 500,
    });
  });
});

describe('POST /api/wallet/topup', () => {
  it('小额（<100 CR）无需 confirm 直接入账，台账 balanceAfterCr 正确', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    const res = await authed(app, token).post('/api/wallet/topup').send({ amountCr: 50 });
    expect(res.status).toBe(200);
    expect(res.body.balanceAfterCr).toBe(4525); // 4475 + 50
    expect(res.body.transaction.type).toBe('topup');
    expect(res.body.transaction.direction).toBe('credit');
    expect(res.body.transaction.amountCr).toBe(50);
    expect(res.body.transaction.balanceAfterCr).toBe(4525);

    const me = await authed(app, token).get('/api/wallet');
    expect(me.body.balanceCr).toBe(4525);
  });

  it('大额（≥100 CR）无 confirm → 400 VALIDATION（A1 二次确认）', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    const res = await authed(app, token).post('/api/wallet/topup').send({ amountCr: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('大额带 confirm:true → 成功', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    const res = await authed(app, token).post('/api/wallet/topup').send({ amountCr: 300, confirm: true });
    expect(res.status).toBe(200);
    expect(res.body.balanceAfterCr).toBe(4775); // 4475 + 300
  });

  it('金额非法（0 / 负数 / 小数 / 非数字）→ 400', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    for (const amountCr of [0, -5, 10.5, 'abc', null]) {
      const res = await authed(app, token).post('/api/wallet/topup').send({ amountCr });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION');
    }
  });
});

describe('GET /api/wallet/transactions', () => {
  it('分页 + type/direction 筛选', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');

    const all = await authed(app, token).get('/api/wallet/transactions');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2); // topup 5000 + escrow_hold 525
    expect(all.body.page).toBe(1);
    expect(all.body.pageSize).toBe(20);
    expect(all.body.items[0].type).toBe('escrow_hold');
    expect(all.body.items[0].direction).toBe('debit');
    expect(all.body.items[0].amountCr).toBe(525);
    expect(all.body.items[0].balanceAfterCr).toBe(4475);
    expect(all.body.items[0].refType).toBe('order');

    const held = await authed(app, token).get('/api/wallet/transactions').query({ type: 'escrow_hold' });
    expect(held.body.total).toBe(1);

    const credits = await authed(app, token).get('/api/wallet/transactions').query({ direction: 'credit' });
    expect(credits.body.total).toBe(1);
    expect(credits.body.items[0].type).toBe('topup');

    const paged = await authed(app, token).get('/api/wallet/transactions').query({ page: 2, pageSize: 1 });
    expect(paged.body.total).toBe(2);
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.items[0].type).toBe('topup');
  });

  it('非法 type/direction → 400', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    const badType = await authed(app, token).get('/api/wallet/transactions').query({ type: 'hack' });
    expect(badType.status).toBe(400);
    const badDir = await authed(app, token).get('/api/wallet/transactions').query({ direction: 'sideways' });
    expect(badDir.status).toBe(400);
  });
});

describe('POST /api/wallet/withdrawals', () => {
  it('余额不足 → 400 INSUFFICIENT_BALANCE', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const res = await authed(app, token)
      .post('/api/wallet/withdrawals')
      .send({ amountCr: 99999, bankName: '测试银行', cardLast4: '1234', holderName: '演示卖家' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('银行卡后四位非法 → 400 VALIDATION', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    for (const cardLast4 of ['12', 'abcd', '', '12345']) {
      const res = await authed(app, token)
        .post('/api/wallet/withdrawals')
        .send({ amountCr: 100, bankName: '测试银行', cardLast4, holderName: '演示买家' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION');
    }
  });

  it('提现成功：创建 withdrawal pending + etaDays 1–3，余额扣减，台账 balanceAfterCr 正确', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    const res = await authed(app, token)
      .post('/api/wallet/withdrawals')
      .send({ amountCr: 300, bankName: '测试银行', cardLast4: '4321', holderName: '演示买家' });
    expect(res.status).toBe(201);
    expect(res.body.withdrawal.status).toBe('withdrawal pending');
    expect(res.body.withdrawal.etaDays).toBeGreaterThanOrEqual(1);
    expect(res.body.withdrawal.etaDays).toBeLessThanOrEqual(3);
    expect(res.body.withdrawal.cardLast4).toBe('4321');
    expect(res.body.withdrawal.amountCr).toBe(300);

    const wallet = await authed(app, token).get('/api/wallet');
    expect(wallet.body.balanceCr).toBe(4175); // 4475 - 300
    expect(wallet.body.pendingWithdrawalCr).toBe(300);

    const txns = await authed(app, token).get('/api/wallet/transactions').query({ type: 'withdrawal' });
    expect(txns.body.total).toBe(1);
    expect(txns.body.items[0].direction).toBe('debit');
    expect(txns.body.items[0].amountCr).toBe(300);
    expect(txns.body.items[0].balanceAfterCr).toBe(4175);
    expect(txns.body.items[0].refType).toBe('withdrawal');
  });
});

describe('GET /api/wallet/withdrawals', () => {
  it('按状态筛选', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const all = await authed(app, token).get('/api/wallet/withdrawals');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(1);
    expect(all.body.items[0].amountCr).toBe(500);
    expect(all.body.items[0].status).toBe('withdrawal pending');
    expect(all.body.items[0].etaDays).toBe(2);
    expect(all.body.items[0].bankName).toBe('演示银行');

    const pending = await authed(app, token)
      .get('/api/wallet/withdrawals')
      .query({ status: 'withdrawal pending' });
    expect(pending.body.total).toBe(1);
    const done = await authed(app, token)
      .get('/api/wallet/withdrawals')
      .query({ status: 'withdrawal completed' });
    expect(done.body.total).toBe(0);
  });
});

describe('GET /api/wallet/escrow', () => {
  it('buyer 视角：order in / 我(买家)；seller 视角：order out / 我(卖家/接单者)', async () => {
    const app = testApp();
    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');

    const buyerRes = await authed(app, buyerToken).get('/api/wallet/escrow');
    expect(buyerRes.status).toBe(200);
    expect(buyerRes.body.items).toHaveLength(1);
    expect(buyerRes.body.items[0]).toMatchObject({
      refType: 'order',
      refId: 'ord_demo_1',
      direction: 'in',
      amountCr: 525,
      escrowStatus: 'held',
      party: '我(买家)',
    });
    expect(buyerRes.body.items[0].eta).toBe('退款窗口内可申请退回');

    const sellerRes = await authed(app, sellerToken).get('/api/wallet/escrow');
    expect(sellerRes.body.items).toHaveLength(1);
    expect(sellerRes.body.items[0]).toMatchObject({
      refType: 'order',
      refId: 'ord_demo_1',
      direction: 'out',
      amountCr: 525,
      escrowStatus: 'held',
      party: '我(卖家/接单者)',
    });
    expect(sellerRes.body.items[0].eta).toBe('验收通过后即时到账');
  });

  it('contractor 视角：无托管记录 → 空列表', async () => {
    const app = testApp();
    const token = await login(app, 'contractor@vibes.local', 'demo1234');
    const res = await authed(app, token).get('/api/wallet/escrow');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });
});
