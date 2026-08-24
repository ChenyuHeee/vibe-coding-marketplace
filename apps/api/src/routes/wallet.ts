import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/errors';
import {
  createWithdrawal,
  getWalletSummary,
  listEscrow,
  listTransactions,
  listWithdrawals,
  topup,
} from '../services/wallet';

const router = Router();

// 钱包接口全部需要登录
router.use(requireAuth);

// GET /api/wallet —— 余额 / 托管中 / 提现中
router.get('/', (req, res) => {
  res.json(getWalletSummary(req.db, req.user!.id));
});

// POST /api/wallet/topup —— 模拟支付（直接成功）；A1 大额 ≥100 CR 需 confirm: true
router.post(
  '/topup',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { amountCr?: unknown; confirm?: unknown };
    const result = topup(req.db, req.user!.id, body.amountCr, body.confirm === true);
    res.json(result);
  }),
);

// GET /api/wallet/transactions —— 收支台账（?type=&direction=&page=&pageSize=）
router.get('/transactions', (req, res) => {
  const result = listTransactions(req.db, req.user!.id, {
    type: req.query.type,
    direction: req.query.direction,
    page: req.query.page !== undefined ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize !== undefined ? Number(req.query.pageSize) : undefined,
  });
  res.json(result);
});

// POST /api/wallet/withdrawals —— 提现（模拟身份+银行卡校验，A4 到账 1–3 工作日）
router.post(
  '/withdrawals',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as {
      amountCr?: unknown;
      bankName?: unknown;
      cardLast4?: unknown;
      holderName?: unknown;
    };
    const withdrawal = createWithdrawal(req.db, req.user!.id, body);
    res.status(201).json({ withdrawal });
  }),
);

// GET /api/wallet/withdrawals —— 提现记录（?status=&page=）
router.get('/withdrawals', (req, res) => {
  const result = listWithdrawals(req.db, req.user!.id, {
    status: req.query.status,
    page: req.query.page !== undefined ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize !== undefined ? Number(req.query.pageSize) : undefined,
  });
  res.json(result);
});

// GET /api/wallet/escrow —— 托管总览（钱在谁手里 / 何时到账）
router.get('/escrow', (req, res) => {
  res.json({ items: listEscrow(req.db, req.user!.id) });
});

export default router;
