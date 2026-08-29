# Spec: 素材相关性重构 — per-scene Claim 搜索 + Used-Asset 去重 + VLM 相关性 Gate（附衬线基准化 + RAG fix）

> Source: `docs/handoffs/handoff-qwen4-preview-pipeline-hardening.md` Backlog #1（最高优先）/ #2b / #3
> Grill: 2026-08-29，Round 1 全部按推荐拍板（范围 #1+#2b+#3；`assetNeed` 结构化字段；确定性分词；跨内容重复率 ≤40%；阈值 60 fail-closed；衬线基准化）

## Problem Statement

qwen4-preview 的 HITL 审阅暴露：自动分配的素材与 scene 主张零相关（S3 支付宝收款码、S4 气球游行、S5 欧洲广场——一个讲 Qwen 架构的视频里出现了三条毫不相关的画面），且多素材来自同一图库源、与历史内容素材高度同质。用户指示「修复当前内容是其次，主要修复管线，保证以后不会再发生」。

根因（已在代码逐层确认）：

1. **搜索关键词来自公司实体**：`main.mjs` 触发 asset-sourcer 时只传 `meta.keyEntities.companies[0]`；各搜索 phase 统一对 `keywords[0]` 评分。搜「Alibaba」得到的是支付宝收款码、企业园区，不是 Qwen 架构示意。
2. **分配无相关性约束**：`assignAssetsToScenes()` 按 score 贪心轮转，素材与 scene 之间没有任何语义匹配。
3. **VLM 只查品牌适配**：`vlm_analyzer.py` 的 prompt 只问 fit（cover/contain）、contentKind、边缘文字，从不对照 scene 的 voiceover 主张，不相关的图只要「适合竖版裁切」就通过。
4. **文档已承诺但代码未兑现**：`content-pipeline.md` 与 `video-script-writing-guide.md` 早已规定 scene-data 应标注 `[ASSET NEEDED: description]`，但代码零消费。
5. 附带问题 A：渲染环境缺 Helvetica Neue，Remotion 路径（`remotion/src/` 无任何 font-family 声明）回退到浏览器默认衬线字体；字体效果依赖环境巧合而非显式声明。已发布成片全部是衬线渲染且均通过 HITL。
6. 附带问题 B：`scripts/rag/index.mjs` summary 行引用从未定义的 `currentSourceIds`（重命名残留，`allSourceIds` 被困在 else 块作用域内），publish-article 触发链路上该脚本必然崩溃。

## Solution

1. **Per-scene claim 搜索**：scene-data 新增结构化字段 `assetNeed: "描述"`（文档约定的 `[ASSET NEEDED: ...]` 内嵌标注废弃）。asset-sourcer 对每个带 `assetNeed` 的 scene 用确定性分词从描述生成关键词、按 claim 搜索并下载，候选素材绑定 `claimSceneId`；无 `assetNeed` 的 scene 保持现有公司实体 fallback（向后兼容）。
2. **Used-Asset 索引 + 重复率上限**：新模块扫描 `content/*/assets/` 文件 hash（sha256）与 `content/*/research/media-cache.json` URL（canonicalize），排除当前 slug，构建「已用素材索引」。本次采用素材中与索引重复（URL 相同或 hash 相同）的比例超过 40% 时拒绝接受后续重复候选。
3. **VLM 相关性 Gate（宁缺毋滥）**：VLM prompt 增加可选 scene 主张上下文（voiceover + assetNeed），输出 `## Relevance` 0-100 评分；claim 绑定素材用 VLM 评分，fallback 素材在分配时用「VLM 描述/subjects vs scene voiceover」确定性 token 重叠评分。统一阈值默认 60（`--relevance-threshold` 可调），低于阈值或 VLM 失败一律不进 media-patch，scene 保持无 media（CSS fallback 是合法结果）。
4. **审计字段**：media-patch.json 与 asset-report.json 条目携带 `relevanceScore` / `relevanceSource`（`vlm` | `overlap`）/ `relevanceReason`，per-source 占比统计输出，供 HITL 审阅。
5. **衬线基准化**：Remotion 全局根容器与 Playwright 路径 `base-styles.mjs` 显式声明 `'Times New Roman', Times, serif`（与已发布成片视觉一致），`docs/brand-system.md` 同步；消除字体环境依赖。
6. **RAG fix**：`allSourceIds` 提升到函数作用域，summary 行改用之。

## User Stories

1. As a content creator, I want scene-data to declare per-scene asset needs (`assetNeed`), so that sourced imagery matches what each scene actually claims.
2. As a content creator, I want claim-based searches to use the scene's own description rather than only the company name, so that a benchmark scene gets benchmark visuals instead of logo shots.
3. As a content creator, I want the pipeline to leave a scene without media rather than assign an irrelevant image, so that videos never show visually contradictory B-roll (宁缺毋滥).
4. As a content creator, I want assets reused from previous videos capped at 40% of what gets assigned, so that each video feels fresh.
5. As a content creator, I want relevance scores and reuse ratios surfaced in the reports, so that I can audit asset choices at the HITL checkpoint.
6. As an agent writing scene-data, I want a structured `assetNeed` field, so that my intent is machine-readable without fragile inline parsing.
7. As an agent, I want scene-rules to FAIL when `[ASSET NEEDED` markers leak into voiceover, so that TTS never reads markers aloud.
8. As an agent, I want the company-keyword fallback preserved for scene-data without `assetNeed`, so that existing contents keep working unchanged.
9. As an agent, I want claim keywords generated deterministically, so that sourcing runs are reproducible and testable without an LLM in the loop.
10. As an agent, I want VLM relevance to judge assets against the scene's voiceover claim, so that brand-fit-only approvals can no longer pass irrelevant stock imagery.
11. As an agent, I want VLM analysis failures to reject (not pass) the asset, so that degraded analysis cannot silently assign bad media.
12. As an agent, I want the used-asset index to exclude the current content's own directory, so that re-runs don't flag its own assets as reused.
13. As an operator, I want per-source ratios in the asset report, so that I can see source diversity without a hard cap.
14. As a content creator, I want the serif rendering baseline declared explicitly in both render paths, so that font availability in the render environment can never silently change the video's look.
15. As a maintainer, I want the RAG indexer's summary to print the real active source count, so that indexing runs are auditable.
16. As an agent, I want `--keywords` CLI override to still work alongside claims, so that manual sourcing overrides remain possible.

## Implementation Decisions

### D1: `assetNeed` 字段约定（Scene Data schema 扩展）

- Scene Data 的 scene 对象新增**可选** `assetNeed: string` 字段（一句话英文视觉描述，由 Stage 3 脚本写作时填写）。
- 语义：`assetNeed` 存在且 trim 非空 → 该 scene 走 per-claim 搜索；否则走现有公司实体 fallback。
- `mediaOptOut: true` 优先级高于 `assetNeed`（声明纯 CSS 的 scene 永不参与 sourcing）。
- **废弃内嵌 `[ASSET NEEDED: ...]` 文本标注**；scene-rules 新增 FAIL 级检查：任何 scene 的 `voiceover` 含 `[ASSET NEEDED` → FAIL（防 TTS 读出标注）。检查注册进 `runAllSceneDataChecks`，MRL-2 表新增 B13。
- 文档同步：`video-script-writing-guide.md` 标注格式改为 `assetNeed` 字段；`content-pipeline.md` Stage 3/4 相应更新。

### D2: Claim 提取与分词（新模块 `lib/claim-keywords.mjs`）

- `extractSceneClaims(scenes)` → `[{ sceneId, claim, voiceover }]`（过滤 `mediaOptOut`、NO_MEDIA_TYPES、空 `assetNeed`）。
- `claimToKeywords(claim)` → 确定性分词：lowercase → 去标点 → 停用词过滤（内置小型英文停用词表）→ 保留 2-4 词的关键词短语，最多 3 个。纯函数、零 LLM。
- claim 关键词全被过滤光 → 该 scene 的 claim 搜索跳过，素材由 fallback 池供给（gate 走 overlap 路径）。

### D3: Per-claim 搜索编排（`asset-sourcer.mjs` main 重构）

- asset-sourcer 直接从 scene-data 读取 claims（不再依赖 main.mjs 传入单一公司关键词）。
- 搜索顺序：每个 claim 的关键词 × 各 source（复用 `getOrSearchResults` 缓存），候选打 `claimSceneId` 标签；随后现有公司实体 fallback 搜索照旧运行（`--keywords` CLI 参数保留，覆盖 fallback 池），候选 `claimSceneId: null`。
- 评分：claim 绑定候选对其自身 claim 关键词评分（修复现状各 phase 只对 `keywords[0]` 评分的问题）；fallback 候选维持现状评分。
- URL 去重（`downloadedUrls`）跨 claim 与 fallback 统一生效，先到先得。
- 每个来源的关键词搜索量不变（仍受 search-results-cache 与 max-per-source 约束）。

### D4: Used-Asset 索引（新模块 `lib/used-asset-index.mjs`）

- `buildUsedAssetIndex({ contentRoot, currentSlug })` → `{ hashes: Set<string>, urls: Set<string>, fileCount }`：
  - 扫 `content/<slug>/assets/`（slug ≠ currentSlug）每个文件 sha256（截断存储）；
  - 读 `content/<slug>/research/media-cache.json`（slug ≠ currentSlug）的图片/视频 URL，经 `canonicalizeUrl` 归一化。
- `isReusedAsset({ url, filePath, hash }, index)` → boolean。文件缺失、目录不存在、JSON 损坏 → 对应集合为空（不误判、不中断）；单文件 hash 计算失败 → 跳过该文件。
- fs 操作集中在 build 函数，根目录可注入（测试用临时目录）。

### D5: VLM 相关性评分（`vlm_analyzer.py` + `visual-analyzer.mjs`）

- Python：`analyze_asset_semantics(asset_path, window=None, claim=None)`。`claim`（含 scene voiceover 主张与 assetNeed 期望视觉）非空时 prompt 附加 scene 主张上下文，并要求输出新 section `## Relevance`（0-100 整数）+ `## Relevance Reason`（一句话）；`claim=None` 时走完全旧 prompt（向后兼容现有调用）。
- 解析：`## Relevance` 缺失或非 0-100 整数 → relevance 视为 null（fail-closed 由上层处理）。
- JS：`analyzeAssetSemantics(path, opts)` 透传 `opts.claim`，返回值新增 `relevance` / `relevanceReason` 字段。

### D6: Relevance Gate 与两条评分路径

- **VLM 路径**（claim 绑定候选）：VLM relevance 即评分，`relevanceSource: "vlm"`。
- **Overlap 路径**（fallback 候选，分配时逐 (asset, scene) 计算）：VLM description + subjects 与目标 scene voiceover（+assetNeed）的确定性 token 重叠 → 0-100 归一，`relevanceSource: "overlap"`。
- Gate：阈值默认 60，CLI `--relevance-threshold` 可调；`relevanceScore >= threshold` 通过。VLM 失败/超时/relevance null → 不通过（fail-closed）。未通过 → 不进 patch，asset-report 标注原因。
- 手工指定的 `scene.media` 不受 gate 约束（用户创作意图优先）。

### D7: 分配绑定与重复率上限（`assignAssetsToScenes` 扩展）

- claim 绑定候选只允许进入其 `claimSceneId` 对应 scene（不 spill 到其他 scene）；绑定 scene 不可用（已有手工 media 等）→ unassigned。
- fallback 候选遍历可用 scene 时逐 scene 过 overlap gate，全部不达标 → unassigned（带原因）。
- **重复率在线贪心**：按接受顺序维护计数，接受一个 reused 候选前检查 `(reused+1)/(total+1) ≤ 0.4`，超限 → 跳过该候选（不中断，后续 fresh 候选可继续）。
- hook 双 gate（score≥60 + fit=cover）保持不变，在其之上叠加 relevance gate。

### D8: 审计与报告

- media-patch.json assigned 条目新增 `relevanceScore` / `relevanceSource` / `relevanceReason`；unassigned 条目带 `reason`。
- asset-report.json：条目携带 relevance 字段 + `reused: boolean`；顶层新增 `reuseStats: { reusedCount, freshCount, reusedRatio, perSource: {source: count} }`（per-source 仅统计展示，无强制上限）。

### D9: 衬线基准化（Backlog #2b）

- Remotion 全局根容器与 `base-styles.mjs` 均显式声明 `font-family: 'Times New Roman', Times, serif`。
- 与已发布成片的实际渲染（环境缺字体后的浏览器默认衬线）一致——零视觉变化、消除环境依赖。
- `docs/brand-system.md` 同步「视频渲染衬线基准」；`checkTextWidthBudget` 的衬线系数无需变更（本就按衬线校准）。

### D10: RAG fix（Backlog #3）

- `scripts/rag/index.mjs`：`allSourceIds` 计算提升到 incremental/full 分支之前，summary 行改用 `allSourceIds.length`。行为无其他变化。

### D11: main.mjs Step 1.5 接线

- 触发条件不变（有非 CTA、非 optOut 的 scene 缺 media）；不再把 `companies[0]` 作为唯一关键词传入——asset-sourcer 自行消费 claims + fallback。Step 1.5c 应用逻辑不变（patch 生成侧已 gate）。

## Testing Decisions

**好的测试**：只测外部行为（给定 scene-data/候选输入 → 分配/拒绝/评分输出），不测内部调用序列。网络、VLM 推理、下载一律 mock 或绕过。

**Seams**（尽量复用现有 seam，仅新增 2 个模块级 seam）：

1. **asset-sourcer 纯函数 seam**（现有，`__tests__/asset-sourcer.test.mjs` 模式）：`extractSceneClaims` / `claimToKeywords` / overlap 评分 / `assignAssetsToScenes` 绑定+gate+cap 扩展。
2. **used-asset-index 模块 seam**（新）：`buildUsedAssetIndex`（注入临时目录）/ `isReusedAsset`。
3. **scene-rules 聚合 seam**（现有，`scene-rules.test.mjs` 模式）：voiceover 标注 ban 检查 + 回归 126 例不破坏。
4. **vlm_analyzer parse seam**（现有模式）：含 `## Relevance` 输出的解析、缺失/非法值 → null；不发推理。
5. **remotion-scene-parity / 帧审计回归**（现有）：字体声明后渲染输出不变。
6. **Real Data Smoke Test**（Step 6）：qwen4-preview 真实 scene-data 跑 `extractSceneClaims` + 真实 `content/` 目录跑 `buildUsedAssetIndex`（不下载、不推理）；`node scripts/rag/index.mjs` 增量重建真实跑通（依赖本地 env，若无法运行则显式标注）。

## Out of Scope

- Backlog #4（基准深挖第二集，内容向）与 #5（Remotion 内 DOM 量宽方案）。
- 单一来源站点占比的强制上限（仅统计展示）。
- 手工指定 media 的质量约束（用户创作意图优先）。
- 打包品牌 sans 字体（@remotion/fonts 路线）——留作未来品牌升级项。
- `assets/catalog.yml` 的自动写入（used-asset index 直接扫文件系统，不依赖手工 catalog）。
- per-claim 搜索的 LLM query 提炼。

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `scripts/short-video/lib/asset-sourcer.mjs` | main() 编排重构（claim 搜索 + fallback 保留）、assignAssetsToScenes 绑定/gate/cap、报告字段 | **High** | 核心路径。缓解：纯函数层先 TDD；fallback 行为回归测试锁定；真实数据 smoke（qwen4-preview）。最坏后果：自动分配全空 → CSS fallback，视频仍可渲染（graceful degradation 是现状既有能力） |
| `scripts/short-video/lib/vlm_analyzer.py` | prompt 可选 claim 上下文 + `## Relevance` 输出与解析 | Medium | `claim=None` 走旧 prompt，现有调用方（analyzeAssets 无 claim 场景）不受影响；parse 单测覆盖。最坏后果：解析失败 → relevance null → fail-closed 排除素材（保守方向） |
| `scripts/short-video/lib/visual-analyzer.mjs` | `analyzeAssetSemantics` 透传 claim、返回 relevance 字段 | Medium | 向后兼容（无 claim 时返回值新增字段为 null）；调用方 asset-sourcer 同步更新 |
| `scripts/short-video/main.mjs` | Step 1.5 不再传 `--keywords companies[0]` | Medium | fallback 行为保留在 asset-sourcer 内部；Step 1.5c 不动。最坏后果： sourcing 触发参数错误 → 素材缺失 → CSS fallback |
| `scripts/short-video/lib/scene-rules.mjs` | 新增 `checkAssetNeedAnnotation`（voiceover ban）+ 注册 | Low | 纯追加；现有 126 测试回归 |
| `scripts/short-video/lib/base-styles.mjs` | 字体栈改显式衬线 | Medium | 与已发布成片渲染一致（现状即衬线）；帧审计回归验证 |
| `scripts/short-video/remotion/src/`（全局样式挂载点） | 显式衬线字体栈 | Medium | 显式声明与现状浏览器默认一致；帧审计回归验证 |
| `scripts/rag/index.mjs` | `allSourceIds` 作用域提升 + summary 行修复 | Low | 单行修复，逻辑无变化 |
| `scripts/short-video/lib/claim-keywords.mjs`（新） | claim 提取 + 确定性分词 | Low | 新建纯函数模块 |
| `scripts/short-video/lib/used-asset-index.mjs`（新） | used-asset 索引构建与匹配 | Low | 新建模块，fs 可注入 |
| `docs/content-pipeline.md`、`docs/video-script-writing-guide.md`、`docs/media-asset-management.md`、`docs/brand-system.md`、`CONTEXT.md` | 约定同步（assetNeed、used-index、衬线基准、新词条） | Low | 按 writing-for-agents 门槛执行；改 docs 前加载 skill |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | scene `assetNeed` 为空字符串/纯空白 | 视为无标注，走公司实体 fallback | Low | trim 判断，单测 |
| 2 | scene 无 `assetNeed` 且 meta 无 keyEntities | fallback 池为空 → 不发起搜索，scene 无 media（CSS fallback），不报错 | Low | 单测 |
| 3 | voiceover 含 `[ASSET NEEDED` | scene-rules FAIL（B13） | Low | 单测 |
| 4 | `mediaOptOut: true` + 有 `assetNeed` | optOut 优先，不参与 claim 搜索与分配 | Medium | 单测（防回归） |
| 5 | claim 分词后全部命中停用词 | claim 搜索跳过；素材走 fallback 池 + overlap gate | Low | 单测 |
| 6 | claim 搜索 0 结果 | scene 无 media，CSS fallback，管线不中断 | Low | 单测（graceful 回归） |
| 7 | VLM 输出缺 `## Relevance` 或非法值（claim 绑定候选） | relevance=null → fail-closed 排除，asset-report 标注 | Medium | parse 单测 |
| 8 | VLM 调用失败/超时 | fail-closed 排除该候选 | Medium | analyzeAssets 异常路径单测 |
| 9 | relevance 恰等于阈值 60 | 通过（>= 语义） | Low | 边界单测 |
| 10 | 同一 URL 被两个 claim 同时命中 | 先到先得（downloadedUrls），后者跳过 | Low | 单测 |
| 11 | used-index 扫描遇到当前 slug 自身 assets | 排除，不算 reused | Medium | 单测 |
| 12 | 历史内容无 assets 目录 / media-cache.json 缺失或损坏 | 对应集合为空，不误判、不中断 | Medium | 单测 |
| 13 | 单个文件 hash 计算失败 | 跳过该文件，索引构建继续 | Low | 单测 |
| 14 | claim 绑定候选的绑定 scene 已有手工 media | unassigned（不 spill 到其他 scene） | Medium | 单测 |
| 15 | fallback 候选对所有 scene 的 overlap 均低于阈值 | unassigned + reason，patch 无该条目 | Medium | 单测 |
| 16 | reused 接受将使 (reused+1)/(total+1) > 0.4 | 跳过该 reused 候选，后续 fresh 候选继续接受 | Medium | 贪心公式单测 |
| 17 | 全部候选均为 reused | assigned 为 0（首 reused 即 1/1>0.4 被拒），CSS fallback | Medium | 单测；宁缺毋滥 |
| 18 | hook scene 自动分配 | score≥60 + fit=cover 双 gate 之上叠加 relevance gate | Medium | 回归单测 |
| 19 | NO_MEDIA_TYPES（cta/data/stat-reveal）scene | 永不分配（现状回归） | Low | 回归单测 |
| 20 | scene 已有手工 media | 不覆盖（现状回归） | Low | 回归单测 |
| 21 | `--keywords "foo"` + scenes 带 claims | claim 搜索照跑；"foo" 覆盖 fallback 池 | Low | 单测 |
| 22 | RAG full rebuild 路径 | allSourceIds hoist 后行为不变 | Low | 代码审查 + smoke |
| 23 | RAG incremental 路径 summary | 打印真实 active source 数，不再 NameError | Low | smoke |
| 24 | Remotion 渲染（字体声明后） | DOM 计算字体为 Times 栈，与既有成片视觉一致；帧审计通过 | Medium | parity/帧审计回归 + 真实帧对比 |
| 25 | Playwright 路径渲染（base-styles 字体变更后） | 显式衬线，与成片一致 | Medium | 真实数据 smoke |
| 26 | asset-report 顶层 reuseStats | reusedCount/freshCount/reusedRatio/perSource 正确统计 | Low | 单测 |

### 跨 Step 接口契约

```
scene-data (assetNeed?: string, mediaOptOut?: true)
  → extractSceneClaims(scenes)                      # claim-keywords.mjs
  → per-claim 搜索 (claimSceneId 标注) + fallback 搜索
  → analyzeAssets(assets, { claims, ... })          # VLM: relevance / relevanceReason
  → relevance gate (阈值 60, fail-closed) + reused cap (≤40% 在线贪心)
  → media-patch.json (assigned 条目含 relevanceScore/Source/Reason)
  → main.mjs Step 1.5c 应用（逻辑不变）
  → 渲染（Remotion/Playwright 均显式衬线）
```

Python 契约：`analyze_asset_semantics(asset_path, window=None, claim=None)`；`claim=None` 输出与旧版完全一致。
