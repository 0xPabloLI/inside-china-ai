# Issue Tracker 审阅报告

**审阅对象：** `docs/issue-tracker.md`  
**本次复核：** 2026-08-23（triage 更新后）  
**审阅范围：** 当前本地 tracker、GitHub Issue 状态、关键 issue 的改动范围，以及 GitHub Issues 的层级能力。

## 结论

最新 triage 已显著改善 tracker 的可用性：#83 与 #78 已正确从开放阶段移入 Closed 区，#88 成为唯一 Phase 0 项；#107 已被纳入暂搁置队列；新建的 #108 也已被加入独立增强阶段；#51 的部分完成状态更具体；`docs/DOCS-INDEX.md` 的 #78 冲突已被移除。这些都是正确且值得保留的修订。

不过，tracker 仍不应被当作严格的全量事实源或可直接执行的并行计划。本次 GitHub 快照显示 **32 个开放 issue**，而 tracker 仍写 **29 个**。Phase 表已覆盖这 32 个开放 issue，却仍保留两个已关闭 issue（#81、#22），因此一共列出 34 项。Closed 区的日期范围与计数也尚未同 GitHub 对齐；Conflict Risk Matrix 与真实改动面仍有关键错配。[1] [2] [3]

> **推荐定位：** GitHub Issue 管理范围、状态、验收与完整关闭历史；`issue-tracker.md` 只管理 triage 得出的推荐顺序、hard/soft dependency、冲突组和下一步动作。每次 triage 以 GitHub 清单重新对账后再更新 tracker。

## 本轮更新：已解决或明显改善的项目

| 事项 | 当前状态 | 评价 |
|---|---|---|
| #83 `stock_api → stock_media` | 已关闭并移入 Closed 区；Phase 0 改为 #83 done → #88。 | 正确。 |
| #78 `DOCS-INDEX sync` | 已关闭并移入 Closed 区；从 Phase 0 和 Docs Index 冲突组移除。 | 正确。 |
| #107 Algorithm & Model Review | 已加入 Phase 6，并保留“项目第一版完成后才开始”的触发条件。 | 正确。 |
| #108 免费云端推理 endpoint 调研 | 已加入 Phase 5；其交付物是调研结论与 `docs/tools-catalog.md` 更新。 | 放置合理；它是可独立推进的 research issue，而非 #107 的硬 blocker。[4] |
| #51 Cascade-filter audit | 已注明 Violation 2 的完成提交与剩余 Violation 1。 | 比笼统的完成百分比更可执行。 |

## P0：inventory 仍然错误，且 phase 条目保留关闭 issue

tracker 顶部写“29 open issues”，但当前 GitHub 查询为 **32 open issues**。Phase 表合计 34 项：其中 #81 与 #22 均已关闭，剩余 32 项正好对应当前开放 backlog。这说明新增 #107/#108 已成功纳入；现存问题是 inventory 数字和两个过期条目，而不是遗漏开放 issue。[1] [2] [3]

| 位置 | 建议修订 |
|---|---|
| 顶部 inventory | **替换为：** `Last reconciled: 2026-08-23 — 32 open issues (after #78/#83 closed; #107/#108 added).` |
| Phase 3 | **删除/迁移：** #81。它已于 2026-08-21 关闭；如保留，移入 Closed 区。 |
| Phase 6 | **删除/迁移：** #22。它已于 2026-08-22 关闭；如保留，移入 Closed 区。 |

完成这三处后，phase 表总数和 GitHub 当前开放数会一致。

## P0：Closed 区的标题、计数与范围仍不一致

当前 Closed 区标题仍为 `2026-08-21~22 Triage`、计数为 22；但 #78 与 #83 是在 2026-08-23 关闭的，已被列在该区。GitHub 在 2026-08-21 至 2026-08-23 期间共关闭 **26** 个 issue；当前表遗漏 #22、#62、#70 和 #81。[2] [3] [5]

建议在两种明确口径中选择一种：

| 方案 | 修订方式 | 优点 |
|---|---|---|
| **完整历史** | 标题改为 `Closed Issues (2026-08-21~23)`；补 #22/#62/#70/#81；计数改为 26。 | 文档独立提供该时间段的完整关闭记录。 |
| **精选 triage 历史（推荐）** | 标题改为 `Recent triage closures (selection)`；删除“22 issues closed”的全量语义；完整历史交给 GitHub。 | 避免维护第二份容易漂移的关闭清单。 |

无论采用哪一种，#81/#22 都不应继续出现在开放 phase 中。

## P0：Conflict Risk Matrix 仍不足以安全指导并行

#83 与 #78 的清理已经降低了矩阵的噪声，但下面四处错配仍然存在。鉴于 tracker 明确允许同一 phase 并行，这些需要在允许并行实施前修正。

| 当前矩阵状态 | 实际 scope | 建议 |
|---|---|---|
| `source-registry.mjs` 未列 #90，仍列 #81 | #90 将 `x_search` 与 `xhs` 从 MCP fallback 改为 direct API fallback；#81 已关闭。 | 加入 **#90**；移除 **#81**。 |
| `asset-sourcer.mjs` 列 #66、未列 #88 | #66 的 approved design 改 `search-sources.mjs` 与 `cdp-client.mjs`；#88 明确改 `asset-sourcer.mjs` 的字段消费者。 | 移除 **#66**；加入 **#88**。 |
| `search-sources.mjs` 未列 #88、仍列 #81 | #88 更改 article-script 与 site-search-script 的 consumer；#81 已关闭。 | 加入 **#88**；移除 **#81**。 |
| 无 `cdp-client.mjs` 行 | #66 增加 `/extract` fallback；#89 P1 修改 retry/backoff。 | 新增：`cdp-client.mjs — #66, #89`，标为高风险。 |

更稳健的后续结构是按 **Conflict Groups** 而不是单一文件名维护，例如 `registry-schema`、`search-collector`、`cdp-transport`、`asset-download`、`docs-index`。它能覆盖新增文件、共享测试和接口迁移等情况。

## P1：Parent–Child 小节仍使用过时的 GitHub 平台描述

tracker 仍写“GitHub 不支持原生父子 issue”。GitHub 已支持 sub-issues、嵌套层级与父任务进度，也支持通过 `gh issue create --parent` 和 `gh issue edit --add-sub-issue` 建立关系。[6] [7]

仓库的 #89 当前尚未建立原生 sub-issues，因此建议将该表述替换为：

> “GitHub 支持原生 sub-issues；本仓库当前尚未建立这些关系。以下 `Parent →` 为临时 triage 视图。”

随后可选择把 #91/#92 设为 #89 的原生 sub-issues，或继续维护文档式关系；两者都可行，但平台能力说明应准确。

## P1：#92 与 #89 P0 的 dependency 语义仍需定稿

#92 的部署前置已完成。它的主正文仍将 #89 P0 视为 blocker，但最新 Agent Brief 又把 rate limiting 写成 out of scope。这个差异会影响 #92 是否能立即实施。[8]

| 决策 | tracker 表达 | 应同步的位置 |
|---|---|---|
| 需要保护 Google/Bing/DDG 等 backend engines | 保持 `Hard blocker: #89 P0`，并明确该限流不针对本地 SearXNG 前端。 | #92 Dependencies、Agent Brief、Parent–Child 表、Phase 3。 |
| 本地 source 可先接入、限流后补 | 改为 `Soft dependency: #89 P0` 或移除 blocker。 | 同上。 |

目标是使 issue 正文、Agent Brief 和 tracker 共享同一套 hard/soft dependency 语义。

## P2：Phase 6 已改善，但仍应按暂停原因拆分

#107 已被正确加入 Phase 6；但 #22 已关闭且其他事项的暂停原因各不相同。建议将现有表拆分为以下队列，以便新 session 可直接判断下一步动作：

| 建议队列 | 事项 |
|---|---|
| `Dormant — measurable trigger` | #21、#29。 |
| `Dormant — project milestone` | #107。 |
| `Waiting for user input / information` | #35、#32。 |
| `Needs triage / design decision` | #60、#61。 |
| `Closed` | #22。 |

## 建议的最小修订顺序

1. 将 inventory 修正为 **32 open**，并从 phase 表迁移 #81/#22。
2. 选择 Closed 区的全量或精选口径，修正标题日期与计数。
3. 修正 Conflict Risk Matrix 的 #88/#90/#66/#81 归属，并新增 `cdp-client.mjs`。
4. 修正 GitHub sub-issues 的能力描述，并明确 #89/#91/#92 是否采用原生层级。
5. 对 #92 与 #89 P0 统一 hard/soft dependency 语义。
6. 将 Phase 6 按暂停原因拆分。

## References

[1]: https://github.com/0xPabloLI/inside-china-ai/issues "Current open issue inventory — inside-china-ai"
[2]: https://github.com/0xPabloLI/inside-china-ai/issues/81 "#81 — Homepage-only sources (closed)"
[3]: https://github.com/0xPabloLI/inside-china-ai/issues/22 "#22 — RAG pre-work (closed)"
[4]: https://github.com/0xPabloLI/inside-china-ai/issues/108 "#108 — Free cloud inference endpoints research"
[5]: https://github.com/0xPabloLI/inside-china-ai/issues/83 "#83 — stock_api to stock_media rename"
[6]: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues "GitHub Docs — Adding sub-issues"
[7]: https://github.blog/changelog/2025-01-12-evolving-github-issues-public-preview/ "GitHub Changelog — Evolving GitHub Issues"
[8]: https://github.com/0xPabloLI/inside-china-ai/issues/92 "#92 — SearXNG self-hosted source"
[9]: https://github.com/0xPabloLI/inside-china-ai/issues/90 "#90 — MCP to direct API migration"
[10]: https://github.com/0xPabloLI/inside-china-ai/issues/88 "#88 — CDP script field rename"

---

**审阅说明：** 本报告基于 2026-08-23 triage 更新后的静态快照。本文仅更新审阅记录，不修改 GitHub Issue、PR 或 `docs/issue-tracker.md` 本身。

---

## 修复记录（2026-08-23）

基于本报告的建议，已对 `docs/issue-tracker.md` 执行以下修复：

### P0 修复

| 问题 | 修复 |
|------|------|
| inventory 数字错误（29 vs 32） | 修正为 32 open issues |
| #81 仍在 Phase 3 和 Conflict Matrix | 移除，移入 Closed Issues |
| #22 仍在 Phase 6 | 移除，移入 Closed Issues |
| Closed 区标题/计数不一致 | 标题改为 2026-08-21~23，计数改为 26，补充 #22/#62/#70/#81 |
| Conflict Matrix 四处错配 | source-registry 加 #90 移 #81；asset-sourcer 加 #88 移 #66；search-sources 加 #88 移 #81；新增 cdp-client.mjs 行 |

### P1 修复

| 问题 | 修复 |
|------|------|
| Parent-Child 描述过时 | 改为 GitHub 已支持原生 sub-issues（2025-01 公测） |
| #92 dependency 语义不清 | 从 hard blocker 改为 soft dep #89 P0 |
| #89->#91/#92 sequence | 拆分为 hard/soft |

### P2 修复

| 问题 | 修复 |
|------|------|
| Phase 6 未按暂停原因分组 | 拆分为 4 个子队列：Dormant-measurable / Dormant-milestone / Waiting-user-input / Needs-triage |
