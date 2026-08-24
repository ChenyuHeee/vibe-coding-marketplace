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
  migrateMissingColumns(db);
}

/**
 * 幂等补列：老库（CREATE TABLE IF NOT EXISTS 不会加新列）启动时补齐缺失列。
 * 只增列、不动已有列；ALTER TABLE ADD COLUMN 在 SQLite 不支持 IF NOT EXISTS，
 * 故先查 PRAGMA table_info 再补。值为完整列定义（与 schema.ts 保持一致）。
 */
const COLUMN_MIGRATIONS: Record<string, string[]> = {
  projects: ['submitted_at TEXT', 'reviewed_at TEXT', 'delisted_at TEXT'],
  orders: ['delivered_at TEXT', 'cancelled_at TEXT'],
  contracts: ['accepted_at TEXT', 'paid_at TEXT'],
  milestones: ['is_final INTEGER NOT NULL DEFAULT 0', 'feedback TEXT', "entry_file TEXT NOT NULL DEFAULT 'index.html'"],
};

function migrateMissingColumns(db: Db): void {
  for (const [table, columns] of Object.entries(COLUMN_MIGRATIONS)) {
    const existing = new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name),
    );
    for (const col of columns) {
      const name = col.split(' ')[0];
      if (existing.has(name)) continue;
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col}`);
    }
  }
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
