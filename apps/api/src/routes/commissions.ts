/**
 * 需求线路由（PR-B3-A）：发布 / 需求板 / 详情 / 更新 / 取消 / 投标 / 选中。
 * - POST /api/commissions —— buyer 发布（验收标准发布即锁定）
 * - GET  /api/commissions —— 公开需求板（status/budgetMaxLte/q/sort/page）
 * - GET  /api/commissions/:id —— 公开详情（bids 仅登录用户可见，不泄露联系方式）
 * - PUT  /api/commissions/:id —— 作者更新（criteria 锁定 400；有投标冻结 409）
 * - POST /api/commissions/:id/cancel —— 作者取消（仅 open；有合同拒绝）
 * - POST /api/commissions/:id/bids —— contractor 投标（预算区间 + 一人一单一标）
 * - POST /api/commissions/:id/select —— buyer 选中（submitted→selected，其余→rejected，建合同）
 */
import { Router } from 'express';
import { requireAuth, requireOptionalAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/errors';
import {
  cancelCommission,
  createBid,
  createCommission,
  getCommissionDetail,
  listCommissions,
  selectBid,
  updateCommission,
  type BidCreateInput,
  type CommissionCreateInput,
} from '../services/commissions';

const router = Router();

// GET /api/commissions —— 需求板（公开）
router.get('/', (req, res) => {
  const result = listCommissions(req.db, {
    status: req.query.status,
    budgetMaxLte: req.query.budgetMaxLte,
    q: req.query.q,
    sort: req.query.sort,
    page: req.query.page !== undefined ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize !== undefined ? Number(req.query.pageSize) : undefined,
  });
  res.json(result);
});

// GET /api/commissions/:id —— 详情（公开；投标列表对登录用户可见）
router.get('/:id', requireOptionalAuth, (req, res) => {
  res.json({ commission: getCommissionDetail(req.db, req.params.id, req.user ?? null) });
});

// POST /api/commissions —— buyer 发布需求
router.post(
  '/',
  requireAuth,
  requireRole('buyer'),
  asyncHandler(async (req, res) => {
    const commission = createCommission(req.db, req.user!.id, (req.body ?? {}) as CommissionCreateInput);
    res.status(201).json({ commission });
  }),
);

// PUT /api/commissions/:id —— 作者更新（验收标准锁定；有投标整体冻结）
router.put(
  '/:id',
  requireAuth,
  requireRole('buyer'),
  asyncHandler(async (req, res) => {
    const commission = updateCommission(
      req.db,
      req.params.id,
      req.user!.id,
      (req.body ?? {}) as Record<string, unknown>,
    );
    res.json({ commission });
  }),
);

// POST /api/commissions/:id/cancel —— 作者取消（仅 open；有合同拒绝）
router.post(
  '/:id/cancel',
  requireAuth,
  requireRole('buyer'),
  asyncHandler(async (req, res) => {
    const commission = cancelCommission(req.db, req.params.id, req.user!.id);
    res.json({ commission });
  }),
);

// POST /api/commissions/:id/bids —— contractor 投标
router.post(
  '/:id/bids',
  requireAuth,
  requireRole('contractor'),
  asyncHandler(async (req, res) => {
    const bid = createBid(req.db, req.params.id, req.user!.id, (req.body ?? {}) as BidCreateInput);
    res.status(201).json({ bid });
  }),
);

// POST /api/commissions/:id/select —— buyer 选中投标并创建合同
router.post(
  '/:id/select',
  requireAuth,
  requireRole('buyer'),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { bidId?: unknown };
    const result = selectBid(req.db, req.params.id, req.user!.id, body.bidId);
    res.json(result);
  }),
);

export default router;
