# 测试计划（QA Test Plan）

> 作者：QA Agent · 对应需求：Epic 质量验收与交付（[#10](https://github.com/ChenyuHeee/vibe-coding-marketplace/issues/10)）
> 依据：`docs/PRD.md`（第 7 节自检清单）、`docs/DECISIONS.md`（D1–D4 / A1–A6）、`docs/STATUS_VOCABULARY.md`（状态词唯一来源）、`docs/API.md`（REST 草案）、`docs/DESIGN_SYSTEM.md`（验收对照）、`docs/WORKFLOW.md`（缺陷流程）、`docs/DEPLOYMENT.md`（环境）。
> 本计划为**总纲**：Phase 1（API 冒烟，当前 main 已完成钱包/认证线）→ Phase 2（前端页面与交互验收）→ Phase 3（部署环境验收 + 第 7 节全量自检）。每阶段产出独立测试报告（`docs/TEST_REPORT-*.md`）。

---

## 1. 测试范围

| 维度 | 范围 |
|---|---|
| 功能区域 | PRD 六功能区全量：① Marketplace 与详情页（试玩）② 上传与上架（审核进度）③ 购买与 My Library（含退款、两步可达）④ 发布需求 Commission（验收标准锁定）⑤ 接单与交付（六状态流）⑥ 钱包与充值（托管一眼可见） |
| 角色 | 三角色 buyer / seller / contractor + 三角色并存模型（D4：`roles` 数组）；同一状态词三角色一致性（词汇表全表抽查） |
| 必答题 | Q1 意图表达（3 示例 chip + ≤2 追问 + 确认意图）、Q2 进度可见（四阶段 + 中间结果 + 可取消）、Q3 失败恢复（保留已完成 + 三出路） |
| 风险等级动作 | 第 4 节清单全量：低风险动作（试玩 / 查看总价 / 取消未付款订单 / 两步回 My Library / 联系卖家与举报）一步可达；高风险动作（大额充值 / 确认收货放款 / 提现 / 下架已售作品 / 修改验收标准）二次确认（对照 REQUIREMENTS.md §3 风险对照表） |
| 设计系统 | 四状态（Empty / In progress / Error / Success）、反馈三通道（视觉+触觉）、颜色非唯一载体、焦点可见、禁用按钮可读附说明、深浅色模式（DESIGN_SYSTEM.md §2.7 §7） |
| 第 7 节自检清单 | 10 项全部拆解为可执行验收用例（见 §5 用例表） |
| 状态词 | 与 `docs/STATUS_VOCABULARY.md` 四流全表一字不差（大小写/空格敏感） |

**不在本期范围**：PRD 第 6 节空间界面（3D/visionOS）——本产品为 2D Web，仅借鉴思想（DESIGN_SYSTEM.md §1.1 已落实），不验收 60pt 点击尺寸/凝视/锚定等原生规则；真实支付渠道（D1 模拟支付，状态机真实完整即可）。

## 2. 测试层级与策略

```
单元（vitest）→ API 集成（supertest）→ 组件（Testing Library）→ E2E 冒烟（curl / 浏览器手工脚本）
```

| 层级 | 工具 | 位置/方式 | 覆盖 | 门槛 |
|---|---|---|---|---|
| L1 单元 | Vitest | `apps/api/src/**/*.test.ts`（如 `auth.test.ts`、`wallet.test.ts`）、`apps/web/src/**/*.test.tsx` | 状态机迁移合法性、金额计算（`calcFeeCr` 5% 取整）、校验规则（邮箱/密码长度/cardLast4）、台账记账（balance_after_cr 连续） | `npm test` 全绿，随 PR 在 CI 跑 |
| L2 API 集成 | Vitest + supertest | `apps/api/src/app.test.ts` + 各路由 test；内存 DB（`:memory:`） | 全部 REST 端点：鉴权、错误格式、状态迁移、幂等、分页/筛选、金额一致性 | 每个功能 PR 必须带 |
| L3 组件 | Testing Library（jsdom） | `apps/web/src/**` | 四状态渲染、StatusBadge 状态词一致性、二次确认弹窗、Q1/Q2/Q3 交互、焦点/禁用态 | 交互组件必须带 |
| L4 E2E 冒烟 | curl（API）+ 浏览器手工脚本（Web） | 本地真实进程（127.0.0.1:3001 / 8090）；Phase 3 在部署环境（`vibers.hechenyu.xin`） | 真实进程链路、种子数据可用、关键用户旅程（注册→充值→下单→托管→放款）、演示链接他人设备可打开 | 每阶段交付前全量跑一遍，结果写入报告 |

策略要点：

1. **状态词断言**：所有 API 断言与 UI 断言中的状态词字符串，一律从 `packages/shared` 类型/常量或词汇表复制，禁止手写（防大小写/空格漂移）。
2. **金额断言**：金额以整数 CR 断言（DECISIONS D2），手续费按 `Math.floor(priceCr * 0.05)`（A5）核算；台账 `balanceAfterCr` 逐条核对连续性。
3. **错误格式**：所有失败路径断言 `{ error: { code, message, details? } }` 形状（API.md 约定）。
4. **回归策略**：缺陷修复 PR 合入后，先重跑对应层级的失败用例，再跑 L2 冒烟全量；第 7 节全量自检只在 Phase 3 交付前跑。

## 3. 环境矩阵

| 环境 | Web | API | 数据库 | 用途 | 状态 |
|---|---|---|---|---|---|
| 本地开发 | `http://127.0.0.1:8090`（Vite dev，DEPLOYMENT.md） | `http://127.0.0.1:3001`（仅本机） | SQLite `data/app.db`（首次启动自动建库+种子） | Phase 1/2 主测试环境 | ✅ 可用 |
| 部署环境 | `https://vibers.hechenyu.xin`（nginx 免端口反代 → 8090） | 同域 `/api`（反代 → 3001） | SQLite（服务器本地） | Phase 3：真实网络链路、演示链接他人设备可打开、HTTPS | ⏳ 待 vhost 部署（见 DEPLOYMENT.md，Orchestrator 协调） |

- 端口唯一事实：`docs/DEPLOYMENT.md`（Web=8090、API=3001、对外仅 80/443）。
- 浏览器手工矩阵：Chrome（桌面）/ Safari（移动视口）；深浅色模式（`prefers-color-scheme` 与 `[data-theme]` 两路都验）；键盘导航（Tab 全站走一遍）。

## 4. 测试数据

**种子账号**（`apps/api/src/db/seed.ts` + `demo-data.ts`，空库自动写入 A6）：

| 账号 | 密码 | 角色 | 初始余额 | 备注 |
|---|---|---|---|---|
| `admin@vibes.local` | `admin123` | buyer+seller+contractor（isAdmin） | 0 CR | 平台管理员 |
| `buyer@vibes.local` | `demo1234` | buyer | 5000 CR（种子后 4475，含演示托管单扣款） | 演示买家 |
| `seller@vibes.local` | `demo1234` | seller+buyer | 2000 CR（种子后 1500，含演示提现划出） | 演示卖家 |
| `contractor@vibes.local` | `demo1234` | contractor+buyer | 1500 CR | 演示接单者 |

**4 个演示 HTML 作品**（approved，单文件自包含可运行，seed 写入 `uploads/projects/<id>/index.html`）：

| 作品 id | 标题 | 分类 | 价格 | 卖家 |
|---|---|---|---|---|
| `proj_snake` | 贪吃蛇 Classic | game | 500 CR | seller |
| 其余 3 个 | 见 `demo-data.ts` `DEMO_PROJECTS` | — | — | seller |

**演示业务数据**：1 条 open 需求（验收标准已锁定 + `criteria_hash`）+ 2 条 submitted 投标；1 笔演示托管订单（buyer 已付 525 CR 在 escrow held）+ 1 笔演示提现（seller，withdrawal pending，etaDays=2）。

**测试专用账号**（冒烟测试现场注册，邮箱带时间戳避免与种子冲突）：`qa+<ts>@vibes.local` / 密码 `qa-pass-1234`。

## 5. 关键验收用例表（PRD 第 7 节逐项拆解）

> 编号规则：`TC-<区域/主题>-<序号>`；P0=阻断交付，P1=高影响，P2=一般。每个用例在对应 Phase 执行并记录 PASS/FAIL，最终汇入 `docs/TEST_REPORT-*.md`。

### 5.1 第 7 节自检项 ↔ 用例映射

| 自检项 | 用例编号 |
|---|---|
| ① 六功能区全有、三角色全走通 | TC-AUTH-01~03、TC-WALLET-01~06 等（全表） |
| ② 状态词三角色一致 | TC-STATUS-01~03 |
| ③ 详情页可试玩；My Library 两步可达 | TC-PLAY-01~02、TC-LIB-01~02 |
| ④ 验收标准发布时锁定；托管状态与到账时间一眼可见 | TC-COMM-03、TC-ESCROW-01~02 |
| ⑤ Q1/Q2/Q3 必答题 | TC-Q1-01~03、TC-Q2-01~03、TC-Q3-01~03 |
| ⑥ 低风险一步可达 / 高风险二次确认 | TC-RISK-L-01~05、TC-RISK-H-01~05 |
| ⑦ 四状态齐全 + 反馈视觉+触觉 | TC-STATE-01~04、TC-FEEDBACK-01 |
| ⑧ Apple 八原则前后四原则各跑一遍 | TC-A8-01~02 |
| ⑨ 颜色非唯一载体；焦点可见 | TC-A11Y-01~03 |
| ⑩ 链接他人设备可打开 | TC-DEPLOY-01 |

### 5.2 用例明细

| # | 用例 | 前置 | 步骤（可执行） | 期望 | 风险 | 阶段 |
|---|---|---|---|---|---|---|
| TC-AUTH-01 | 注册（默认 buyer + 自动建钱包） | API 空库或种子库 | `POST /api/auth/register` 新邮箱（不含 roles） | 201，`roles=["buyer"]`，`token` 有效；`GET /api/wallet` 可访问且 `balanceCr=0` | P0 | 1 |
| TC-AUTH-02 | 登录 + me | 已注册账号 | `POST /api/auth/login` → `GET /api/auth/me` | 200；me 返回 displayName/roles，与注册一致 | P0 | 1 |
| TC-AUTH-03 | 角色并存与切换 | 种子账号（seller 兼 buyer） | 以 `seller@vibes.local` 登录，检查 `roles` 含 `["seller","buyer"]`；前端个人中心可切换角色视角（Phase 2） | 后端 `roles` 为数组；前端同一账号可切换角色看到不同内容（D4） | P0 | 1/2 |
| TC-STATUS-01 | 订单流状态词三角色一致 | 一笔 paid 订单 | buyer 与 seller 分别 `GET /api/orders` 看同一订单状态 | 两方看到同一状态词（`paid`），与词汇表 §2 一字不差 | P0 | 2 |
| TC-STATUS-02 | 接单流六词规范 | 一个 contract | 遍历 bid→selected→in progress→milestone submission→buyer acceptance→payout 全链 | 状态词恰为 PRD 第 5 节六词（词汇表 §3 ★），买卖双方同屏一致 | P0 | 2 |
| TC-STATUS-03 | 状态词全表抽查 | 种子数据 | 对四流（审核/订单/接单/钱包提现）出现的每个状态词与 `STATUS_VOCABULARY.md` 比对（含空格） | 无一字不差；无词汇表外自造词 | P0 | 1/2/3 |
| TC-PLAY-01 | 详情页直接试玩（免登录免付款） | 已上架作品 | 未登录访问详情页试玩区/`GET /play/:id` | 不要求登录/支付，iframe 可运行（sandbox 头存在，无 `allow-same-origin`） | P0 | 2 |
| TC-PLAY-02 | 非 approved 作品不对公开试玩 | 种子库 | 尝试访问 draft/submitted 作品的 play | 拒绝或 404；仅 approved 公开（作者本人可预览） | P1 | 2 |
| TC-MKT-01 | 作品列表分类筛选 | 4 个演示作品 | `GET /api/projects?category=game`（或前端筛选） | 只返回该分类已上架作品；含价格/作者/评分字段 | P1 | 2 |
| TC-MKT-02 | 列表只展示 approved | 种子库 | `GET /api/projects` 全量 | 不含 draft/submitted/rejected/delisted | P0 | 2 |
| TC-ORDER-01 | 下单前总价含手续费一屏可见 | 已登录 buyer | 打开下单页查看报价 | 显示 price + fee（5%，A5）+ total 合计；`GET /api/orders/:id/quote`（或等价端点）字段齐全 | P0 | 2 |
| TC-ORDER-02 | 取消未付款订单一步完成 | pending 订单 | 点「取消订单」，无二次确认、无原因追问 | 订单 `cancelled`；余额无变化；Toast + 撤销（5s） | P0 | 2 |
| TC-ORDER-03 | 退款路径可找到 | 已付款订单 | 在订单详情/作品详情找「退款政策/申请退款」入口 | 入口常驻可见（非三级菜单）；发起后订单 `refund requested`（退款窗口内，A2） | P0 | 2 |
| TC-LIB-01 | 两步回 My Library | 任意页面（含详情、弹窗、全屏流程页） | 从最深层页面点击回 Library | ≤ 2 次点击到达（顶栏 Library 常驻 / 移动 TabBar 固定位） | P0 | 2 |
| TC-LIB-02 | 已购内容在线运行或下载 | 已购作品 | My Library 中打开运行/下载 | 两个动作直接可见；已下架作品已购者仍可访问（TC-RISK-H-04） | P0 | 2 |
| TC-UPLOAD-01 | 拖入 HTML 上架全流程 | seller 账号 | 上传 HTML → 填标题/描述/定价/试用范围 → 提交审核 | 四状态齐全（空/进度百分比/错误/成功）；`draft → submitted` | P0 | 2 |
| TC-UPLOAD-02 | 审核进度全程可见 | 已提交作品 | seller 查看 `GET /api/projects/:id/review`（或审核进度 UI） | 状态 + 提交时间 + 审核意见 + 历史可见（「我的作品到哪一步了」） | P0 | 2 |
| TC-UPLOAD-03 | 驳回须附理由，可重新提交 | rejected 作品 | 查看驳回意见 → 修改后重新提交 | rejected 必带 reviewNote；重新提交回 `submitted` 重走审核 | P1 | 2 |
| TC-RISK-H-04 | 下架已售出作品须理由 + 买家保留访问 | 有已购订单的 approved 作品 | seller 下架：不填理由 → 被拒；填理由 → `delisted`；已购买家仍可在 Library 运行 | 理由必填校验存在；delisted 后已购买家访问权不受影响 | P0 | 2 |
| TC-COMM-01 | 发布需求字段齐全 | buyer 账号 | 发布需求（预算区间/时间线/验收标准/参考作品） | 201；`acceptance_criteria` + `criteria_hash` 返回；需求板 `open` | P0 | 2 |
| TC-COMM-02 | 需求板可筛选 | ≥2 条需求 | 按状态/预算/关键词筛选 | 筛选生效；卡片含状态徽章与投标数 | P1 | 2 |
| TC-COMM-03 | 验收标准发布时锁定 | 已发布需求 | 发布后尝试修改 `acceptance_criteria`（含有人投标后） | 修改被拒（400 VALIDATION / CONFLICT）；锁定视觉（Lock 图标 + 只读 + 说明，DESIGN_SYSTEM §5.2） | P0 | 2 |
| TC-CONTRACT-01 | 投标 → 选中 → 进行中 | open 需求 + contractor | 投标（金额须在预算区间内）→ buyer 选中 → 合同生效 | bid `submitted` → `selected` → `in progress`；托管 `held`（预算进托管） | P0 | 2 |
| TC-CONTRACT-02 | 里程碑提交 → 验收循环 | in progress 合同 | contractor 提交里程碑 → buyer 验收（通过/打回） | 提交 → `milestone submission`；打回须附修改意见；通过后最终验收 → `buyer acceptance` | P0 | 2 |
| TC-CONTRACT-03 | 放款前必须先看交付物 | buyer acceptance 合同 | 买家点确认放款前检查流程 | 「确认放款」在预览交付物前不可用（未预览 → 按钮禁用附说明）；放款后 escrow `released`、contractor 余额入账（记 payout） | P0 | 2 |
| TC-WALLET-01 | 钱包总览字段齐全 | 已登录 | `GET /api/wallet` | `balanceCr` / `escrowHeldCr` / `currency="CR"` / `pendingWithdrawalCr` 齐全；托管金额与订单状态联动 | P0 | 1 |
| TC-WALLET-02 | 小额充值直接成功 + 台账记录 | 已登录 | `POST /api/wallet/topup {amountCr:50}` | 成功；`balanceAfterCr` 正确；`GET /api/wallet/transactions` 出现 `type=topup` credit 记录 | P0 | 1 |
| TC-WALLET-03 | 大额充值二次确认（≥100 CR） | 已登录 | 无 `confirm` 提交 ≥100 CR → 400；带 `confirm:true` → 成功 | 无 confirm 时 400 且含阈值提示；有 confirm 成功且台账有记录；前端弹窗显示充值后余额（A1） | P0 | 1/2 |
| TC-WALLET-04 | 台账筛选与分页 | 多笔台账 | `?type=topup&direction=credit&page=1&pageSize=5` | 筛选生效；`{items,page,pageSize,total}` 分页结构正确 | P1 | 1 |
| TC-WALLET-05 | 提现校验与到账时间 | 余额充足 | `cardLast4` 非 4 位数字 → 400；正确 → 201 | 校验生效；创建后 `status="withdrawal pending"`、`etaDays ∈ [1,3]`；列表可查；余额扣减且台账记录（A4） | P0 | 1 |
| TC-WALLET-06 | 提现列表筛选 | ≥2 笔提现 | `?status=withdrawal pending` | 只返回对应状态；分页结构正确 | P1 | 1 |
| TC-ESCROW-01 | 托管总览字段齐全（钱在谁手里/何时到账） | 有 held 托管 | `GET /api/wallet/escrow` | 每项含 refType/refId/direction/amountCr/escrowStatus/party/eta；party 人话（我(买家)/我(卖家/接单者)），eta 人话到账说明 | P0 | 1 |
| TC-ESCROW-02 | 托管状态一眼可见（前端） | 有 held 托管 | 钱包页/交易详情查看 | WalletBalanceCard 顶部两栏：钱在谁手里 / 何时到账；EscrowStatusBar 金额/持有方/预计到账（DESIGN_SYSTEM §8） | P0 | 2 |
| TC-Q1-01 | 意图输入框 3 个可点击示例 | 首页/需求发布 | 检查输入框内底部 3 个 chip；点击一个 | 点击即填入输入框、光标到末尾、提交按钮立即启用；chip 可 Tab 聚焦 | P0 | 2 |
| TC-Q1-02 | ≤2 个澄清追问 | 信息不足的意图 | 触发追问流程 | 内联追问卡，一次一问，最多 2 题；第 2 题后不再追问（不足则标注假设进入确认） | P0 | 2 |
| TC-Q1-03 | 理解确认后再执行 | 任意意图 | 提交意图 → 确认卡 | 展示理解到的意图 + 参数 + 费用/风险摘要；点「确认」才执行；「修改」保留已填内容返回 | P0 | 2 |
| TC-Q2-01 | 四阶段步骤指示器 | 任一长流程（检索/构建） | 触发流程 | 固定四阶段 understanding→retrieving→building→checking，当前步 spinner + 每步说明文案 | P0 | 2 |
| TC-Q2-02 | 尽早放出中间结果 | 检索类流程 | 观察 retrieving 阶段 | 候选列表骨架占位→逐条填入；中间结果保留不回退 | P0 | 2 |
| TC-Q2-03 | Cancel 按钮始终可用 | 进行中的长流程 | 中途点取消 | 右上角常驻；可逆任务直接取消并保留已生成内容；不可逆任务轻量确认 | P0 | 2 |
| TC-Q3-01 | 失败说清哪一步+为什么 | 人为制造失败（如断网/错误文件） | 触发失败 | 失败卡片引用阶段名（如「第 3 步构建失败」）+ 平实语言原因，非「Something went wrong」 | P0 | 2 |
| TC-Q3-02 | 保留已完成内容 | 同上 | 失败后检查 | 「已保留的内容」区块逐项列出（真实内容）；不整页刷新、输入不丢（草稿持久化） | P0 | 2 |
| TC-Q3-03 | 三条出路 | 同上 | 失败卡片操作 | 重试(primary) / 换一种方式(secondary) / 手动编辑(ghost) 三按钮不同权；自动重试 ≤1 次 | P0 | 2 |
| TC-RISK-L-01 | 试玩免登录免付款 | 未登录 | 打开详情页试玩 | 直接可玩，不要求账号/支付 | P0 | 2 |
| TC-RISK-L-02 | 查看总价一屏可见 | 下单页 | 下单前一屏 | 作品价 + 手续费（注明 5%）+ 实付总额，支付动作前可见 | P0 | 2 |
| TC-RISK-L-03 | 取消未付款订单一步完成 | pending 订单 | 点击取消 | 无追问/无二次确认；成功 Toast + 撤销 5s | P0 | 2 |
| TC-RISK-L-04 | 两步回 My Library | 任意页面 | 见 TC-LIB-01 | ≤2 步 | P0 | 2 |
| TC-RISK-L-05 | 联系卖家与举报常驻 | 详情页 | 检查操作行 | `[联系卖家] [举报] [···]` 常驻，永不在折叠菜单内 | P1 | 2 |
| TC-RISK-H-01 | 大额充值二次确认 + 余额变化预览 | 见 TC-WALLET-03 | 前端弹窗 | 标题「确认充值」+ 当前余额 → 充值金额 → 充值后余额并列 + 到账说明；确认按钮含金额 | P0 | 2 |
| TC-RISK-H-02 | 确认收货先看交付物 | 见 TC-CONTRACT-03 | 前端流程 | ① 点确认收货 → 交付物预览页（+验收标准 checklist）② 二次确认弹窗「不可撤回」；未预览时按钮禁用 | P0 | 2 |
| TC-RISK-H-03 | 提现二次确认 + 到账时间明示 | 见 TC-WALLET-05 | 前端流程 | 身份+银行卡验证 + 弹窗展示金额/手续费/实际到账/到账时间（T+1 等，不得写「尽快」） | P0 | 2 |
| TC-RISK-H-04 | 下架须理由 + 买家保留访问 | 见 TC-RISK-H-04（上传区） | 前端流程 | 理由必填表单 + 后果说明 + 二次确认弹窗 | P0 | 2 |
| TC-RISK-H-05 | 验收标准锁定视觉 | 有人投标的需求 | 查看编辑态 | Lock 图标 + 「已有接单者投标，验收标准已锁定，不可修改」+ 字段只读 | P0 | 2 |
| TC-STATE-01 | 内容块四状态齐全（空态） | 空列表（新账号无订单/需求） | 访问空购物车/空需求板/空 Library | 图标 + 一句说明 + 一个明确主按钮（动词+对象） | P1 | 2 |
| TC-STATE-02 | 内容块四状态齐全（进行中） | 上传/支付/检索 | >1s 操作 | 立即显示指示器；可算百分比给进度条+百分比，不可算给步骤条；无假百分比；加载用骨架屏 | P1 | 2 |
| TC-STATE-03 | 内容块四状态齐全（错误） | 人为失败 | 见 TC-Q3 | 三件事：什么错/为什么/下一步 + 1–2 动作按钮 + 图标 | P1 | 2 |
| TC-STATE-04 | 内容块四状态齐全（成功） | 支付成功/发布成功 | 成功页/Toast | 给结果一个去处（可编辑/可分享/可撤销），主动作按钮 | P1 | 2 |
| TC-FEEDBACK-01 | 反馈三通道（视觉+触觉） | 移动端 Chrome | 成功/警告/失败操作 | 视觉（图标+文字）必有；触觉 `navigator.vibrate` 特性检测后按 30/[20,40,20]/[50,80,50] 震动；声音默认静音且永不作唯一通道 | P2 | 2 |
| TC-A8-01 | 前四原则自检（Purpose/Agency/Responsibility/Familiarity） | 全部页面 | 评审对照 | 界面以用户意图为先、可反悔、说人话、全程一致 | P2 | 3 |
| TC-A8-02 | 后四原则自检（Adaptability/Simplicity/Craft/Delight） | 全部页面 | 评审对照 | 适配场景/设备/输入；元素各得其位；细节用心；有人情味 | P2 | 3 |
| TC-A11Y-01 | 颜色非唯一信息载体 | 全部状态提示 | 检查错误/成功/警告出现处 | 色块 + 图标 + 文字成对；必填 `*` 配文字；步骤完成有对勾非仅变绿 | P0 | 2 |
| TC-A11Y-02 | 焦点可见（focus ring） | 键盘导航 | Tab 走全站 | `:focus-visible` 显示 2px ring（`--color-ring`），所有可交互元素可见焦点 | P0 | 2 |
| TC-A11Y-03 | 禁用按钮可读附说明 | 锁定字段/未选交付物/表单不完整 | 检查禁用控件 | 禁用态文字可读（`--color-text-disabled`）+ 旁边/ tooltip 说明原因；禁用控件不收焦点，原因说明可聚焦 | P0 | 2 |
| TC-A11Y-04 | 深浅色模式正确切换 | 浏览器深浅色 | 切换 `prefers-color-scheme` / `[data-theme]` | 一套代码双模式；dark 下纯白降亮度、大色块降饱和、分割线用系统分隔色 | P1 | 2 |
| TC-DEPLOY-01 | 演示链接他人设备可打开 | 部署环境就绪 | 另一设备（手机/另一网络）访问 `https://vibers.hechenyu.xin` | 免端口可打开；登录/试玩/下单链路可用；无本地依赖（不用 127.0.0.1 直连） | P0 | 3 |
| TC-ERR-01 | 未登录访问受保护端点 | 未登录 | `GET /api/wallet` | 401 `{error:{code:"UNAUTHORIZED",message}}` | P0 | 1 |
| TC-ERR-02 | 不存在资源 | — | `GET /api/wallet/nonexistent`（或任意未注册路径） | 404 `{error:{code:"NOT_FOUND",message}}` | P0 | 1 |
| TC-ERR-03 | 参数校验错误格式 | — | 非法参数（坏 JSON / 非法金额 / 非法 status） | 400 `{error:{code:"VALIDATION",message}}`；坏 JSON 提示合法 JSON | P1 | 1 |

> 用例与 PRD 第 7 节 10 项自检一一对应（§5.1 映射表）；自检项 ②③④⑥ 各含后端 + 前端两层验证，防止「API 对、页面不对」或反之。

## 6. 缺陷流程

```
发现缺陷 → gh issue create（type/bug，按 .github/ISSUE_TEMPLATE/bug.md）
        → 开发修复合入 → QA 回归（重跑对应用例 + L2 冒烟）
        → 报告/自检清单勾选留痕
```

规则：

1. **确凿缺陷**（可复现、对照 PRD/DECISIONS/词汇表有明确期望）才开 issue；疑似问题先在报告中记录为「观察项」。
2. issue 必填：复现步骤、期望行为（对照 PRD 条款）、实际行为、影响（角色/线路/风险等级）、环境。标签 `type/bug` + 区域标签（`area/*`）+ 优先级（`priority/*`）。
3. 修复走分支 + PR（`fix/<slug>`），PR 引用 issue（`Closes #N`）；QA 在修复合入后回归并在报告中更新状态。
4. 缺陷状态跟踪：本计划维护「已知缺陷清单」（见各阶段报告附录），交付前清零 P0/P1 或给出豁免理由。
5. **与文档冲突的处理**：若实现与 `docs/DECISIONS.md` 冲突，以 DECISIONS 为准并开 issue 指出冲突（DECISIONS.md 第 1 节规则）；若与 API.md 草案冲突且 DECISIONS 未覆盖，记录为文档漂移观察项，由 Orchestrator 协调更新文档或实现。

## 7. 阶段划分与交付物

| 阶段 | 内容 | 交付物 | 状态 |
|---|---|---|---|
| Phase 1 | API 冒烟：认证/钱包/托管/台账/错误格式（当前 main 已具备的路由） | `docs/TEST_REPORT-API-PHASE1.md` | ✅ 已执行（见报告） |
| Phase 2 | 前端页面与交互验收：六功能区 UI、Q1/Q2/Q3、设计系统、风险动作二次确认 | `docs/TEST_REPORT-UI-PHASE2.md`（待产出） | ⏳ 依赖 #2–#9 前端/后端功能 PR |
| Phase 3 | 部署环境验收 + 第 7 节 10 项全量自检 + 他人设备链接验证 | `docs/TEST_REPORT-FINAL-PHASE3.md` + #10 自检清单勾选 | ⏳ 依赖部署（DEPLOYMENT.md vhost）与功能全量完成 |

## 8. 变更记录

| 日期 | 变更 | 说明 |
|---|---|---|
| 2026-08-24（初始版） | 建立测试计划 | 对应 #10；Phase 1 用例（TC-ERR/WALLET/ESCROW 等）已随 API 冒烟执行 |
