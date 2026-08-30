# Spec: asset-sourcer 技术债清理（phase 结构重复 + relevance 散装原语）

> Status: building
> Created: 2026-08-30
> Trigger: handoff-qwen4-preview-pipeline-hardening 收尾——review 记录的两项技术债（不阻塞，用户要求清理）
> Scope: `scripts/short-video/lib/asset-sourcer.mjs`（纯重构，不改行为，除一处存量崩溃 bug）

## 1. 背景

asset-sourcer review 记录了两项技术债，本次收尾清理：

1. **四处搜索 phase 结构重复**：`main()` 中 6 个搜索/下载流程（Phase 0 cached、Phase 0b cached-media、API、yt-dlp、CDP、Tier 3）重复「preFilter → URL dedup → download → 三路分支记录」结构，尤其**下载三路分支**（success/skipped/failed）逐字重复 6 次。
2. **relevance 字段散装原语**：`relevanceScore` / `relevanceSource` / `relevanceReason` / `reused` 在 `assignAssetsToScenes` 中两套写法并存（claim-bound entry 手写 4 字段，hook/pass2 用 `gatedEntryFields` 工厂）；`"vlm"` / `"overlap"` 是散落 magic string；VLM 语义字段名 `relevance` 与 asset 字段名 `relevanceScore` 命名不一致。

另发现一处**存量崩溃 bug**（review 未记录，重构顺带修复）：API phase 下载循环引用未定义变量 `keywords[0]`（2265 行）——一旦 API source 有候选通过 preFilter 即 ReferenceError 崩掉整个 `main()`。

## 2. 目标

- 消除 6 处下载三路分支重复，每个 phase 只剩差异化逻辑。
- relevance 字段组集中构造，source 值语义化常量。
- 修复 API phase `keywords[0]` ReferenceError。
- **不改变任何现有可观察行为**（console.log 输出、skipped/failed/allAssets 记录、检查顺序、输出契约扁平字段）。

## 3. 重构设计

### 3.1 下载循环共享 helper（技术债 1）

抽取两个模块级 helper：

**`shouldSkipByPreFilter(candidate, keyword, sourceName, skipped)`** → boolean
将「`preFilterCandidate` → 低于阈值 → `skipped.push({source, reason})`」收拢为一行。返回 true 表示应跳过。

**`shouldSkipByDedup(candidate, downloadedUrls, sourceName, skipped)`** → boolean
将「`downloadedUrls.has(candidate.url)` → `skipped.push({source: sourceName, reason: "URL already downloaded"})`」收拢为一行。返回 true 表示应跳过。

**`downloadAndRecord(candidate, opts)`** → Promise\<void\>
下载三路分支核心（6 处重复的统一体），opts：

| 字段 | 含义 |
|------|------|
| `destPath` | 目标绝对路径 |
| `contentDir` | 传给 downloadCandidate |
| `downloadOpts` | downloadCandidate 附加选项（如 wikimedia headers） |
| `label` | console.log 前缀（✅/⏭️/❌ 用） |
| `sourceName` | skipped/failed 记录的 source |
| `keyword` | failed 记录的 keyword |
| `downloadedUrls` | 全局 Set（success 时 add） |
| `allAssets` / `failed` / `skipped` | 记录数组 |
| `onDownloaded` | 可选异步钩子（API wikimedia license fetch），在 push 前 await |

行为（与原文逐行等价）：
```js
const dl = await downloadCandidate(candidate, { destPath, contentDir, ...downloadOpts });
if (dl.success) downloadedUrls.add(candidate.url);
if (dl.success) {
  const entry = { ...candidate, path: dl.path, status: dl.skipped ? "already exists" : "downloaded" };
  if (onDownloaded) await onDownloaded(entry, candidate);
  allAssets.push(entry);
  console.log(`    ✅ ${label}: ${basename(destPath)} (score: ${candidate.score})`);
} else if (dl.skipped) {
  skipped.push({ source: sourceName, reason: dl.error });
  console.log(`    ⏭️  ${label}: ${dl.error}`);
} else {
  failed.push({ source: sourceName, keyword, error: dl.error });
  console.log(`    ❌ ${label}: ${dl.error}`);
}
```

各 phase 改造为保留差异、共用 helper：

| Phase | 保留的差异逻辑 | 共用部分 |
|-------|--------------|---------|
| Phase 0 (cached) | `!url` → preFilter(**在 dedup 前**) → dedup | downloadAndRecord（label="cached"） |
| Phase 0b (cached-media) | `!url` → dedup（**无 preFilter**） | downloadAndRecord（label="cached-media"） |
| API | preFilter → `!url` 守卫 → dedup | downloadAndRecord（label=candidate.source；wikimedia headers + license 钩子） |
| yt-dlp | preFilter → dedup | downloadAndRecord（label=source.name） |
| CDP | `!url` → **text 特判** → preFilter → dedup | downloadAndRecord（label=source.name） |
| Tier 3 | `!url` → preFilter → dedup（**失败记录进 engineFailed**，非 skipped） | 同构循环，记录数组传 engineAssets/engineFailed |

**Tier 3 注意**：Tier 3 的 preFilter/dedup 失败进 `engineFailed`（merge 后进 `failed`），与其他 phase 进 `skipped` 不同——为保持行为，Tier 3 用局部数组传入 helper（`failed`/`skipped` 参数分别接 `engineFailed`/`engineFailed`），不强行统一记录目标。

**API phase 修复**：`buildFilename(candidate.source, keywords[0], ...)` 的 `keywords[0]` → `candidate.searchKeyword || primaryKeyword`（与 `scoreCandidate` 评分用词一致；原代码必崩，无历史行为可破坏）。

### 3.2 relevance 字段集中封装（技术债 2）

模块级常量 + 工厂：

```js
const RELEVANCE_SOURCE = { VLM: "vlm", OVERLAP: "overlap" };

/** 构造 patch entry 的 relevance 字段组（保持扁平字段输出契约）。 */
function makeRelevance({ score, source, reason, reused }) {
  return {
    relevanceScore: score,
    relevanceSource: source,
    relevanceReason: reason,
    reused,
  };
}
```

改造点（行为逐字段等价）：
- `assignAssetsToScenes` 内 `gatedEntryFields` → 调用 `makeRelevance({ score: overlap, source: RELEVANCE_SOURCE.OVERLAP, reason: "token overlap vs scene ${id} claim", reused })`
- claim-bound entry（747-750 手写 4 字段）→ `makeRelevance({ score: asset.relevanceScore, source: RELEVANCE_SOURCE.VLM, reason: asset.relevanceReason || null, reused })`（**保持 `||` 语义**，勿改 `??`）
- `analyzeAssets` 中 `asset.relevanceScore = semantics.relevance ?? null` 加注释说明 `relevance`(VLM 契约) → `relevanceScore`(asset 契约) 的映射，不更改 VLM 输出契约（改动影响面到 `visual-analyzer.mjs` / `vlm_analyzer.py` / `test_claim_prompt.py`，超出本次范围）

## 4. Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `scripts/short-video/lib/asset-sourcer.mjs` | main() 6 个 phase 下载循环改用共享 helper；assignAssetsToScenes relevance 字段集中封装；API phase `keywords[0]` → `searchKeyword \|\| primaryKeyword` | Medium | 纯重构，行为逐行等价（差异点见矩阵）；唯一行为变化是 API phase 从必然 ReferenceError 变为可正常下载（崩溃路径修复，无历史可观察行为被改变）。验证：asset-sourcer 相关测试套件 264+ tests 全绿 + 新增 helper 单测 |
| `scripts/short-video/__tests__/download-phase-helpers.test.mjs` | 新增：downloadAndRecord 三路分支、shouldSkipByPreFilter/Dedup 记录（vi.mock download-candidate，独立文件避免污染现有 221 tests 的导入行为） | Low | 纯追加测试 |
| `scripts/short-video/__tests__/asset-relevance-gate.test.mjs` | 新增 makeRelevance / RELEVANCE_SOURCE 契约断言 | Low | 纯追加测试 |
| `docs/handoffs/handoff-qwen4-preview-pipeline-hardening.md` | Backlog #1 标记已清理、状态更新 | Low | 文档状态同步 |
| `docs/DOCS-INDEX.md` | handoffs 表补 qwen4-preview / infinitetalk 两行 | Low | 文档索引同步 |

下游消费者核查：`relevanceScore/relevanceSource/relevanceReason` 仅存在于 `asset-sourcer.mjs` / `visual-analyzer.mjs`(产出 `relevance`) / `vlm_analyzer.py` / 测试文件；patch entry 扁平字段契约不变，`apply-media-patch.mjs` 等消费者无感知。`main()` 无单元测试、无模块级消费者（CLI 直调），下载循环重构影响面 = 6 个 phase 本身。

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Phase 0 低分候选（preScore < 20） | skipped 记 `{source:"cached", reason:"pre-download filter (score: X)"}`，preFilter **先于** URL dedup | Medium | helper 按调用顺序组合，Phase 0 先调 shouldSkipByPreFilter 再 shouldSkipByDedup |
| 2 | Phase 0 已下载 URL | skipped 记 `{source:"cached", reason:"URL already downloaded"}` | Medium | shouldSkipByDedup source 参数传 "cached" |
| 3 | Phase 0b 候选（无 preFilter） | 低分候选**不**被 preFilter 拦截，直接走 dedup→download | High（顺序差异） | Phase 0b 不调用 shouldSkipByPreFilter，仅 dedup + downloadAndRecord |
| 4 | API 成功下载（wikimedia） | User-Agent header 注入；下载后 await license fetch；entry 带 licenseInfo/author；skipped/failed 用 candidate.source | Medium | downloadOpts.headers + onDownloaded 钩子 |
| 5 | API 候选 URL 为空 | `if (candidate.url)` 守卫行为保留（preFilter 在守卫前） | Low | 保留原 `if (candidate.url)` 包裹 dedup+download |
| 6 | CDP text 候选 | 直接 push `{...candidate, path:null, status:"text-only"}`，不进下载 | Medium | text 特判保留在 CDP phase 内、调用 helper 之前 |
| 7 | Tier 3 preFilter/dedup/dl.skipped 失败 | 记录进 engineFailed（merge 后进 failed），**不进**全局 skipped | High | Tier 3 将 engineFailed 同时作为 failed/skipped 参数传入 helper |
| 8 | 下载失败（dl.success=false, skipped=false） | failed 记 `{source, keyword, error}`；console.log `❌` | Medium | downloadAndRecord 三路分支逐字段等价 |
| 9 | 下载已存在（dl.skipped=true） | skipped 记 `{source, reason: dl.error}`；console.log `⏭️` | Medium | 同上 |
| 10 | 下载成功但文件已存在 | entry.status = "already exists"；downloadedUrls.add 照常 | Low | 同上 |
| 11 | claim-bound asset relevance 字段 | `{relevanceScore: asset.relevanceScore, relevanceSource:"vlm", relevanceReason: asset.relevanceReason \|\| null, reused}` 精确保持 | High | makeRelevance 用 `\|\|`；relevance-gate 测试套件覆盖 |
| 12 | hook/pass2 overlap 字段 | `{relevanceScore: overlap, relevanceSource:"overlap", relevanceReason:"token overlap vs scene X claim", reused}` 精确保持 | High | gatedEntryFields 改调 makeRelevance，值不变 |
| 13 | `asset.relevanceScore = semantics.relevance ?? null`（VLM 返回 null/缺失） | fail-closed 语义不变（null → 拒绝） | Medium | 仅加注释不改逻辑 |
| 14 | API phase `keywords[0]` ReferenceError | 修复后不崩溃，文件名用 `searchKeyword \|\| primaryKeyword` | Low | 崩溃路径修复，无历史行为 |
| 15 | main() 全流程 smoke（真实内容目录或 fixture） | 各 phase 记录数组、console.log、report/patch 输出与重构前一致 | Medium | 抽取前后 diff 审查 + 全量测试 |

## 5. 测试策略

- **基线**：重构前 asset-sourcer 相关测试全绿（已验证：asset-sourcer 221 + asset-relevance-gate 16 + download-candidate 13 + search-results-cache 14 = 264 passed）。
- **新增**：helper 单测（矩阵 1-10 行：三路分支、顺序、source/keyword 记录、text 不适用）；makeRelevance 契约（矩阵 11-12 行）。
- **验证**：`npx vitest run` 相关文件全绿 + `npm run lint` + `npm run build` + `npx tsc --noEmit`。

## 6. 明确不做（范围外）

- 不改 VLM 输出契约（`visual-analyzer.mjs` / `vlm_analyzer.py` 的 `relevance` 字段）。
- 不统一 Tier 3 与其它 phase 的记录目标（行为差异，保持）。
- 不动 Backlog #4（基准第二集）、#5（DOM 量宽）——按 Grill 拍板跳过。
- 不触碰发布流程（BGM 拍板、widget publish、TikTok 发布等 HITL 待办）。
