/**
 * 作品线集成测试（PR-B2-A）：上传校验 / zip 安全 / 审核状态机 / 市场 / /play / 举报 / 下载。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { getDb } from '../db';
import { buildZip } from '../test/zip-builder';
import { PLAY_CSP } from './play';

const appDirs: string[] = [];

function testApp() {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-proj-test-'));
  appDirs.push(uploadsDir);
  return createApp({ dbPath: ':memory:', uploadsDir });
}

afterAll(() => {
  for (const dir of appDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

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

const HTML = '<!DOCTYPE html><html><head><title>t</title></head><body><h1>hi</h1></body></html>';

interface UploadOverrides {
  title?: string;
  description?: string;
  category?: string;
  priceCr?: string;
  trialScope?: string;
  filename?: string;
  html?: string;
  fileBuffer?: Buffer;
}

async function uploadHtml(
  app: ReturnType<typeof testApp>,
  token: string,
  overrides: UploadOverrides = {},
) {
  const fileBuf = overrides.fileBuffer ?? Buffer.from(overrides.html ?? HTML);
  const req = request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .field('title', overrides.title ?? '测试作品')
    .field('description', overrides.description ?? '一个用于测试的作品')
    .field('category', overrides.category ?? 'game')
    .field('priceCr', overrides.priceCr ?? '0')
    .field('trialScope', overrides.trialScope ?? '完整版可玩')
    .attach('file', fileBuf, overrides.filename ?? 'game.html');
  return req;
}

describe('上传（POST /api/projects）', () => {
  it('未登录 → 401', async () => {
    const res = await request(testApp()).post('/api/projects').attach('file', Buffer.from(HTML), 'a.html');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('无 seller 角色（buyer）→ 403', async () => {
    const app = testApp();
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    const res = await authed(app, token).post('/api/projects').attach('file', Buffer.from(HTML), 'a.html');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('缺 file → 400', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const res = await authed(app, token)
      .post('/api/projects')
      .field('title', 'x')
      .field('description', 'd')
      .field('category', 'game')
      .field('priceCr', '0')
      .field('trialScope', 's');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('缺标题 / 非法分类 / 负数价格 → 400', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    let res = await uploadHtml(app, token, { title: '  ' });
    expect(res.status).toBe(400);
    res = await uploadHtml(app, token, { category: 'nope' });
    expect(res.status).toBe(400);
    res = await uploadHtml(app, token, { priceCr: '-1' });
    expect(res.status).toBe(400);
  });

  it('非 html/zip 文件 → 400', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const res = await uploadHtml(app, token, { filename: 'evil.exe', html: 'MZ...' });
    expect(res.status).toBe(400);
  });

  it('单 html 上传成功 → 201 draft，index.html 落盘', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const res = await uploadHtml(app, token, { priceCr: '300' });
    expect(res.status).toBe(201);
    expect(res.body.project.status).toBe('draft');
    expect(res.body.project.priceCr).toBe(300);
    const dir = app.locals.uploadsDir as string;
    const html = fs.readFileSync(path.join(dir, 'projects', res.body.project.id, 'index.html'), 'utf8');
    expect(html).toContain('<h1>hi</h1>');
  });

  it('单 html 超过 20MB → 400', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const big = Buffer.alloc(20 * 1024 * 1024 + 1, 'x');
    const res = await uploadHtml(app, token, { html: big.toString('utf8') });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('20MB');
  });

  it('zip 上传成功 → 201 draft，入口 index.html', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const zip = buildZip([
      { name: 'index.html', data: '<h1>zip</h1>' },
      { name: 'assets/app.js', data: 'console.log(1)' },
    ]);
    const res = await uploadHtml(app, token, { filename: 'proj.zip', fileBuffer: zip });
    expect(res.status).toBe(201);
    expect(res.body.project.status).toBe('draft');
  });

  it('坏 zip → 400', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const res = await uploadHtml(app, token, { filename: 'bad.zip', fileBuffer: Buffer.from('this is not a zip') });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('zip 含路径穿越 → 400，目录被清理', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const zip = buildZip([
      { name: 'index.html', data: '<h1>ok</h1>' },
      { name: '../evil.html', data: 'x' },
    ]);
    const res = await uploadHtml(app, token, { filename: 'evil.zip', fileBuffer: zip });
    expect(res.status).toBe(400);
    // 项目目录被清理（不会残留半成品）
    const dir = app.locals.uploadsDir as string;
    const leftovers = fs.readdirSync(path.join(dir, 'projects')).filter((d) => d.length === 36);
    expect(leftovers).toHaveLength(0);
  });

  it('zip 无 html 入口 → 400', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const zip = buildZip([{ name: 'a.css', data: 'body{}' }]);
    const res = await uploadHtml(app, token, { filename: 'nohtml.zip', fileBuffer: zip });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('HTML');
  });

  it('带封面上传 → coverUrl 可访问', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'); // 1x1 PNG 头部
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .field('title', '封面作品')
      .field('description', 'd')
      .field('category', 'art')
      .field('priceCr', '10')
      .field('trialScope', 's')
      .attach('file', Buffer.from(HTML), 'game.html')
      .attach('cover', png, 'cover.png');
    expect(res.status).toBe(201);
    const coverUrl = res.body.project.coverUrl as string;
    expect(coverUrl).toMatch(/^\/api\/files\/.+\/cover\.png$/);
    // 草稿期封面仅作者可见（匿名 404）
    expect((await request(app).get(coverUrl)).status).toBe(404);
    const coverRes = await authed(app, token).get(coverUrl);
    expect(coverRes.status).toBe(200);
    expect(coverRes.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('审核流（submit / review / admin / delist）', () => {
  it('submit：draft → under review（词汇表：提交后自动进入）', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const created = await uploadHtml(app, token);
    expect(created.body.project.status).toBe('draft');
    const res = await authed(app, token).post(`/api/projects/${created.body.project.id}/submit`);
    expect(res.status).toBe(200);
    expect(res.body.project.status).toBe('under review');
  });

  it('非作者 submit → 403；approved 后再 submit → 409', async () => {
    const app = testApp();
    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');
    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const created = await uploadHtml(app, sellerToken);
    const id = created.body.project.id;
    const forbidden = await authed(app, buyerToken).post(`/api/projects/${id}/submit`);
    expect(forbidden.status).toBe(403);

    const adminToken = await login(app, 'admin@vibes.local', 'admin123');
    await authed(app, sellerToken).post(`/api/projects/${id}/submit`);
    await authed(app, adminToken).post(`/api/admin/projects/${id}/approve`);
    const again = await authed(app, sellerToken).post(`/api/projects/${id}/submit`);
    expect(again.status).toBe(409);
  });

  it('审核进度：status + history 含 submitted 事件', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const created = await uploadHtml(app, token);
    await authed(app, token).post(`/api/projects/${created.body.project.id}/submit`);
    const res = await authed(app, token).get(`/api/projects/${created.body.project.id}/review`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('under review');
    expect(res.body.submittedAt).toBeTruthy();
    expect(res.body.history.map((h: { event: string }) => h.event)).toContain('submitted');
  });

  it('admin 队列：非 admin 403；?status=under review 可见新提交', async () => {
    const app = testApp();
    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');
    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const adminToken = await login(app, 'admin@vibes.local', 'admin123');

    expect((await authed(app, buyerToken).get('/api/admin/projects')).status).toBe(403);

    const created = await uploadHtml(app, sellerToken);
    await authed(app, sellerToken).post(`/api/projects/${created.body.project.id}/submit`);

    const queue = await authed(app, adminToken).get('/api/admin/projects?status=under review');
    expect(queue.status).toBe(200);
    const ids = queue.body.items.map((p: { id: string }) => p.id);
    expect(ids).toContain(created.body.project.id);
  });

  it('approve → approved + publishedAt；进市场列表', async () => {
    const app = testApp();
    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');
    const adminToken = await login(app, 'admin@vibes.local', 'admin123');
    const created = await uploadHtml(app, sellerToken, { title: '即将上架' });
    const id = created.body.project.id;
    await authed(app, sellerToken).post(`/api/projects/${id}/submit`);

    const res = await authed(app, adminToken).post(`/api/admin/projects/${id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.project.status).toBe('approved');
    expect(res.body.project.publishedAt).toBeTruthy();

    const list = await request(app).get('/api/projects?q=即将上架');
    expect(list.body.items.map((p: { id: string }) => p.id)).toContain(id);
  });

  it('reject：无 reviewNote → 400；有 → rejected + 作者可修改重提', async () => {
    const app = testApp();
    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');
    const adminToken = await login(app, 'admin@vibes.local', 'admin123');
    const created = await uploadHtml(app, sellerToken);
    const id = created.body.project.id;
    await authed(app, sellerToken).post(`/api/projects/${id}/submit`);

    const noNote = await authed(app, adminToken).post(`/api/admin/projects/${id}/reject`);
    expect(noNote.status).toBe(400);
    expect(noNote.body.error.message).toContain('reviewNote');

    const rejected = await authed(app, adminToken)
      .post(`/api/admin/projects/${id}/reject`)
      .send({ reviewNote: '入口页加载失败，请检查后重提' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.project.status).toBe('rejected');

    const progress = await authed(app, sellerToken).get(`/api/projects/${id}/review`);
    expect(progress.body.reviewNote).toContain('入口页加载失败');

    // 修改元数据 + 重提
    await authed(app, sellerToken)
      .put(`/api/projects/${id}`)
      .field('title', '修改后的标题')
      .field('description', '改')
      .field('category', 'game')
      .field('priceCr', '0')
      .field('trialScope', 's');
    const resubmit = await authed(app, sellerToken).post(`/api/projects/${id}/submit`);
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.project.status).toBe('under review');
    const after = await authed(app, sellerToken).get(`/api/projects/${id}/review`);
    const events = after.body.history.map((h: { event: string }) => h.event);
    expect(events.filter((e: string) => e === 'submitted')).toHaveLength(2);
  });

  it('delist：reason 必填；下架后公开不可见，已购买家保留访问', async () => {
    const app = testApp();
    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');
    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const adminToken = await login(app, 'admin@vibes.local', 'admin123');

    // 演示数据：buyer 已购 proj_snake（ord_demo_1，paid）
    const snakeId = 'proj_snake';
    const noReason = await authed(app, sellerToken).post(`/api/projects/${snakeId}/delist`);
    expect(noReason.status).toBe(400);

    const delisted = await authed(app, sellerToken)
      .post(`/api/projects/${snakeId}/delist`)
      .send({ reason: '版权问题，下架重做' });
    expect(delisted.status).toBe(200);
    expect(delisted.body.project.status).toBe('delisted');

    // 公开列表不再出现
    const list = await request(app).get('/api/projects');
    expect(list.body.items.map((p: { id: string }) => p.id)).not.toContain(snakeId);
    // 匿名详情 404
    expect((await request(app).get(`/api/projects/${snakeId}`)).status).toBe(404);
    // 作者详情可见
    const authorDetail = await authed(app, sellerToken).get(`/api/projects/${snakeId}`);
    expect(authorDetail.status).toBe(200);
    expect(authorDetail.body.status).toBe('delisted');
    // 已购买家详情可见 + 试玩可用
    const buyerDetail = await authed(app, buyerToken).get(`/api/projects/${snakeId}`);
    expect(buyerDetail.status).toBe(200);
    expect(buyerDetail.body.isPurchased).toBe(true);
    expect((await authed(app, buyerToken).get(`/play/${snakeId}`)).status).toBe(200);
    // 未购用户（contractor）不可见
    const contractorToken = await login(app, 'contractor@vibes.local', 'demo1234');
    expect((await authed(app, contractorToken).get(`/api/projects/${snakeId}`)).status).toBe(404);

    // admin 队列仍可见（管理需要）
    const queue = await authed(app, adminToken).get('/api/admin/projects?status=delisted');
    expect(queue.body.items.map((p: { id: string }) => p.id)).toContain(snakeId);
  });
});

describe('市场（GET /api/projects 等）', () => {
  it('列表只含 approved（种子 4 个；新建 draft 不出现）', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    await uploadHtml(app, token); // draft
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(4);
    for (const p of res.body.items) expect(p.status).toBe('approved');
    const first = res.body.items[0];
    expect(first).toHaveProperty('title');
    expect(first).toHaveProperty('category');
    expect(first).toHaveProperty('priceCr');
    expect(first).toHaveProperty('playUrl', `/play/${first.id}`);
    expect(first.seller.displayName).toBeTruthy();
  });

  it('category / q / minRating / sort 筛选', async () => {
    const app = testApp();
    const game = await request(app).get('/api/projects?category=game');
    expect(game.body.items).toHaveLength(2);
    const tool = await request(app).get('/api/projects?category=tool');
    expect(tool.body.items).toHaveLength(1);
    expect(tool.body.items[0].id).toBe('proj_markdown');

    const q = await request(app).get('/api/projects?q=贪吃蛇');
    expect(q.body.items.map((p: { id: string }) => p.id)).toContain('proj_snake');

    const asc = await request(app).get('/api/projects?sort=price_asc');
    expect(asc.body.items[0].priceCr).toBe(300);
    const desc = await request(app).get('/api/projects?sort=price_desc');
    expect(desc.body.items[0].priceCr).toBe(600);

    const db = getDb(app);
    db.prepare('UPDATE projects SET avg_rating = 4.8, rating_count = 5 WHERE id = ?').run('proj_snake');
    const rated = await request(app).get('/api/projects?minRating=4');
    expect(rated.body.items.map((p: { id: string }) => p.id)).toEqual(['proj_snake']);
    const none = await request(app).get('/api/projects?minRating=5');
    expect(none.body.items).toHaveLength(0);
  });

  it('非法 sort → 400', async () => {
    const res = await request(testApp()).get('/api/projects?sort=whatever');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('详情字段齐全（含 playUrl/priceCr/trialScope/seller/reviews/isPurchased/canDownload）', async () => {
    const app = testApp();
    const res = await request(app).get('/api/projects/proj_snake');
    expect(res.status).toBe(200);
    expect(res.body.playUrl).toBe('/play/proj_snake');
    expect(res.body.priceCr).toBe(500);
    expect(res.body.trialScope).toBeTruthy();
    expect(res.body.seller.displayName).toBe('演示卖家');
    expect(res.body.seller.ratingAvg).toBe(0);
    expect(Array.isArray(res.body.reviews)).toBe(true);
    expect(res.body.isPurchased).toBe(false);
    expect(res.body.canDownload).toBe(false);
  });

  it('登录后详情返回 isPurchased/canDownload 正确值', async () => {
    const app = testApp();
    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const res = await authed(app, buyerToken).get('/api/projects/proj_snake');
    expect(res.body.isPurchased).toBe(true);
    expect(res.body.canDownload).toBe(true);
    // 种子数据 buyer 对 proj_snake 有一笔 paid 订单 → existingOrder 应返回它
    expect(res.body.existingOrder).toEqual({ id: 'ord_demo_1', status: 'paid', escrowStatus: 'held' });
  });

  it('存在待支付订单时详情返回 existingOrder（订单恢复路径）', async () => {
    const app = testApp();
    // 注册新买家并下未付款订单
    const reg = await request(app).post('/api/auth/register').send({
      email: 'order-recovery@vibes.local',
      password: 'demo1234',
      displayName: '订单恢复测试',
      roles: ['buyer'],
    });
    const token = reg.body.token as string;
    await authed(app, token).post('/api/orders').send({ projectId: 'proj_breakout' });
    const res = await authed(app, token).get('/api/projects/proj_breakout');
    expect(res.body.isPurchased).toBe(false);
    expect(res.body.existingOrder).not.toBeNull();
    expect(res.body.existingOrder.status).toBe('pending payment');
    expect(res.body.existingOrder.escrowStatus).toBe('none');
    // 匿名不返回
    const anon = await request(app).get('/api/projects/proj_breakout');
    expect(anon.body.existingOrder).toBeNull();
  });

  it('GET /api/categories → 六个分类', async () => {
    const res = await request(testApp()).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual(['game', 'tool', 'art', 'animation', 'webapp', 'other']);
  });

  it('quote：下单前总价（price + 5% fee）一屏可见', async () => {
    const app = testApp();
    const res = await request(app).get('/api/projects/proj_snake/quote');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ projectId: 'proj_snake', priceCr: 500, feeCr: 25, totalCr: 525 });
  });
});

describe('试玩回放（GET /play/:projectId）', () => {
  it('approved：200 + 硬性响应头（CSP/nosniff/inline）', async () => {
    const app = testApp();
    const res = await request(app).get('/play/proj_snake');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toBe(PLAY_CSP);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toBe('inline');
    expect(res.text).toContain('<!DOCTYPE html>');
  });

  it('非白名单扩展名 → 404', async () => {
    const app = testApp();
    const res = await request(app).get('/play/proj_snake?entry=evil.php');
    expect(res.status).toBe(404);
  });

  it('白名单扩展名（.txt）可回放', async () => {
    const app = testApp();
    const res = await request(app).get('/play/proj_snake?entry=notes.txt');
    expect(res.status).toBe(404); // 种子作品无该文件，但语义为「不存在」
    // 用 zip 上传一个 .txt 再验证
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const zip = buildZip([
      { name: 'index.html', data: '<h1>t</h1>' },
      { name: 'readme.txt', data: 'hello' },
    ]);
    const created = await uploadHtml(app, token, { filename: 'z.zip', fileBuffer: zip });
    const id = created.body.project.id;
    await authed(app, token).post(`/api/projects/${id}/submit`);
    const adminToken = await login(app, 'admin@vibes.local', 'admin123');
    await authed(app, adminToken).post(`/api/admin/projects/${id}/approve`);
    const txt = await request(app).get(`/play/${id}?entry=readme.txt`);
    expect(txt.status).toBe(200);
    expect(txt.text).toBe('hello');
  });

  it('非 approved：匿名 404；作者可预览自己的草稿', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const created = await uploadHtml(app, token);
    const id = created.body.project.id;
    expect((await request(app).get(`/play/${id}`)).status).toBe(404);
    const author = await authed(app, token).get(`/play/${id}`);
    expect(author.status).toBe(200);
    expect(author.headers['content-security-policy']).toBe(PLAY_CSP);
  });
});

describe('举报（POST /api/projects/:id/report）', () => {
  it('未登录 401；reason 空 400；正常 201', async () => {
    const app = testApp();
    expect((await request(app).post('/api/projects/proj_snake/report').send({ reason: 'x' })).status).toBe(401);
    const token = await login(app, 'buyer@vibes.local', 'demo1234');
    const empty = await authed(app, token).post('/api/projects/proj_snake/report').send({ reason: '  ' });
    expect(empty.status).toBe(400);
    const ok = await authed(app, token).post('/api/projects/proj_snake/report').send({ reason: '涉嫌抄袭' });
    expect(ok.status).toBe(201);
    expect(ok.body.report.reason).toBe('涉嫌抄袭');
    expect(ok.body.report.projectId).toBe('proj_snake');
  });

  it('不能举报自己的作品', async () => {
    const app = testApp();
    const token = await login(app, 'seller@vibes.local', 'demo1234');
    const res = await authed(app, token).post('/api/projects/proj_snake/report').send({ reason: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('下载（GET /api/projects/:id/download）', () => {
  it('未登录 401；未购 403；作者 200 zip；已购 200 zip', async () => {
    const app = testApp();
    expect((await request(app).get('/api/projects/proj_snake/download')).status).toBe(401);

    const sellerToken = await login(app, 'seller@vibes.local', 'demo1234');
    const authorRes = await authed(app, sellerToken).get('/api/projects/proj_snake/download');
    expect(authorRes.status).toBe(200);
    expect(authorRes.headers['content-type']).toContain('application/zip');
    expect(authorRes.headers['content-disposition']).toContain('attachment');

    const buyerToken = await login(app, 'buyer@vibes.local', 'demo1234');
    const buyerRes = await authed(app, buyerToken).get('/api/projects/proj_snake/download');
    expect(buyerRes.status).toBe(200);

    const contractorToken = await login(app, 'contractor@vibes.local', 'demo1234');
    const denied = await authed(app, contractorToken).get('/api/projects/proj_snake/download');
    expect(denied.status).toBe(403);
  });
});
