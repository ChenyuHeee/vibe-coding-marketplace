/**
 * 里程碑路由（PR-B3-B）：验收通过 / 打回（feedback 必填）/ 详情 / 交付物回放。
 * - POST /api/milestones/:id/approve —— buyer 验收（非最终→合同回 in progress；最终→buyer acceptance）
 * - POST /api/milestones/:id/request-revision —— buyer 打回（feedback 必填；合同保持 milestone submission）
 * - GET  /api/milestones/:id —— 买卖双方可见
 * - GET  /api/milestones/:id/files/* —— 交付物回放（买卖双方可见；白名单/穿越校验复用）
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { resolveDirFile, milestoneDir } from '../lib/upload';
import {
  approveMilestone,
  getMilestone,
  getMilestoneDir,
  requestMilestoneRevision,
} from '../services/contracts';

const router = Router();

router.use(requireAuth);

// POST /api/milestones/:id/approve —— buyer 验收通过
router.post(
  '/:id/approve',
  requireRole('buyer'),
  (req, res) => {
    const contract = approveMilestone(req.db, req.params.id, req.user!.id);
    res.json({ contract });
  },
);

// POST /api/milestones/:id/request-revision —— buyer 打回（feedback 必填）
router.post(
  '/:id/request-revision',
  requireRole('buyer'),
  (req, res) => {
    const body = (req.body ?? {}) as { feedback?: unknown };
    const contract = requestMilestoneRevision(req.db, req.params.id, req.user!.id, body.feedback);
    res.json({ contract });
  },
);

// GET /api/milestones/:id —— 里程碑详情（买卖双方可见）
router.get('/:id', (req, res) => {
  res.json({ milestone: getMilestone(req.db, req.params.id, req.user!.id) });
});

// GET /api/milestones/:id/files/* —— 交付物回放（默认 index.html；?entry 由路径携带）
router.get('/:id/files/*', (req, res, next) => {
  const { contractId, seq } = getMilestoneDir(req.db, req.params.id, req.user!.id);
  const uploadsDir = req.app.locals.uploadsDir as string;
  const filePath = (req.params as unknown as Record<string, string | undefined>)['0'] ?? '';
  const { absPath } = resolveDirFile(milestoneDir(uploadsDir, contractId, seq), filePath);
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    'Cache-Control': 'private, max-age=3600',
  });
  res.sendFile(absPath, (err) => {
    if (err) next(err);
  });
});

export default router;
