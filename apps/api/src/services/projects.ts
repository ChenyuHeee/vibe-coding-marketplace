/**
 * 作品线服务（PR-B2-A）：上传创建 / 审核状态机 / 市场列表与详情 / 举报。
 * 状态词一律使用 docs/STATUS_VOCABULARY.md §1 规范字符串。
 *
 * 审核流实现说明：按词汇表 §1「提交后自动进入 under review」，
 * POST /:id/submit 一次完成 draft→submitted→under review（history 保留 submitted 事件），
 * 保证 admin 队列 `?status=under review` 可见新提交。
 */
import { randomUUID } from 'node:crypto';
import {
  PROJECT_CATEGORIES,
  type AdminProjectItem,
  type Cr,
  type OrderStatus,
  type Paginated,
  type ProjectCategory,
  type ProjectDetail,
  type ProjectListItem,
  type ProjectReviewProgress,
  type ProjectReviewStatus,
  type ReviewEventItem,
  type ReviewItem,
} from '@vibe/shared';
import type { Db } from '../db';
import { ApiError } from '../lib/errors';
import type { AuthUser } from '../middleware/auth';

// ---------------------------------------------------------------------------
// 行类型与映射
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  category: string;
  price_cr: number;
  cover_url: string | null;
  trial_scope: string;
  file_path: string;
  entry_file: string;
  status: ProjectReviewStatus;
  review_note: string | null;
  avg_rating: number;
  rating_count: number;
  download_count: number;
  play_count: number;
  published_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  delisted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithSellerRow extends ProjectRow {
  seller_display_name: string;
  seller_rating_avg: number;
}

export function getProjectRow(db: Db, projectId: string): ProjectWithSellerRow {
  const row = db
    .prepare(
      `SELECT p.*, u.display_name AS seller_display_name, u.rating_avg AS seller_rating_avg
       FROM projects p JOIN users u ON u.id = p.seller_id
       WHERE p.id = ?`,
    )
    .get(projectId) as ProjectWithSellerRow | undefined;
  if (!row) throw ApiError.notFound('作品不存在');
  return row;
}

function playUrlOf(projectId: string): string {
  return `/play/${projectId}`;
}

export function toProjectListItem(row: ProjectWithSellerRow): ProjectListItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category as ProjectCategory,
    priceCr: row.price_cr,
    coverUrl: row.cover_url,
    trialScope: row.trial_scope,
    playUrl: playUrlOf(row.id),
    seller: { id: row.seller_id, displayName: row.seller_display_name, ratingAvg: row.seller_rating_avg },
    avgRating: row.avg_rating,
    ratingCount: row.rating_count,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// 访问控制（delisted：仅作者或已购买家可见；非 approved：仅作者/已购买家）
// ---------------------------------------------------------------------------

export const PURCHASED_ORDER_STATUSES: readonly OrderStatus[] = ['paid', 'delivered', 'completed'];

/** 该用户是否已购此作品（订单 paid/delivered/completed；退款/取消后失去访问权） */
export function hasPurchased(db: Db, userId: string, projectId: string): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM orders
       WHERE buyer_id = ? AND project_id = ? AND status IN ('paid','delivered','completed')`,
    )
    .get(userId, projectId) as { c: number };
  return row.c > 0;
}

/** 详情/试玩/封面可见性：approved 公开；作者本人；已购买家（含 delisted） */
export function canViewProject(db: Db, project: ProjectRow, user: AuthUser | null): boolean {
  if (project.status === 'approved') return true;
  if (!user) return false;
  if (project.seller_id === user.id) return true;
  return hasPurchased(db, user.id, project.id);
}

export function canDownloadProject(db: Db, project: ProjectRow, user: AuthUser | null): boolean {
  if (!user) return false;
  if (project.seller_id === user.id) return true;
  return hasPurchased(db, user.id, project.id);
}

// ---------------------------------------------------------------------------
// 市场列表 / 详情（区域 1）
// ---------------------------------------------------------------------------

export type ProjectSort = 'rating' | 'newest' | 'price_asc' | 'price_desc';

const SORTS: readonly ProjectSort[] = ['rating', 'newest', 'price_asc', 'price_desc'];

export function listProjects(
  db: Db,
  opts: {
    category?: unknown;
    q?: unknown;
    minRating?: unknown;
    sort?: unknown;
    page?: number;
    pageSize?: number;
  },
): Paginated<ProjectListItem> {
  const where: string[] = ['p.status = ?'];
  const params: unknown[] = ['approved'];

  if (opts.category !== undefined && opts.category !== '') {
    const category = String(opts.category);
    if (!PROJECT_CATEGORIES.includes(category as ProjectCategory)) {
      throw ApiError.badRequest('VALIDATION', `category 只能是：${PROJECT_CATEGORIES.join(' / ')}`);
    }
    where.push('p.category = ?');
    params.push(category);
  }
  if (opts.q !== undefined && String(opts.q).trim() !== '') {
    const q = String(opts.q).trim().replace(/[%_\\]/g, (ch) => `\\${ch}`);
    where.push("(p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (opts.minRating !== undefined && opts.minRating !== '') {
    const minRating = Number(opts.minRating);
    if (!Number.isFinite(minRating) || minRating < 0 || minRating > 5) {
      throw ApiError.badRequest('VALIDATION', 'minRating 需为 0–5 之间的数字');
    }
    where.push('p.avg_rating >= ?');
    params.push(minRating);
  }

  const sort = opts.sort === undefined || opts.sort === '' ? 'newest' : String(opts.sort);
  if (!SORTS.includes(sort as ProjectSort)) {
    throw ApiError.badRequest('VALIDATION', `sort 只能是：${SORTS.join(' / ')}`);
  }
  const orderBy: Record<ProjectSort, string> = {
    rating: 'p.avg_rating DESC, p.rating_count DESC, p.created_at DESC',
    newest: 'p.created_at DESC',
    price_asc: 'p.price_cr ASC, p.created_at DESC',
    price_desc: 'p.price_cr DESC, p.created_at DESC',
  };

  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
  const whereSql = where.join(' AND ');

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM projects p WHERE ${whereSql}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT p.*, u.display_name AS seller_display_name, u.rating_avg AS seller_rating_avg
       FROM projects p JOIN users u ON u.id = p.seller_id
       WHERE ${whereSql} ORDER BY ${orderBy[sort as ProjectSort]} LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as ProjectWithSellerRow[];

  return { items: rows.map(toProjectListItem), page, pageSize, total };
}

function toReviewItem(row: {
  id: string;
  rating: number;
  comment: string | null;
  user_id: string;
  display_name: string;
  created_at: string;
}): ReviewItem {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    user: { id: row.user_id, displayName: row.display_name },
    createdAt: row.created_at,
  };
}

export function getProjectDetail(
  db: Db,
  projectId: string,
  user: AuthUser | null,
): ProjectDetail {
  const project = getProjectRow(db, projectId);
  if (!canViewProject(db, project, user)) {
    throw ApiError.notFound('作品不存在');
  }
  const reviews = db
    .prepare(
      `SELECT r.id, r.rating, r.comment, r.user_id, u.display_name, r.created_at
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.project_id = ? ORDER BY r.created_at DESC`,
    )
    .all(projectId) as {
    id: string;
    rating: number;
    comment: string | null;
    user_id: string;
    display_name: string;
    created_at: string;
  }[];
  const purchased = user ? hasPurchased(db, user.id, projectId) : false;
  return {
    ...toProjectListItem(project),
    description: project.description,
    reviews: reviews.map(toReviewItem),
    isPurchased: purchased,
    canDownload: canDownloadProject(db, project, user),
    reviewNote: project.review_note,
  };
}

export function listCategories(): { items: string[] } {
  return { items: [...PROJECT_CATEGORIES] };
}

// ---------------------------------------------------------------------------
// 上传创建（区域 2；文件存储由路由层完成，这里只落库）
// ---------------------------------------------------------------------------

export interface ProjectCreateInput {
  id?: string;
  title: string;
  description: string;
  category: ProjectCategory;
  priceCr: Cr;
  trialScope: string;
  coverUrl: string | null;
  entryFile: string;
}

export function createProject(db: Db, sellerId: string, input: ProjectCreateInput) {
  const id = input.id ?? randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, seller_id, title, description, category, price_cr, cover_url, trial_scope, file_path, entry_file, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
  ).run(
    id,
    sellerId,
    input.title,
    input.description,
    input.category,
    input.priceCr,
    input.coverUrl,
    input.trialScope,
    `projects/${id}`,
    input.entryFile,
    now,
    now,
  );
  const row = getProjectRow(db, id);
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priceCr: row.price_cr,
    coverUrl: row.cover_url,
  };
}

export interface ProjectUpdateInput {
  title?: string;
  description?: string;
  category?: ProjectCategory;
  priceCr?: Cr;
  trialScope?: string;
  coverUrl?: string | null;
  entryFile?: string;
}

export function updateProject(
  db: Db,
  projectId: string,
  authorId: string,
  input: ProjectUpdateInput,
) {
  const project = getProjectRow(db, projectId);
  if (project.seller_id !== authorId) {
    throw ApiError.forbidden('只有作者本人可以编辑作品');
  }
  if (input.category !== undefined && !PROJECT_CATEGORIES.includes(input.category)) {
    throw ApiError.badRequest('VALIDATION', `category 只能是：${PROJECT_CATEGORIES.join(' / ')}`);
  }
  db.prepare(
    `UPDATE projects
     SET title = COALESCE(?, title),
         description = COALESCE(?, description),
         category = COALESCE(?, category),
         price_cr = COALESCE(?, price_cr),
         trial_scope = COALESCE(?, trial_scope),
         cover_url = ?,
         entry_file = COALESCE(?, entry_file),
         updated_at = ?
     WHERE id = ?`,
  ).run(
    input.title ?? null,
    input.description ?? null,
    input.category ?? null,
    input.priceCr ?? null,
    input.trialScope ?? null,
    input.coverUrl === undefined ? project.cover_url : input.coverUrl,
    input.entryFile ?? null,
    new Date().toISOString(),
    projectId,
  );
  return getProjectRow(db, projectId);
}

// ---------------------------------------------------------------------------
// 审核状态机（词汇表 §1）
// ---------------------------------------------------------------------------

function recordEvent(db: Db, projectId: string, event: string, actorId: string, note: string | null): void {
  db.prepare(
    `INSERT INTO project_review_events (id, project_id, event, note, actor_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), projectId, event, note, actorId, new Date().toISOString());
}

const SUBMITTABLE_STATUSES: readonly ProjectReviewStatus[] = ['draft', 'rejected', 'delisted'];

/** 作者提交审核：draft/rejected/delisted → under review（词汇表：提交后自动进入） */
export function submitProject(db: Db, projectId: string, authorId: string) {
  const project = getProjectRow(db, projectId);
  if (project.seller_id !== authorId) {
    throw ApiError.forbidden('只有作者本人可以提交审核');
  }
  if (!SUBMITTABLE_STATUSES.includes(project.status)) {
    throw ApiError.conflict(`当前状态 ${project.status} 不可提交审核`);
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE projects SET status = 'under review', submitted_at = ?, review_note = NULL, updated_at = ? WHERE id = ?`,
  ).run(now, now, projectId);
  recordEvent(db, projectId, 'submitted', authorId, null);
  return getProjectRow(db, projectId);
}

function listEvents(db: Db, projectId: string): ReviewEventItem[] {
  const rows = db
    .prepare(
      `SELECT event, note, created_at FROM project_review_events
       WHERE project_id = ? ORDER BY created_at ASC, rowid ASC`,
    )
    .all(projectId) as { event: string; note: string | null; created_at: string }[];
  return rows.map((r) => ({ event: r.event, note: r.note, createdAt: r.created_at }));
}

/** 审核进度（作者最关心「我的作品到哪一步了」） */
export function getReviewProgress(db: Db, projectId: string, authorId: string): ProjectReviewProgress {
  const project = getProjectRow(db, projectId);
  if (project.seller_id !== authorId) {
    throw ApiError.forbidden('只有作者本人可以查看审核进度');
  }
  return {
    status: project.status,
    reviewNote: project.review_note,
    submittedAt: project.submitted_at,
    reviewedAt: project.reviewed_at,
    delistedAt: project.delisted_at,
    history: listEvents(db, projectId),
  };
}

/** 作者下架：仅 approved，reason 必填；已购买家保留访问权（访问控制由 canViewProject 保证） */
export function delistProject(db: Db, projectId: string, authorId: string, reason: string) {
  const project = getProjectRow(db, projectId);
  if (project.seller_id !== authorId) {
    throw ApiError.forbidden('只有作者本人可以下架作品');
  }
  if (project.status !== 'approved') {
    throw ApiError.conflict(`只有已上架（approved）作品可以下架，当前状态：${project.status}`);
  }
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (trimmed === '') {
    throw ApiError.badRequest('VALIDATION', '下架已售出作品必须填写理由');
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE projects SET status = 'delisted', delisted_at = ?, updated_at = ? WHERE id = ?`,
  ).run(now, now, projectId);
  recordEvent(db, projectId, 'delisted', authorId, trimmed);
  return getProjectRow(db, projectId);
}

// ---------------------------------------------------------------------------
// 举报（PR-B2-A；reports 表）
// ---------------------------------------------------------------------------

export function reportProject(db: Db, projectId: string, reporterId: string, reason: string) {
  const project = getProjectRow(db, projectId);
  if (project.seller_id === reporterId) {
    throw ApiError.badRequest('VALIDATION', '不能举报自己的作品');
  }
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (trimmed === '') {
    throw ApiError.badRequest('VALIDATION', '举报理由不能为空');
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO reports (id, project_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, projectId, reporterId, trimmed, now);
  return { id, projectId, reporterId, reason: trimmed, createdAt: now };
}

// ---------------------------------------------------------------------------
// 管理端审核队列（admin）
// ---------------------------------------------------------------------------

export function adminListProjects(
  db: Db,
  opts: { status?: unknown; page?: number; pageSize?: number },
): Paginated<AdminProjectItem> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.status !== undefined && opts.status !== '') {
    const status = String(opts.status);
    const ALL: readonly ProjectReviewStatus[] = [
      'draft',
      'submitted',
      'under review',
      'approved',
      'rejected',
      'delisted',
    ];
    if (!ALL.includes(status as ProjectReviewStatus)) {
      throw ApiError.badRequest('VALIDATION', `status 只能是：${ALL.join(' / ')}`);
    }
    where.push('p.status = ?');
    params.push(status);
  }
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM projects p ${whereSql}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT p.*, u.display_name AS seller_display_name, u.rating_avg AS seller_rating_avg
       FROM projects p JOIN users u ON u.id = p.seller_id
       ${whereSql} ORDER BY p.submitted_at IS NULL, p.submitted_at ASC, p.created_at ASC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as ProjectWithSellerRow[];

  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category as ProjectCategory,
      priceCr: r.price_cr,
      status: r.status,
      seller: { id: r.seller_id, displayName: r.seller_display_name, ratingAvg: r.seller_rating_avg },
      reviewNote: r.review_note,
      submittedAt: r.submitted_at,
      reviewedAt: r.reviewed_at,
      publishedAt: r.published_at,
      createdAt: r.created_at,
    })),
    page,
    pageSize,
    total,
  };
}

const REVIEWABLE_STATUSES: readonly ProjectReviewStatus[] = ['submitted', 'under review'];

function assertReviewable(project: ProjectWithSellerRow): void {
  if (!REVIEWABLE_STATUSES.includes(project.status)) {
    throw ApiError.conflict(`当前状态 ${project.status} 不可审核（仅 submitted / under review）`);
  }
}

export function adminApprove(db: Db, projectId: string, adminId: string) {
  const project = getProjectRow(db, projectId);
  assertReviewable(project);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE projects SET status = 'approved', reviewed_at = ?, published_at = ?, updated_at = ? WHERE id = ?`,
  ).run(now, project.published_at ?? now, now, projectId);
  recordEvent(db, projectId, 'approved', adminId, null);
  return getProjectRow(db, projectId);
}

export function adminReject(db: Db, projectId: string, adminId: string, reviewNote: string) {
  const project = getProjectRow(db, projectId);
  assertReviewable(project);
  const trimmed = typeof reviewNote === 'string' ? reviewNote.trim() : '';
  if (trimmed === '') {
    throw ApiError.badRequest('VALIDATION', '驳回必须填写审核意见（reviewNote）');
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE projects SET status = 'rejected', review_note = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`,
  ).run(trimmed, now, now, projectId);
  recordEvent(db, projectId, 'rejected', adminId, trimmed);
  return getProjectRow(db, projectId);
}
