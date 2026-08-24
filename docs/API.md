# REST API 设计（v1 草案）

> 作者：Tech Lead Agent · 配套：[ARCHITECTURE.md](ARCHITECTURE.md)（技术选型与状态机）、[PRD.md](PRD.md)
> 约定：
> - 前缀统一 `/api`；JSON 请求/响应；金额单位**整数 CR（DECISIONS.md D2）**；时间 ISO 8601。
> - 鉴权标注：`公开` / `登录`（任意角色）/ `seller` / `buyer` / `contractor` / `作者本人`。
> - 错误统一 `{ "error": { "code": "...", "message": "人话", "details?": {} } }`；错误码如 `UNAUTHORIZED` `FORBIDDEN` `NOT_FOUND` `VALIDATION` `CONFLICT` `INSUFFICIENT_BALANCE`。
> - 分页统一 `?page=&pageSize=` → `{ items, page, pageSize, total }`。
> - 状态词 = [ARCHITECTURE.md §6](ARCHITECTURE.md) 草案；**唯一权威来源是 PM 的 STATUS_VOCABULARY.md**。
> - 列表筛选（分类/评分/状态）均为 GET query，字段见各端点。

---

## 0. 共享类型（packages/shared 提供）

```ts
type Role = 'buyer' | 'seller' | 'contractor';
type ContractStatus = 'bid' | 'selected' | 'in progress' | 'milestone submission' | 'buyer acceptance' | 'payout';
type OrderStatus = 'pending payment' | 'paid' | 'delivered' | 'completed' | 'refund requested' | 'refunded' | 'cancelled' | 'disputed';
type EscrowStatus = 'none' | 'held' | 'released' | 'refunded';
type ProjectReviewStatus = 'draft' | 'submitted' | 'under review' | 'approved' | 'rejected' | 'delisted';
type CommissionStatus = 'open' | 'in progress' | 'completed' | 'cancelled';
type BidStatus = 'submitted' | 'selected' | 'rejected' | 'withdrawn';
type WithdrawalStatus = 'withdrawal pending' | 'withdrawal completed' | 'withdrawal failed';
type HealthResponse = { ok: true; service: string; version: string };
```

---

## 1. 认证（区域：auth）

### POST /api/auth/register — 公开
注册（默认角色 `["buyer"]`，可选追加 seller/contractor）。
```jsonc
// req
{ "email": "a@b.c", "password": "secret123", "displayName": "小明", "roles": ["buyer", "seller"] }
// res 201
{ "user": { "id": "u1", "email": "a@b.c", "displayName": "小明", "roles": ["buyer","seller"] }, "token": "<jwt>" }
```

### POST /api/auth/login — 公开
```jsonc
// req  { "email": "...", "password": "..." }
// res 200 同上（user + token）
```

### GET /api/auth/me — 登录
```jsonc
// res 200
{ "user": { "id": "u1", "email": "...", "displayName": "小明", "roles": ["buyer","seller","contractor"],
            "avatarUrl": null, "ratingAvg": 4.7, "ratingCount": 12 } }
```

---

## 2. 作品线 · Marketplace（区域 1）

### GET /api/projects — 公开
列表，支持筛选：
`?category=game&q=关键词&minRating=4&sort=rating|newest|price_asc|price_desc&page=&pageSize=`
```jsonc
// res
{ "items": [ { "id": "p1", "title": "贪吃蛇 3D", "category": "game", "priceCr": 9900, "coverUrl": "/api/files/p1/cover.png",
               "seller": { "id": "u2", "displayName": "老张" }, "avgRating": 4.8, "ratingCount": 21, "status": "approved" } ],
  "page": 1, "pageSize": 20, "total": 37 }
```
涉及状态词：`approved`（只列出已上架）。

### GET /api/projects/:id — 公开
```jsonc
// res
{ "id": "p1", "title": "贪吃蛇 3D", "description": "...", "category": "game",
  "priceCr": 9900, "trialScope": "前 3 关可玩", "coverUrl": "/api/files/p1/cover.png",
  "playUrl": "/play/p1", "seller": {...}, "avgRating": 4.8, "ratingCount": 21,
  "reviews": [ { "rating": 5, "comment": "好玩", "user": {...}, "createdAt": "..." } ],
  "isPurchased": false, "canDownload": false }
```
> `playUrl` 供详情页 iframe 直接试玩（免登录免付款）。已下架作品仅作者或已购者可见。

### GET /api/categories — 公开
```jsonc
// res  { "items": ["game","tool","art","animation","webapp","other"] }
```

---

## 3. 上传与审核（区域 2）

### POST /api/projects — seller（multipart/form-data）
字段：`title` `description` `category` `priceCr`（0=免费）`trialScope` `cover`(图片,可选) `file`(html 或 zip，见 ARCHITECTURE §3.3 大小/解压边界)。
```jsonc
// res 201
{ "project": { "id": "p1", "status": "draft", "title": "..." } }
```

### PUT /api/projects/:id — 作者本人
更新元数据（title/description/category/priceCr/trialScope/cover）。`status` 不可在此修改。

### POST /api/projects/:id/submit — 作者本人
`draft → submitted`（词汇表 §1：提交后**自动进入** `under review`，history 保留 `submitted` 事件）。
```jsonc
// res 200  { "project": { "id": "p1", "status": "under review", "submittedAt": "..." } }
```

### GET /api/projects/:id/review — 作者本人
查询审核进度（PRD 区域 2 核心：作者最想知道「我的作品到哪一步了」）。
```jsonc
// res
{ "status": "under review", "reviewNote": null, "submittedAt": "...", "reviewedAt": null,
  "delistedAt": null, "history": [ { "event": "submitted", "note": null, "createdAt": "..." } ] }
```
涉及状态词：`draft / submitted / under review / approved / rejected / delisted`。

### POST /api/projects/:id/delist — 作者本人
下架已售作品：**必须带理由**；已购买家保留访问/下载权。
```jsonc
// req  { "reason": "版权问题，下架重做" }
// res  { "project": { "id": "p1", "status": "delisted", "delistedAt": "..." } }
```

### GET /api/admin/projects — 平台管理员（is_admin）
审核队列：`?status=under review&page=`（不传 status 返回全部，按提交时间排序）。
```jsonc
// res
{ "items": [ { "id": "p1", "title": "...", "category": "game", "priceCr": 9900, "status": "under review",
               "seller": { "id": "u2", "displayName": "老张" }, "reviewNote": null,
               "submittedAt": "...", "reviewedAt": null, "publishedAt": null } ], "page": 1, "pageSize": 20, "total": 3 }
```

### POST /api/admin/projects/:id/approve · /reject — 平台管理员（is_admin）
```jsonc
// approve: {} → { "project": { "id": "p1", "status": "approved", "publishedAt": "..." } }
// reject:  { "reviewNote": "入口页加载失败" } → { "project": { "id": "p1", "status": "rejected", "reviewNote": "..." } }
```
> 驳回时 `reviewNote` 必填（400 VALIDATION）；仅 `submitted / under review` 可审核，否则 409 CONFLICT。

### POST /api/projects/:id/report — 登录
举报作品（不能举报自己的作品）。
```jsonc
// req  { "reason": "涉嫌抄袭" }
// res 201  { "report": { "id": "r1", "projectId": "p1", "reporterId": "u1", "reason": "涉嫌抄袭", "createdAt": "..." } }
```

### GET /api/projects/:id/quote — 公开（同作品可见性）
下单前查看实际应付总额（PRD 4：下单前一屏显示含手续费总价）。
```jsonc
// res  { "orderId": null, "projectId": "p1", "projectTitle": "贪吃蛇 3D", "priceCr": 9900, "feeCr": 495, "totalCr": 10395 }
```

### GET /api/projects/:id/download — 已购 / 作者本人
zip 打包下载 `uploads/projects/<id>/`，返回 `application/zip` 流；未购 → 403。
> 草案中的 `/api/library/:projectId/download` 以实现为准改为 `/api/projects/:id/download`。

---

## 4. 购买与 My Library（区域 3）

### POST /api/orders — buyer
下单。**响应即含总价（含手续费）**，下单前先调用预览。
```jsonc
// req  { "projectId": "p1" }
// res 201
{ "order": { "id": "o1", "orderNo": "VCM20260824XXXX", "priceCr": 9900, "feeCr": 495,
             "totalCr": 10395, "status": "pending payment", "escrowStatus": "none" } }
```

### GET /api/orders/:id/quote — buyer（或 GET /api/projects/:id/quote）
下单前查看实际应付总额（PRD 4：下单前一屏显示含手续费总价）。
```jsonc
// res  { "projectId": "p1", "priceCr": 9900, "feeCr": 495, "totalCr": 10395 }
```

### POST /api/orders/:id/pay — buyer
模拟支付：余额 ≥ totalCr 则扣款，钱进托管 `escrowStatus=held`，订单 `paid`。
```jsonc
// res 200
{ "order": { "id": "o1", "status": "paid", "escrowStatus": "held", "paidAt": "..." },
  "balanceAfterCr": 5000 }
```
涉及状态词：`pending payment → paid`、escrow `none → held`。

### POST /api/orders/:id/cancel — buyer
**仅未付款**可取消，一步完成、不追问原因：`pending payment → cancelled`。

### POST /api/orders/:id/refund — buyer
已付款订单退款：escrow `held → refunded`，余额全额退回，`paid / delivered → refunded`（创建 14 天内，REFUND_WINDOW_DAYS）。退款入口在订单页常驻可见。
```jsonc
// res  { "order": { "status": "refunded", "escrowStatus": "refunded" }, "refundedCr": 10395, "balanceAfterCr": 15000 }
```

### POST /api/orders/:id/confirm — buyer
确认收货（放款）：escrow `released` → 卖家钱包入账（卖家 `transactions` 记 payout/分成），订单 `completed`。
> PRD 4：放款前买家必须先看到交付物——前端在确认弹窗前展示作品试玩/截图。

### GET /api/orders — 登录（buyer 查自己 / seller 查售出）
`?role=buyer|seller&status=&page=`：
```jsonc
{ "items": [ { "id": "o1", "orderNo": "...", "project": {...}, "priceCr": 9900, "totalCr": 10395,
               "status": "paid", "escrowStatus": "held", "createdAt": "..." } ], "page": 1, "total": 8 }
```

### GET /api/library — buyer（My Library）
已购作品列表（含免费/已下架作品，**两步可达**由前端导航保证）。
```jsonc
{ "items": [ { "project": { "id": "p1", "title": "贪吃蛇 3D", "playUrl": "/play/p1" },
               "orderId": "o1", "purchasedAt": "...", "status": "completed" } ] }
```

### GET /api/library/:projectId/run — buyer（在线运行）
```jsonc
// res  { "playUrl": "/play/p1?order=o1" }   // 已购者的回放地址（与试玩同域，可带鉴权参数）
```

### GET /api/library/:projectId/download — buyer / 作者本人
zip 打包下载 `uploads/projects/<id>/`。返回 `application/zip` 流。

---

## 5. 需求线 · Commission（区域 4）

### POST /api/commissions — buyer
发布需求。**验收标准在发布时锁定**（写入 `acceptance_criteria` + `criteria_hash`，此后任何 update 端点都拒绝修改该字段）。
```jsonc
// req
{ "title": "帮我做一个课堂小游戏", "description": "...", "budgetMinCr": 5000, "budgetMaxCr": 15000,
  "timelineDays": 7, "acceptanceCriteria": "1) 可运行 2) 有计分 3) 移动端可用", "referenceProjectIds": ["p1"] }
// res 201
{ "commission": { "id": "c1", "status": "open", "acceptanceCriteria": "1) ...", "criteriaHash": "sha256:...",
                  "budgetMinCr": 5000, "budgetMaxCr": 15000, "timelineDays": 7, "createdAt": "..." } }
```

### GET /api/commissions — 公开（需求板）
筛选：`?status=open&budgetMaxLte=10000&sort=newest&q=&page=`
```jsonc
{ "items": [ { "id": "c1", "title": "...", "budgetMinCr": 5000, "budgetMaxCr": 15000, "timelineDays": 7,
               "status": "open", "bidCount": 3, "buyer": { "displayName": "小明" } } ], "page": 1, "total": 12 }
```

### GET /api/commissions/:id — 公开
```jsonc
{ "id": "c1", "title": "...", "description": "...", "acceptanceCriteria": "1) ...", "criteriaHash": "...",
  "budgetMinCr": 5000, "budgetMaxCr": 15000, "timelineDays": 7, "referenceProjects": [...],
  "status": "open", "bids": [ { "id": "b1", "contractor": {...}, "amountCr": 8000, "status": "submitted" } ] }
```

### PUT /api/commissions/:id — buyer（作者）
可改描述/预算/时间线，**不可改 acceptance_criteria / criteria_hash**（400 `VALIDATION`：「验收标准在发布时锁定，不可修改」）；若已有 bid（status=submitted 存在）则整体冻结，返回 `CONFLICT`。

### POST /api/commissions/:id/cancel — buyer
`open → cancelled`（已有进行中 contract 时拒绝）。

---

## 6. 接单与交付（区域 5）

### POST /api/commissions/:id/bids — contractor
投标（金额须在预算区间内；一人一单一标）。
```jsonc
// req  { "amountCr": 8000, "proposal": "我做过多款小游戏..." }
// res 201  { "bid": { "id": "b1", "amountCr": 8000, "status": "submitted" } }
```

### GET /api/bids/mine — contractor
我的投标及状态：`?status=&page=`。

### POST /api/commissions/:id/select — buyer
选中投标 → 生成 contract：`bid status → selected`，合同 `bid → selected`。
```jsonc
// req  { "bidId": "b1" }
// res  { "contract": { "id": "k1", "status": "selected", "agreedAmountCr": 8000, "escrowStatus": "none" } }
```

### POST /api/contracts/:id/start — buyer（或 select 时自动）
预算进托管：buyer 扣 `agreedAmountCr` → 合同 `selected → in progress`、escrow `held`。
```jsonc
// res  { "contract": { "id": "k1", "status": "in progress", "escrowStatus": "held" } }
```

### POST /api/contracts/:id/milestones — contractor
提交里程碑（multipart，交付物文件）。
```jsonc
// res 201  { "milestone": { "id": "m1", "seq": 1, "status": "submitted", "deliverablePath": "/api/files/k1/m1/..." } }
// 合同状态 → "milestone submission"
```

### POST /api/milestones/:id/approve — buyer
验收通过：里程碑 `submitted → approved`；若非最终里程碑，合同回到 `in progress`。
### POST /api/milestones/:id/request-revision — buyer
打回：里程碑 `submitted → revision requested`，合同仍为 `milestone submission`，**必须带修改意见**。

### POST /api/contracts/:id/accept — buyer
最终验收通过：合同 `milestone submission → buyer acceptance`。
### POST /api/contracts/:id/payout — buyer / 系统自动
放款：escrow `released` → contractor 钱包入账（记 payout），合同 `buyer acceptance → payout`。
```jsonc
// res  { "contract": { "id": "k1", "status": "payout", "escrowStatus": "released", "paidAt": "..." } }
```
> 买卖双方看到同一 contract.status（PRD 区域 5：两边屏幕状态词一致）。

### GET /api/contracts/:id — 双方可见（buyer/contractor）
```jsonc
{ "id": "k1", "status": "in progress", "escrowStatus": "held", "agreedAmountCr": 8000,
  "commission": {...}, "buyer": {...}, "contractor": {...},
  "milestones": [ { "id": "m1", "seq": 1, "status": "approved" } ] }
```

---

## 7. 钱包（区域 6）

### GET /api/wallet — 登录
```jsonc
{ "balanceCr": 12000, "escrowHeldCr": 8000,   // 托管中的钱（可一眼看出"钱在谁手里"）
  "currency": "CR" }
```

### POST /api/wallet/topup — 登录（模拟支付）
```jsonc
// req  { "amountCr": 50000, "confirm": true }   // ≥ 100 CR（A1 二次确认阈值）必须 confirm=true 二次确认，否则 400
// res  { "balanceAfterCr": 62000, "transaction": { "id": "t1", "type": "topup", "direction": "credit", "amountCr": 50000 } }
```

### GET /api/wallet/transactions — 登录
`?type=&direction=&page=`：
```jsonc
{ "items": [ { "id": "t1", "type": "escrow_release", "direction": "credit", "amountCr": 8000,
               "balanceAfterCr": 62000, "refType": "contract", "refId": "k1", "note": "接单《小游戏》结算入账", "createdAt": "..." } ], "page": 1, "total": 23 }
```

### POST /api/wallet/withdrawals — 登录
提现（模拟身份+银行卡校验）：`withdrawal pending`，`etaDays` 展示到账时间（PRD 4：注明到账时间）。
```jsonc
// req  { "amountCr": 10000, "bankName": "测试银行", "cardLast4": "1234", "holderName": "小明" }
// res 201  { "withdrawal": { "id": "w1", "amountCr": 10000, "status": "withdrawal pending", "etaDays": 1 } }
```

### GET /api/wallet/withdrawals — 登录
`?status=&page=` → `{ items: [{ id, amountCr, status: "withdrawal pending"|"withdrawal completed"|"withdrawal failed", etaDays, createdAt }] }`

### GET /api/wallet/escrow — 登录
托管总览（PRD 区域 6 两个必答问题：钱在谁手里 / 何时到账）。
```jsonc
{ "items": [ { "refType": "order", "refId": "o1", "direction": "in"|"out", "amountCr": 10395,
               "escrowStatus": "held"|"released"|"refunded", "party": "我(买家)"|"我(卖家)", "eta": "验收后即时到账" } ] }
```

---

## 8. 附：试玩回放与静态文件

| 方法/路径 | 鉴权 | 说明 |
|-----------|------|------|
| GET /play/:projectId | 公开（仅 approved；作者可预览任意状态；**已购买家可访问含 delisted**） | iframe 试玩入口，回放 `uploads/projects/<id>/`（默认 `index.html`，`?entry=` 指定相对路径）。响应头硬性要求：`Content-Security-Policy: sandbox allow-scripts allow-forms; default-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:`、`X-Content-Type-Options: nosniff`、`Content-Disposition: inline`；MIME 白名单外一律 404（ARCHITECTURE §3.3） |
| GET /api/files/:projectId/* | 同作品详情可见性 | 作品静态资源（封面 `cover.*`；白名单扩展名，其余 404） |
