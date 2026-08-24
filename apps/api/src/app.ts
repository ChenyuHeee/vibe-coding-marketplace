import cors from 'cors';
import express, { type Express } from 'express';
import { HEALTH_SERVICE, HEALTH_VERSION, type HealthResponse } from '@vibe/shared';
import { defaultDbPath, defaultUploadsDir, migrate, openDb, type Db } from './db';
import { seedIfEmpty } from './db/seed';
import { errorHandler, notFoundHandler } from './lib/errors';
import authRouter from './routes/auth';
import walletRouter from './routes/wallet';
import projectsRouter from './routes/projects';
import adminRouter from './routes/admin';
import playRouter from './routes/play';
import filesRouter from './routes/files';
import ordersRouter from './routes/orders';
import libraryRouter from './routes/library';
import commissionsRouter from './routes/commissions';
import bidsRouter from './routes/bids';
import { listCategories } from './services/projects';

export interface CreateAppOptions {
  /** SQLite 路径；默认取 DATABASE_PATH 或 <cwd>/data/app.db；测试传 ':memory:' */
  dbPath?: string;
  /** 演示作品文件写入目录；默认 UPLOADS_DIR 或 <cwd>/uploads */
  uploadsDir?: string;
  /** 空库时是否自动写入演示数据（默认 true） */
  autoSeed?: boolean;
}

/**
 * 组装 Express app（与 listen 分离，便于 supertest 直接测试）。
 * - 打开数据库 → 幂等建表 → 空库自动 seed（A6 演示数据）
 * - 数据库连接挂到 app.locals.db，并注入每个请求的 req.db
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();

  const dbPath = options.dbPath ?? defaultDbPath();
  const uploadsDir = options.uploadsDir ?? defaultUploadsDir();
  const db: Db = openDb(dbPath);
  migrate(db);
  if (options.autoSeed !== false) {
    seedIfEmpty(db, { uploadsDir });
  }
  app.locals.db = db;
  app.locals.uploadsDir = uploadsDir;

  // 开发时允许 web dev server 直接跨域调用
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
  app.use(express.json());

  // 给每个请求挂数据库连接（类型见 src/types/express.d.ts）
  app.use((req, _res, next) => {
    req.db = db;
    next();
  });

  const healthHandler = (_req: express.Request, res: express.Response) => {
    const body: HealthResponse = { ok: true, service: HEALTH_SERVICE, version: HEALTH_VERSION };
    res.json(body);
  };

  // 脚手架健康检查（两个路径都可用：/health 按任务要求，/api/health 供 Vite 代理）
  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // 业务路由
  app.use('/api/auth', authRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/library', libraryRouter);
  app.use('/api/commissions', commissionsRouter);
  app.use('/api/bids', bidsRouter);
  app.get('/api/categories', (_req, res) => {
    res.json(listCategories());
  });

  // 试玩回放（作品静态文件，CSP sandbox 隔离；详见 routes/play.ts）
  app.use('/play', playRouter);

  // 404 + 统一错误处理（{ error: { code, message, details? } }）
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
