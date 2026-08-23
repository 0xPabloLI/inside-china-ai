# Issue Tracker 现状对齐复审报告

**审阅对象：** [`docs/issue-tracker.md`](../issue-tracker.md)
**复审日期：** 2026-08-23
**审阅原则：** 本报告只描述和评估 tracker 当前已经采用的结构，不把备选信息架构写成现状。

## 当前事实：tracker 没有领域 Phase 主分组

当前 tracker 的主执行结构是 `Recommended Execution Order`，使用 **W0–W4** 表示推进批次；`Execution Tiers` 用于优先级和完整 inventory；`Conflict Risk Matrix` 用于并行安全检查。它当前**没有**按“Source Request”“内容管线”或“视频管线”设立把相关 issue 放在一起的领域 Phase。

因此，对“原来围绕 source request 的 issue 是否仍在同一 Phase”这个问题，准确答案是：**没有。它们目前分布在 W0、W1、W2 和 W3，而不是被一个 Source Request Phase 容纳。**

| 当前 Wave | Source request / 搜索相关 issue | 当前职责 |
|---|---|---|
| W0 — 决策与基线 | #67 | capabilities schema 基线。 |
| W1 — 搜索/素材核心链 | #88、#89 P0、#110 | script fallback、rate limiter、媒体搜索层。 |
| W2 — 搜索扩展与路由 | #64、#66、#90、#65、#97 | API source、extract fallback、Bigsong API、search pool、RSS。 |
| W3 — 审计与收尾 | #68、#76、#77、#87、#91、#92 | capabilities/fallback 审计与搜索源扩展。 |

这份分布有其执行逻辑：schema 基线在前、实现扩展居中、审计在后。但是它确实牺牲了领域上下文连续性。阅读或实施 source request 工作时，需要跨四个 wave 往返，并同时在 Tier 与 Conflict Matrix 中确认状态。

## 结构性结论

当前 W0–W4 结构并非错误：它有效表达了跨领域的推进批次和明确的 blocker。问题是它**不同时提供领域聚合**。因此，不能把它描述成“source request 全部仍在同一 Phase”，也不能把尚未写入 tracker 的领域 Phase 方案说成当前结构。

> **当前 tracker 的事实是：以 Wave 排序，而非以领域 Phase 聚合。**

## 当前结构下已确认的问题

| 优先级 | 位置 | 问题 | 影响 |
|---|---|---|---|
| **P0** | W0 并行规则 | W0 现已正确写为 #103 → #111 串行；这与 `content-pipeline.md` 冲突组一致。 | 已�| **P0** | W0 并行规则 | W0 现已正确写为 #103 → #111 串行；这与 `content-pipeline.md` 冲突�/#77/#91/#92 分散在 W0–W3。 | 增加 source 领域工作的上下文切换和路线理解成本。 |
| **P1** | Wave 与 Tier 双视图 | 每个 issue 同时需要在执行摘要和完整 inventory 中维护。 | 新增、关闭或移动 issue 时容易产生漂移，必须有单一更新顺序。 |

## 对当前 tracker 的建议

本报告不要求立即删除 Wave 或重写 tracker。若维持 Wave 作为主执行顺序，最小且不破坏当前结构的改进是新增一个**只读领域索引**，而不是重新分配 issue：

```text
Source request / search work: #67, #88, #89, #110, #64, #66, #90, #65,
#68, #76, #77, #87, #91, #92
See: W0 → W1 → W2 → W3; verify Conflict Risk Matrix before parallel work.
```

这个索引只解决“这些相关 issue 在哪里”的定位问题；W0–W4 仍保留“按什么顺序推进”的功能。若 source request 工作成为长期主要工作流，再评估将该领域提升为正式 Phase 的成本与收益。

为减少双视图漂移，现有 Triage Protocol 应维持下面的更新顺序：

1. 先更新 `Execution Tiers` 或 Dormant 的 issue 状态与归属；
2. 再更新 Conflict Risk Matrix 的文件或资源冲突；
3. 最后更新 Wave 摘要与新 session 的执行提示。

## 未采纳的备选设计

“领域 Phase 为主、Phase 内 Sequence 为辅”是可能降低 source request 领域心智负担的**备选重构**，但当前 tracker 尚未采用。它不应被描述为当前事实，也不应在未明确决定重构前替代 W0–W4。

## References

[1]: ../issue-tracker.md "Current issue tracker — Recommended Execution Order, Execution Tiers and Conflict Risk Matrix"

---

**审阅说明：** 本报告仅更新 review 文档，未修改 `docs/issue-tracker.md`、GitHub Issue 或 PR。
