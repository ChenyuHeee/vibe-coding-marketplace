/**
 * 卖家工作台路由（Issue #30）：GET /api/seller/projects —— 作者视角全部状态 + 审核进度。
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { listSellerProjects } from '../services/projects';

const router = Router();

router.use(requireAuth);

// GET /api/seller/projects —— seller（?page=&pageSize=）
router.get('/projects', requireRole('seller'), (req, res) => {
  const result = listSellerProjects(req.db, req.user!.id, {
    page: req.query.page !== undefined ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize !== undefined ? Number(req.query.pageSize) : undefined,
  });
  res.json(result);
});

export default router;
