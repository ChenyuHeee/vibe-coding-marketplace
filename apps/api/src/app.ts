import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { HEALTH_SERVICE, HEALTH_VERSION, type HealthResponse } from '@vibe/shared';

/**
 * 组装 Express app（与 listen 分离，便于 supertest 直接测试）。
 * 端口/环境变量在 index.ts 中读取。
 */
export function createApp(): Express {
  const app = express();

  // 开发时允许 web dev server（5173）直接跨域调用
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
  app.use(express.json());

  const healthHandler = (_req: Request, res: Response) => {
    const body: HealthResponse = { ok: true, service: HEALTH_SERVICE, version: HEALTH_VERSION };
    res.json(body);
  };

  // 脚手架健康检查（两个路径都可用：/health 按任务要求，/api/health 供 Vite 代理）
  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // 404
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  // 统一错误处理
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[vibe-api] unhandled error:', err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  });

  return app;
}
