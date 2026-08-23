# Issue Tracker 复审报告

**审阅对象：** [`docs/issue-tracker.md`](../issue-tracker.md)
**复审日期：** 2026-08-23
**审阅范围：** triage 修订后的 tracker、GitHub 当前 issue 状态、关键 issue scope 与冲突矩阵。

## 结论

本轮 triage **已落实此前大部分关键建议**。tracker 当前将 32 个开放 issue 全部纳入 Tier 或 Dormant 队列；顶部 inventory、Closed 区的日期与计数、hard/soft dependency、GitHub sub-issues 说明以及主要冲突矩阵错配均已修正。它现在可以作为新 session 的可靠调度入口。[1] [2]

仍有 **一个 P1 冲突矩阵遗漏**：#77 的 tracker 行和 GitHub issue 都明确指出它会审计、修订或测试 `source-registry.mjs` 中的 capabilities/fallback 配置，但该文件的 Conflict Risk Matrix 行未包含 #77。因为 #67、#88、#64、#90、#91 与 #92 也共享该文件，应将 #77 纳入这一冲突组，再允许它和这些工作并行。[3]

> **最终判断：** 文档从“概览可用但事实会漂移”升级为“可用于排程的 triage 视图”。补齐 #77，并处理两处 P2 文案精度问题后，当前版本即可视为审阅通过。

## 已核验并通过的修复

| 审阅项 | 当前状态 | 核验结果 |
|---|---|---|
| Open inventory | 顶部写 `32 open issues`。 | GitHub 当前为 32 个 open issue；tracker 的 Tier/Dormant 队列也恰有 32 项。通过。[1] [2] |
| 已关闭 issue 清理 | #81、#22、#62、#70 已从开放队列迁入 Closed 区。 | 开放队列不再保留已关闭事项。通过。 |
| Closed 区口径 | 标题为 `2026-08-21~23`，计数 26。 | GitHub 在该日期范围内关闭 26 个 issue；表内已补入此前漏记项。通过。[2] |
| #83 与 #78 | 已进入 Closed 区；#88 成为原机械改名完成后的后续工作。 | Phase/Tier 排程正确。通过。 |
| #107 与 #108 | #107 在 project-milestone Dormant 队列；#108 在 Tier 3 作为独立调研。 | 启动条件与 issue scope 一致。通过。 |
| Parent–Child 说明 | 已改为 GitHub 支持原生 sub-issues、仓库暂用临时视图。 | 事实正确；#89 当前确实尚未建立原生 sub-issues。通过。[4] [5] |
| #89 → #91/#92 依赖 | #91 标为 hard，#92 标为 soft，并说明 SearXNG backend 风险。 | 依赖语义已消除先前矛盾。通过。 |
| 主要冲突矩阵修复 | #90 已加入 registry/search collector；#88 已加入 asset/search collector；#81 与 #66 的误配已移除；`cdp-client.mjs` 已新增。 | 先前四个 P0 错配已修复。通过。 |
| Dormant 队列 | 已按 measurable trigger、project milestone、waiting for user input、needs triage 拆分。 | 下一步动作清晰。通过。 |

## P1：将 #77 加入 `source-registry.mjs` 冲突组

#77 是“59 个 source capability 与 fallback chain 审计”。它明确涉及每个 source 的 `capabilities` 标注、articles access method、fallback 链完整性以及相关测试；issue 本身也直接点名 `source-registry.mjs`。[3]

当前 Tier 3 的 #77 行已正确标注 `source-registry.mjs`，但 Conflict Risk Matrix 中该文件的 issue 列表为：

```text
#88, #67, #64, #90, #91, #92
```

建议改为：

```text
#88, #67, #64, #77, #90, #91, #92
```

这不是简单的展示问题。#77 与 Tier 1 的 #67/#88 共享 capabilities schema 与 fallback 语义；若同时实施，审计结论、field rename 与 schema 补全可能产生 merge conflict 或重复修订。#77 优先级较低并不消除它与高优先级任务的文件冲突。

## P2：两处文案精度改进

| 位置 | 当前表述 | 建议 |
|---|---|---|
| Tier 1 的 #67 Notes | “block 最多下游（6 个 issue 依赖）”。 | tracker 的显式依赖关系列出 #66、#68、#76、#77、#87，共 **5 个直接下游**。建议改为“阻塞 5 个直接下游；并间接影响 #87 的完整审计链”，或给出第 6 个 issue 的明确依据。 |
| `## Execution Phases` 标题 | 下属结构已改为 Tier 1–3 与 Dormant。 | 改为 `## Execution Tiers` | `## Execution Phases` 标题 | 下属结构已改为 Tier 1–3 与 Dormant。 | 改为 `## Execution Tiers` | `##��“阶段顺序”误读为强制线性执行，并提升依赖数量的可审计性。

## 维护建议

tracker 现在已具备正确的职责边界。为保持其可信度，建议把以下轻量检查纳入每次 triage：

1. 先执行 GitHub open/closed 查询；仅在数量对齐后修改 inventory 与 Closed 区。
2. 对每个变更 issue 的 `Conflict files` 与 Conflict Risk Matrix 做双向检查：Tier 表中出现的共享文件，矩阵必须覆盖；矩阵中的 closed issue 必须移除。
3. 对 `hard` 和 `soft` dependency 使用固定定义：hard 表示不能开工；soft 表示可开工但建议等待或需降级策略。
4. 新 issue 加入 tracker 时，同时归入 Tier/Dormant 队列并写入至少一个下一步动作或明确 trigger。

## References

[1]: https://github.com/0xPabloLI/inside-china-ai/issues "inside-china-ai — current open issue inventory"
[2]: https://github.com/0xPabloLI/inside-china-ai/issues?q=is%3Aissue%20is%3Aclosed%20closed%3A2026-08-21..2026-08-23 "inside-china-ai — issues closed 2026-08-21 to 2026-08-23"
[3]: https://github.com/0xPabloLI/inside-china-ai/issues/77 "#77 — Source type labeling audit"
[4]: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues "GitHub Docs — Adding sub-issues"
[5]: https://github.com/0xPabloLI/inside-china-ai/issues/89 "#89 — Anti-bot scraping (parent work item)"

---

**审阅说明：** 本报告是 triage 修订后的静态复审结果；未修改 GitHub Issue、PR 或 `docs/issue-tracker.md`。报告自身以当前核验结果为准，不保留已解决问题的重复建议或独立“修复记录”附录。
