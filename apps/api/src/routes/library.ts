/**
 * My Library 路由（PR-B2-B）：已购列表（含 delisted 已购）+ 在线运行入口。
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { getLibraryRun, listLibrary } from '../services/orders';

const router = Router();

router.use(requireAuth, requireRole('buyer'));

// GET /api/library —— 已购作品列表（含免费/已下架作品；两步可达由前端保证）
router.get('/', (req, res) => {
  res.json(listLibrary(req.db, req.user!.id));
});

// GET /api/library/:projectId/run —— 在线运行（返回 playUrl）
router.get('/:projectId/run', (req, res) => {
  res.json(getLibraryRun(req.db, req.user!.id, req.params.projectId));
});

export default router;
