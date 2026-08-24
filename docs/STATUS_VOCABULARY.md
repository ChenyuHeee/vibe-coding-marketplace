# 状态词汇表（Status Vocabulary）

> **本文档是全平台唯一的业务状态事实来源（single source of truth）。**
> 前端状态徽章、后端存储、API 字段、测试断言、文档引用——所有角色的所有界面与接口，必须使用本文档给出的**规范状态词字符串**，一字不差（大小写、空格均敏感）。
>
> 来源：`PRD.md` 第 1、2、5 节。由 PM Agent 维护；任何变更须走 PR，并同步 Architect（API 字段）、Frontend Dev（徽章渲染）、Backend Dev（存储）、QA（验收）。
>
> 对应需求：Epic 质量验收与交付（#10）按本表全表抽查「状态词三角色一致」。

---

## 0. 使用规则

1. **规范状态词**即下表「状态词」列的字符串：全平台唯一，前后端必须使用完全相同的字符串。示例：`in progress` 不能写成 `In Progress` 或 `in_progress`（存储层的 snake_case 映射由 Architect 决定，但对外展示与逻辑判断以本表规范词为准）。
2. 中文翻译仅用于界面文案与沟通，不进入存储/API 逻辑判断。
3. 四条状态流互相独立：同一个作品可以同时处于「审核流」的 `approved` 与某笔订单的 `delivered`；同一账号可以同时是买家（订单流）与卖家（审核流）。
4. **本文档不包含设计系统 5.1 的界面四状态**（Empty / In progress / Error / Success）——那是「界面状态」而非「业务状态」，属设计系统规范（Epic #8）。注意别与需求流业务状态 `in progress` 混淆（见第 3 节）。
5. 每个状态词在 buyer / seller / contractor 眼中的含义可能不同，但**词本身相同**——这正是 PRD「同一个状态词，三种角色看到的是同一件事的不同侧面」的要求。本文档每个状态给出三角色视角。
6. 风险语义：涉及钱的状态，必须能回答两个问题——**钱现在在谁手里？何时到我的账户？**（第 4、5 节）。

---

## 1. 作品审核流（Artwork Review Flow）

适用对象：卖家上传的作品（work/artifact）。角色：seller（作者）、buyer（潜在买家）、contractor（仅以买家身份浏览，无独立视角）。

### 状态总览

| 状态词 | 中文 | 触发条件 | 流转方向 |
|---|---|---|---|
| `draft` | 草稿 | 作者创建作品（保存草稿）但未提交审核；API 草案：`POST /api/projects` 创建后即 `draft`，作者填完再 submit | → `submitted`（作者提交审核） |
| `submitted` | 已提交 | 卖家提交上传表单（拖入 HTML + 标题/描述/定价/试用范围） | → `under review`（自动） |
| `under review` | 审核中 | 提交后自动进入；或驳回修改后重新提交 | → `approved` / `rejected` |
| `approved` | 已上架 | 平台审核通过 | → `delisted` |
| `rejected` | 已驳回 | 审核未通过（**必须附理由**） | → `submitted`（卖家修改后重新提交，重新走审核） |
| `delisted` | 已下架 | 卖家下架（**必须填写理由**）或平台违规下架 | → `submitted`（重新提交需重新审核）；对已购买家而言是服务持续态（保留访问权） |

### 三角色视角

- `draft` 草稿
  - seller：草稿箱中可见，可继续编辑、预览、删除；填写完整后提交审核（→ `submitted`）。
  - buyer / contractor：不可见（从未提交，不进入任何列表/搜索）。
- `submitted` 已提交
  - seller：作品已提交，等待进入审核队列——作者最关心的「我的作品到哪一步了」从这里开始可见。
  - buyer / contractor：不可见（未上架，不进入市场列表）。
- `under review` 审核中
  - seller：可见审核进度（队列位置 / 审核阶段指示器）。
  - buyer / contractor：不可见。
- `approved` 已上架
  - seller：作品在售，可查看浏览/购买数据。
  - buyer：可见、可试玩、可购买。
  - contractor：以买家身份可见、可购买。
- `rejected` 已驳回
  - seller：可见驳回理由，可修改后重新提交（回到 `submitted`）。
  - buyer / contractor：不可见（从未上架过，列表与搜索均不出现）。
- `delisted` 已下架
  - seller：作品不再公开出售；下架理由被平台记录（下架已售出作品时**理由必填**）。
  - buyer：**已购买家保留访问权**（My Library 中仍可在线运行/下载），未购用户不可见。
  - contractor：未购不可见。

> 风险注记（对照 PRD 第 4 节）：`draft` 可编辑/删除（可逆、低风险）；`delisted` 对已售出作品是不可逆动作 → 必须填理由 + 防误触；`rejected` → 重新提交为可逆路径。

---

## 2. 订单与支付流（Order & Payment Flow）

适用对象：一笔购买订单（buyer 购买 seller 的已上架作品）。**钱在谁手里是本流核心语义**，每个状态均已标注。

### 状态总览

| 状态词 | 中文 | 触发条件 | 流转方向 | 钱在谁手里 |
|---|---|---|---|---|
| `pending payment` | 待支付 | 买家下单（下单前已显示含手续费的总价） | → `paid` / `cancelled` | 买家自己（尚未支付） |
| `cancelled` | 已取消 | 买家一步取消（不追问原因）/ 超时未付自动取消 | 终态 | 无资金流动 |
| `paid` | 已支付（资金托管中） | 支付成功 | → `delivered` / `refund requested` / `disputed` | 平台托管账户（escrow held） |
| `delivered` | 已交付 | 作品类：支付后自动交付；接单类：contractor 提交交付物 | → `completed` / `refund requested` / `disputed` | 平台托管账户（escrow held） |
| `completed` | 已完成 | 买家确认收货 / 验收期结束自动确认 | 终态 | 已放款给卖家（进入 seller 的 `balance`） |
| `refund requested` | 退款申请中 | 买家在退款窗口内发起退款（路径可从订单/作品详情找到） | → `refunded` / `completed` | 平台托管账户（escrow held，冻结） |
| `refunded` | 已退款 | 退款审核通过 | 终态 | 已退回买家（原路返回 / 平台余额） |
| `disputed` | 争议中 | 买家/卖家发起争议，平台介入 | → `refunded` / `completed` / 平台裁决 | 平台托管账户（escrow held，冻结） |

### 三角色视角

- `pending payment` 待支付
  - buyer：看到含手续费的实际应付总额；**一步取消、不追问原因**（低风险动作）。
  - seller：收到新订单（未付款）。
  - contractor：不适用。
- `cancelled` 已取消
  - buyer：无任何扣款，订单关闭。
  - seller：订单关闭，无销售。
- `paid` 已支付（资金托管中）
  - buyer：已付款，等待交付。
  - seller：资金已进入托管（**此时拿不到**），交付后放款。
- `delivered` 已交付
  - buyer：已收到作品（可在线运行/下载），可确认收货或申请退款。
  - seller：已交付，等待买家确认或退款窗口结束。
- `completed` 已完成
  - buyer：交易完成，作品常驻 My Library。
  - seller：货款已放款，进入余额（`escrow released` → `balance`）。
- `refund requested` 退款申请中
  - buyer：退款申请已提交，等待处理。
  - seller：收到退款申请，可响应/申诉。
- `refunded` 已退款
  - buyer：款项已退回。
  - seller：交易关闭，未获得放款。
- `disputed` 争议中
  - buyer / seller：进入平台仲裁，资金冻结在托管，裁决后流向 `refunded` 或 `completed`。

> 风险注记：`paid`→`delivered` 之间资金在平台托管（买家与卖家都动不了）；`completed` 是放款时点（不可逆，见第 5 节速查）。

---

## 3. 需求-接单-交付流（Commission & Delivery Flow）

**PRD 第 5 节硬性规定的状态流，规范形式不可改动**（六个标 ★ 的词必须原样出现）：

> ★ `bid` → ★ `selected` → ★ `in progress` → ★ `milestone submission` → ★ `buyer acceptance` → ★ `payout`

### 状态总览

| 状态词 | 中文 | 触发条件 | 流转方向 |
|---|---|---|---|
| ★ `bid` | 投标 | contractor 对需求投标（金额、时间线） | → `selected` / `rejected`（未中标）/ `cancelled`（需求取消） |
| ★ `selected` | 被选中 | buyer 选中某投标 | → `in progress`（开始执行）/ `cancelled` |
| ★ `in progress` | 进行中 | 选中后进入执行 | → `milestone submission` / `cancelled` / `disputed` |
| ★ `milestone submission` | 里程碑提交 | contractor 提交里程碑交付物 | → `buyer acceptance`（进入验收）/ `in progress`（被打回修改） |
| ★ `buyer acceptance` | 买家验收 | buyer 对当前交付物进行验收 | → `payout`（验收通过）/ `in progress`（要求修改，须附修改意见） |
| ★ `payout` | 结算 | 验收通过（或全部里程碑完成）后自动结算 | 终态；托管资金放款给 contractor |
| `rejected` | 已拒绝（投标） | buyer 拒绝某投标 / 选中他人 | 终态（对该投标而言） |
| `cancelled` | 已取消 | buyer/contractor 协商取消；或需求在无人接单时被发布者取消 | 终态；若已有托管资金则走退款 |
| `disputed` | 争议中 | 任一方发起争议，平台介入 | → `payout` / `refunded` / 平台裁决 |

### 三角色视角

- ★ `bid` 投标
  - buyer：收到投标列表，可筛选、选中（→ `selected`）、拒绝（→ `rejected`）。
  - contractor：我的投标在等待结果。
  - seller：不适用。
- ★ `selected` 被选中
  - buyer：已选定接单者，可确认开始。
  - contractor：中标，准备开始（→ `in progress`）。
- ★ `in progress` 进行中
  - buyer：可查看里程碑进度。
  - contractor：执行中。
- ★ `milestone submission` 里程碑提交
  - buyer：查看里程碑交付物并进入验收。
  - contractor：等待验收结果。
- ★ `buyer acceptance` 买家验收
  - buyer：验收当前交付物——确认（→ `payout`）或要求修改（→ `in progress`，须附修改意见）。
  - contractor：等待验收结果。
- ★ `payout` 结算
  - buyer：款项已结算。
  - contractor：收入到账，进入 `balance`（对应钱包流 `escrow released`）。
- `rejected` 已拒绝（投标）
  - contractor：该投标被拒/落选（可对同一需求重新投标或另寻需求）。
  - buyer：已选择其他投标。
- `cancelled` 已取消
  - buyer / contractor：合同关闭；如有托管资金则退款。
- `disputed` 争议中
  - buyer / contractor：平台介入仲裁，资金冻结在托管。

> 资金语义：`selected` 之后若合同已托管资金，则在 `in progress` / `milestone submission` / `buyer acceptance` / `disputed` 期间钱均在平台托管（`escrow held`）；`payout` 时放款给 contractor（`escrow released` → contractor `balance`）。
>
> ⚠️ 界面注意：业务状态 `in progress` 与设计系统界面四状态中的「进行中 In progress」**同名不同义**——前者是需求-接单-交付流的业务状态（第 0 节规则 4），渲染时需按上下文区分。

---

## 4. 钱包与托管流（Wallet & Escrow Flow）

适用对象：平台账户的钱。**每个涉及钱的状态必须回答两个问题：钱现在在谁手里？何时到我的账户？**

### 状态总览

| 状态词 | 中文 | 触发条件 | 钱在谁手里 | 何时到我的账户 |
|---|---|---|---|---|
| `balance` | 余额 | 充值入账 / 退款入账 / 放款入账 | 平台账户中的**我的可用余额**（可消费、可提现） | 已在我的账户（可立即使用） |
| `top-up pending` | 充值处理中 | 发起充值，支付渠道处理中 | 支付渠道（尚未到平台） | 支付确认后**即时入账**到 `balance` |
| `escrow held` | 托管中 | 买家付款 / 合同托管 | **平台托管账户（冻结）**——买家、卖家/接单者都不可动用 | 交付验收通过放款后进入收款方 `balance` |
| `escrow released` | 已放款 | 验收通过自动放款 | 已从托管转给收款方（进入其 `balance`） | 放款时**即时入账**到收款方 `balance` |
| `withdrawal pending` | 提现处理中 | 发起提现（身份 + 银行卡验证通过后） | 已从 `balance` 划出，在银行处理通道 | 页面注明到账时间（默认 **1–3 个工作日**） |
| `withdrawal completed` | 已到账 | 银行处理完成 | 我的银行卡 | 已完成 |
| `withdrawal failed` | 提现失败 | 银行退回 | 退回平台 `balance`（注明原因） | 已退回 `balance`，可重新提现 |

### 三角色视角

- buyer：充值（`top-up pending` → `balance`）、付款（→ `escrow held`）、退款（→ `balance` / 原路返回）。
- seller：收款方——作品订单 `completed` 时放款（`escrow released` → `balance`）。
- contractor：收款方——需求合同 `payout` 时放款（`escrow released` → `balance`）。

> 托管状态在钱包页**一眼可见**：谁的钱、在哪里（托管/余额/银行通道）、何时到账（第 5 节速查表供 UI 直接引用）。

---

## 5. 附录：钱在谁手里（速查表）

> 供钱包页、订单详情、结算页直接引用；每个涉及钱的状态在此表必有答案。

| 状态 | 钱的位置 | 何时到我的账户 |
|---|---|---|
| `pending payment` | 买家自己（未支付） | 支付后进入平台托管 |
| `top-up pending` | 支付渠道 | 支付确认后即时入账 `balance` |
| `paid` / `delivered` / `refund requested` / `disputed` | 平台托管（`escrow held`） | 放款后入收款方 `balance`；退款则退回买家 |
| `completed` / `escrow released` | 已放款到收款方 `balance` | 即时 |
| `refunded` | 买家（原路返回 / 平台余额） | 即时 |
| `balance` | 平台账户可用余额 | 已可用（可消费、可提现） |
| `withdrawal pending` | 银行处理通道 | 1–3 个工作日（页面注明） |
| `withdrawal completed` | 我的银行卡 | 已完成 |
| `withdrawal failed` | 退回平台 `balance` | 已退回，可重新提现 |

---

## 6. 变更记录

| 日期 | 变更 | 说明 |
|---|---|---|
| 2026-02（初始版） | 建立四流全量词汇表 | 与 PRD 第 5 节硬性状态流保持一致；后续变更走 PR 并通知全角色 |
| 2026-02（修订） | 作品审核流新增 `draft`（草稿） | 与架构师 API 草案 diff 后补齐：`POST /api/projects` 创建后即 `draft`，作者填完再 submit（→ `submitted`） |
