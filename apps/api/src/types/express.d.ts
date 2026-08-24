import type { Database } from 'better-sqlite3';
import type { AuthUser } from '../middleware/auth';

declare global {
  namespace Express {
    interface Request {
      /** 当前请求使用的数据库连接（由 app.ts 挂载） */
      db: Database;
      /** 登录用户（requireAuth 之后可用） */
      user?: AuthUser;
    }
  }
}

export {};
