/**
 * 作品静态资源（封面等）：GET /api/files/:projectId/*
 * 可见性与作品详情一致（approved 公开；作者/已购可见）；仅服务白名单扩展名；
 * 出于安全只暴露封面类文件（cover.*），其余一律 404。
 */
import { Router } from 'express';
import { requireOptionalAuth } from '../middleware/auth';
import { resolvePlayFile } from '../lib/upload';
import { ApiError } from '../lib/errors';
import { canViewProject, getProjectRow } from '../services/projects';

const router = Router();

router.get('/:projectId/*', requireOptionalAuth, (req, res, next) => {
  const project = getProjectRow(req.db, req.params.projectId);
  if (!canViewProject(req.db, project, req.user ?? null)) {
    throw ApiError.notFound('作品不存在');
  }
  const filePath = (req.params[0] as string | undefined) ?? '';
  const baseName = filePath.split('/').pop() ?? '';
  if (!baseName.startsWith('cover.')) {
    throw ApiError.notFound('文件不存在');
  }
  const uploadsDir = req.app.locals.uploadsDir as string;
  const { absPath } = resolvePlayFile(uploadsDir, project.id, filePath);
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    'Cache-Control': 'public, max-age=3600',
  });
  res.sendFile(absPath, (err) => {
    if (err) next(err);
  });
});

export default router;
