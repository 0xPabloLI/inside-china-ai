# Spec: Multi-Video Splitting — 多视频拆分管线集成

## Summary

将 Deep Research 调研结论（`docs/research/multi-video-splitting-best-practices.md`）集成到内容管线。实现自动分集评估器、scene-data 多集支持、系列发布、合集制作（方案 A 拼接 + 方案 B 重构）。共 6 个 ISSUE（20-25），分为三类交付物：

1. **代码脚本**（ISSUE-20, 21, 23, 24）— 需 TDD 实现
2. **Agent 工作流文档**（ISSUE-25）— 管线文档更新
3. **现有代码扩展**（ISSUE-22）— `main.mjs` + `publish-utils.mjs` + `publish-tiktok.mjs` 扩展

## Background

调研报告 `docs/research/multi-video-splitting-best-practices.md` 确认：2026 年 TikTok 算法奖励系列化内容，拆分多视频是更优策略。管线需支持自动判断分集、多集 scene-data、系列发布和合集制作。

### 架构约束（Grill 确认）

- **代码 vs Agent 边界**：纯计算/IO/字符串操作 → 代码；需要创意/叙事/判断 → Agent。代码提供能力，Agent 调用能力。
- **分集评估器是代码**：`episode-evaluator.mjs` 接受文章 markdown 文本，内部做字数/章节/数据点提取，输出推荐集数 + 理由。语义层面判断（人物/公司、因果链）留给 Agent。
- **scene-data 多文件命名**：`scene-data-pt1.mjs`、`scene-data-pt2.mjs` 等，`main.mjs` 通过 `--scene` 参数指定。
- **合集方案 A + B 都实现**：方案 A（FFmpeg 拼接）用于快速出合集；方案 B（重构叙事）用于高质量合集。
- **向后兼容**：所有新参数可选，不传时行为与当前完全一致。

## Requirements

### ISSUE-20: 分集评估器（代码 — 核心）

**交付物**:
- `scripts/short-video/lib/episode-evaluator.mjs` — 评估器纯函数
- `scripts/short-video/lib/__tests__/episode-evaluator.test.mjs` — 单元测试

**API**:
```javascript
/**
 * @param {string} markdownText - 文章 markdown 全文
 * @returns {Object} {
 *   wordCount: number,           // 去除 markdown 标记后的英文词数
 *   estimatedDuration: number,   // 秒，wordCount / 2.5
 *   recommendedParts: number,    // 1-5
 *   splitMethod: string,         // "none" | "thematic" | "narrative"
 *   chapterCount: number,        // ## 标题数
 *   dataPointCount: number,      // 数字/百分比/金额匹配数
 *   reasoning: string[],         // 推荐理由数组
 * }
 */
export function evaluateArticle(markdownText)
```

**评估逻辑**:
- `estimatedDuration <= 60` → `recommendedParts = 1`, `splitMethod = "none"`
- `<= 120` → `recommendedParts = 2`, `splitMethod = chapterCount >= 2 ? "thematic" : "narrative"`
- `<= 180` → `recommendedParts = 3`, 同上逻辑
- `<= 240` → `recommendedParts = 4`
- `> 240` → `recommendedParts = 5`（上限）
- 空/极短文本 → `recommendedParts = 1`（安全默认）
- `reasoning` 数组含 2-3 条人类可读理由

**Word count 逻辑**:
- 去除 markdown 标记（`#`, `*`, `-`, `>`, 链接, 图片, widget 标记）
- 去除 frontmatter（`---` 之间的内容）
- 按空格分词计数

### ISSUE-21: 合集制作脚本 — 方案 A 拼接（代码）

**交付物**:
- `scripts/short-video/compile-series.mjs` — FFmpeg 拼接脚本
- `scripts/short-video/lib/__tests__/compile-series.test.mjs` — 单元测试

**功能**:
- 输入：多个 mp4 文件路径（CLI `--videos part1.mp4 part2.mp4 part3.mp4`）
- 输出：合集 mp4（`--output output/compilation.mp4`）
- FFmpeg `concat` + 交叉淡入淡出（`xfade` + `acrossfade`，1 秒过渡）
- 文件不存在时报错
- 单个文件时直接 copy（不转码）
- 输出文件信息（时长、大小）

### ISSUE-22: 现有管线扩展 — main.mjs + publish-utils.mjs + publish-tiktok.mjs（代码）

**交付物**:
- 修改 `scripts/short-video/main.mjs` — 增加 `--scene` 参数
- 修改 `scripts/short-video/lib/publish-utils.mjs` — 追加系列函数
- 修改 `scripts/short-video/publish-tiktok.mjs` — 增加系列发布参数
- `scripts/short-video/lib/__tests__/publish-utils-series.test.mjs` — 系列函数测试

**main.mjs 改动**:
- 增加 `--scene <path>` 参数（默认 `./scene-data.mjs`）
- 用动态 `import()` 加载指定 scene-data 文件
- 不传 `--scene` 时行为不变（向后兼容）

**publish-utils.mjs 新增函数**:
```javascript
/**
 * Build caption with series hashtag and part number.
 * @param {Object} metadata - { title, description, hashtags }
 * @param {Object} seriesMeta - { seriesId, partNumber, totalParts }
 * @returns {string} Caption with series info, <= 2200 chars
 */
export function buildSeriesCaption(metadata, seriesMeta)

/**
 * Build pinned comment content linking to prev/next parts.
 * @param {Object} seriesMeta - { partNumber, totalParts, prevPartUrl?, nextPartUrl? }
 * @returns {string} Pinned comment text
 */
export function buildSeriesPinnedComment(seriesMeta)
```

**publish-tiktok.mjs 改动**:
- 增加可选参数：`--series-id <id>`, `--part <n/total>`, `--prev-url <url>`, `--next-url <url>`
- 传入系列参数时用 `buildSeriesCaption` 替代 `buildCaption`
- 不传系列参数时行为不变

### ISSUE-23: 合集制作脚本 — 方案 B 重构叙事（代码）

**交付物**:
- `scripts/short-video/compile-series-reconstruct.mjs` — 重构叙事合集脚本
- `scripts/short-video/lib/__tests__/compile-series-reconstruct.test.mjs` — 单元测试

**功能**:
- 输入：多份 scene-data 文件路径（`--scenes scene-data-pt1.mjs scene-data-pt2.mjs`）
- 逻辑：
  1. 动态 import 所有 scene-data
  2. 合并所有 scenes 为一个数组
  3. 去掉每集的 hook scene（Part 1 的第一个 scene）和 CTA scene（每集的最后一个 scene）
  4. 只保留 Part 1 的 hook + 中间所有内容 + 最后一集的 CTA
  5. 输出合并后的 scene-data 文件（`--output scene-data-compilation.mjs`）
- 输出的 scene-data 可直接跑 `main.mjs --scene scene-data-compilation.mjs`
- **注意**：此脚本只做 scene-data 合并，不跑 TTS/渲染（那是 `main.mjs` 的事）

**合并逻辑**:
```javascript
// 伪代码
const allScenes = sceneFiles.flatMap(import => import.scenes)
const hookScene = allScenes[0]  // Part 1 的 hook
const ctaScene = allScenes[allScenes.length - 1]  // 最后一集的 CTA
const middleScenes = allScenes.filter(s => 
  s.name !== 'hook' && s.name !== 'cta'
)
const compilationScenes = [hookScene, ...middleScenes, ctaScene]
```

### ISSUE-24: scene-data seriesMeta 格式约定（代码）

**交付物**:
- `scripts/short-video/lib/series-meta.mjs` — seriesMeta 类型定义 + 验证函数
- `scripts/short-video/lib/__tests__/series-meta.test.mjs` — 单元测试

**功能**:
```javascript
/**
 * Validate a seriesMeta object.
 * @param {Object} meta - seriesMeta to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateSeriesMeta(meta)

/**
 * Get series-related caption hashtag from seriesMeta.
 * @param {Object} meta - validated seriesMeta
 * @returns {string} e.g. "#deepseekdistillation"
 */
export function getSeriesHashtag(meta)
```

**seriesMeta 格式**:
```javascript
{
  seriesId: "deepseek-distillation",      // string, required, kebab-case
  partNumber: 1,                           // number, required, 1-5
  totalParts: 3,                           // number, required, 1-5
  prevPartSlug: null,                      // string | null, optional
  nextPartSlug: "deepseek-distillation-pt2", // string | null, optional
  hookType: "standalone",                  // "standalone" | "recap" | "cliffhanger-close"
  rewatchElement: "hidden-detail",         // string, optional
  compilationSlug: "deepseek-distillation-full", // string, optional
}
```

### ISSUE-25: 管线文档更新（Agent 工作流文档）

**交付物**:
- 修改 `docs/content-pipeline.md` — Stage 3 增加分集评估步骤
- 修改 `docs/video-workflow.md` — 增加系列发布策略 + 合集制作章节
- 不需要代码，记录 agent 操作规范

**content-pipeline.md 改动**:
- Stage 3 开头增加「Step 0: 分集评估」
- Agent 调用 `episode-evaluator.mjs` 评估文章
- 输出分集评估报告供用户审阅
- 确认后生成 N 份 scene-data（各含 seriesMeta）
- HITL-2 审阅扩展：系列整体叙事 + 每集独立可看

**video-workflow.md 改动**:
- 新增「Multi-Video Series Strategy」章节
- 新增「Compilation Video」章节（方案 A + B）
- 新增「Series Publishing Workflow」章节

---

## Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `scripts/short-video/main.mjs` | 增加 `--scene` 参数，动态 import scene-data | Medium | 修改了入口文件的 import 逻辑。通过默认值 `./scene-data.mjs` 保持向后兼容。验证：不传 `--scene` 时行为不变。 |
| `scripts/short-video/lib/publish-utils.mjs` | 追加 `buildSeriesCaption` + `buildSeriesPinnedComment` 函数 | Low | 纯追加新函数，不修改现有 `buildCaption` 等函数。现有调用方不受影响。 |
| `scripts/short-video/publish-tiktok.mjs` | 增加系列参数（`--series-id`, `--part` 等），系列模式下用 `buildSeriesCaption` | Medium | 修改了发布脚本主流程。通过可选参数保持向后兼容。不传系列参数时走原 `buildCaption` 路径。 |
| `docs/content-pipeline.md` | Stage 3 增加分集评估步骤 | Low | 纯文档追加。 |
| `docs/video-workflow.md` | 增加系列发布策略 + 合集制作章节 | Low | 纯文档追加。 |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | 单集内容，不传 `--scene`，跑 `main.mjs` | 用默认 `scene-data.mjs`，行为与当前完全一致 | Low | 默认值 = 当前路径 |
| 2 | 多集内容，传 `--scene scene-data-pt1.mjs` | 动态 import 指定文件，跑 Part 1 管线 | Medium | 动态 import 用 `await import(path)` |
| 3 | `--scene` 指向不存在的文件 | 报错退出，提示文件路径 | Low | try-catch + 明确错误信息 |
| 4 | `publish-tiktok.mjs` 不传系列参数 | 正常发布，caption 用原 `buildCaption` | Low | 系列参数全部可选 |
| 5 | `publish-tiktok.mjs --series-id deepseek --part 1/3` | caption 自动加 `#deepseek` + `Part 1/3` | Medium | `buildSeriesCaption` 独立测试 |
| 6 | 评估器输入短文章（<60s） | `recommendedParts: 1`, `splitMethod: "none"` | Low | 单元测试覆盖 |
| 7 | 评估器输入长文章（>180s） | `recommendedParts: 3` + 理由数组 | Low | 单元测试覆盖 |
| 8 | 评估器输入空字符串 | `recommendedParts: 1`（安全默认） | Low | 单元测试覆盖 |
| 9 | 评估器输入只有 frontmatter 没有正文 | `wordCount: 0`, `recommendedParts: 1` | Low | 单元测试覆盖 |
| 10 | 合集拼接输入 2 个 mp4 | 输出 1 个合集 mp4 with xfade | Low | FFmpeg concat 测试 |
| 11 | 合集拼接输入不存在文件 | 报错退出 | Low | 文件存在检查 |
| 12 | 合集拼接输入 1 个 mp4 | 直接 copy 不转码 | Low | 边界场景测试 |
| 13 | 合集重构输入 3 份 scene-data | 去掉 hook/CTA，合并输出 | Low | 单元测试覆盖 |
| 14 | 合集重构输入 1 份 scene-data | 输出与输入相同（无合并需要） | Low | 边界场景测试 |
| 15 | `buildSeriesCaption` 超过 2200 字符 | 截断到句末 | Low | 复用 `truncateAtSentence` |
| 16 | `validateSeriesMeta` 输入无效 `seriesId`（非 kebab-case） | `valid: false` + 错误信息 | Low | 单元测试覆盖 |
| 17 | `buildSeriesPinnedComment` 无 prev/next URL | 只输出当前集信息，不含链接 | Low | 可选字段处理 |
