import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { getDb } from './db';

function testApp() {
  return createApp({ dbPath: ':memory:' });
}

describe('health check', () => {
  it('GET /health returns { ok: true }', async () => {
    const res = await request(testApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'vibe-api', version: '0.1.0' });
  });

  it('GET /api/health returns { ok: true }', async () => {
    const res = await request(testApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('unknown route returns 404 JSON', async () => {
    const res = await request(testApp()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('db bootstrap', () => {
  it('empty DB is migrated and auto-seeded (A6)', () => {
    const app = testApp();
    const db = getDb(app);
    const users = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
    const projects = db.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number };
    expect(users.c).toBe(4);
    expect(projects.c).toBe(4);
  });
});
