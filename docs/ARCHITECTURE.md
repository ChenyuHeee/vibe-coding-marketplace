# 架构决策（Architecture Decision Record）

> 作者：Tech Lead Agent · 状态：v1 草案（待 Orchestrator 审查）
> 依据：[PRD.md](PRD.md)（完整需求）与 [WORKFLOW.md](WORKFLOW.md)（协作规范）
> ⚠️ 状态词汇表的**唯一权威来源**是 PM 产出的 `docs/STATUS_VOCABULARY.md`。本文第 6 节列出的是 Tech Lead 依据 PRD 第 5 节整理的**草案状态词**，若与词汇表冲突，以词汇表为准，由 Orchestrator 协调。

---

## 1. 技术选型表

| 领域 | 选型 | 版本 | 理由 |
|------|------|------|------|
| 语言 | TypeScript | ^5.x | 全栈类型安全；`packages/shared` 共享类型一次定义、前后端复用（状态词、DTO） |
| 包管理 / Monorepo | npm workspaces | npm ≥10 | 零额外工具（不用 pnpm/turbo/nx）；`npm install && npm run dev` 一条命令可跑 |
| 前端 | React 18 + Vite 6 | react ^18, vite ^6 | 课程项目主流组合；Vite dev server 快、配置少；Vite 6 对 Node 22 兼容稳定 |
| 后端 | Express 4 | ^4.21 | 生态最大、资料最多（课程项目查错成本最低）；中间件体系（cors/json/静态）开箱即用。Fastify 更"现代"但无必要 |
| 数据库 | **better-sqlite3** | ^12.x | 同步 API（`prepare/run/get/all`、`db.transaction()`）对课程项目最友好；SQLite 零外部服务；Node 22 下有**预编译二进制**（实测 6s 装完，无需编译工具链）。备选：Node 22 内置 `node:sqlite`（实测可用，但 API 仍标记 experimental，可能变动，弃用） |
| API 运行时（dev） | tsx watch | ^4 | 免编译热重启 TypeScript；`npm run dev` 即起 |
| 认证 | JWT（Bearer）+ bcryptjs | — | 课程项目简单方案：无状态、前端 localStorage 存 token 即可；bcryptjs 纯 JS 免原生编译 |
| 测试 | Vitest + supertest | vitest ^3 | 与 Vite 同生态；API 用 supertest 打内存 app；web 用 jsdom + Testing Library |
| Lint | ESLint 9（flat config）+ typescript-eslint | ^9 / ^8 | 单根配置覆盖全仓库，规则统一 |
| CI | GitHub Actions | — | PR 触发：install → lint → typecheck → build → test |
| 上传作品存储 | 文件系统 `uploads/` 目录 | — | HTML 项目天然是文件；SQLite 只存元数据与相对路径（见 §3.3） |

> 为什么不用 `node:sqlite`：实测 Node 22.23.2 可用但输出 `ExperimentalWarning`，官方标注「API might change at any time」。课程项目后期 BE dev 要写大量表操作，选 API 稳定、文档全、社区答案多的 better-sqlite3 更省事。

---

## 2. 目录结构（monorepo）

```
vibe-coding-marketplace/
├── package.json                 # npm workspaces: apps/*, packages/*；dev/build/test/lint/typecheck
├── package-lock.json            # 提交（CI npm ci 依赖）
├── tsconfig.base.json           # 统一 TS 编译选项（strict），各包 extends
├── .env.example                 # 环境变量样例（API_PORT/JWT_SECRET/DATABASE_PATH/UPLOADS_DIR…）
├── .gitignore                   # 已有；追加 data/、uploads/、*.db
├── .github/
│   ├── ISSUE_TEMPLATE/  PULL_REQUEST_TEMPLATE.md   # 已有
│   └── workflows/ci.yml         # install → lint → typecheck → build → test
├── docs/
│   ├── PRD.md  WORKFLOW.md      # 已有
│   ├── ARCHITECTURE.md          # 本文
│   ├── API.md                   # REST API 设计
│   └── STATUS_VOCABULARY.md     # PM 产出（唯一状态词来源，待创建）
├── packages/shared/
│   └── src/index.ts             # StatusWord 联合类型、HealthResponse、角色/分类枚举等
├── apps/api/
│   ├── src/
│   │   ├── index.ts             # 启动入口（listen）
│   │   ├── app.ts               # 组装 express app（导出，供测试）
│   │   ├── db/                  # better-sqlite3 连接 + schema 迁移
│   │   ├── middleware/          # auth(JWT)、error handler、upload limits
│   │   ├── routes/              # auth/projects/orders/commissions/bids/wallets…
│   │   └── services/            # 上传解压、支付模拟、托管状态机
│   ├── data/app.db              # SQLite 文件（gitignore）
│   └── uploads/projects/<projectId>/   # 作品文件（gitignore）
├── apps/web/
│   ├── src/  App.tsx  main.tsx  pages/ components/  api/client.ts
│   ├── vite.config.ts           # dev port 5173；/api 代理 → :3001
│   └── index.html
```

**端口约定**：web dev = `5173`，api = `3001`。Vite dev 用 `/api` 代理到 3001（同源，无 CORS），API 同时配 CORS 白名单允许 `http://localhost:5173`（兜底直接调用）。

---

## 3. 数据库设计草案（字段级）

> 约定：金额一律用**分（cents）**存整数，避免浮点误差；`id` 用 UUID 文本；外键加 `ON DELETE RESTRICT`；所有表带 `created_at`/`updated_at`（ISO 字符串）。TEXT 数组用 JSON 字符串存储（SQLite 无原生数组）。

### 3.1 用户与认证

**users**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| email | TEXT UNIQUE NOT NULL | 登录名 |
| password_hash | TEXT NOT NULL | bcryptjs |
| display_name | TEXT NOT NULL | |
| avatar_url | TEXT | 可空 |
| roles | TEXT NOT NULL | JSON 数组，取值 `["buyer"]` `["seller"]` `["contractor"]` 的任意组合（三角色可兼任；页面按当前上下文角色呈现） |
| bio | TEXT | 可空 |
| rating_avg | REAL DEFAULT 0 | 作为卖家的综合评分 |
| rating_count | INTEGER DEFAULT 0 | |
| created_at / updated_at | TEXT | |

> 角色表达决策：**`roles` 为数组**（不是单值）。PRD 说"三种角色共用一个平台，同一页面三角色呈现不同内容"，用户完全可能是"既是买家又是卖家"；权限判定按动作归属（上架→需 `seller`，投标→需 `contractor`，购买→需 `buyer`），注册时默认 `["buyer"]`，可在设置中追加角色。

### 3.2 作品线（Marketplace / 上传审核 / 购买）

**projects**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID；同时是存储目录名 `uploads/projects/<id>/` |
| seller_id | TEXT FK→users.id NOT NULL | |
| title | TEXT NOT NULL | |
| description | TEXT NOT NULL | |
| category | TEXT NOT NULL | 枚举（见 shared：game/tool/art/animation/webapp/other 等） |
| price_cents | INTEGER NOT NULL DEFAULT 0 | 0 = 免费 |
| cover_url | TEXT | 封面截图（上传审核时生成/提供） |
| trial_scope | TEXT NOT NULL | 试用范围说明（PRD 区域 1：详情页试玩；字段为展示性描述，如 "完整版 5 分钟" / "前 3 关"；课程项目不做功能级限流，仅记录并在详情页展示） |
| file_path | TEXT NOT NULL | 相对 `uploads/` 的目录路径（如 `projects/<id>`） |
| entry_file | TEXT NOT NULL DEFAULT 'index.html' | 试玩入口（单文件上传时即该文件名） |
| status | TEXT NOT NULL | 审核状态机（§4.1）：`draft` / `submitted` / `under review` / `approved` / `rejected` / `delisted` |
| review_note | TEXT | 审核意见（驳回时必填） |
| avg_rating | REAL DEFAULT 0 | 冗余聚合，避免每次 JOIN 计算 |
| rating_count | INTEGER DEFAULT 0 | |
| download_count / play_count | INTEGER DEFAULT 0 | |
| published_at | TEXT | 上架时间（status=approved 时写入） |
| created_at / updated_at | TEXT | |

**reviews**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| project_id | TEXT FK | |
| user_id | TEXT FK | 买家 |
| order_id | TEXT FK | 仅已购可评 |
| rating | INTEGER NOT NULL | 1–5 |
| comment | TEXT | |
| created_at | TEXT | |
| UNIQUE(project_id, user_id) | | 一人一作一评 |

**orders**（作品购买）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| order_no | TEXT UNIQUE | 展示用单号 |
| buyer_id | TEXT FK | |
| project_id | TEXT FK | |
| seller_id | TEXT FK | 冗余，方便卖家查询 |
| price_cents | INTEGER | 作品价 |
| fee_cents | INTEGER | 平台手续费（如 5%，下单时算好，**下单前展示总价**） |
| total_cents | INTEGER | = price + fee，实付 |
| status | TEXT | 订单状态机（§4.2）：`pending` / `paid` / `completed` / `cancelled` / `refunded` |
| escrow_status | TEXT | 托管状态机（§4.3）：`none` / `held` / `released` / `refunded` |
| payment_ref | TEXT | 模拟支付流水号 |
| created_at / paid_at / completed_at / refunded_at | TEXT | 时间线 |

### 3.3 上传作品的存储与试玩安全（重要）

**存储方案**：文件系统目录，不存数据库 BLOB。

```
uploads/
└── projects/
    └── <projectId>/          # 与 projects.id 同名
        ├── index.html        # 入口（单文件上传：直接就是该文件）
        └── …其他资源          # css/js/img/zip 解压后的文件
```

- 上传接口收**单个 HTML 文件**（≤20MB）或 **zip**（≤50MB）。
- zip 解压边界（服务端严格校验，`adm-zip`/`yauzl` + 自实现校验）：
  - 总解压后体积 ≤100MB；条目数 ≤1000；
  - **路径穿越拒绝**：每个条目路径规范化后必须以目标目录为前缀，`..` 或绝对路径一律拒绝；
  - **拒绝符号链接**（防止解压出指向外部的链接）；
  - 只保留白名单扩展名文件，其余丢弃（见下）。
- **MIME 白名单**（服务端只允许这些扩展名被回放）：`.html .htm .css .js .mjs .json .png .jpg .jpeg .gif .webp .svg .ico .woff .woff2 .ttf .otf .mp3 .wav .ogg .mp4 .webm .txt .md .pdf`。其他一律 404。

**URL 设计（试玩回放）**：

- 详情页试玩 iframe：`/play/:projectId` → API 静态回放 `uploads/projects/<projectId>/`（入口默认 `index.html`，`?entry=` 可指定；仅对 status=approved 的作品开放，作者本人可在审核期间预览）。
- 下载：`GET /api/projects/:id/download`（鉴权 + 已购/作者，zip 打包返回）。

**iframe 安全（核心措施）**：

```html
<iframe
  src="/play/:projectId"
  sandbox="allow-scripts allow-forms allow-popups allow-pointer-lock allow-modals allow-downloads"
  referrerpolicy="no-referrer"
/>
```

- **不给 `allow-same-origin`**：iframe 内作品获得**不透明源（opaque origin）**——读不到主站 cookie/localStorage，无法冒充登录用户；这是隔离的关键。
- 不给 `allow-top-navigation`：作品不能把父页面导航走。
- 服务端回放时再叠一层响应头（纵深防御）：
  - `Content-Security-Policy: sandbox allow-scripts allow-forms; default-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:`（作品是卖家代码，主站不信任它，靠 CSP sandbox 把它锁在隔离上下文）
  - `X-Content-Type-Options: nosniff`、`Content-Disposition: inline`
- 同源部署而非第三方 origin：课程项目不做多域名，主站与作品同域但靠 iframe sandbox + CSP 双层隔离，足以满足「sandboxed iframe、无第三方 origin」约束。
- 试玩免登录、免付款（PRD 低风险动作）。

**「无第三方 origin」的说明**：作品文件由我们自己的 API 回放（`/play/:projectId`），不引用任何外部 CDN/第三方域；作品自身的 `<script src="https://...">` 由 CSP 默认拦截（`default-src 'self'`），防数据外泄。

### 3.4 需求线（Commission / 接单交付）

**commissions**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| buyer_id | TEXT FK | |
| title | TEXT NOT NULL | |
| description | TEXT NOT NULL | |
| budget_min_cents / budget_max_cents | INTEGER | 预算区间 |
| timeline_days | INTEGER | 期望天数 |
| acceptance_criteria | TEXT NOT NULL | **验收标准，发布时锁定**：写入后不可编辑（后端拒绝任何修改该字段的 update；详情见 §4.5 与 PRD 区域 4 ⚠️） |
| criteria_hash | TEXT | 验收标准内容 hash，用于「锁定」证明与纠纷溯源 |
| reference_project_ids | TEXT | JSON 数组：参考作品 project id |
| status | TEXT | 需求板状态（§4.5）：`open` / `in progress` / `completed` / `cancelled` |
| created_at / updated_at | TEXT | |

**bids**（投标）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| commission_id | TEXT FK | |
| contractor_id | TEXT FK | |
| amount_cents | INTEGER | 报价（须在预算区间内） |
| proposal | TEXT | 方案说明 |
| status | TEXT | `submitted` / `selected` / `rejected` / `withdrawn` |
| created_at | TEXT | |
| UNIQUE(commission_id, contractor_id) | | 一人一单一标 |

**contracts**（接单交付：里程碑交付的工作单）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| commission_id | TEXT FK | |
| buyer_id | TEXT FK | |
| contractor_id | TEXT FK | |
| bid_id | TEXT FK | 由哪个中标 bid 产生 |
| agreed_amount_cents | INTEGER | 中标价（= selected bid 报价） |
| status | TEXT | **PRD 第 5 节六状态**（§4.4）：`bid` / `selected` / `in progress` / `milestone submission` / `buyer acceptance` / `payout` |
| escrow_status | TEXT | `none` / `held` / `released` / `refunded`（买家预算进托管） |
| created_at / updated_at | TEXT | |

**milestones**（里程碑）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| contract_id | TEXT FK | |
| seq | INTEGER | 顺序号 |
| title / description | TEXT | |
| deliverable_path | TEXT | 交付物文件路径（uploads/milestones/<contractId>/<seq>/） |
| status | TEXT | `submitted` / `approved` / `revision requested` |
| submitted_at / approved_at | TEXT | |

### 3.5 钱包线（连接两条线的钱）

**wallets**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| user_id | TEXT FK UNIQUE | 1:1 |
| balance_cents | INTEGER NOT NULL DEFAULT 0 | 可用余额 |
| created_at / updated_at | TEXT | |
> 托管中的钱不计入 `balance_cents`（钱已离开钱包进 escrow），由 orders/contracts 的 `escrow_status` 追踪「钱在谁手里」。

**transactions**（收支台账，充值/支付/托管/结算全记录）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| user_id | TEXT FK | |
| type | TEXT | `topup` / `withdrawal` / `order_payment` / `escrow_hold` / `escrow_release` / `payout` / `refund` / `fee` |
| direction | TEXT | `credit`（入账）/ `debit`（出账） |
| amount_cents | INTEGER | |
| balance_after_cents | INTEGER | 记账后余额（流水可审计） |
| ref_type / ref_id | TEXT | 关联 order / contract / withdrawal |
| status | TEXT | `pending` / `completed` / `failed` |
| note | TEXT | 人话说明（「作品《XX》售出分成入账」） |
| created_at | TEXT | |

**withdrawals**（提现，模拟）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| user_id | TEXT FK | |
| amount_cents | INTEGER | |
| bank_info | TEXT | 模拟：卡号后四位 + 开户名（掩码存储）；身份校验为 mock 标志位 |
| status | TEXT | `pending` / `paid` / `rejected` |
| eta_days | INTEGER | 到账时间说明（如 T+1） |
| created_at / processed_at | TEXT | |

---

## 4. 关键流程状态机

> 箭头 = 合法迁移。**同一状态词，买家/卖家/接单者看到的是同一件事**（PRD 5.2）。

### 4.1 作品审核状态机（区域 2）
```
draft ──提交──▶ submitted ──▶ under review ──┬─通过─▶ approved (published) ──下架(需理由)──▶ delisted
    ▲                                          └─驳回─▶ rejected ──修改后重新提交──▶ submitted
    └────────────── 作者可随时改回草稿（未提交时）────────────
```
- 作者全程可见进度（列表展示当前状态 + 审核意见）。
- `delisted` 后：列表/详情对**新买家**隐藏，**已购买家保留访问权与下载权**（PRD 4 高风险动作：下架已售作品必须给理由）。

### 4.2 订单状态机（区域 3）
```
pending ──支付(余额→托管)──▶ paid(escrow=held) ──自动/确认收货──▶ completed(escrow=released)
   │                            │
   ├─取消(未付款,一步)──▶ cancelled          └──退款(全额回余额)──▶ refunded
   └───────────────────────────────────────────────────────────▶（paid 也可走退款）
```
- 下单前展示 `total_cents`（含手续费）；取消未付款订单一步完成不追问（PRD 4）。
- 退款路径常驻订单页（PRD 区域 3：退款路径必须可找到）。

### 4.3 托管状态机（escrow，订单与合同共用词）
```
none ──资金入账──▶ held（钱在平台托管，不在卖家/接单者手里）
  │                    │
  └────────────────────┼─验收通过/确认收货──▶ released（到卖家/接单者钱包）
                       └─退款/取消──▶ refunded（回买家钱包）
```
- 「钱现在在谁手里」= escrow_status 一眼可见（PRD 区域 6）。

### 4.4 接单交付状态机（区域 5，**PRD 规范六词**）
```
bid ──买家选中某投标──▶ selected ──合同生效+预算进托管──▶ in progress
     （投标阶段）                                        │
                                                        ▼
   payout ◀── buyer acceptance ◀── milestone submission
  （结算：托管释放到接单者钱包）   （里程碑提交/修订循环）
```
- `milestone submission` 期间允许 `revision requested` 循环（里程碑级），但合同级状态词**固定用 PRD 六词**，买卖双方看到的永远是同一个词。
- 结算触发：最终里程碑 buyer acceptance 通过后 → escrow `released` → contractor 钱包入账（payout）。放款前买家必须先看到交付物（PRD 4）。

### 4.5 需求（Commission）状态机（区域 4/5）
```
open（接受投标）──选中投标──▶ in progress ──最终验收通过──▶ completed
   │                              │
   └──买家取消──▶ cancelled        └──（验收失败可回到 in progress 或终止退款）
```
- 验收标准在 `open` 发布时锁定：`acceptance_criteria` 与 `criteria_hash` 一旦创建不可改；**有投标（≥1 bid）后任何一方都不可单方面修改**（PRD 4）。

### 4.6 提现状态机（区域 6，模拟）
```
pending ──T+1 模拟到账──▶ paid
   └──风控驳回──▶ rejected（余额退回）
```

---

## 5. 认证 / 支付 / 托管实现要点

- **认证**：注册时 `bcryptjs` 哈希密码；登录签发 JWT（HS256，`JWT_SECRET` 环境变量，24h 过期）放在 `Authorization: Bearer <token>`；`roles` 在 token 的 payload 中。中间件 `requireAuth` + `requireRole('seller')` 组合做权限。
- **模拟支付**：充值 = 调用 mock 银行（直接成功）；大额充值（≥¥500）二次确认（前端确认弹窗 + 后端要求 `confirm: true`）。所有资金变动走 `transactions` 台账。
- **托管 = 状态机，不是真钱**：买家支付/预算 → 余额扣减 + order/contract `escrow_status=held`；验收 → `released` + 卖家/接单者余额入账 + `transactions` 各记一条。到账时间：订单即时、提现 T+1（`eta_days` 展示）。

---

## 6. 状态词汇表（草案 —— 以 PM 的 STATUS_VOCABULARY.md 为唯一来源）

| 域 | 状态词 | 备注 |
|----|--------|------|
| 接单交付（PRD 第 5 节，**不得改名**） | `bid` / `selected` / `in progress` / `milestone submission` / `buyer acceptance` / `payout` | 合同级六词 |
| 里程碑（子状态） | `submitted` / `approved` / `revision requested` | |
| 订单 | `pending` / `paid` / `completed` / `cancelled` / `refunded` | |
| 托管 escrow | `none` / `held` / `released` / `refunded` | 订单与合同共用 |
| 作品审核 | `draft` / `submitted` / `under review` / `approved` / `rejected` / `delisted` | |
| 需求板 | `open` / `in progress` / `completed` / `cancelled` | |
| 投标 | `submitted` / `selected` / `rejected` / `withdrawn` | |
| 提现 | `pending` / `paid` / `rejected` | |
| 台账记录 | `pending` / `completed` / `failed` | transactions.status |

---

## 7. CI（.github/workflows/ci.yml）

- 触发：`push`（任意分支）+ `pull_request`。
- 五个 job 串行依赖（`needs: install`）：`install`（setup-node 22 + `npm ci` + 缓存）→ `lint`（`npm run lint`）→ `typecheck`（`npm run typecheck`）→ `build`（`npm run build`）→ `test`（`npm test`）。
- 每个 job 用 `actions/setup-node` + `actions/cache`（node_modules / ~/.npm），保证二次安装快速。

## 8. 需要 Orchestrator 协调的事项

1. **状态词汇表归属**：本文 §6 为 Tech Lead 草案，PM 的 `STATUS_VOCABULARY.md` 是唯一来源——请 PM 尽快产出并 diff 本文，冲突以词汇表为准（特别是「需求板状态」与「台账记录状态」，PRD 未明示，属我设计的补充词）。
2. **手续费费率**：本文按 5% 示例设计（`fee_cents`），需 PM 确认实际费率/是否免费作品也收费。
3. **大额充值阈值**：PRD 要求二次确认，阈值（¥500）为草案值。
4. **分类枚举**：category 枚举值（game/tool/art/animation/webapp/other）需 PM 与 Designer 确认。
