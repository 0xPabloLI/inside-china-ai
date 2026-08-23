# Issue Tracker 现状对齐复审报告

**审阅对象：** [`docs/issue-tracker.md`](../issue-tracker.md)
**复审日期：** 2026-08-23
**审阅原则：** 本报告只描述并评估 tracker **当前实际采用**的结构；不把尚未采纳的替代设计写成现状或既定改动。

## 当前结构：事实基线

当前 tracker 的主执行导航是 **`Recommended Execution Order`**。它以 **W0–W4** 与 `Dormant / Human gate` 表示执行顺序，并规定新 session 从“最早未完成、无 hard blocker 的 wave”开始选取工作。

`Execution Tiers` 仍然存在，但其职责是表达内容生产价值和近期优先级；`Blocked by` 表达 issue 依赖；`Conflict Risk Matrix` 表达同文件或共享资源的并行限制；Dormant 子队列表达 trigger 或人工决策门槛。换言之，当前 tracker 不是 Phase 主导航，而是 **Wave 为主执行顺序、Tier 为优先级视图、Matrix 为并行安全检查** 的三层结构。[1]

| 当前组件 | 当前职责 | 当前是否是主导航 |
|---|---|---|
| `Recommended Execution Order` | W0–W4 的推荐推进顺序、每个 wave 的并行规则与 blocker。 | **是**。 |
| `Execution Tiers` | 按内容生产价值归类 Tier 1/2/3。 | 否；是优先级与完整 inventory 视图。 |
| `Conflict Risk Matrix` | 同文件与共享资源的串行约束。 | 否；是所有并行前的安全检查。 |
| `Dormant / Human gate` | 不进入实现排期的 trigger 与人工决策事项。 | 否；是等待队列。 |

## 结论

当前结构本身是可理解的：它把“先推进哪一批能力”（Wave）、“同批候选中什么更有价值”（Tier）和“能否同时改”（Conflict Matrix）分开。对于需要一个显式全局执行顺序的场景，W0–W4 有实际作用，不是冗余标题。

此前 review 中提出的“以领域 Phase 取代 Wave”只是一个**未采纳的备选设计**，与当前 tracker 内容不一致，不应继续作为本报告的主结论。该建议已从本报告中移除。

当前唯一需要立即修正的内容是 **W0 的并行声明与 Conflict Matrix 不一致**：W0 写 `#103/#111 可与 #67 并行`，但 #103 与 #111 都列在 `docs/content-pipeline.md` 冲突组中。因此，#103 与 #111 不能互相并行；它们可以分别与 #67 并行，前提是 #67 未触及该文档。[1]

> **应修正为：** `#67 可与 #103 或 #111 并行；#103 → #111 必须串行。`

## 结构性审阅

| 审阅项 | 当前 tracker 的表现 | 结论与建议 |
|---|---|---|
| 执行顺序 | W0–W4 给出全局推进次序，并在每行标注 block/parallel 条件。 | **通过。** 它满足“下一步从哪里开始”的直接需求。 |
| 优先级 | Tier 1–3 与 Wave 并存。 | **通过，但需明确源头。** Tier 表应作为完整 issue inventory 的权威位置；Wave 是执行摘要，不应独立承担完整状态维护。 |
| 并行安全 | 另设 Conflict Matrix。 | **通过，但 W0 有一处 P0 误写。** 每个 Wave 的并行文字必须以 Matrix 为准。 |
| Dormant 控制 | measurable、milestone、user input、triage 被拆分。 | **通过。** 这避免未满足条件的任务干扰 W0–W4。 |
| 跨领域关系 | Wave 将搜索、素材、内容管线、视频能力按执行阶段联结。 | **通过。** 这正是当前选择 Wave 主导航的价值；不是强制每个领域内部工作全部完成后才能切换。 |

## 当前结构下的执行规则

为了避免读者同时维护两套顺序，建议在现有模型中坚持以下规则，而不是引入另一套 Phase 主导航：

1. **先用 Wave 选择执行窗口。** 从最早未完成的 W0–W4 中选取无 hard blocker 的事项。
2. **再用 Tier 决定同一窗口内的优先级。** 若同一 wave 有多个可开始 issue，优先处理 Tier 1，再考虑 Tier 2/3 的收益与风险。
3. **最后用 Conflict Matrix 决定并行。** Wave 的描述只能提供初筛；Matrix 是并行的最终裁决来源。
4. **Dormant 不进入 Wave。** 只有 trigger、用户输入或 triage 决策满足后，才将它迁入合适的 Wave 与 Tier。
5. **Wave 是摘要，Tier 是 inventory。** 添加、关闭或调整 issue 时先更新 Tier/Dormant 和 Matrix，再更新 Wave 摘要，避免双处信息漂移。

## 最小修订清单

| 优先级 | 修改位置 | 修订内容 |
|---|---|---|
| **P0** | W0 的并行规则 | 把 `#103/#111 可与 #67 并行` 改为 `#67 可与 #103 或 #111 并行；#103 → #111 串行`。 |
| **P1** | `Execution Semantics` 或 Triage Protocol | 明确写出：Wave 是执行摘要，Tier/Dormant 是 inventory，Conflict Matrix 是并行最终裁决。 |
| **P1** | 新 issue / 关闭 issue 流程 | 规定先更新 Tier/Dormant 与 Matrix，再同步更新 Wave，减少双视图漂移。 |

## 未采纳的备选设计

“领域 Phase 为主、领域内 sequence 为辅”仍可作为未来重构选项，但**不是当前 tracker 的结构，也不是本报告要求立即实施的变更**。只有当 W0–W4 频繁造成跨领域上下文切换，或 Wave 与 Tier 的双维护成本持续高于其调度价值时，才应�“领域 Phase 为主、领域内 sequence 为辅”仍可作为未来重构选项，但**不是当前 tracker 的结构，也不是本报告要求立即实施的变��“领域 Phase�于当前本地 tracker 内容撰写；未修改 GitHub Issue、PR 或 `docs/issue-tracker.md`。
