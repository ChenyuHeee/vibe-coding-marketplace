/**
 * 订单路由（PR-B2-B）：下单 / 报价 / 支付 / 取消 / 退款 / 确认收货 / 列表 / 详情。
 * 状态词与资金语义见 services/orders.ts 与词汇表 §2。
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/errors';
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  getOrder,
  listOrders,
  payOrder,
  quoteOrder,
  refundOrder,
} from '../services/orders';

const router = Router();

router.use(requireAuth);

// POST /api/orders —— buyer 下单（响应即含手续费总价）
router.post(
  '/',
  requireRole('buyer'),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { projectId?: unknown };
    const order = createOrder(req.db, req.user!.id, body.projectId);
    res.status(201).json({ order });
  }),
);

// GET /api/orders —— buyer 查自己 / seller 查售出（?role=&status=&page=）
router.get('/', (req, res) => {
  const result = listOrders(req.db, req.user!.id, {
    role: req.query.role,
    status: req.query.status,
    page: req.query.page !== undefined ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize !== undefined ? Number(req.query.pageSize) : undefined,
  });
  res.json(result);
});

// GET /api/orders/:id/quote —— 下单后/订单页查看实际应付总额（PRD 4）
router.get('/:id/quote', (req, res) => {
  res.json(quoteOrder(req.db, req.params.id, req.user!.id));
});

// GET /api/orders/:id —— 订单详情（买卖双方；退款入口前端在详情页常驻）
router.get('/:id', (req, res) => {
  res.json({ order: getOrder(req.db, req.params.id, req.user!.id) });
});

// POST /api/orders/:id/pay —— 模拟支付（余额→托管；免费作品直接 completed）
router.post(
  '/:id/pay',
  requireRole('buyer'),
  asyncHandler(async (req, res) => {
    const result = payOrder(req.db, req.params.id, req.user!.id);
    res.json(result);
  }),
);

// POST /api/orders/:id/cancel —— 仅未付款，一步取消不追问
router.post(
  '/:id/cancel',
  requireRole('buyer'),
  asyncHandler(async (req, res) => {
    const order = cancelOrder(req.db, req.params.id, req.user!.id);
    res.json({ order });
  }),
);

// POST /api/orders/:id/refund —— 仅 paid/delivered 且 14 天内，全额退回
router.post(
  '/:id/refund',
  requireRole('buyer'),
  asyncHandler(async (req, res) => {
    const result = refundOrder(req.db, req.params.id, req.user!.id);
    res.json(result);
  }),
);

// POST /api/orders/:id/confirm —— 确认收货放款（delivered→completed，escrow released）
router.post(
  '/:id/confirm',
  requireRole('buyer'),
  asyncHandler(async (req, res) => {
    const result = confirmOrder(req.db, req.params.id, req.user!.id);
    res.json(result);
  }),
);

export default router;
