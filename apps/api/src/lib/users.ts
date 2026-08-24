import type { Role, SafeUser } from '@vibe/shared';
import type { Db } from '../db';
import { ApiError } from './errors';

/** users 表行（含 DB 列名） */
export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  roles: string; // JSON 数组
  rating_avg: number;
  rating_count: number;
  is_admin: number;
}

export function toSafeUser(row: UserRow): SafeUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    roles: JSON.parse(row.roles) as Role[],
    avatarUrl: row.avatar_url ?? null,
    ratingAvg: row.rating_avg,
    ratingCount: row.rating_count,
    isAdmin: Boolean(row.is_admin),
  };
}

export function getSafeUser(db: Db, id: string): SafeUser {
  const row = db
    .prepare(
      `SELECT id, email, display_name, avatar_url, roles, rating_avg, rating_count, is_admin
       FROM users WHERE id = ?`,
    )
    .get(id) as UserRow | undefined;
  if (!row) throw ApiError.notFound('用户不存在');
  return toSafeUser(row);
}
