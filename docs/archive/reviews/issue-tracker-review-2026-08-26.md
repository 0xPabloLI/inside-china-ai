# Issue Tracker 全量逐项审阅报告

**审阅对象：** `docs/issue-tracker.md` 的最新 GitHub 版本
**审阅时间：** 2026-08-26
**覆盖范围：** 当前 GitHub 中的 **38 个开放 issue**。每项均核对其状态、tracker 位置、Wave/Tier/Dormant 分类、依赖、冲突文件与相关 issue 的边界。[1] [2]

## 执行摘要

tracker 的核心结构已经较成熟：Wave 提供执行摘要，Tier 是完整 inventory，Conflict Risk Matrix 是并行最终裁决，Domain Index 负责跨 Wave 的领域定位。大部分 issue 的状态与位置正确。本轮逐项核验中，**19 项通过，19 项需要 Comment**；其中 **8 项 P1、11 项 P2**。

最重要的风险不是单个 issue 的实现难度，而是 tracker 的三类一致性：第一，#119 是 GitHub open issue，却没有进入 Tier、Wave 或 Matrix，导致 inventory 与实际开放清单相差一项；第二，#91 → #112 → #115 的依赖链在 Wave/Tier 表和共享模块表之间没有完全闭合；第三，部分 source/search issue 的 scope 已扩展，但 Tier 表或 Conflict Matrix 没有同步。

> **本报告中的 Comment 是对 tracker 的修订建议，不表示已修改 tracker 或 GitHub Issue。**

## 全局 Comment

| 优先级 | Comment | 影响范围 | 建议修复 |
|---|---|---|---|
| **P1** | **#119 未被 tracker 纳入。** 顶部 inventory 写 38 open，但 Tier/Dormant 中只有 37 个当前 open issue；#119 仅在摘要中被提及。 | Inventory、Wave、Tier、Matrix。 | 为 #119 定 Wave/Tier、列出实际冲突文件，并将其加入 Domain Index。 |
| **P1** | **#91/#112/#115 依赖链未闭合。** #112 依赖 #91 与 #115，但 #112 的 Tier/Wave 说明未完整表达；#91 又位于后续 W3。 | W2、W3、共享模块表。 | 选择一种明确路径：将 #91 前移到 W2，或把 #112 后移到 #91/#115 完成后；并将 #115 写入 #112 的 hard blocker。 |
| **P1** | **#65 的 GitHub 正文与 tracker 设计决策漂移。** tracker 已将 Currents/GNews/Noozra 从 pool 移出，issue 正文仍将它们作为 pool 成员。 | #65、#109 合并关系、fallback 设计。 | 将最新 Layer 3 fallback 定义同步回 #65 正文和验收项。 |
| **P1** | **#76/#77 的 issue 优先级标签与 tracker Tier 不一致。** 两个 GitHub title 都标 P0，tracker 置于 Tier 3；#77 还是 #75 的推荐前置审计。 | W2/W3、Source/Search。 | 明确以 tracker Tier 还是 GitHub title 为准；若 #75 需要 #77 的结论，应将 #77 前移或把 #75 的关系明确为 soft。 |
| **P1** | **Wave 与 Tier 是双视图。** 当前协议已有“先 Tier/Matrix 后 Wave”的正确顺序，但每次迁移仍须同步三处。 | 全文。 | 对状态变动增加固定检查：Tier/Dormant → Matrix → Wave → Domain Index。 |

## 逐项审阅：需要 Comment 的 Issue

| Issue | 当前位置 | 等级 | Comment | 建议修订 |
|---|---|---:|---|---|
| #29 | Dormant measurable | P2 | tracker 的标题/trigger 只呈现 Part A；Domain Index 的 Video Pipeline 未列 #29。 | 补全 Part B 描述，并在 Video Pipeline 索引加入 #29。 |
| #61 | Dormant triage | P2 | `Non-blocking evidence audit` 未出现在 Audit Domain Index；若后续实现会改内容管线，应在 `docs/content-pipeline.md` 冲突组与 #60 一并确认。 | 补 Domain Index；待 #60/#61 定稿后再决定是否加入 Matrix。 |
| #63 | W1 / Tier 2 | P2 | 最新 issue 已明确：#63 只做 URL dedup，实际改 `search-sources.mjs` 与 `trends-utils.mjs`，并复用既有 `url-normalizer.mjs`；原 SVE 与 `asset-sourcer.mjs` 影响已移至 #114。 | 将 `trends-utils.mjs` 加入 Tier/Matrix；从 `asset-sourcer.mjs` 冲突组移除 #63，并将 SVE 关联完全交给 #114。 |
| #64 | W2 / Tier 2 | P2 | tracker 为 #64 增加 baidu_news 和 Currents/Noozra 分类调整，但 GitHub issue 未同步；这些变化也可能触及 `search-sources.mjs`。 | 将扩展 scope 回写 issue，并复核 `search-sources.mjs` 是否应进入 Matrix。 |
| #65 | W3 / Tier 2 | P1 | pool 成员和 fallback 位置的 tracker 决策比 GitHub issue 更新；两者当前不一致。 | 同步 issue 正文、验收条件与 #109 合并说明。 |
| #75 | W2 / Tier 2 | P2 | 最新 issue 的第一批 Video Download Layer 已完成；遗留工作分为 Cobalt 部署（用户 gate）、adapter 扩展、与 #115 协调的 asset-sourcer 集成、以及 #77 后的 registry 标注。tracker 仍把它呈现为单一 scope，无法表达这些不同 gate。 | 在 #75 Notes 或子任务表拆分四类遗留工作及其 gate；Domain Index 同时补 W2。当前不应把已完成 VDL 与尚未开始的 registry/asset 集成视为同一并行修改。 |
| #76 | W3 / Tier 3 | P1 | GitHub title 标 P0，tracker 标 Tier 3；若 audit 实际改类型/核心 schema，Matrix 可能低估其冲突。 | 确定优先级口径；核验其实际修改文件，再按需要加入 registry/search/asset 冲突组。 |
| #77 | W3 / Tier 3 | P1 | #75 将 #77 视为推荐前置，但 #77 在后续 W3；title P0 与 Tier 3 也不一致；对 `search-sources.mjs` 的审计影响未显式列出。 | 将 #77 前移到 W2，或将 #75 对 #77 改为纯建议；复核并补充 Matrix。 |
| #85 | W4 / Tier 3 | P2 | 若 Bloomberg alternatives 的落地需要添加或调整 source，Tier 表的空 Conflict files 不足。 | 标注是否会修改 `source-registry.mjs`；若会，纳入 Matrix 并建议在 #88 后实施。 |
| #89 | W1 / Tier 2 | P1 | P5 自动修复涉及 `source-registry.mjs`，P6 涉及 `proxy-manager.mjs`，目前 Matrix 未完整表达。 | 补齐实际影响文件或明确 P5/P6 是否已移出本 issue scope。 |
| #90 | W2 / Tier 2 | P2 | Tier 行只列 `source-registry.mjs`，但 Matrix/issue 也涉及 `search-sources.mjs`。 | 在 #90 的 Conflict files 补 `search-sources.mjs`。 |
| #91 | W3 / Tier 3 | P1 | #112 位于 W2 且显式依赖 #91 的 DuckDuckGo/CDP 基础设施，形成执行顺序倒置。 | 将 #91 前移到 W2，或明确 #112 中 DDG 是可选 soft dependency。 |
| #97 | W2 / Tier 2 | P2 | 若 issue 实现 evidence 分组和 `sourceRole`，仅列文档文件低估了 `search-sources.mjs` 与 `source-registry.mjs` 的影响。 | 核验实现边界；如涉及代码，更新 Tier 行和 Matrix。 |
| #101 | W4 / Tier 3 | P2 | Parent–Child 表称 #101 是 #94 child，但紧接着的注释称 #98–#101 不是父子而是线性序列；Tier 行也称 `Child of #94`。 | 选择一种真实关系：移除 parent-child 关联，或改写“不是父子”的通用说明。 |
| #112 | W2 / Tier 2 | P1 | 同时依赖 #91、#103 与共享模块 #115；Tier/Wave 只写前两项，未写 #115 hard dependency，且其文档影响需进一步确认。 | 把 #115 作为 hard blocker 写入 Tier/Wave；调整 #91/#112 的 Wave 顺序。 |
| #114 | W1 / Tier 2 | P2 | 新拆分的 SVE issue 未进入 Domain Index 或 Matrix，导致 #63/#114 的拆分没有完全反映到导航与冲突层。 | 在 Source/Search Index 与 `search-sources.mjs`、`asset-sourcer.mjs` Matrix 行补 #114。 |
| #115 | W1 / Tier 2 | P1 | 共享模块表已经声明 #112 是 hard consumer，但 #112 的依赖没有同步；Tier 行也未列新模块 `lib/download-candidate.mjs`。 | 补 #112 → #115 hard dependency，并增加新模块冲突行或在 Tier 注明。 |
| #116 | W1 / Tier 2 | P2 | W1 将 #116 视为可与 #63 并行，但两者均影响 `search-sources.mjs`，与 Matrix 冲突。Domain Index 也漏记 #116。 | 修正 W1 并行文字，并将 #116 纳入 Source/Search 索引。 |
| #117 | W4 / Tier 3 | P2 | `normalize-currency.mjs` 只被 Tier 行提及，未进入 Matrix 或 Domain Index。 | 添加独立 Matrix 行和相应 Domain Index 归属。 |
| #119 | 缺失 | P1 | GitHub open，tracker 仅在顶部摘要提及；没有 Wave、Tier、Domain 或 Matrix 位置。 | 基于实际 scope 纳入 Tier/Wave；确认其是否触及 `vlm_analyzer.py`、裁切规则或新模块后补 Matrix。 |

## 逐项审阅：通过或仅有导航注记的 Issue

| Issue | 当前位置 | 结论 |
|---|---|---|
| #21 | Dormant measurable | **通过。** 50+ images trigger 合理；可选地在 Video Pipeline Domain Index 加入 #21。 |
| #32 | Dormant user input | **通过。** 与 #99 的后续消费关系已表达。 |
| #35 | Dormant user input | **通过。** 用户录制参考音频的 gate 明确。 |
| #60 | Dormant triage | **通过。** 与 #61 的合并讨论状态清晰。 |
| #66 | W1/W2 / Tier 2 | **通过。** #67 完成后已 unblocked；位置与冲突面一致。 |
| #68 | W3 / Tier 3 | **通过。** 审计性质与 #67 完成后的时序一致。 |
| #87 | W3 / Tier 3 | **通过。** #66/#63 依赖与审计定位一致。 |
| #88 | W0 / Tier 1 | **通过。** #83 已完成，字段 rename 对下游审计的前置关系已表达。 |
| #92 | W3 / Tier 3 | **通过。** #89 的 soft 依赖与已部署的 SearXNG 状态一致。 |
| #94 | W4 / Tier 3 | **通过。** 设计/审计定位和文件冲突表达一致。 |
| #98 | W4 / Tier 3 | **通过。** #69 → #98 → #99 的线性顺序明确。 |
| #99 | W4 / Tier 3 | **通过。** #98 dependency 明确。 |
| #100 | W4 / Tier 3 | **通过。** 与 #98/#99 可并行的说明清晰。 |
| #107 | Dormant milestone | **通过。** “第一版完成”触发条件明确。 |
| #108 | W4 / Tier 3 | **通过。** 低优先级研究定位合理。 |
| #109 | Needs triage / merged into #65 | **通过。** 仍为 GitHub open，但 tracker 已明确其合并关系；#65 完成时应关闭 #109。 |
| #111 | W0 / Tier 1 | **通过。** #15 前置、#21 推荐顺序和 `content-pipeline.md` 冲突面一致。 |
| #113 | W1 / Tier 2 | **通过。** 独立的 `vlm_analyzer.py` 修改，适合与搜索链并行。 |

## 建议的修订顺序

1. **先修 #119、#91/#112/#115、#65。** 这些直接影响 inventory、hard dependency 和后续工作能否安全启动。
2. **再修 source/search 的 scope 与 Matrix。** 重点是 #63/#64/#76/#77/#85/#89/#90/#97/#114/#116。
3. **最后修导航和描述一致性。** 重点是 #29/#61/#75/#101/#117，以及 Domain Index 补项。
4. 每次状态变更继续遵守 tracker 已定义的更新顺序：**Tier/Dormant → Conflict Matrix → Wave → Domain Index**。

## References

[1]: https://github.com/0xPabloLI/inside-china-ai/blob/main/docs/issue-tracker.md "Latest Issue Tracker — GitHub"
[2]: https://github.com/0xPabloLI/inside-china-ai/issues "Current open GitHub issues — inside-china-ai"

---

**审阅说明：** 本报告基于 2026-08-26 读取的 GitHub tracker 版本与 38 个开放 GitHub issue 的逐项核验。本文未修改 tracker、任何 GitHub issue、PR 或本地项目文件。

## 修复状态追踪（2026-08-28 更新）

审阅报告中 19 项 Comment 的修复状态：

### 全局 Comment（5 项 P1）

| # | Comment | 状态 | 修复内容 |
|---|---------|------|---------|
| G1 | #119 未被 tracker 纳入 | ✅ 已修复 | #119 已 CLOSED 并纳入 Closed Issues 表 |
| G2 | #91/#112/#115 依赖链未闭合 | ✅ 已修复 | #91 前移 W2；#115 ✅ closed；tracker 标注 "Only #91 remains" |
| G3 | #65 GitHub 正文与 tracker 漂移 | ✅ 已修复 | #65 GitHub issue body 已同步 pool 设计、fallback chain、Currents/Noozra 移出说明 |
| G4 | #76/#77 P0 title vs Tier 3 | ✅ 已修复 | 2026-08-28 给 #76/#77 加 GitHub comment 说明 tracker Tier 为准；#75→#77 关系明确为 soft |
| G5 | Wave/Tier 双视图同步检查 | ✅ 已修复 | Triage Protocol 第 7 条 "更新顺序铁律" 已定义 Tier→Matrix→Wave→Domain Index |

### 逐项 Comment（8 P1 + 11 P2）

| Issue | 优先级 | Comment | 状态 | 修复内容 |
|---|---|---|---|---|
| #89 | P1 | P5 涉及 proxy-manager.mjs 未在 Matrix | ✅ 已修复 | Tier 行标注 "P5 涉及 proxy-manager.mjs"；Matrix 有独立 proxy-manager.mjs 行 |
| #91 | P1 | 在 W3，应前移 W2 | ✅ 已修复 | 已前移到 W2，Wave 表标注 "T3→W2 提升" |
| #112 | P1 | #115 hard dependency 未写入 | ✅ 已修复 | Tier/Wave 标注 "#115 (hard) ✅ hard blocker 已解除" |
| #115 | P1 | Tier 未列 lib/download-candidate.mjs | ✅ 已修复 | #115 ✅ closed，Closed Issues 表记录 lib/download-candidate.mjs |
| #65 | P1 | pool 成员/fallback 与 GitHub 不一致 | ✅ 已修复 | 同 G3 |
| #76 | P1 | P0 title vs Tier 3 | ✅ 已修复 | 同 G4 |
| #77 | P1 | P0 title vs Tier 3 + #75 前置 | ✅ 已修复 | 同 G4 |
| #119 | P1 | 缺失 Wave/Tier/Matrix | ✅ 已修复 | 同 G1 |
| #29 | P2 | Part B 描述 + Domain Index | ✅ 已修复 | Dormant 表有 Part A + B 描述；Domain Index Video Pipeline 有 #29 |
| #61 | P2 | Audit Domain Index 缺失 | ✅ 已修复 | Domain Index Audit 行有 #61 |
| #63 | P2 | trends-utils.mjs + asset-sourcer.mjs | ✅ 已修复 | #63 ✅ closed；trends-utils.mjs 在 Tier 行；#114 处理 SVE |
| #64 | P2 | search-sources.mjs in Matrix | ✅ 已修复 | Matrix search-sources.mjs 行有 #64 |
| #65 | P2 | GitHub 未同步扩展 scope | ✅ 已修复 | 同 G3 |
| #75 | P2 | 子任务拆分 | ✅ 已修复 | Tier 行已详细描述 scope 扩展、与 #77 分工、~25% done 状态 |
| #85 | P2 | source-registry.mjs in Matrix | ✅ 已修复 | Matrix source-registry.mjs 行有 #85 (may) |
| #90 | P2 | search-sources.mjs in Tier/Matrix | ✅ 已修复 | Tier 行已标注；Matrix search-sources.mjs 行有 #90 |
| #97 | P2 | search-sources.mjs + source-registry.mjs | ✅ 已修复 | Tier 行标注 (may)；Matrix 两行都有 #97 (may) |
| #101 | P2 | parent-child 关系 | ✅ 已修复 | tracker 明确 "不是 #94 的 child"；Parent-Child 表不列 #101 |
| #114 | P2 | Domain Index + Matrix | ✅ 已修复 | #114 ✅ closed；Domain Index 和 Matrix 都有 ~~#114~~ ✅ |
| #116 | P2 | W1 并行 + Domain Index | ✅ 已修复 | #116 ✅ closed；Domain Index 有 ~~#116~~ ✅ |
| #117 | P2 | Matrix + Domain Index | ✅ 已修复 | Matrix 有 normalize-currency.mjs 独立行；Domain Index 有 Infra/Platform |

**总结：19/19 项全部已修复。**
