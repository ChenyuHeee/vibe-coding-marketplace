import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { defaultDbPath, defaultUploadsDir, migrate, openDb, type Db } from './index';
import { DEMO_BIDS, DEMO_COMMISSION, DEMO_PROJECTS, DEMO_USERS } from './demo-data';

/** 验收标准 hash（sha256 前缀，用于「发布即锁定」证明与纠纷溯源） */
export function hashCriteria(criteria: string): string {
  const hex = createHash('sha256').update(criteria).digest('hex');
  return `sha256:${hex}`;
}

export interface SeedOptions {
  uploadsDir?: string;
}

/** 写演示作品的单文件 HTML 到 uploads/projects/<id>/index.html */
function writeProjectFiles(uploadsDir: string): void {
  for (const p of DEMO_PROJECTS) {
    const dir = path.join(uploadsDir, 'projects', p.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), p.html, 'utf8');
  }
}

/**
 * 空库时写入演示数据（A6）。返回是否执行了写入。
 * - 账号：admin / buyer / seller / contractor（密码见 demo-data.ts）
 * - 4 个已上架（approved）作品 + 可运行 HTML 文件
 * - 1 个 open 需求 + 2 条 submitted 投标
 * - 各账号初始余额走 transactions 台账（balance_after_cr 连续可审计）
 */
export function seed(db: Db, options: SeedOptions = {}): void {
  const uploadsDir = options.uploadsDir ?? defaultUploadsDir();
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    // 账号 + 钱包 + 初始余额台账
    for (const u of DEMO_USERS) {
      const passwordHash = bcrypt.hashSync(u.password, 10);
      db.prepare(
        `INSERT INTO users (id, email, password_hash, display_name, roles, is_admin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(u.id, u.email, passwordHash, u.displayName, JSON.stringify(u.roles), u.isAdmin ? 1 : 0, now, now);

      const walletId = randomUUID();
      db.prepare(
        `INSERT INTO wallets (id, user_id, balance_cr, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(walletId, u.id, u.initialBalanceCr, now, now);

      if (u.initialBalanceCr > 0) {
        db.prepare(
          `INSERT INTO transactions (id, user_id, type, direction, amount_cr, balance_after_cr, ref_type, ref_id, status, note, created_at)
           VALUES (?, ?, 'topup', 'credit', ?, ?, NULL, NULL, 'completed', ?, ?)`,
        ).run(
          randomUUID(),
          u.id,
          u.initialBalanceCr,
          u.initialBalanceCr,
          `演示数据：初始余额 ${u.initialBalanceCr} CR`,
          now,
        );
      }
    }

    // 已上架作品（approved）+ 文件
    const insertProject = db.prepare(
      `INSERT INTO projects (id, seller_id, title, description, category, price_cr, trial_scope, file_path, entry_file, status, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'index.html', 'approved', ?, ?, ?)`,
    );
    for (const p of DEMO_PROJECTS) {
      insertProject.run(
        p.id,
        p.sellerId,
        p.title,
        p.description,
        p.category,
        p.priceCr,
        p.trialScope,
        `projects/${p.id}`,
        now,
        now,
        now,
      );
    }
    writeProjectFiles(uploadsDir);

    // 需求（open，验收标准发布即锁定：criteria + hash）
    const c = DEMO_COMMISSION;
    db.prepare(
      `INSERT INTO commissions (id, buyer_id, title, description, budget_min_cr, budget_max_cr, timeline_days, acceptance_criteria, criteria_hash, reference_project_ids, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    ).run(
      c.id,
      c.buyerId,
      c.title,
      c.description,
      c.budgetMinCr,
      c.budgetMaxCr,
      c.timelineDays,
      c.acceptanceCriteria,
      hashCriteria(c.acceptanceCriteria),
      JSON.stringify(c.referenceProjectIds),
      now,
      now,
    );

    // 投标（submitted）
    const insertBid = db.prepare(
      `INSERT INTO bids (id, commission_id, contractor_id, amount_cr, proposal, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'submitted', ?)`,
    );
    for (const b of DEMO_BIDS) {
      insertBid.run(b.id, b.commissionId, b.contractorId, b.amountCr, b.proposal, now);
    }

    // ------------------------------------------------------------------
    // 演示托管订单（PR-B2）：buyer 购买《贪吃蛇 Classic》，已支付、资金在托管
    // buyer 余额 5000 → 4475（525 CR = 500 价 + 25 手续费 进托管）；seller 侧为待收托管
    // ------------------------------------------------------------------
    db.prepare(
      `INSERT INTO orders (id, order_no, buyer_id, project_id, seller_id, price_cr, fee_cr, total_cr, status, escrow_status, payment_ref, created_at, paid_at)
       VALUES ('ord_demo_1', 'VCM202608240001', 'usr_buyer', 'proj_snake', 'usr_seller', 500, 25, 525, 'paid', 'held', 'PAY-DEMO-0001', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO transactions (id, user_id, type, direction, amount_cr, balance_after_cr, ref_type, ref_id, status, note, created_at)
       VALUES (?, 'usr_buyer', 'escrow_hold', 'debit', 525, 4475, 'order', 'ord_demo_1', 'completed', '购买《贪吃蛇 Classic》已支付，资金托管中（含 5% 手续费）', ?)`,
    ).run(randomUUID(), now);
    db.prepare(`UPDATE wallets SET balance_cr = 4475, updated_at = ? WHERE user_id = 'usr_buyer'`).run(now);

    // ------------------------------------------------------------------
    // 演示提现（PR-B2）：seller 发起 500 CR 提现（withdrawal pending，1–3 个工作日）
    // seller 余额 2000 → 1500；pendingWithdrawalCr = 500
    // ------------------------------------------------------------------
    db.prepare(
      `INSERT INTO withdrawals (id, user_id, amount_cr, bank_info, status, eta_days, created_at)
       VALUES ('wdr_demo_1', 'usr_seller', 500, ?, 'withdrawal pending', 2, ?)`,
    ).run(JSON.stringify({ bankName: '演示银行', cardLast4: '8888', holderName: '演示卖家' }), now);
    db.prepare(
      `INSERT INTO transactions (id, user_id, type, direction, amount_cr, balance_after_cr, ref_type, ref_id, status, note, created_at)
       VALUES (?, 'usr_seller', 'withdrawal', 'debit', 500, 1500, 'withdrawal', 'wdr_demo_1', 'completed', '提现申请：演示银行 ****8888，预计 2 个工作日到账', ?)`,
    ).run(randomUUID(), now);
    db.prepare(`UPDATE wallets SET balance_cr = 1500, updated_at = ? WHERE user_id = 'usr_seller'`).run(now);
  });

  tx();
}

/** 启动时自动 seed：空库（users 表无记录）才写入 */
export function seedIfEmpty(db: Db, options: SeedOptions = {}): boolean {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  if (row.c > 0) return false;
  seed(db, options);
  return true;
}

/** 清空全部业务表（--force 重建用，子表先删） */
export function wipeAll(db: Db): void {
  const tables = [
    'transactions',
    'withdrawals',
    'milestones',
    'contracts',
    'bids',
    'commissions',
    'orders',
    'reviews',
    'projects',
    'wallets',
    'users',
  ];
  const tx = db.transaction(() => {
    for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
  });
  tx();
}

// ---------------------------------------------------------------------------
// CLI：npm run seed -w @vibe/api  [--force]
// ---------------------------------------------------------------------------
if (require.main === module) {
  const force = process.argv.includes('--force');
  const dbPath = defaultDbPath();
  const db = openDb(dbPath);
  migrate(db);
  if (force) wipeAll(db);
  const seeded = seedIfEmpty(db);
  db.close();
  if (seeded) {
    console.log(`[seed] 演示数据已写入 ${dbPath}（4 个作品文件位于 ${defaultUploadsDir()}/projects/）`);
  } else {
    console.log(`[seed] 数据库非空，跳过。如需重建演示数据：npm run seed -w @vibe/api -- --force`);
  }
}
