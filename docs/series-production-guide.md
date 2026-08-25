# Series Production Guide — 多集系列与合集制作

> **创建于**: 2026-08-25
> **被引用**: `docs/content-pipeline.md` Stage 3 Step 0（分集评估触发时加载）、`docs/video-workflow.md`（系列/合集操作时加载）
> **研究依据**: `docs/research/multi-video-splitting-best-practices.md`（15 源，TikTok 算法分析、集间链接、自动评估器）

## When to Split

Agent 在 Stage 3 生成 scene-data 前，先运行分集评估器：

```bash
node -e "import { evaluateArticle } from './scripts/short-video/lib/episode-evaluator.mjs'; const r = evaluateArticle(articleText); console.log(JSON.stringify(r, null, 2));"
```

评估器输出 `recommendedParts`（1-5，Agent 强制 cap 为 3）、`splitMethod`（"none" | "thematic" | "narrative"）、`reasoning`。

**三集上限规则**：2-3 集为最佳，超过 3 集观众流失率显著上升。评估器输出 >3 时强制 cap 为 3。

**Agent 行为**：
- `recommendedParts === 1`：走单集流程
- `recommendedParts > 1`：cap 为 3 后输出分集评估报告，等待用户确认后生成 N 份 scene-data

## 内容拆分原则

- **不要一次把所有素材全用了**——如文章内容丰富无法在 60 秒内讲完，优先拆分多集，而非塞入单集导致信息过载
- 每集独立可看——不看前集也能看懂
- 分开用的素材比一次全用更有价值——"一次全用就浪费了"

## Series Types

| 类型               | 适用场景     | 长度   |
| ------------------ | ------------ | ------ |
| Explicit Part N    | 复杂事件分析 | 2-3 集 |
| Loop-and-Flashback | 突发新闻     | 1-2 集 |
| Deep Dive          | 技术解析     | 2-4 集 |
| 对比系列           | 多公司对比   | 2-3 集 |

## Inter-Episode Linking

| 方法                | 操作                                       |
| ------------------- | ------------------------------------------ |
| Pin Part 1          | 将 Part 1 pin 在主页顶部                   |
| Pinned Comment 互链 | 每集 pinned comment 放上下集链接           |
| Stitch 自身视频     | Part 2 开头 Stitch Part 1 作为「上集回顾」 |
| 统一 Hashtag        | 所有集用同一个 `#seriesId`                 |
| Part 编号           | 画面标注 "Part X/Y"                        |

## Coherence Rules

- **每集独立可看** — 不看前集也能看懂
- **不同 Hook** — 每集不同角度的 Hook
- **信息间隔** — Part 1 提出问题，Part 2 解答
- **Payoff 兑现** — 每集的承诺必须兑现
- **间隔 ≤ 3 天** — 超过 1 周观众流失

## Series Publishing Workflow

### 发布节奏

| 策略     | 间隔         | 适用       |
| -------- | ------------ | ---------- |
| 快速连续 | 1-3 天       | 2-3 集系列 |
| 同日发布 | 同日不同时段 | 2 集系列   |

### 系列发布命令

```bash
# 发布 Part 1
node scripts/short-video/publish-tiktok.mjs --series-id deepseek-distillation --part 1/3

# 发布 Part 2（带上一集链接）
node scripts/short-video/publish-tiktok.mjs --series-id deepseek-distillation --part 2/3 --prev-url "https://tiktok.com/@chinaainews/video/xxx"

# 发布 Part 3（最后一集）
node scripts/short-video/publish-tiktok.mjs --series-id deepseek-distillation --part 3/3 --prev-url "https://tiktok.com/@chinaainews/video/yyy"
```

脚本自动：Caption 加 `Part X/Y #seriesId`，输出 pinned comment 内容（含上下集链接）。

### 批量生产

决定拆分后一次性生成所有 scene-data，批量跑 TTS → 渲染 → 合成。相比逐条制作节省 60-70% 时间。

## Compilation Video

> 所有集发完后 3-5 天，合并为合集发布到 YouTube 长视频。`compile-series.mjs` 和 `compile-series-reconstruct.mjs` 是可选 standalone 工具，不在默认管线中。

### Plan A: FFmpeg 拼接

```bash
node scripts/short-video/compile-series.mjs --videos part1.mp4 part2.mp4 part3.mp4
```

适合 2 集快速出合集。

### Plan B: 重构叙事

```bash
# 合并 scene-data，去掉每集 hook/CTA
node scripts/short-video/compile-series-reconstruct.mjs --scenes content/distillation/pt1/scene-data.mjs content/distillation/pt2/scene-data.mjs content/distillation/pt3/scene-data.mjs --output content/distillation-compilation/scene-data.mjs

# 然后跑合集版 scene-data
node scripts/short-video/main.mjs --content distillation-compilation
```

适合 3+ 集高质量合集。

### Compilation Publishing

合集 mp4 发布到 YouTube 长视频（2-5 分钟），网站文章更新嵌入合集视频。

## Design Decisions & References

| Topic | Reference | Content |
|-------|-----------|---------|
| Multi-video splitting research | `docs/research/multi-video-splitting-best-practices.md` (L2) | 15 sources — TikTok algorithm analysis, episode linking, auto-evaluator design |
