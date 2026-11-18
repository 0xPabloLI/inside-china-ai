# Agent Harness 总览

> 本文件是 harness 的**组件地图**：有哪些组件、各自解决什么问题、什么时机读、与 core（`~/Documents/code/agent-harness`）的移植关系。规则正文不在本文件——每份文档自己就是单一来源。新建/移动/改写组件后同步更新本文件，否则地图会先于规则腐化。

## 组件地图

| 层 | 文件 | 作用 |
| --- | --- | --- |
| 路由 | `AGENTS.md` | Workflow Router（9 条）+ Hard Safety Gates，按任务类型指到组件 |
| 实施 | `docs/agents/implementation-workflow.md` | Planning Scale（S0–S3）× Risk（R0–R3）、skill 契约与降级、TDD/review 循环、收尾报告（含产品视角门禁） |
| Git | `docs/agents/git-workflow.md` | safety baseline、worktree 纪律、stash 禁令、commit cadence、PR 门禁、Session-Id |
| Git 应急 | `docs/agents/git-concurrent-recovery.md` | 并发竞态 4 配方（临时 index / 孤儿提交 / blob 恢复 / pathspec 重提） |
| 建议 | `docs/agents/proposal-review.md` | 建议前的因果依据、影响面、事实双源、新工具准入、模型参数 |
| 票 | `docs/agents/issue-tracker.md`、`docs/agents/triage-labels.md` | GitHub Issues 后端与 core 契约；category/priority/state/signal 四类 label |
| 领域 | `docs/agents/domain.md` + 根 `CONTEXT.md` + `docs/adr/` | 词汇单一来源、ADR 与代码对标 |
| 场景 | `docs/conventions/scenario-enumeration-checklist.md`、`scenario-matrix.md` | 9 类边界场景「查什么」+「怎么记」，矩阵行即 TDD 用例 |
| 事实 | `docs/conventions/fact-verification.md` | 事实双源操作程序、平台事实 |
| 其他约定 | `docs/conventions/test-env-baseline.md`、`data-handling.md`、`coverage-matrix.md` | env-flake 台账、数据处理边界、覆盖矩阵 |
| 机器兜底 | `.githooks/`（8 个） | commit-msg / prepare-commit-msg（Session-Id）、pre-commit（secret/LFS/doc 层级）、pre-push、post-checkout/commit/merge、reference-transaction |
| 技能 | `.agents/skills/`（本仓真实目录，非软链） | `open-code-review`、`web-access`、`web-deep-research`、`search-pool` + 本仓专属（brand-system、short-video-pipeline、devtools-*、router-* 等） |
| 文档索引 | `docs/DOCS-INDEX.md` | Agent 可达文档的落位规则（配合 `writing-for-agents`） |

## 什么时机读哪份

- session 开始 / 接手未完成工作 → 本文件 + `AGENTS.md` §Workflow Router
- 准备 stage / commit / push / worktree / 跨分支 → `git-workflow.md`；竞态已发生 → `git-concurrent-recovery.md`
- 拿到实施任务 → `implementation-workflow.md`（先判 S/R 等级，再决定要不要 Spec/Tickets）
- 要给建议或查外部事实 → `proposal-review.md` + `conventions/fact-verification.md`
- 建 / 读 / 关 issue，选 label → `issue-tracker.md` + `triage-labels.md`
- 改文档结构、术语、ADR → `domain.md` + `DOCS-INDEX.md`
- 内容生产（文章/Scene Data/视频渲染发布）→ `docs/content-pipeline.md`、`docs/video-production-runbook.md`（不走代码 TDD 路线）

## 移植记录（本仓视角）

- **来源**：`~/Documents/code/agent-harness` core，逐组件对照移植（对齐语义，不整目录覆盖）。本仓同时是多份 core 文档的**合并底本**：`git-workflow` / `implementation-workflow` / `proposal-review` / `issue-tracker` 的多数段落源自这里。
- **刻意不搬**：品牌与内容管线（`brand-system`、`short-video-pipeline`、`docs/content-pipeline.md`）属 domain 层，core 不收；`.githooks` 的机器兜底形态早于 core 的 `slots/session-id.md` 通用模板，本仓按现有机制运行、不回写成通用模板。
- **本地改编**：Hard Safety Gates 中的内容管线门（渲染产物、发布前校验）只在本仓；`docs/conventions/` 比 core 多 `data-handling.md` 与 `coverage-matrix.md`。
- **补齐记录**：本文件此前缺失——2026-11-18 按 `slots/harness-overview.md` 模板建立；此前「组件地图」只散落在 `AGENTS.md` router 的各条里，新 session 无法一次看全组件关系与移植来源。
