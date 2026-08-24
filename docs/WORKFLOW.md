# 协作规范（Multi-Agent Workflow）

本项目由多个角色 agent 协作开发，Orchestrator（主 agent）负责总体协调、审查与合并。

## 角色分工

| 角色 | 职责 | 独立工作目录（各自 clone） |
|------|------|--------------------------|
| **Orchestrator** | 总体协调、拆分任务、审查并合并全部 PR、质量把关 | `repo/` |
| **PM（产品经理）** | 确认需求、状态词汇表、需求拆解为 Issue（含验收标准） | `agents/pm/` |
| **Tech Lead（架构师）** | 技术选型、架构与 API 设计、CI 脚手架 | `agents/architect/` |
| **Designer（设计师）** | 设计系统规范：颜色/四状态/反馈/无障碍/组件清单 | `agents/designer/` |
| **Frontend Dev** | 前端实现（Marketplace / Library / Commission 等 UI） | `agents/fe-dev/` |
| **Backend Dev** | 后端实现（API / 数据库 / 文件存储 / 支付与托管） | `agents/be-dev/` |
| **Code Reviewer** | 审查所有 PR（代码质量、PRD 对照） | `agents/reviewer/` |
| **QA（测试）** | 测试计划、测试执行、缺陷 Issue、PRD 自检清单验收 | `agents/qa/` |

## 铁律（所有 agent 必须遵守）

1. **所有需求 → GitHub Issue**：每个需求 issue 必须含：PRD 来源、面向角色、验收标准（checklist）、风险等级。
2. **所有开发 → 分支 + Pull Request**：PR 必须引用 issue（`Closes #N`）。
3. **只有 Orchestrator 合并 PR**（squash merge）。任何 agent 不得直接 push main、不得自行 merge。
4. **分支命名**：`feat/<area>-<slug>` / `fix/<slug>` / `docs/<slug>` / `chore/<slug>`。新分支一律从最新 `origin/main` 切出：`git fetch origin && git checkout -b <branch> origin/main`。
5. **Commit 使用 Conventional Commits**：`feat:` `fix:` `docs:` `test:` `refactor:` `chore:`。
6. **独立目录 = 独立 clone**：每个 agent 只在自己的工作目录操作，天然避免 commit 冲突。
7. **状态词汇表唯一来源**：`docs/STATUS_VOCABULARY.md`（PM 产出），所有界面与接口的状态词必须与其一致。
8. **高风险动作**（见 PRD 第 4 节）必须实现二次确认/防误触；低风险动作一步可达。

## PR 生命周期

```
dev 开分支 → 实现 → push → gh pr create（引用 issue，请求 review）
   → Code Reviewer 审查（gh pr review，comment/approve）
   → QA 验证（如适用）
   → Orchestrator 最终审查 → squash merge（删除分支）
```

## Issue 标签约定

- 区域：`area/marketplace` `area/upload` `area/library` `area/commission` `area/contract` `area/wallet` `area/auth` `area/design-system`
- 类型：`type/feature` `type/bug` `type/docs` `type/refactor`
- 优先级：`priority/high` `priority/medium` `priority/low`
- 角色：`role/frontend` `role/backend` `role/design` `role/test`
- 其他：`status/blocked` `good-first-issue`
