import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

describe('health check', () => {
  it('GET /health returns { ok: true }', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'vibe-api', version: '0.1.0' });
  });

  it('GET /api/health returns { ok: true }', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('unknown route returns 404 JSON', async () => {
    const res = await request(createApp()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
