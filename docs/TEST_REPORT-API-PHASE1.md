# API 冒烟测试报告 · Phase 1（TEST_REPORT-API-PHASE1）

> 作者：QA Agent · 对应：[TEST_PLAN.md](TEST_PLAN.md) Phase 1（认证/钱包/托管/台账/错误格式）
> 关联需求：Epic 质量验收与交付（[#10](https://github.com/ChenyuHeee/vibe-coding-marketplace/issues/10)）、Epic 认证与三角色模型（[#1](https://github.com/ChenyuHeee/vibe-coding-marketplace/issues/1)）、Epic 区域6 钱包与充值（[#7](https://github.com/ChenyuHeee/vibe-coding-marketplace/issues/7)）

---

## 1. 测试信息

| 项 | 值 |
|---|---|
| 执行日期 | 2026-08-24 |
| 被测版本 | `origin/main` @ `954f11e`（feat(api): 钱包与托管（充值/台账/提现/托管总览）(Closes #7) (#20)） |
| 环境 | 本地真实进程：API `http://127.0.0.1:3001`（DEPLOYMENT.md 端口约定） |
| 启动方式 | `npm run dev -w @vibe/api`（tsx watch；前置 `npm run build -w @vibe/shared`） |
| 数据库 | SQLite `apps/api/data/app.db`（首次启动自动建库 + 种子 A6） |
| 方法 | curl 逐用例执行（HTTP 状态码 + JSON 响应体断言），原始响应存档 `/tmp/qa-smoke/*.txt` |
| 自动化佐证 | 仓库自带测试套件 `npm test`（L1 单元 + L2 supertest 集成）结果见 §4 |

## 2. 测试范围（对应 TEST_PLAN 用例编号）

| 主题 | 用例编号 | 结果 |
|---|---|---|
| 健康检查 / 错误格式（401/404/400/坏 JSON） | TC-ERR-01~03 + 补充 | ✅ 全通过 |
| 注册（默认 buyer、角色并存 D4、自动建钱包、校验/冲突） | TC-AUTH-01 | ✅ 全通过 |
| 登录 / me / 错误密码 / 坏 token | TC-AUTH-02 | ✅ 全通过 |
| 钱包总览（balanceCr / escrowHeldCr / currency=CR / pendingWithdrawalCr） | TC-WALLET-01 | ✅ 全通过 |
| 充值：小额直通 / 大额二次确认（A1 阈值 100 CR）/ 台账 | TC-WALLET-02、TC-WALLET-03 | ✅ 全通过 |
| 台账：筛选（type/direction）/ 分页 / 非法筛选 | TC-WALLET-04 | ✅ 全通过 |
| 提现：cardLast4 校验 / 创建 / 列表 / 状态筛选 / 余额与台账联动（A4 1–3 工作日） | TC-WALLET-05、TC-WALLET-06 | ✅ 全通过 |
| 托管总览：钱在谁手里 / 何时到账（三角色视角） | TC-ESCROW-01、TC-STATUS-03（部分） | ✅ 全通过 |
| 种子数据可登录（四账号）+ 角色数组 | — | ✅ 全通过 |

**本轮不涉及**：作品线（Marketplace/上传/订单/My Library）、需求线（Commission/接单交付）路由——当前 main 尚未实现（Epic #2–#6 进行中），访问返回 404（已在 TC-ERR 验证 404 形状正确），留待 Phase 2。

## 3. 用例明细（43 项，全部 PASS）

> 期望列对照：`docs/PRD.md`（第 4 节）、`docs/DECISIONS.md`（A1/A4/D2/D4）、`docs/STATUS_VOCABULARY.md`（第 4 节提现状态词）、`docs/API.md`（错误格式/分页约定）。

### 3.1 健康与错误格式（TC-ERR）

| # | 用例 | 命令（简） | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| 1 | 健康检查 | `GET /api/health` | 200 `{ok:true,service:"vibe-api",version}` | `{"ok":true,"service":"vibe-api","version":"0.1.0"}` | ✅ PASS |
| 2 | 未登录访问钱包 | `GET /api/wallet`（无 token） | 401 `{error:{code,message}}` | 401 `{"error":{"code":"UNAUTHORIZED","message":"未登录或登录已过期"}}` | ✅ PASS |
| 3 | 未登录访问 me | `GET /api/auth/me` | 401 `{error:{code:"UNAUTHORIZED"}}` | 同上（401 UNAUTHORIZED） | ✅ PASS |
| 4 | 不存在资源 | `GET /api/projects`（未实现路由） | 404 `{error:{code:"NOT_FOUND"}}` | 404 `{"error":{"code":"NOT_FOUND","message":"Not found"}}` | ✅ PASS |
| 5 | 坏 JSON 请求体 | `POST /api/wallet/topup` body=`{"amountCr":` | 400 `{error:{code:"VALIDATION"}}` 且提示合法 JSON | 400 `{"error":{"code":"VALIDATION","message":"请求体不是合法的 JSON"}}` | ✅ PASS |
| 6 | 坏 token | `GET /api/wallet` Bearer `not.a.jwt` | 401 UNAUTHORIZED | 401 UNAUTHORIZED | ✅ PASS |

### 3.2 注册 / 登录 / me（TC-AUTH）

| # | 用例 | 命令（简） | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| 7 | 注册默认角色 | `POST /api/auth/register` 新邮箱（不含 roles） | 201；`roles=["buyer"]`；返回 `user`+`token`；**自动建钱包** | 201；`roles:["buyer"]`；user+token；后续钱包查询 balanceCr=0 | ✅ PASS |
| 8 | 重复邮箱 | 同邮箱再注册 | 409 `CONFLICT` | 409 `{"error":{"code":"CONFLICT","message":"该邮箱已注册"}}` | ✅ PASS |
| 9 | 非法邮箱 | email=`not-an-email` | 400 VALIDATION | 400「邮箱格式不正确」 | ✅ PASS |
| 10 | 短密码（D3 最小 8 位） | password=`123` | 400 VALIDATION | 400「密码长度至少 8 位」 | ✅ PASS |
| 11 | 空角色数组（D4） | roles=`[]` | 400 VALIDATION | 400「roles 必须是非空数组」 | ✅ PASS |
| 12 | 多角色并存（D4） | roles=`["buyer","seller"]` | 201；roles 原样返回 | 201；`roles:["buyer","seller"]` | ✅ PASS |
| 13 | 登录 | `POST /api/auth/login` 正确密码 | 200 user+token | 200；user 与注册一致 | ✅ PASS |
| 14 | 错误密码 | 错误密码登录 | 401 UNAUTHORIZED | 401「邮箱或密码错误」 | ✅ PASS |
| 15 | me | `GET /api/auth/me` | 200 当前用户 | 200；displayName/roles 正确 | ✅ PASS |

### 3.3 钱包总览与充值（TC-WALLET-01~03）

| # | 用例 | 命令（简） | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| 16 | 新用户钱包（注册自动建） | `GET /api/wallet` | `balanceCr:0, escrowHeldCr:0, currency:"CR"` | `{"balanceCr":0,"escrowHeldCr":0,"currency":"CR","pendingWithdrawalCr":0}` | ✅ PASS |
| 17 | 小额充值直通（<100 CR） | `POST /api/wallet/topup {amountCr:50}` | 200；`balanceAfterCr:50`；台账有记录 | 200；`balanceAfterCr:50`；`type:"topup",direction:"credit",status:"completed"` | ✅ PASS |
| 18 | 阈值边界（99 CR 免确认） | `{amountCr:99}` | 200（低于 A1 阈值 100） | 200；`balanceAfterCr:249` | ✅ PASS |
| 19 | 大额无二次确认（A1） | `{amountCr:100}`（无 confirm） | 400 VALIDATION + 阈值提示；余额不变 | 400「单次充值 ≥ 100 CR 需二次确认（confirm: true）」`details.thresholdCr:100` | ✅ PASS |
| 20 | 大额带确认 | `{amountCr:200, confirm:true}` | 200；`balanceAfterCr:250`；台账记录 | 200；`balanceAfterCr:250`；台账 `topup` credit 200 CR | ✅ PASS |
| 21 | 非法金额 | `{amountCr:-5}` | 400 VALIDATION | 400「充值金额必须是正整数（CR）」 | ✅ PASS |
| 22 | 充值后钱包联动 | `GET /api/wallet` | `balanceCr:250` | `{"balanceCr":250,...}` | ✅ PASS |

### 3.4 收支台账（TC-WALLET-04）

| # | 用例 | 命令（简） | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| 23 | 台账全量 | `GET /api/wallet/transactions` | `{items,page,pageSize,total}`；含 3 笔 topup | 3 笔（50/99/200 CR），`total:3`，倒序 | ✅ PASS |
| 24 | type 筛选 | `?type=topup` | 只返回 topup | 全部 topup（3 笔） | ✅ PASS |
| 25 | direction 筛选 | `?direction=debit` | 只返回 debit（本账号无） | `items:[], total:0` | ✅ PASS |
| 26 | 分页 | `?page=1&pageSize=1` | `items` 长度 1，`total` 不变 | `items` 1 条，`pageSize:1, total:3` | ✅ PASS |
| 27 | 非法 type 筛选 | `?type=bogus` | 400 VALIDATION 列出合法值 | 400「type 只能是：topup / withdrawal / …」 | ✅ PASS |

### 3.5 提现（TC-WALLET-05~06，状态词对照词汇表 §4）

| # | 用例 | 命令（简） | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| 28 | cardLast4 校验 | `{cardLast4:"12a4"}` | 400 VALIDATION | 400「银行卡后四位需为 4 位数字」 | ✅ PASS |
| 29 | 持卡人必填 | 缺 `holderName` | 400 VALIDATION | 400「持卡人姓名不能为空」 | ✅ PASS |
| 30 | 创建提现 | `{amountCr:100, bankName, cardLast4:"1234", holderName}` | 201；`status:"withdrawal pending"`；`etaDays ∈ [1,3]`（A4） | 201；`status:"withdrawal pending"`；`etaDays:3` | ✅ PASS |
| 31 | 超额提现 | `{amountCr:99999}` | 400 `INSUFFICIENT_BALANCE` | 400 `{"error":{"code":"INSUFFICIENT_BALANCE","message":"余额不足"}}` | ✅ PASS |
| 32 | 提现后钱包联动 | `GET /api/wallet` | `balanceCr` 扣减；`pendingWithdrawalCr:100`（钱在银行通道） | `{"balanceCr":150,"pendingWithdrawalCr":100,...}` | ✅ PASS |
| 33 | 提现列表 | `GET /api/wallet/withdrawals` | 含新提现，字段齐全 | 1 条，`status:"withdrawal pending", etaDays:3, bankName/cardLast4/holderName` | ✅ PASS |
| 34 | 状态筛选 | `?status=withdrawal%20pending` | 只返回对应状态 | 1 条（词汇表状态词原样生效） | ✅ PASS |
| 35 | 非法 status 筛选 | `?status=bogus` | 400 VALIDATION 列出合法值 | 400「status 只能是：withdrawal pending / withdrawal completed / withdrawal failed」 | ✅ PASS |

### 3.6 托管总览（TC-ESCROW-01，三角色视角 + 种子数据）

| # | 用例 | 命令（简） | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| 36 | 新用户托管（空） | `GET /api/wallet/escrow` | `items:[]` | `{"items":[]}` | ✅ PASS |
| 37 | 种子 buyer 钱包 | 登录 buyer 后 `GET /api/wallet` | `balanceCr:4475, escrowHeldCr:525`（演示托管单） | `{"balanceCr":4475,"escrowHeldCr":525,"currency":"CR","pendingWithdrawalCr":0}` | ✅ PASS |
| 38 | 种子 buyer 托管视角 | `GET /api/wallet/escrow` | 每项含 refType/refId/direction/amountCr/escrowStatus/party/eta；**钱在谁手里 + 何时到账**两个问题有答案 | `{refType:"order",refId:"ord_demo_1",direction:"in",amountCr:525,escrowStatus:"held",party:"我(买家)",eta:"退款窗口内可申请退回"}` | ✅ PASS |
| 39 | 种子 seller 钱包 | 登录 seller 后 `GET /api/wallet` | `escrowHeldCr:525`（待收）；`pendingWithdrawalCr:500`（演示提现） | `{"balanceCr":1500,"escrowHeldCr":525,"currency":"CR","pendingWithdrawalCr":500}` | ✅ PASS |
| 40 | 种子 seller 托管视角 | `GET /api/wallet/escrow` | 同一笔托管，seller 看到 `direction:"out"`、`party:"我(卖家/接单者)"`、`eta:"验收通过后即时到账"` | 与期望逐字段一致 | ✅ PASS |
| 41 | 种子 contractor 钱包 | 登录 contractor 后 `GET /api/wallet` | `escrowHeldCr:0` | `{"balanceCr":1500,"escrowHeldCr":0,"currency":"CR","pendingWithdrawalCr":0}` | ✅ PASS |
| 42 | 种子 contractor 托管视角 | `GET /api/wallet/escrow` | `items:[]` | `{"items":[]}` | ✅ PASS |

### 3.7 种子账号登录（数据可用性）

| # | 用例 | 命令（简） | 期望 | 实际 | 结果 |
|---|---|---|---|---|---|
| 43 | 四种子账号登录 | 依次登录 admin/buyer/seller/contractor | 均可登录；角色/管理员标记正确 | admin（三角色 isAdmin）、buyer（`["buyer"]`）、seller（`["seller","buyer"]`）、contractor（`["contractor","buyer"]`）；admin 钱包 0 CR | ✅ PASS |

## 4. 自动化测试套件（L1/L2 佐证）

`npm test`（构建 shared → 全部 workspace 测试）：**全绿**。

| Workspace | 文件数 | 用例数 | 结果 |
|---|---|---|---|
| `@vibe/api`（app/auth/钱包路由 + 中间件，supertest + `:memory:`） | 4 | 40 | ✅ 全部通过（含健康检查、404 JSON、空库自动种子 A6、鉴权、钱包/提现/台账） |
| `@vibe/web`（App 渲染，Testing Library） | 1 | 2 | ✅ 全部通过 |
| **合计** | **5** | **42** | ✅ **通过率 100%** |

## 5. 结果统计与结论

| 项 | 值 |
|---|---|
| 用例总数 | 43 |
| PASS | 43 |
| FAIL | 0 |
| **通过率** | **100%（43/43）** |
| 阻断缺陷 | **未发现阻断缺陷**（无 P0/P1 缺陷） |

**结论**：当前 main 的认证 + 钱包/托管/台账 API 与 PRD 第 4 节风险规则（A1 大额充值二次确认、A4 提现到账 1–3 工作日）、DECISIONS D2（CR 整数货币）、D4（角色数组）、状态词汇表 §4（`withdrawal pending` 等规范词）、API.md 错误格式/分页约定**全部一致**。种子数据（四账号 + 演示托管单 + 演示提现）可用，三角色在同一笔托管上的视角（钱在谁手里/何时到账）字段齐全且语义正确。

## 6. 观察项（非阻断，建议跟进）

| # | 观察 | 说明 | 建议 |
|---|---|---|---|
| O1 | **API.md 文档漂移**：`docs/API.md` §7 仍写 `amountCents`/`currency:"CNY"`，实现与 `DECISIONS.md` D2 均为整数 CR（`amountCr`/`currency:"CR"`） | DECISIONS.md 第 1 节规定以决策日志为准并指出冲突；实现正确，**文档落后** | 已开 issue（见 §6.1）更新 API.md 金额字段与阈值描述（100 CR 而非 ¥500） |
| O2 | 托管条目 `party` 文案「我(卖家/接单者)」对作品线卖家语义略宽（卖家≠接单者） | 共享 DTO 通用措辞，非功能缺陷 | Phase 2 前端渲染时按 refType 区分「卖家」/「接单者」措辞 |
| O3 | 提现 `etaDays` 为随机 1–3（`WITHDRAWAL_ETA_MIN/MAX_DAYS`） | 符合 A4「1–3 个工作日」；页面须明示该值 | Phase 2 验收 TC-WALLET-05 前端展示 |

### 6.1 缺陷 / 文档 issue 列表

| Issue | 标题 | 类型 | 优先级 | 状态 |
|---|---|---|---|---|
| [#22](https://github.com/ChenyuHeee/vibe-coding-marketplace/issues/22) | API.md 金额字段与 DECISIONS D2 冲突（amountCents→amountCr / CNY→CR） | type/docs | priority/low | OPEN |

> 说明：本轮**未发现运行期阻断缺陷**（43/43 通过）；O1 属文档漂移，已按 DECISIONS.md「指出冲突」规则登记为低优先级 issue 跟进。

## 7. 对 Phase 2 的测试建议

1. **前端验收入口**：以 TEST_PLAN §5 用例表为准（TC-WALLET-01/03/05 的前端侧、TC-ESCROW-02、TC-RISK-H-01/03、TC-A11Y-01~04），重点验证二次确认弹窗（金额并列展示、确认按钮含金额）与 WalletBalanceCard「钱在谁手里/何时到账」两栏。
2. **状态词一致性抽查**：前端所有徽章渲染字符串与 `STATUS_VOCABULARY.md` 逐字比对（含空格），防 `in progress` vs `in_progress` 类漂移。
3. **作品线与需求线**：订单/My Library/上传审核/Commission/Contract 路由上线后，立即补 Phase 1 同款 curl 冒烟（下单总价含手续费、取消未付款一步、退款路径、验收标准锁定、放款前看交付物）。
4. **回归基线**：本报告 43 条 curl 用例作为 API 回归基线；每合并一个功能 PR 重跑受影响子集。
5. **部署环境**：vhost 就绪后执行 TC-DEPLOY-01（他人设备可打开 `https://vibers.hechenyu.xin`）并补 HTTPS/反代链路冒烟（`/api`、`/play` 经 nginx）。

## 8. 附录：执行环境快照

- `node v22.23.2` / `npm 10.9.8`（沙箱 `NODE_ENV=production`，安装使用 `npm install --include=dev`）
- 依赖：453 包安装成功，`npm audit` 0 漏洞
- 测试产物：本报告 + `/tmp/qa-smoke/*.txt`（原始 curl 响应存档）

## 9. 变更记录

| 日期 | 变更 | 说明 |
|---|---|---|
| 2026-08-24（初始版） | 建立 Phase 1 报告 | 43 用例全 PASS；`npm test` 42/42 全绿；文档漂移登记 issue #22 |
