/**
 * 订单 / 支付 / 退款 / My Library 服务（PR-B2-B）。
 *
 * 状态机（词汇表 §2）：
 *   pending payment ──pay──▶ paid(escrow=held) ──自动交付──▶ delivered ──confirm──▶ completed(escrow=released)
 *        │  │                 │                                 │
 *        │  └──cancel──▶ cancelled                            └──refund──▶ refunded(escrow=refunded)
 *        │            （仅未付款可取消，一步完成）              （创建 14 天内 REFUND_WINDOW_DAYS）
 *        └──免费作品(priceCr=0)：pay 直接 completed（escrow 保持 none，无台账）
 *
 * 资金语义：买家支付 totalCr 进托管（escrow_hold debit）；确认收货时卖家收到 priceCr
 * （escrow_release credit），平台收取 feeCr（无平台账户，不单独记台账，见 PR 说明）。
 */
import { randomUUID } from 'node:crypto';
import {
  REFUND_WINDOW_DAYS,
  type Cr,
  type EscrowStatus,
  type LibraryItem,
  type OrderItem,
  type OrderQuote,
  type OrderStatus,
  type Paginated,
} from '@vibe/shared';
import type { Db } from '../db';
import { ApiError } from '../lib/errors';
import { calcFeeCr } from '../lib/money';
import { getBalanceCr, recordLedger } from './wallet';
import { getProjectRow, hasPurchased } from './projects';

// ---------------------------------------------------------------------------
// 行类型与映射
// ---------------------------------------------------------------------------

interface OrderWithProjectRow {
  id: string;
  order_no: string;
  buyer_id: string;
  project_id: string;
  seller_id: string;
  price_cr: number;
  fee_cr: number;
  total_cr: number;
  status: OrderStatus;
  escrow_status: EscrowStatus;
  payment_ref: string | null;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  refunded_at: string | null;
  cancelled_at: string | null;
  project_title: string;
  project_cover_url: string | null;
  project_status: string;
}

function getOrderRow(db: Db, orderId: string): OrderWithProjectRow {
  const row = db
    .prepare(
      `SELECT o.*, p.title AS project_title, p.cover_url AS project_cover_url, p.status AS project_status
       FROM orders o JOIN projects p ON p.id = o.project_id
       WHERE o.id = ?`,
    )
    .get(orderId) as OrderWithProjectRow | undefined;
  if (!row) throw ApiError.notFound('订单不存在');
  return row;
}

function toOrderItem(row: OrderWithProjectRow): OrderItem {
  return {
    id: row.id,
    orderNo: row.order_no,
    project: {
      id: row.project_id,
      title: row.project_title,
      coverUrl: row.project_cover_url,
      playUrl: `/play/${row.project_id}`,
      status: row.project_status as OrderItem['project']['status'],
    },
    priceCr: row.price_cr,
    feeCr: row.fee_cr,
    totalCr: row.total_cr,
    status: row.status,
    escrowStatus: row.escrow_status,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    deliveredAt: row.delivered_at,
    completedAt: row.completed_at,
    refundedAt: row.refunded_at,
    cancelledAt: row.cancelled_at,
  };
}

function genOrderNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `VCM${ymd}${rand}`;
}

interface OrderInsert {
  id: string;
  orderNo: string;
  buyerId: string;
  projectId: string;
  sellerId: string;
  priceCr: Cr;
  feeCr: Cr;
  totalCr: Cr;
  createdAt: string;
}

function insertOrder(db: Db, order: OrderInsert): void {
  db.prepare(
    `INSERT INTO orders (id, order_no, buyer_id, project_id, seller_id, price_cr, fee_cr, total_cr, status, escrow_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending payment', 'none', ?)`,
  ).run(
    order.id, order.orderNo, order.buyerId, order.projectId, order.sellerId,
    order.priceCr, order.feeCr, order.totalCr, order.createdAt,
  );
}

// ---------------------------------------------------------------------------
// 下单（区域 3）
// ---------------------------------------------------------------------------

export function createOrder(db: Db, buyerId: string, projectId: unknown): OrderItem {
  if (typeof projectId !== 'string' || projectId.trim() === '') {
    throw ApiError.badRequest('VALIDATION', 'projectId 不能为空');
  }
  const project = getProjectRow(db, projectId);
  if (project.status !== 'approved') {
    throw ApiError.conflict(`作品未上架（当前状态 ${project.status}），无法购买`);
  }
  if (project.seller_id === buyerId) {
    throw ApiError.badRequest('VALIDATION', '不能购买自己的作品');
  }
  const active = db
    .prepare(
      `SELECT COUNT(*) AS c FROM orders
       WHERE buyer_id = ? AND project_id = ? AND status IN ('pending payment','paid','delivered')`,
    )
    .get(buyerId, projectId) as { c: number };
  if (active.c > 0) {
    throw ApiError.conflict('已存在未完成订单（待支付/已支付/已交付），请勿重复下单');
  }

  const priceCr = project.price_cr;
  const feeCr = calcFeeCr(priceCr);
  const order: OrderInsert = {
    id: randomUUID(),
    orderNo: genOrderNo(),
    buyerId,
    projectId: project.id,
    sellerId: project.seller_id,
    priceCr,
    feeCr,
    totalCr: priceCr + feeCr,
    createdAt: new Date().toISOString(),
  };
  insertOrder(db, order);
  return toOrderItem(getOrderRow(db, order.id));
}

export function quoteOrder(db: Db, orderId: string, userId: string): OrderQuote {
  const order = getOrderRow(db, orderId);
  if (order.buyer_id !== userId) {
    throw ApiError.forbidden('只有下单买家可以查看报价');
  }
  return {
    orderId: order.id,
    projectId: order.project_id,
    projectTitle: order.project_title,
    priceCr: order.price_cr,
    feeCr: order.fee_cr,
    totalCr: order.total_cr,
  };
}

// ---------------------------------------------------------------------------
// 支付（模拟；免费作品跳过支付直接 completed）
// ---------------------------------------------------------------------------

export interface PayResult {
  order: OrderItem;
  balanceAfterCr: Cr;
}

export function payOrder(db: Db, orderId: string, buyerId: string): PayResult {
  const order = getOrderRow(db, orderId);
  if (order.buyer_id !== buyerId) {
    throw ApiError.forbidden('只有下单买家可以支付');
  }
  if (order.status !== 'pending payment') {
    throw ApiError.conflict(`当前状态 ${order.status} 不可支付（仅 pending payment）`);
  }

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    if (order.total_cr === 0) {
      // 免费作品：跳过支付，escrow 保持 none，直接 completed（无资金流动，不记台账）
      db.prepare(
        `UPDATE orders SET status = 'completed', paid_at = ?, delivered_at = ?, completed_at = ? WHERE id = ?`,
      ).run(now, now, now, orderId);
      return getBalanceCr(db, buyerId);
    }
    // 余额扣减进托管 + 台账（escrow_hold debit）
    const { balanceAfterCr } = recordLedger(db, buyerId, {
      type: 'escrow_hold',
      direction: 'debit',
      amountCr: order.total_cr,
      note: `购买《${order.project_title}》已支付，资金托管中（含 ${order.fee_cr} CR 手续费）`,
      refType: 'order',
      refId: orderId,
    });
    // 作品类支付即交付（PRD）：paid → delivered（自动），escrow held
    db.prepare(
      `UPDATE orders SET status = 'delivered', escrow_status = 'held', payment_ref = ?, paid_at = ?, delivered_at = ? WHERE id = ?`,
    ).run(`PAY-${randomUUID().slice(0, 8).toUpperCase()}`, now, now, orderId);
    return balanceAfterCr;
  });

  const balanceAfterCr = tx();
  return { order: toOrderItem(getOrderRow(db, orderId)), balanceAfterCr };
}

// ---------------------------------------------------------------------------
// 取消（仅未付款，一步完成不追问）
// ---------------------------------------------------------------------------

export function cancelOrder(db: Db, orderId: string, buyerId: string): OrderItem {
  const order = getOrderRow(db, orderId);
  if (order.buyer_id !== buyerId) {
    throw ApiError.forbidden('只有下单买家可以取消订单');
  }
  if (order.status !== 'pending payment') {
    throw ApiError.conflict(`当前状态 ${order.status} 不可取消（仅 pending payment）`);
  }
  db.prepare(`UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    orderId,
  );
  return toOrderItem(getOrderRow(db, orderId));
}

// ---------------------------------------------------------------------------
// 退款（创建 14 天内 REFUND_WINDOW_DAYS；全额退回 totalCr）
// ---------------------------------------------------------------------------

export interface RefundResult {
  order: OrderItem;
  refundedCr: Cr;
  balanceAfterCr: Cr;
}

export function refundOrder(db: Db, orderId: string, buyerId: string): RefundResult {
  const order = getOrderRow(db, orderId);
  if (order.buyer_id !== buyerId) {
    throw ApiError.forbidden('只有下单买家可以申请退款');
  }
  if (order.status !== 'paid' && order.status !== 'delivered') {
    throw ApiError.conflict(`当前状态 ${order.status} 不可退款（仅 paid / delivered）`);
  }
  if (order.escrow_status !== 'held') {
    throw ApiError.conflict(`当前托管状态 ${order.escrow_status} 不可退款`);
  }
  const createdMs = new Date(order.created_at).getTime();
  const windowMs = REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() - createdMs > windowMs) {
    throw ApiError.conflict(`已超过 ${REFUND_WINDOW_DAYS} 天退款窗口`);
  }

  const tx = db.transaction(() => {
    const { balanceAfterCr } = recordLedger(db, buyerId, {
      type: 'refund',
      direction: 'credit',
      amountCr: order.total_cr,
      note: `《${order.project_title}》订单退款，全额退回（含手续费）`,
      refType: 'order',
      refId: orderId,
    });
    db.prepare(
      `UPDATE orders SET status = 'refunded', escrow_status = 'refunded', refunded_at = ? WHERE id = ?`,
    ).run(new Date().toISOString(), orderId);
    return balanceAfterCr;
  });

  const balanceAfterCr = tx();
  return { order: toOrderItem(getOrderRow(db, orderId)), refundedCr: order.total_cr, balanceAfterCr };
}

// ---------------------------------------------------------------------------
// 确认收货（放款：escrow held → released，卖家入账 priceCr，平台留 feeCr）
// ---------------------------------------------------------------------------

export interface ConfirmResult {
  order: OrderItem;
  sellerBalanceAfterCr: Cr;
}

export function confirmOrder(db: Db, orderId: string, buyerId: string): ConfirmResult {
  const order = getOrderRow(db, orderId);
  if (order.buyer_id !== buyerId) {
    throw ApiError.forbidden('只有下单买家可以确认收货');
  }
  if (order.status !== 'delivered') {
    throw ApiError.conflict(`当前状态 ${order.status} 不可确认收货（仅 delivered）`);
  }
  if (order.escrow_status !== 'held') {
    throw ApiError.conflict(`当前托管状态 ${order.escrow_status} 不可放款`);
  }

  const tx = db.transaction(() => {
    // 卖家入账 priceCr（平台收取 feeCr 未单独记账，见 PR 说明）
    const { balanceAfterCr } = recordLedger(db, order.seller_id, {
      type: 'escrow_release',
      direction: 'credit',
      amountCr: order.price_cr,
      note: `《${order.project_title}》售出放款（平台已收取 ${order.fee_cr} CR 手续费）`,
      refType: 'order',
      refId: orderId,
    });
    db.prepare(
      `UPDATE orders SET status = 'completed', escrow_status = 'released', completed_at = ? WHERE id = ?`,
    ).run(new Date().toISOString(), orderId);
    return balanceAfterCr;
  });

  const sellerBalanceAfterCr = tx();
  return { order: toOrderItem(getOrderRow(db, orderId)), sellerBalanceAfterCr };
}

// ---------------------------------------------------------------------------
// 订单列表 / 详情
// ---------------------------------------------------------------------------

const ORDER_STATUSES: readonly OrderStatus[] = [
  'pending payment',
  'paid',
  'delivered',
  'completed',
  'refund requested',
  'refunded',
  'cancelled',
  'disputed',
];

export function listOrders(
  db: Db,
  userId: string,
  opts: { role?: unknown; status?: unknown; page?: number; pageSize?: number },
): Paginated<OrderItem> {
  const role = opts.role === undefined || opts.role === '' ? 'buyer' : String(opts.role);
  if (role !== 'buyer' && role !== 'seller') {
    throw ApiError.badRequest('VALIDATION', 'role 只能是 buyer / seller');
  }
  const where: string[] = [role === 'buyer' ? 'o.buyer_id = ?' : 'o.seller_id = ?'];
  const params: unknown[] = [userId];

  if (opts.status !== undefined && opts.status !== '') {
    const status = String(opts.status);
    if (!ORDER_STATUSES.includes(status as OrderStatus)) {
      throw ApiError.badRequest('VALIDATION', `status 只能是：${ORDER_STATUSES.join(' / ')}`);
    }
    where.push('o.status = ?');
    params.push(status);
  }

  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
  const whereSql = where.join(' AND ');

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM orders o WHERE ${whereSql}`).get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT o.*, p.title AS project_title, p.cover_url AS project_cover_url, p.status AS project_status
       FROM orders o JOIN projects p ON p.id = o.project_id
       WHERE ${whereSql} ORDER BY o.created_at DESC, o.rowid DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as OrderWithProjectRow[];

  return { items: rows.map(toOrderItem), page, pageSize, total };
}

export function getOrder(db: Db, orderId: string, userId: string): OrderItem {
  const order = getOrderRow(db, orderId);
  if (order.buyer_id !== userId && order.seller_id !== userId) {
    throw ApiError.forbidden('只能查看与自己相关的订单');
  }
  return toOrderItem(order);
}

// ---------------------------------------------------------------------------
// My Library（已购列表，含 delisted 已购；两步可达由前端保证）
// ---------------------------------------------------------------------------

export function listLibrary(db: Db, buyerId: string): { items: LibraryItem[] } {
  const rows = db
    .prepare(
      `SELECT o.id AS order_id, o.status AS order_status, o.paid_at, o.created_at,
              p.id AS project_id, p.title, p.cover_url, p.price_cr, p.status AS project_status
       FROM orders o JOIN projects p ON p.id = o.project_id
       WHERE o.buyer_id = ? AND o.status IN ('paid','delivered','completed')
       ORDER BY o.paid_at DESC, o.created_at DESC`,
    )
    .all(buyerId) as {
    order_id: string;
    order_status: OrderStatus;
    paid_at: string | null;
    created_at: string;
    project_id: string;
    title: string;
    cover_url: string | null;
    price_cr: number;
    project_status: string;
  }[];
  return {
    items: rows.map((r) => ({
      project: {
        id: r.project_id,
        title: r.title,
        coverUrl: r.cover_url,
        playUrl: `/play/${r.project_id}`,
        priceCr: r.price_cr,
        status: r.project_status as LibraryItem['project']['status'],
      },
      orderId: r.order_id,
      orderStatus: r.order_status,
      purchasedAt: r.paid_at ?? r.created_at,
    })),
  };
}

export function getLibraryRun(db: Db, buyerId: string, projectId: string): { playUrl: string } {
  if (!hasPurchased(db, buyerId, projectId)) {
    throw ApiError.forbidden('未购买该作品');
  }
  return { playUrl: `/play/${projectId}` };
}
