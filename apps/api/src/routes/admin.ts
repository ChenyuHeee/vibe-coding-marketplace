/**
 * 管理端路由（PR-B2-A）：审核队列 + 审核动作（approve / reject，驳回必填 reviewNote）。
 * 鉴权：requireAuth + requireAdmin（demo：admin@vibes.local，is_admin=1）。
 */
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/errors';
import { adminApprove, adminListProjects, adminReject } from '../services/projects';

const router = Router();

router.use(requireAuth, requireAdmin);

// GET /api/admin/projects —— 审核队列（?status=，默认全部；常用 ?status=under review）
router.get('/projects', (req, res) => {
  const result = adminListProjects(req.db, {
    status: req.query.status,
    page: req.query.page !== undefined ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize !== undefined ? Number(req.query.pageSize) : undefined,
  });
  res.json(result);
});

// POST /api/admin/projects/:id/approve —— 通过（→ approved，写入 published_at）
router.post('/projects/:id/approve', (req, res) => {
  const project = adminApprove(req.db, req.params.id, req.user!.id);
  res.json({ project: { id: project.id, status: project.status, publishedAt: project.published_at } });
});

// POST /api/admin/projects/:id/reject —— 驳回（→ rejected，reviewNote 必填）
router.post(
  '/projects/:id/reject',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { reviewNote?: unknown };
    const project = adminReject(req.db, req.params.id, req.user!.id, String(body.reviewNote ?? ''));
    res.json({ project: { id: project.id, status: project.status, reviewNote: project.review_note } });
  }),
);

export default router;
