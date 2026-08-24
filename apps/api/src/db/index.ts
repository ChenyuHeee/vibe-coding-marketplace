import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Express } from 'express';
import { SCHEMA } from './schema';

export type Db = Database.Database;

/** 打开 SQLite 连接（:memory: 供测试；否则自动创建父目录） */
export function openDb(dbPath: string): Db {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  return db;
}

/** 幂等建表（启动时调用） */
export function migrate(db: Db): void {
  db.exec(SCHEMA);
}

/** 默认数据库路径：环境变量优先，否则 <cwd>/data/app.db */
export function defaultDbPath(): string {
  return process.env.DATABASE_PATH ?? path.resolve(process.cwd(), 'data/app.db');
}

/** 默认上传根目录：环境变量优先，否则 <cwd>/uploads */
export function defaultUploadsDir(): string {
  return process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), 'uploads');
}

/** 从 Express app 取回挂载的数据库连接 */
export function getDb(app: Express): Db {
  return (app.locals as { db: Db }).db;
}
