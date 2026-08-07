# Tickets: Multi-Video Splitting — 多视频拆分管线集成

## Dependency Graph

```
T8 (series-meta.mjs) ──→ T10 (publish-utils 扩展) ──→ T11 (publish-tiktok.mjs 扩展)
                                                           │
T9 (episode-evaluator.mjs) ─────────────────────────→ T12 (content-pipeline.md 更新)
                                                           │
T10 (publish-utils 扩展) ──→ T13 (video-workflow.md 更新)

T14 (compile-series.mjs 方案A) ──→ T13
T15 (compile-series-reconstruct.mjs 方案B) ──→ T13

T9 ──→ T12 (main.mjs --scene 扩展, 合并到 T9 ticket)
```

执行顺序：T8 → T9 → T10 → T11 → T12(main.mjs) → T14 → T15 → T13

---

## T8: series-meta.mjs — seriesMeta 类型定义 + 验证

**Depends on**: none
**Delivers**: `scripts/short-video/lib/series-meta.mjs` + `scripts/short-video/lib/__tests__/series-meta.test.mjs`
**Covers scenarios**: 16, 17

Tasks:

- 创建 `scripts/short-video/lib/series-meta.mjs`
- `validateSeriesMeta(meta)` — 验证 seriesMeta 对象
  - `seriesId` 必填，kebab-case（`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`）
  - `partNumber` 必填，整数 1-5
  - `totalParts` 必填，整数 1-5
  - `partNumber <= totalParts`
  - `prevPartSlug` 可选，string | null
  - `nextPartSlug` 可选，string | null
  - `hookType` 可选，枚举 `"standalone" | "recap" | "cliffhanger-close"`
  - `rewatchElement` 可选，string
  - `compilationSlug` 可选，string
  - 返回 `{ valid: boolean, errors: string[] }`
- `getSeriesHashtag(meta)` — 从 seriesId 生成 hashtag（`#` + seriesId）
- 测试：valid meta、invalid seriesId、partNumber > totalParts、missing required fields、null fields

---

## T9: episode-evaluator.mjs — 分集评估器

**Depends on**: none
**Delivers**: `scripts/short-video/lib/episode-evaluator.mjs` + `scripts/short-video/lib/__tests__/episode-evaluator.test.mjs`
**Covers scenarios**: 6, 7, 8, 9

Tasks:

- 创建 `scripts/short-video/lib/episode-evaluator.mjs`
- `evaluateArticle(markdownText)` 纯函数
- **Word count 逻辑**:
  - 去除 frontmatter（`---` 之间的内容）
  - 去除 markdown 标记：`#`, `*`, `-`, `>`, `` ` ``, `[text](url)`, `![alt](url)`, `<!-- widget:xxx -->`
  - 按空格分词计数
- **Chapter count**: 数 `## ` 开头的行
- **Data point count**: 正则匹配 `\d+\.?\d*[%$]?` 和金额 `$\d+`
- **Estimated duration**: `wordCount / 2.5`（F5-TTS 平均 2.5 词/秒）
- **Recommended parts**:
  - `<= 60s` → 1, `"none"`
  - `<= 120s` → 2, `chapterCount >= 2 ? "thematic" : "narrative"`
  - `<= 180s` → 3, 同上
  - `<= 240s` → 4
  - `> 240s` → 5（上限）
- **Reasoning**: 2-3 条人类可读理由，例如：
  - `"Core narrative requires ~Xs, exceeding 60s limit"`
  - `"Article has N independent subtopics, suitable for thematic split"`
  - `"N data points detected, recommending N episodes at ~3-4 per episode"`
- 空/极短文本 → `recommendedParts: 1`（安全默认）
- 测试：短文章、长文章、空字符串、只有 frontmatter、只有 widget 标记

---

## T10: publish-utils.mjs 扩展 — 系列函数

**Depends on**: T8
**Delivers**: 修改 `scripts/short-video/lib/publish-utils.mjs` + `scripts/short-video/lib/__tests__/publish-utils-series.test.mjs`
**Covers scenarios**: 5, 15, 17

Tasks:

- 在 `publish-utils.mjs` 追加 `buildSeriesCaption(metadata, seriesMeta)`
  - 调用 `validateSeriesMeta` 验证 seriesMeta
  - caption = `buildCaption(metadata)` + `\n\nPart {partNumber}/{totalParts} #{seriesId}`
  - 超过 2200 字符时用 `truncateAtSentence` 截断
  - 返回 string
- 在 `publish-utils.mjs` 追加 `buildSeriesPinnedComment(seriesMeta)`
  - `partNumber > 1` 且 `prevPartSlug` 存在 → `"🎬 Part 1: [prevPartUrl]\n\nThis is Part {partNumber}/{totalParts}"`
  - `partNumber < totalParts` 且 `nextPartSlug` 存在 → 追加 `"\n\nPart {nextPartNumber} coming soon!"`
  - 无 prev/next → 只输出 `"Part {partNumber}/{totalParts} of the {seriesId} series"`
  - 返回 string
- 测试：正常系列 caption、超长 caption 截断、Part 1 无 prev、最后一集无 next、invalid seriesMeta

---

## T11: publish-tiktok.mjs 扩展 — 系列发布参数

**Depends on**: T10
**Delivers**: 修改 `scripts/short-video/publish-tiktok.mjs`
**Covers scenarios**: 4, 5

Tasks:

- 增加可选 CLI 参数：`--series-id <id>`, `--part <n/total>`, `--prev-url <url>`, `--next-url <url>`
- 当 `--series-id` 存在时：
  - 构建 `seriesMeta` 对象（从 CLI 参数解析）
  - 调用 `validateSeriesMeta` 验证
  - 用 `buildSeriesCaption(metadata, seriesMeta)` 替代 `buildCaption(metadata)`
  - 用 `buildSeriesPinnedComment(seriesMeta)` 生成 pinned comment 文本，输出到控制台（提示用户手动 pin）
- 当 `--series-id` 不存在时：走原 `buildCaption` 路径，行为不变
- `--part` 格式为 `n/total`（如 `1/3`），解析为 `partNumber` 和 `totalParts`

---

## T12: main.mjs 扩展 — --scene 参数

**Depends on**: none（可与 T8-T11 并行）
**Delivers**: 修改 `scripts/short-video/main.mjs`
**Covers scenarios**: 1, 2, 3

Tasks:

- 增加可选 CLI 参数：`--scene <path>`（默认 `./scene-data.mjs`）
- 替换静态 `import { scenes } from "./scene-data.mjs"` 为动态 import：
  ```javascript
  const scenePath = getArg("scene") || new URL("./scene-data.mjs", import.meta.url).pathname;
  const { scenes } = await import(scenePath);
  ```
- 不传 `--scene` 时用默认路径，行为不变
- 文件不存在时 try-catch 报错：`Scene file not found: ${path}. Use --scene to specify.`
- 验证 `scenes` 是数组且非空

---

## T13: 管线文档更新

**Depends on**: T9, T10, T11, T12, T14, T15
**Delivers**: 修改 `docs/content-pipeline.md` + `docs/video-workflow.md`
**Covers scenarios**: N/A（文档）

Tasks:

- **`docs/content-pipeline.md` Stage 3 改动**:
  - 在 Stage 3 开头增加「Step 0: 分集评估」
  - Agent 运行 `node -e "import {evaluateArticle} from './lib/episode-evaluator.mjs'; ..."` 或直接在 Agent 上下文中调用
  - 输出分集评估报告（推荐集数 + 理由 + 各集概览）
  - 如 `recommendedParts > 1`：等待用户确认拆分方案，然后生成 N 份 scene-data
  - 如 `recommendedParts === 1`：走当前单集流程
  - HITL-2 审阅扩展：增加系列整体叙事 + 每集独立可看 + 集间连接钩子审阅

- **`docs/video-workflow.md` 新增章节**:
  - 「Multi-Video Series Strategy」— 拆分策略、集间串联、连贯技巧
  - 「Series Publishing Workflow」— 发布节奏、平台适配、批量生产
  - 「Compilation Video」— 方案 A 拼接 + 方案 B 重构、发布时机

---

## T14: compile-series.mjs — 合集方案 A 拼接

**Depends on**: none
**Delivers**: `scripts/short-video/compile-series.mjs` + `scripts/short-video/lib/__tests__/compile-series.test.mjs`
**Covers scenarios**: 10, 11, 12

Tasks:

- 创建 `scripts/short-video/compile-series.mjs`
- CLI 参数：`--videos <path1> <path2> ...`（必选）、`--output <path>`（默认 `output/compilation.mp4`）
- 检查每个输入文件是否存在，不存在报错
- 单个文件时直接 `fs.copyFileSync`（不转码）
- 多个文件时用 FFmpeg：
  - `xfade` 视频交叉淡入淡出（1 秒）
  - `acrossfade` 音频交叉淡出（1 秒）
  - 需要先 `ffprobe` 获取每段时长来计算 offset
- 输出：合集 mp4 + 时长 + 大小信息
- 测试：mock execSync 验证 FFmpeg 命令构建、文件存在检查、单文件 copy 路径

---

## T15: compile-series-reconstruct.mjs — 合集方案 B 重构叙事

**Depends on**: T8
**Delivers**: `scripts/short-video/compile-series-reconstruct.mjs` + `scripts/short-video/lib/__tests__/compile-series-reconstruct.test.mjs`
**Covers scenarios**: 13, 14

Tasks:

- 创建 `scripts/short-video/compile-series-reconstruct.mjs`
- CLI 参数：`--scenes <path1> <path2> ...`（必选）、`--output <path>`（默认 `scene-data-compilation.mjs`）
- 动态 import 所有 scene-data 文件
- 合并逻辑：
  1. 收集所有 scenes
  2. 找到 Part 1 的 hook scene（`name === "hook"` 或 `id === 1`，第一个匹配的）
  3. 找到最后一集的 CTA scene（`name === "cta"` 或最后一个 scene）
  4. 过滤掉所有 hook 和 CTA scenes
  5. 重新编号剩余 scenes 的 id
  6. 组合：`[hookScene, ...middleScenes, ctaScene]`
  7. 输出为 `.mjs` 文件（`export const scenes = [...]`）
- 单份 scene-data 时：原样输出（只是 copy）
- 测试：多份合并、单份 copy、hook/CTA 正确过滤、id 重新编号
