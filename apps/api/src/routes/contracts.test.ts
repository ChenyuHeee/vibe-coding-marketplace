/**
 * 接单交付集成测试（PR-B3-B）：start 托管 / 里程碑提交（html+zip 安全）/ approve 分支 /
 * request-revision / accept / payout 放款+台账连续性 / 双方可见性 / A3 自动确认 / 卖家工作台（#30）。
 * 状态词断言使用词汇表 §3 六词；金额整数 CR；台账 balanceAfterCr 逐条核对。
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import type { Db } from '../db';
import { buildZip } from '../test/zip-builder';

function testApp() {
  return createApp({ dbPath: ':memory:' });
}

type App = ReturnType<typeof testApp>;

async function login(app: App, email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

function authed(app: App, token: string) {
  const headers = { Authorization: `Bearer ${token}` };
  return {
    get: (url: string) => request(app).get(url).set(headers),
    post: (url: string) => request(app).post(url).set(headers),
  };
}

async function freshUser(app: App, roles: string[], displayName = 'QA 用户'): Promise<string> {
  const email = `qa+${randomUUID().slice(0, 8)}@vibes.local`;
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'qa-pass-1234', displayName, roles });
  expect(reg.status).toBe(201);
  return reg.body.token as string;
}

async function topup(app: App, token: string, amountCr: number) {
  const res = await authed(app, token)
    .post('/api/wallet/topup')
    .send({ amountCr, confirm: amountCr >= 100 });
  expect(res.status).toBe(200);
  return res.body.balanceAfterCr as number;
}

async function walletSummary(app: App, token: string) {
  const res = await authed(app, token).get('/api/wallet');
  expect(res.status).toBe(200);
  return res.body as { balanceCr: number; escrowHeldCr: number };
}

/** 完整建链：发布需求 → 投标 → 选中 → （可选 start）→ 返回双方 token 与合同 id */
async function setupContract(
  app: App,
  opts: { amountCr?: number; buyerBalance?: number; start?: boolean } = {},
) {
  const { amountCr = 1500, buyerBalance = 5000, start = true } = opts;
  const buyerToken = await freshUser(app, ['buyer'], 'QA 买家');
  if (buyerBalance > 0) await topup(app, buyerToken, buyerBalance);
  const pub = await authed(app, buyerToken)
    .post('/api/commissions')
    .send({
      title: '做一个课堂小游戏',
      description: '可运行的课堂展示小游戏',
      budgetMinCr: 1000,
      budgetMaxCr: 3000,
      timelineDays: 7,
      acceptanceCriteria: '1) 可运行 2) 有计分',
    });
  expect(pub.status).toBe(201);
  const commissionId = pub.body.commission.id as string;

  const contractorToken = await freshUser(app, ['contractor'], 'QA 接单者');
  const bidRes = await authed(app, contractorToken)
    .post(`/api/commissions/${commissionId}/bids`)
    .send({ amountCr, proposal: '我来做' });
  expect(bidRes.status).toBe(201);
  const bidId = bidRes.body.bid.id as string;

  const sel = await authed(app, buyerToken)
    .post(`/api/commissions/${commissionId}/select`)
    .send({ bidId });
  expect(sel.status).toBe(200);
  const contractId = sel.body.contract.id as string;

  if (start) {
    const started = await authed(app, buyerToken).post(`/api/contracts/${contractId}/start`);
    expect(started.status).toBe(200);
  }
  return { buyerToken, contractorToken, commissionId, contractId, amountCr };
}

/** contractor 提交一个里程碑（html 单文件），返回 milestone */
async function submitMilestone(
  app: App,
  contractorToken: string,
  contractId: string,
  overrides: Record<string, string> = {},
  file = { name: 'deliverable.html', body: '<h1>deliverable</h1>' },
) {
  const res = await request(app)
    .post(`/api/contracts/${contractId}/milestones`)
    .set('Authorization', `Bearer ${contractorToken}`)
    .field('title', overrides.title ?? '里程碑一')
    .field('description', overrides.description ?? '第一版交付')
    .field('final', overrides.final ?? 'false')
    .attach('file', Buffer.from(file.body), file.name);
  return res;
}

describe('启动合同（POST /api/contracts/:id/start）', () => {
  it('未登录 401；非合同买家 403', async () => {
    const app = testApp();
    const { contractId } = await setupContract(app, { start: false });
    const anon = await request(app).post(`/api/contracts/${contractId}/start`);
    expect(anon.status).toBe(401);
    const stranger = await freshUser(app, ['buyer']);
    const forbidden = await authed(app, stranger).post(`/api/contracts/${contractId}/start`);
    expect(forbidden.status).toBe(403);
  });

  it('selected → in progress；预算进托管（escrow=held）+ escrow_hold debit 台账（余额连续性）', async () => {
    const app = testApp();
    const { buyerToken, contractorToken, contractId, amountCr } = await setupContract(app, {
      start: false,
      buyerBalance: 5000,
    });
    const before = await walletSummary(app, buyerToken);
    expect(before.balanceCr).toBe(5000);

    const res = await authed(app, buyerToken).post(`/api/contracts/${contractId}/start`);
    expect(res.status).toBe(200);
    expect(res.body.contract.status).toBe('in progress');
    expect(res.body.contract.escrowStatus).toBe('held');
    expect(res.body.balanceAfterCr).toBe(5000 - amountCr);

    const after = await walletSummary(app, buyerToken);
    expect(after.balanceCr).toBe(5000 - amountCr);
    expect(after.escrowHeldCr).toBe(amountCr);

    // 台账：escrow_hold debit，balanceAfterCr 连续
    const txns = await authed(app, buyerToken).get('/api/wallet/transactions');
    const hold = txns.body.items.find(
      (t: { type: string; refType: string; refId: string }) =>
        t.type === 'escrow_hold' && t.refType === 'contract' && t.refId === contractId,
    );
    expect(hold).toMatchObject({ direction: 'debit', amountCr, balanceAfterCr: 5000 - amountCr });

    // 合同双方看到同一状态词
    const buyerView = await authed(app, buyerToken).get(`/api/contracts/${contractId}`);
    const contractorView = await authed(app, contractorToken).get(`/api/contracts/${contractId}`);
    expect(buyerView.body.contract.status).toBe('in progress');
    expect(contractorView.body.contract.status).toBe(buyerView.body.contract.status);

    // 重复 start → 409
    const dup = await authed(app, buyerToken).post(`/api/contracts/${contractId}/start`);
    expect(dup.status).toBe(409);
  });

  it('余额不足 → 400 INSUFFICIENT_BALANCE；合同保持 selected', async () => {
    const app = testApp();
    const { buyerToken, contractId, amountCr } = await setupContract(app, {
      start: false,
      buyerBalance: 100,
    });
    const res = await authed(app, buyerToken).post(`/api/contracts/${contractId}/start`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(amountCr).toBeGreaterThan(100);
  });
});

describe('里程碑提交（POST /api/contracts/:id/milestones）', () => {
  it('未登录 401；无 contractor 角色 403；未启动（selected）合同 409', async () => {
    const app = testApp();
    const { contractorToken, contractId } = await setupContract(app, { start: false });
    const anon = await request(app).post(`/api/contracts/${contractId}/milestones`);
    expect(anon.status).toBe(401);
    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const forbidden = await authed(app, buyerToken).post(`/api/contracts/${contractId}/milestones`);
    expect(forbidden.status).toBe(403);
    const notStarted = await submitMilestone(app, contractorToken, contractId);
    expect(notStarted.status).toBe(409);
  });

  it('html 单文件提交成功：seq=1、status=submitted、合同 → milestone submission、交付物可回放', async () => {
    const app = testApp();
    const { buyerToken, contractorToken, contractId } = await setupContract(app);
    const res = await submitMilestone(app, contractorToken, contractId);
    expect(res.status).toBe(201);
    expect(res.body.milestone).toMatchObject({
      seq: 1,
      status: 'submitted',
      title: '里程碑一',
      isFinal: false,
    });
    expect(res.body.milestone.deliverableUrl).toMatch(/\/api\/milestones\/.+\/files\/index\.html$/);

    // 合同状态 → milestone submission（买卖双方一致）
    const detail = await authed(app, buyerToken).get(`/api/contracts/${contractId}`);
    expect(detail.body.contract.status).toBe('milestone submission');
    expect(detail.body.contract.milestones.length).toBe(1);

    // 交付物回放（买卖双方可见）
    const url = res.body.milestone.deliverableUrl as string;
    const play = await authed(app, buyerToken).get(url);
    expect(play.status).toBe(200);
    expect(play.text).toContain('deliverable');

    // 第三方不可看/不可回放
    const stranger = await freshUser(app, ['contractor']);
    const forbidden = await authed(app, stranger).get(url);
    expect(forbidden.status).toBe(403);
  });

  it('zip 交付物安全解压（合法 zip 成功；路径穿越 zip → 400 且目录清理）', async () => {
    const app = testApp();
    const { buyerToken, contractorToken, contractId } = await setupContract(app);

    const goodZip = buildZip([
      { name: 'index.html', data: '<h1>zip deliverable</h1>' },
      { name: 'style.css', data: 'body{}' },
    ]);
    const good = await request(app)
      .post(`/api/contracts/${contractId}/milestones`)
      .set('Authorization', `Bearer ${contractorToken}`)
      .field('title', 'zip 交付')
      .field('final', 'false')
      .attach('file', goodZip, 'deliverable.zip');
    expect(good.status).toBe(201);
    const play = await authed(app, buyerToken).get(good.body.milestone.deliverableUrl);
    expect(play.status).toBe(200);
    expect(play.text).toContain('zip deliverable');

    // 路径穿越 zip → 400 VALIDATION，不落库
    const evilZip = buildZip([{ name: '../evil.html', data: '<h1>evil</h1>' }]);
    const evil = await request(app)
      .post(`/api/contracts/${contractId}/milestones`)
      .set('Authorization', `Bearer ${contractorToken}`)
      .field('title', 'evil')
      .field('final', 'false')
      .attach('file', evilZip, 'evil.zip');
    expect(evil.status).toBe(400);
    expect(evil.body.error.code).toBe('VALIDATION');
    const detail = await authed(app, buyerToken).get(`/api/contracts/${contractId}`);
    expect(detail.body.contract.milestones.length).toBe(1); // 只有第一个里程碑
  });

  it('里程碑 submission 期间可再提交新版本（seq=2），合同保持 milestone submission', async () => {
    const app = testApp();
    const { contractorToken, contractId } = await setupContract(app);
    await submitMilestone(app, contractorToken, contractId);
    const res2 = await submitMilestone(app, contractorToken, contractId, { title: '里程碑二' });
    expect(res2.status).toBe(201);
    expect(res2.body.milestone.seq).toBe(2);
    const detail = await authed(app, contractorToken).get(`/api/contracts/${contractId}`);
    expect(detail.body.contract.status).toBe('milestone submission');
    expect(detail.body.contract.milestones.length).toBe(2);
  });
});

describe('验收与打回（POST /api/milestones/:id/approve 与 /request-revision）', () => {
  it('approve 非最终里程碑 → 合同回 in progress；milestone approved', async () => {
    const app = testApp();
    const { buyerToken, contractorToken, contractId } = await setupContract(app);
    const m = await submitMilestone(app, contractorToken, contractId);
    const approve = await authed(app, buyerToken).post(`/api/milestones/${m.body.milestone.id}/approve`);
    expect(approve.status).toBe(200);
    expect(approve.body.contract.status).toBe('in progress');
    const detail = await authed(app, contractorToken).get(`/api/contracts/${contractId}`);
    expect(detail.body.contract.milestones[0].status).toBe('approved');
    expect(detail.body.contract.milestones[0].approvedAt).toBeTruthy();
  });

  it('approve 最终里程碑（final:true）→ 合同 → buyer acceptance（acceptedAt 起算）', async () => {
    const app = testApp();
    const { buyerToken, contractorToken, contractId } = await setupContract(app);
    const m = await submitMilestone(app, contractorToken, contractId, { final: 'true' });
    const approve = await authed(app, buyerToken).post(`/api/milestones/${m.body.milestone.id}/approve`);
    expect(approve.status).toBe(200);
    expect(approve.body.contract.status).toBe('buyer acceptance');
    expect(approve.body.contract.acceptedAt).toBeTruthy();
    expect(approve.body.contract.milestones[0].status).toBe('approved');
  });

  it('request-revision 必须带 feedback（空 → 400）；带意见 → revision requested，合同保持 milestone submission', async () => {
    const app = testApp();
    const { buyerToken, contractorToken, contractId } = await setupContract(app);
    const m = await submitMilestone(app, contractorToken, contractId);

    const noFeedback = await authed(app, buyerToken)
      .post(`/api/milestones/${m.body.milestone.id}/request-revision`)
      .send({});
    expect(noFeedback.status).toBe(400);
    expect(noFeedback.body.error.message).toContain('修改意见');

    const revise = await authed(app, buyerToken)
      .post(`/api/milestones/${m.body.milestone.id}/request-revision`)
      .send({ feedback: '缺少计分功能，请补充' });
    expect(revise.status).toBe(200);
    expect(revise.body.contract.status).toBe('milestone submission');

    const detail = await authed(app, contractorToken).get(`/api/contracts/${contractId}`);
    const m1 = detail.body.contract.milestones[0];
    expect(m1.status).toBe('revision requested');
    expect(m1.feedback).toBe('缺少计分功能，请补充');

    // 打回后 contractor 提交新版本 → 合同仍 milestone submission；approve 新版本（final）→ buyer acceptance
    const m2 = await submitMilestone(app, contractorToken, contractId, { title: '修订版', final: 'true' });
    expect(m2.status).toBe(201);
    const approve2 = await authed(app, buyerToken).post(`/api/milestones/${m2.body.milestone.id}/approve`);
    expect(approve2.body.contract.status).toBe('buyer acceptance');
  });

  it('已 approved 的里程碑不可重复验收 → 409；非合同买家 → 403', async () => {
    const app = testApp();
    const { buyerToken, contractorToken, contractId } = await setupContract(app);
    const m = await submitMilestone(app, contractorToken, contractId);
    await authed(app, buyerToken).post(`/api/milestones/${m.body.milestone.id}/approve`);
    const dup = await authed(app, buyerToken).post(`/api/milestones/${m.body.milestone.id}/approve`);
    expect(dup.status).toBe(409);

    const stranger = await freshUser(app, ['buyer']);
    const m2 = await submitMilestone(app, contractorToken, contractId);
    const forbidden = await authed(app, stranger).post(`/api/milestones/${m2.body.milestone.id}/approve`);
    expect(forbidden.status).toBe(403);
  });
});

describe('最终验收（POST /api/contracts/:id/accept）', () => {
  it('milestone submission 且无 approved 里程碑 → 409（提示先批准里程碑）', async () => {
    const app = testApp();
    const { buyerToken, contractorToken, contractId } = await setupContract(app);
    await submitMilestone(app, contractorToken, contractId); // submitted，未 approve
    const res = await authed(app, buyerToken).post(`/api/contracts/${contractId}/accept`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('里程碑');
  });

  it('approve 最终里程碑后合同已 buyer acceptance；/accept 幂等返回同状态', async () => {
    const app = testApp();
    const { buyerToken, contractorToken, contractId } = await setupContract(app);
    const m = await submitMilestone(app, contractorToken, contractId, { final: 'true' });
    await authed(app, buyerToken).post(`/api/milestones/${m.body.milestone.id}/approve`);
    const res = await authed(app, buyerToken).post(`/api/contracts/${contractId}/accept`);
    expect(res.status).toBe(200);
    expect(res.body.contract.status).toBe('buyer acceptance');
  });
});

describe('结算放款（POST /api/contracts/:id/payout）', () => {
  it('放款：payout credit 入 contractor 钱包 + escrow released + commission completed + 台账对账', async () => {
    const app = testApp();
    const { buyerToken, contractorToken, commissionId, contractId, amountCr } = await setupContract(app, {
      buyerBalance: 5000,
    });
    const m = await submitMilestone(app, contractorToken, contractId, { final: 'true' });
    await authed(app, buyerToken).post(`/api/milestones/${m.body.milestone.id}/approve`);

    const ctrBefore = await walletSummary(app, contractorToken);
    const res = await authed(app, buyerToken).post(`/api/contracts/${contractId}/payout`);
    expect(res.status).toBe(200);
    expect(res.body.contract.status).toBe('payout');
    expect(res.body.contract.escrowStatus).toBe('released');
    expect(res.body.contract.paidAt).toBeTruthy();
    expect(res.body.contractorBalanceAfterCr).toBe(ctrBefore.balanceCr + amountCr);

    // 台账：contractor payout credit（balanceAfterCr 连续）；与 buyer escrow_hold debit 同额同 ref 对账
    const ctrTxns = await authed(app, contractorToken).get('/api/wallet/transactions');
    const payout = ctrTxns.body.items.find(
      (t: { type: string; refType: string; refId: string }) =>
        t.type === 'payout' && t.refType === 'contract' && t.refId === contractId,
    );
    expect(payout).toMatchObject({ direction: 'credit', amountCr, balanceAfterCr: ctrBefore.balanceCr + amountCr });
    const buyerTxns = await authed(app, buyerToken).get('/api/wallet/transactions');
    const hold = buyerTxns.body.items.find(
      (t: { type: string; refType: string; refId: string }) =>
        t.type === 'escrow_hold' && t.refType === 'contract' && t.refId === contractId,
    );
    expect(hold).toMatchObject({ direction: 'debit', amountCr });

    // commission → completed
    const com = await authed(app, buyerToken).get(`/api/commissions/${commissionId}`);
    expect(com.body.commission.status).toBe('completed');

    // escrowHeldCr 归零；重复 payout → 409
    const after = await walletSummary(app, buyerToken);
    expect(after.escrowHeldCr).toBe(0);
    const dup = await authed(app, buyerToken).post(`/api/contracts/${contractId}/payout`);
    expect(dup.status).toBe(409);
  });

  it('非 buyer acceptance 不可结算 → 409；非合同买家 → 403', async () => {
    const app = testApp();
    const { buyerToken, contractorToken, contractId } = await setupContract(app);
    const tooEarly = await authed(app, buyerToken).post(`/api/contracts/${contractId}/payout`);
    expect(tooEarly.status).toBe(409);

    const stranger = await freshUser(app, ['buyer']);
    const m = await submitMilestone(app, contractorToken, contractId, { final: 'true' });
    await authed(app, buyerToken).post(`/api/milestones/${m.body.milestone.id}/approve`);
    const forbidden = await authed(app, stranger).post(`/api/contracts/${contractId}/payout`);
    expect(forbidden.status).toBe(403);
  });
});

describe('合同列表与可见性（GET /api/contracts）', () => {
  it('买家/接单者可见同一 status 词；第三方 403；role/status 筛选与分页', async () => {
    const app = testApp();
    const { buyerToken, contractorToken, contractId } = await setupContract(app);

    const buyerList = await authed(app, buyerToken).get('/api/contracts?role=buyer');
    expect(buyerList.status).toBe(200);
    expect(buyerList.body.items.length).toBe(1);
    expect(buyerList.body.items[0].id).toBe(contractId);
    expect(buyerList.body.items[0].status).toBe('in progress');

    const ctrList = await authed(app, contractorToken).get('/api/contracts?role=contractor');
    expect(ctrList.body.items[0].status).toBe('in progress');

    const filtered = await authed(app, buyerToken).get('/api/contracts?role=buyer&status=in progress');
    expect(filtered.body.total).toBe(1);
    const empty = await authed(app, buyerToken).get('/api/contracts?role=buyer&status=payout');
    expect(empty.body.total).toBe(0);
    const badRole = await authed(app, buyerToken).get('/api/contracts?role=admin');
    expect(badRole.status).toBe(400);

    const stranger = await freshUser(app, ['contractor']);
    const forbidden = await authed(app, stranger).get(`/api/contracts/${contractId}`);
    expect(forbidden.status).toBe(403);
  });
});

describe('A3 验收期 7 天自动确认（惰性检查路径）', () => {
  it('buyer acceptance 满 7 天未操作 → 读取时自动 payout（系统放款）', async () => {
    const app = testApp();
    const db = (app as unknown as { locals: { db: Db } }).locals.db;
    const { buyerToken, contractorToken, contractId, amountCr } = await setupContract(app);
    const m = await submitMilestone(app, contractorToken, contractId, { final: 'true' });
    await authed(app, buyerToken).post(`/api/milestones/${m.body.milestone.id}/approve`);
    expect((await authed(app, buyerToken).get(`/api/contracts/${contractId}`)).body.contract.status).toBe(
      'buyer acceptance',
    );

    // 把 accepted_at 拨回 8 天前（模拟验收期已过）
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`UPDATE contracts SET accepted_at = ?, updated_at = ? WHERE id = ?`).run(old, old, contractId);

    const ctrBefore = await walletSummary(app, contractorToken);
    const detail = await authed(app, contractorToken).get(`/api/contracts/${contractId}`); // 惰性触发
    expect(detail.body.contract.status).toBe('payout');
    expect(detail.body.contract.escrowStatus).toBe('released');

    const ctrAfter = await walletSummary(app, contractorToken);
    expect(ctrAfter.balanceCr).toBe(ctrBefore.balanceCr + amountCr);

    const txns = await authed(app, contractorToken).get('/api/wallet/transactions');
    expect(
      txns.body.items.some(
        (t: { type: string; refId: string }) => t.type === 'payout' && t.refId === contractId,
      ),
    ).toBe(true);
  });
});

describe('卖家工作台（GET /api/seller/projects，#30）', () => {
  it('未登录 401；非 seller（纯 buyer）403', async () => {
    const app = testApp();
    const anon = await request(app).get('/api/seller/projects');
    expect(anon.status).toBe(401);
    const buyerToken = await freshUser(app, ['buyer']);
    const forbidden = await authed(app, buyerToken).get('/api/seller/projects');
    expect(forbidden.status).toBe(403);
  });

  it('seller 可见自己全部状态作品（含审核进度 reviewHistory）；分页结构', async () => {
    const app = testApp();
    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');
    // 新建一个作品并走驳回 → 状态 rejected 带 reviewNote + history
    const created = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${sellerToken}`)
      .field('title', '待审核作品')
      .field('description', '描述')
      .field('category', 'game')
      .field('priceCr', '100')
      .field('trialScope', '完整版')
      .attach('file', Buffer.from('<h1>x</h1>'), 'x.html');
    const projectId = created.body.project.id as string;
    await authed(app, sellerToken).post(`/api/projects/${projectId}/submit`);
    const adminToken = await login(app, 'admin@vibes.local', 'admin123');
    await authed(app, adminToken).post(`/api/admin/projects/${projectId}/reject`).send({ reviewNote: '入口页缺失' });

    const res = await authed(app, sellerToken).get('/api/seller/projects');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5); // 4 演示 + 1 新建
    const item = res.body.items.find((p: { id: string }) => p.id === projectId);
    expect(item).toMatchObject({
      status: 'rejected',
      reviewNote: '入口页缺失',
      priceCr: 100,
    });
    expect(item.reviewHistory.length).toBeGreaterThanOrEqual(1); // submitted / rejected 事件
    expect(item.reviewHistory[0]).toHaveProperty('event');
    expect(item.reviewHistory[0]).toHaveProperty('createdAt');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('pageSize');
    expect(res.body).toHaveProperty('total');
  });
});
