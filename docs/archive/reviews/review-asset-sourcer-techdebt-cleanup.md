# Code Review: asset-sourcer 技术债清理

> Date: 2026-08-30
> Scope: `scripts/short-video/lib/asset-sourcer.mjs` + 测试（spec: `docs/archive/spec-asset-sourcer-techdebt-cleanup.md`）
> Method: 双轴并行 sub-agent 审查（Standards / Spec），working-tree diff vs HEAD

## Standards 轴

**结论：无硬性违规。** 脚本层（`.mjs`）不适用 TS/React 栈约定；2-space indent、`export function`、JSDoc（helper 均有完整 `@param`/`@returns`）、`console.log` 前缀（✅/⏭️/❌）、`// ───` 区块注释均与文件既有风格一致。测试文件符合 vitest `describe/it` 惯例。

判断项（judgement calls）：
1. **Duplicated Code（已修复）**：`downloadAndRecord` 原有两个连续 `if (dl.success)`（`downloadedUrls.add` + 成功块），已合并为单条件块，行为等价。
2. **Data Clumps（保留，刻意设计）**：`downloadAndRecord` 的 `opts` 反复携带 `downloadedUrls/allAssets/failed/skipped` 四个可变数组——共享 helper 的 mutation-context 设计，非反模式。
3. **范围**：下载循环重构 + relevance 封装 + `keywords[0]` ReferenceError 修复合入同一改动，轻微超出单一关注点；建议 commit 分离（见下）。

## Spec 轴

**结论：实现与 spec 忠实对齐，无缺失、无 scope creep、无实现错误。**

- 矩阵行 1-10 全部保留：Phase 0 preFilter 先于 dedup ✓、Phase 0b 无 preFilter ✓、API wikimedia headers + onDownloaded license 钩子 ✓、API preFilter 在 `if(url)` 守卫前 ✓、CDP text 特判 ✓、Tier 3 preFilter/dedup 记入 engineFailed ✓、三路分支逐字段等价 ✓
- 矩阵行 11-13：claim-bound 走 `makeRelevance`（`||` 语义在工厂内部 `reason || null` 归一化，功能等价）✓、overlap 字段组 ✓、analyzeAssets 映射注释 ✓
- 矩阵行 14：`keywords[0]` → `searchKeyword || primaryKeyword` ✓
- §6 范围外事项（VLM 输出契约、Tier 3 记录目标统一、Backlog #4/#5）均未触碰 ✓
- 唯一偏差：spec 表格原写 helper 单测放 `asset-sourcer.test.mjs`，实际建独立文件 `download-phase-helpers.test.mjs`（vi.mock download-candidate 需要隔离导入），spec 表格已同步修正。

## 验证证据

- 测试：330 passed（基线 264 + 新增 12 helper + 3 makeRelevance + 51 visual-integration）——微调后复跑全绿
- lint / tsc / build 全过
- Real Data Smoke Test：`qwen4-preview/scene-data.mjs` 真实场景 + 真实形状 asset 跑 gated `assignAssetsToScenes`——claim-bound `vlm` 字段组、fail-closed（`relevanceScore: null` / `0` → unassigned）、`reason: ""` → `null` 全部正确

## 归档建议

- spec/tickets/review 按 AGENTS.md Step 8 归档至 `docs/archive/`
- commit 建议拆 2 个原子提交：① helper 抽取 + ReferenceError 修复 + helper 测试；② relevance 封装 + 契约测试 + spec/tickets/review 文档
