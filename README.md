# Vibe Coding Marketplace

一个交易「能运行的作品（vibe coding 项目）」的在线市场 —— **买家 buyer / 卖家 seller / 接单者 contractor** 三种角色共用一个平台。

> 课程项目。需求文档见 [docs/PRD.md](docs/PRD.md)，多 agent 协作规范见 [docs/WORKFLOW.md](docs/WORKFLOW.md)。

## 六大功能区（全部必做）

| # | 功能区 | 一句话 |
|---|--------|--------|
| 1 | Marketplace 与详情页 | 列表筛选 + 详情页**可直接试玩**（不是封面轮播） |
| 2 | 上传与上架 | 拖入 HTML 上架，作者全程可见**审核进度** |
| 3 | 购买与 My Library | 下单→支付→收货→在线运行/下载；**两步回到 My Library**；退款路径可找到 |
| 4 | 发布需求 Commission | 预算/时间线/**验收标准（发布时锁定）**/参考作品；需求板可筛选 |
| 5 | 接单与交付 | bid→selected→in progress→milestone→acceptance→payout；**双方同一状态词** |
| 6 | 钱包与充值 | 余额/充值/收支/提现/**托管状态**：钱在谁手里、何时到账，一眼可见 |

## 三条交易线逻辑

1–3 = 作品交易线；4–5 = 需求线；6 = 连接两条线的钱。

## 仓库结构

```
apps/web       前端应用（React + Vite，由架构决策确认）
apps/api       后端 API（Express，由架构决策确认）
packages/shared 共享类型
docs/          PRD / 架构 / 设计系统 / 状态词汇表 / 协作规范
.github/       Issue / PR 模板，CI workflow
```

## 本地运行

（由架构决策落地后补充 —— 见 docs/ARCHITECTURE.md）
