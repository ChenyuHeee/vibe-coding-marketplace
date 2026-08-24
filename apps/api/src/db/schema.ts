/**
 * 数据库 DDL（better-sqlite3）。
 *
 * 依据：docs/ARCHITECTURE.md §3（字段级草案），按 DECISIONS.md D2 金额字段用 `*_cr`（整数 CR）。
 * 状态词一律使用 docs/STATUS_VOCABULARY.md 的规范字符串存储。
 * 幂等：全部 `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`，启动时执行。
 */

export const SCHEMA = `
-- ---------------------------------------------------------------------------
-- 3.1 用户与认证（roles 为 JSON 数组，D4 角色并存；is_admin 平台管理员标志）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  roles         TEXT NOT NULL DEFAULT '["buyer"]',
  bio           TEXT,
  rating_avg    REAL NOT NULL DEFAULT 0,
  rating_count  INTEGER NOT NULL DEFAULT 0,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 3.5 钱包（1:1 user）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  balance_cr  INTEGER NOT NULL DEFAULT 0 CHECK (balance_cr >= 0),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 3.2 作品线 · projects（审核流状态见词汇表 §1）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  seller_id      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  category       TEXT NOT NULL,
  price_cr       INTEGER NOT NULL DEFAULT 0,
  cover_url      TEXT,
  trial_scope    TEXT NOT NULL DEFAULT '',
  file_path      TEXT NOT NULL,
  entry_file     TEXT NOT NULL DEFAULT 'index.html',
  status         TEXT NOT NULL DEFAULT 'draft',
  review_note    TEXT,
  avg_rating     REAL NOT NULL DEFAULT 0,
  rating_count   INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  play_count     INTEGER NOT NULL DEFAULT 0,
  published_at   TEXT,
  submitted_at   TEXT,
  reviewed_at    TEXT,
  delisted_at    TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_status   ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
CREATE INDEX IF NOT EXISTS idx_projects_seller   ON projects(seller_id);

-- ---------------------------------------------------------------------------
-- 作品审核事件流水（GET /api/projects/:id/review 的 history；词汇表 §1）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_review_events (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  event      TEXT NOT NULL,
  note       TEXT,
  actor_id   TEXT REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_review_events_project ON project_review_events(project_id, created_at);

-- ---------------------------------------------------------------------------
-- 举报（PR-B2-A；reports(id, project_id, reporter_id, reason, created_at)）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_project ON reports(project_id, created_at);

-- ---------------------------------------------------------------------------
-- 3.2 作品线 · orders（订单状态见词汇表 §2；escrow 见词汇表 §2/§3）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  order_no      TEXT NOT NULL UNIQUE,
  buyer_id      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  seller_id     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  price_cr      INTEGER NOT NULL,
  fee_cr        INTEGER NOT NULL DEFAULT 0,
  total_cr      INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending payment',
  escrow_status TEXT NOT NULL DEFAULT 'none',
  payment_ref   TEXT,
  created_at    TEXT NOT NULL,
  paid_at       TEXT,
  delivered_at  TEXT,
  completed_at  TEXT,
  refunded_at   TEXT,
  cancelled_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_buyer   ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller  ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);

-- ---------------------------------------------------------------------------
-- 3.2 作品线 · reviews（仅已购可评）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_id   TEXT REFERENCES orders(id) ON DELETE RESTRICT,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 3.4 需求线 · commissions（验收标准发布即锁定：acceptance_criteria + criteria_hash）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commissions (
  id                     TEXT PRIMARY KEY,
  buyer_id               TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title                  TEXT NOT NULL,
  description            TEXT NOT NULL,
  budget_min_cr          INTEGER NOT NULL DEFAULT 0,
  budget_max_cr          INTEGER NOT NULL DEFAULT 0,
  timeline_days          INTEGER NOT NULL DEFAULT 7,
  acceptance_criteria    TEXT NOT NULL,
  criteria_hash          TEXT NOT NULL,
  reference_project_ids  TEXT NOT NULL DEFAULT '[]',
  status                 TEXT NOT NULL DEFAULT 'open',
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);

-- ---------------------------------------------------------------------------
-- 3.4 需求线 · bids（一人一单一标由应用层在 Phase 2 接单接口校验；
--     此处用普通索引，允许演示数据同一 contractor 对同一需求有多条历史投标）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bids (
  id            TEXT PRIMARY KEY,
  commission_id TEXT NOT NULL REFERENCES commissions(id) ON DELETE RESTRICT,
  contractor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_cr     INTEGER NOT NULL,
  proposal      TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'submitted',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bids_commission ON bids(commission_id);
CREATE INDEX IF NOT EXISTS idx_bids_contractor ON bids(contractor_id);

-- ---------------------------------------------------------------------------
-- 3.4 需求线 · contracts（合同级状态 = PRD 第 5 节规范六词，不得改名）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
  id               TEXT PRIMARY KEY,
  commission_id    TEXT NOT NULL REFERENCES commissions(id) ON DELETE RESTRICT,
  buyer_id         TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contractor_id    TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  bid_id           TEXT NOT NULL REFERENCES bids(id) ON DELETE RESTRICT,
  agreed_amount_cr INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'bid',
  escrow_status    TEXT NOT NULL DEFAULT 'none',
  accepted_at      TEXT,
  paid_at          TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contracts_buyer       ON contracts(buyer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_contractor  ON contracts(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status      ON contracts(status);

-- ---------------------------------------------------------------------------
-- 3.4 需求线 · milestones（is_final：最终里程碑声明，approve 后合同进入 buyer acceptance；
--     feedback：request-revision 的修改意见（必填））
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS milestones (
  id               TEXT PRIMARY KEY,
  contract_id      TEXT NOT NULL REFERENCES contracts(id) ON DELETE RESTRICT,
  seq              INTEGER NOT NULL,
  title            TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  deliverable_path TEXT,
  entry_file       TEXT NOT NULL DEFAULT 'index.html',
  is_final         INTEGER NOT NULL DEFAULT 0,
  feedback         TEXT,
  status           TEXT NOT NULL DEFAULT 'submitted',
  submitted_at     TEXT,
  approved_at      TEXT,
  UNIQUE (contract_id, seq)
);

-- ---------------------------------------------------------------------------
-- 3.5 钱包线 · transactions（收支台账，每次资金变动必记，balance_after_cr 可审计）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type             TEXT NOT NULL,
  direction        TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_cr        INTEGER NOT NULL,
  balance_after_cr INTEGER NOT NULL,
  ref_type         TEXT,
  ref_id           TEXT,
  status           TEXT NOT NULL DEFAULT 'completed',
  note             TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at);

-- ---------------------------------------------------------------------------
-- 3.5 钱包线 · withdrawals（提现状态见词汇表 §4：withdrawal pending/completed/failed）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS withdrawals (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_cr    INTEGER NOT NULL,
  bank_info    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'withdrawal pending',
  eta_days     INTEGER NOT NULL,
  created_at   TEXT NOT NULL,
  processed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id, status);
`;
