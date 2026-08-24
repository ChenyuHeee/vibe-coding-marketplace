/**
 * 试玩回放 GET /play/:projectId（docs/ARCHITECTURE.md §3.3 —— 硬性要求）。
 *
 * 可见性：approved 公开；作者可预览自己任何状态；已购买家可访问（含 delisted）。
 * 安全响应头：CSP sandbox（不信任卖家代码）+ nosniff + inline；MIME 白名单外一律 404。
 */
import { Router } from 'express';
import { requireOptionalAuth } from '../middleware/auth';
import { resolvePlayFile } from '../lib/upload';
import { ApiError } from '../lib/errors';
import { canViewProject, getProjectRow } from '../services/projects';

/** 响应头硬性要求（任务指定字符串，一字不差） */
export const PLAY_CSP =
  "sandbox allow-scripts allow-forms; default-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:";

const router = Router();

router.get('/:projectId', requireOptionalAuth, (req, res, next) => {
  const project = getProjectRow(req.db, req.params.projectId);
  if (!canViewProject(req.db, project, req.user ?? null)) {
    // 未上架/已下架且非作者非已购：与不存在同语义（不泄露存在性）
    throw ApiError.notFound('作品不存在');
  }
  const uploadsDir = req.app.locals.uploadsDir as string;
  const { absPath } = resolvePlayFile(uploadsDir, project.id, req.query.entry);

  req.db.prepare('UPDATE projects SET play_count = play_count + 1 WHERE id = ?').run(project.id);

  res.set({
    'Content-Security-Policy': PLAY_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    'Cache-Control': 'no-store',
  });
  res.sendFile(absPath, (err) => {
    if (err) next(err);
  });
});

export default router;
