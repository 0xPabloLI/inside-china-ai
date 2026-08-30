# Tickets: asset-sourcer 技术债清理

> Source: `spec-asset-sourcer-techdebt-cleanup.md`（同目录归档）
> 策略：tracer-bullet，纯重构不改行为；每 ticket 完成后跑相关测试确认无回归。

## Ticket 1 — 下载循环共享 helper + API phase 崩溃 bug 修复

**依赖**：无

**内容**：
- [x] 新增模块级 helper：`shouldSkipByPreFilter(candidate, keyword, sourceName, skipped)`、`shouldSkipByDedup(candidate, downloadedUrls, sourceName, skipped)`、`downloadAndRecord(candidate, opts)`
- [x] 单测：矩阵行 1-10（三路分支、preFilter 顺序、dedup、source/keyword 记录、status 语义、onDownloaded 钩子）
- [x] 改造 6 个 phase（Phase 0 / 0b / API / yt-dlp / CDP / Tier 3）使用 helper，保留各 phase 差异（preFilter 有无、顺序、text 特判、Tier 3 engineFailed）
- [x] API phase `keywords[0]` → `candidate.searchKeyword || primaryKeyword`（修复 ReferenceError）
- [x] 行为等价检查：抽取前后 diff 逐字段核对（console.log label、skipped/failed 结构、检查顺序）
- [x] 相关测试套件全绿（asset-sourcer / asset-relevance-gate / download-candidate / search-results-cache）

## Ticket 2 — relevance 字段集中封装

**依赖**：无（与 Ticket 1 无共享代码，可并行实施）

**内容**：
- [x] 新增 `RELEVANCE_SOURCE = { VLM: "vlm", OVERLAP: "overlap" }` 常量 + `makeRelevance({score, source, reason, reused})` 工厂
- [x] `gatedEntryFields` 改调 `makeRelevance`（值不变：OVERLAP + token overlap reason）
- [x] claim-bound entry 手写 4 字段改调 `makeRelevance`（值不变：VLM + `||` 语义在工厂内部归一化，**保持 `||`**）
- [x] `analyzeAssets` 的 `relevance`→`relevanceScore` 映射加契约注释（不改 VLM 输出契约）
- [x] 单测：矩阵行 11-13（claim-bound / overlap 字段组精确值、`||` vs `??` 语义）
- [x] asset-relevance-gate 套件全绿

## 完成标准（两 ticket 合计）

- [x] `npx vitest run` 相关测试全绿（基线 264 + 新增全过 → 330 passed）
- [x] `npm run lint` / `npm run build` / `npx tsc --noEmit` 全过
- [x] code-review 双轴通过（见 `docs/archive/reviews/review-asset-sourcer-techdebt-cleanup.md`）
- [ ] 文档消化（handoff 状态更新、DOCS-INDEX、spec/tickets/review 归档）
