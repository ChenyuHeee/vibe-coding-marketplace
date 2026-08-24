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
apps/web         前端应用（React + Vite + TS）
apps/api         后端 API（Express + TS，端口 3001）
packages/shared  共享类型与常量（@vibe/shared：状态词 / 角色 / 健康检查）
docs/            PRD / 架构 / API / 设计系统 / 状态词汇表 / 协作规范
.github/         Issue / PR 模板，CI workflow（install → lint → typecheck → build → test）
```

## 本地运行

要求：**Node.js ≥ 22**（内置 `node:sqlite`；推荐 22.x LTS）、npm ≥ 10。

```bash
# 1) 安装依赖（一次性；npm workspaces 会自动链接 @vibe/shared）
npm install

# 2) 启动开发环境（并行运行 api :3001 与 web :5173；web 的 /api 会代理到 api）
npm run dev
```

- 打开 http://localhost:5173 应看到首页标题「Vibe Coding Marketplace」并显示 API 状态。
- 直接验证后端：`curl http://localhost:3001/health` → `{"ok":true,...}`。

其他脚本：

```bash
npm run build       # 按依赖顺序构建 shared → api → web
npm test            # vitest：api /health 测试 + web 组件测试
npm run lint        # ESLint 9（flat config，覆盖全仓库）
npm run typecheck   # tsc --noEmit（shared → api → web）
```

环境变量见 [.env.example](.env.example)（端口 / CORS / JWT_SECRET / 数据与上传目录）。详细技术决策见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，接口设计见 [docs/API.md](docs/API.md)。
