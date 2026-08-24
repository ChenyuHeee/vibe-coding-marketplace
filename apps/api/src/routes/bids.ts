/**
 * 投标路由（PR-B3-A）：GET /api/bids/mine —— contractor 查看我的投标。
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { listMyBids } from '../services/commissions';

const router = Router();

router.use(requireAuth);

// GET /api/bids/mine —— contractor（?status=&page=）
router.get('/mine', requireRole('contractor'), (req, res) => {
  const result = listMyBids(req.db, req.user!.id, {
    status: req.query.status,
    page: req.query.page !== undefined ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize !== undefined ? Number(req.query.pageSize) : undefined,
  });
  res.json(result);
});

export default router;
