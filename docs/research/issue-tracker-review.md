# Issue Tracker 结构与执行顺序复审报告

**审阅对象：** [`docs/issue-tracker.md`](../issue-tracker.md)
**复审日期：** 2026-08-23
**重点：** Execution Tier、Recommended Execution Order、依赖、并行边界与状态对账。

## 结论

tracker 现已采用一套可执行的**双轴调度模型**：`Tier` 表达内容生产优先级，`Wave` 表达推荐实施顺序，`Sequence` 表达单一能力内的强依赖，`Conflict Group` 限制同一 wave 内的安全并行。这个结构同时满足“什么更值得做”和“下一步应怎么做”，比单独使用 Phase 或 Tier 都更清晰。

本次核验显示：GitHub 当前 **34 个开放 issue**，tracker 的 Execution Tiers 与 Dormant 队列也恰有 **34 项**。已关闭的 #51 已移入 Closed 区；#109 与 #110 已被纳入相应队列；#110 的文件/资源冲突已加入矩阵。因此 tracker 目前可作为每个 session 的直接执行入口。[1] [2]

> **Session 规则：** 先打开 `Recommended Execution Order`，选择最早一个未完成 wave；在该 wave 中只选择没有 hard blocker、且不与正在进行工作共享 Conflict Risk Matrix 行的 issue。

## 已验证的执行结构

| 结构层 | 回答的问题 | 当前实现 | 评价 |
|---|---|---|---|
| **Tier** | 什么工作更值得优先投入？ | Tier 1、Tier 2、Tier 3、Dormant。 | 正确；优先级不再伪装成技术依赖。 |
| **Wave** | 这一轮应先推进哪一组能力？ | W0 基线 → W1 核心搜索/素材 → W2 扩展/路由 → W3 审计/收尾 → W4 延后链。 | 正确；每个 wave 都有入口、出口、串行条件与并行规则。 |
| **Sequence** | 同一能力内哪些任务绝不能倒序？ | #98 → #99；#100 可并行；#101 推荐接 #100；#111 → #21 为推荐顺序。 | 正确；避免 Tier 3 被误读为任意顺序。 |
| **Conflict Group** | 同一 wave 内哪些任务不能并行改？ | registry、asset-sourcer、search-sources、cdp-client、content-pipeline、quota/routing。 | 正确；新增 #110 后也有文件与资源冲突边界。 |
| **Human gate** | 哪些任务尚不应进入实现排期？ | Dormant 与 Needs triage，包括 #109。 | 正确；把未决架构边界与可执行工作分开。 |

## 当前推荐执行顺序

| 顺序 | 目标 | 关键工作 | 开始条件 |
|---|---|---|---|
| W0 | 决策与基线 | #67、#103、#111。 | 立即可开始；#67 完成后才释放多项审计/修复。 |
| W1 | 搜索与素材核心链 | #88、#63、#89 P0、#110。 | #110 建议在 #88/#67 接口稳定后进入；#63 可与 #89 并行。 |
| W2 | 搜索扩展与路由 | #64、#66、#90、#97。 | #66 依赖 #67；#65 等待 #64/#90；#109 仍需先与 #65 完成边界决策。 |
| W3 | 审计与收尾 | #68、#76、#77、#87、#65、#91/#92。 | 相关实现稳定后执行；审计不与被审计的共享文件改动并行。 |
| W4 | 延后的视频链与独立增强 | #98/#99/#100/#101 与 #75/#85/#94/#108。 | 按 P5–P8b 显式 Sequence 和各自 blocker 推进。 |
| Dormant / Human gate | 暂不排期 | #21/#29/#107/#32/#35/#60/#61/#109。 | 仅在 trigger、用户输入或 triage 决策满足后进入 wave。 |

## 对账与边界检查

| 审阅项 | 当前状态 | 结果 |
|---|---|---|
| Open inventory | GitHub 34；tracker 活动队列 34。 | 通过。 |
| #51 | 已关闭，已移入 Closed Issues；Closed 区计数为 27。 | 通过。 |
| #109 | 已进入 Needs triage，明确要求先界定其与 #65 的职责。 | 通过。 |
| #110 | 已进入 Tier 2，并登记 `source-registry.mjs`、`asset-sourcer.mjs`、`content-pipeline.md` 及 quota/routing 冲突。 | 通过。 |
| 运行时“tier”歧义 | #110 在 tracker 中写为 media-search `layers (L1–L4)`。 | 通过。 |
| Session 开始规则 | Triage Protocol 指向最早未完成 wave 与 hard blocker 检查。 | 通过。 |

## 维护要求

该结构可持续使用，前提是每次 triage 都执行以下轻量校验：

1. 执行 GitHub open/closed 查询，并满足 `GitHub open count = Tier + Dormant entries`。
2. 新 issue 同时归入 Tier、Wave 或 Human gate；未定义 #65 等边界的工作先放入 `Needs triage`。
3. 新增或修改 `Conflict files` 时，同步检查 Conflict Risk Matrix 与 Resource/Quota 冲突组。
4. 每个 wave 只推进满足 hard blocker 的任务；soft/recommended 提前执行时，必须在 issue 中记录风险与回退方案。

## References

[1]: https://github.com/0xPabloLI/inside-china-ai/issues "inside-china-ai — current[1]: https://github.com/0xPabloLI/inside-china-ai/issues "inside-china-ai — current[1]: https://github.com/0xPabloLI/inside-china-ai/issues "in/github.com/0xPabloLI/inside-china-ai/issues/109 "#109 — Unified text search pool"
[4]: https://github.com/0xPabloLI/inside-china-ai/issues/111 "#111 — Text RAG retrieval integration"

---

**审阅说明：** 本�**审阅说�26-08-23 的 tracker 快照编写。本文仅更新文档记录，未修改 GitHub Issue 或 PR。
