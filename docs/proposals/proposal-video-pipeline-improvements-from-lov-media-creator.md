# Proposal: Video Pipeline Improvements — Inspired by lov-media-creator

> **状态：** Proposal — Review comments 已合入，待 Grill
> **来源：** 对 `lovstudio/media-creator-skill` (v0.9.1, MIT, commit `main` branch 2026-08-26) 的设计分析
> **日期：** 2026-08-26
> **前提：** 本方案不新增 HITL，且不改变既有 Stage 5 HITL 的责任与时序

## 1. Background

`lov-media-creator` 是 Lovstudio 出品的一个视频剪辑 skill，核心场景是"录屏 → 字幕审校 → 平台成片"。虽然它的赛道（录屏教学 + 视频号发布）与我们的赛道（AI 新闻 + TikTok 发布）不同，但它在以下设计理念上值得借鉴：

1. **字幕审校门**（两阶段交付）
2. **状态维度分离**（6 个独立维度 vs 我们的 stage 级状态）
3. **封面 vs 开场静帧分离**
4. **系列片工程代码复用**
5. **Profile 持久化**

我们的管线已有 MRL（Machine Review Loop）自审循环，这本身已经是 AIL 的一种实现。本方案在现有 MRL 基础上引入上述设计理念，**不新增任何 HITL 检查点，不改变既有 Stage 5 HITL 的责任与时序**。

## 2. Current State

### 2.1 字幕流程

当前流程：`text-align.py 强制对齐（wav2vec2，scene-data voiceover 文本 → 逐词时间戳）→ subtitle-timing.json → ASS 生成 → 渲染/合成 → verify-subtitles.mjs 验证 → verify-retry.mjs 自动修复`

关键事实（经源码验证）：

- `text-align.py` 做的是**强制对齐**（已知文本 → wav2vec2 → 逐词时间戳），不做 Whisper ASR 识别。manifest 中的 `text` 字段直接从 `scene.voiceover` 取值。
- `runWhisperAlignment()` 函数名有误导性——它不运行 Whisper，它运行的是 `text-align.py`（wav2vec2-large-960h-lv60-self 强制对齐）。
- `verify-retry.mjs` 的 `subtitle-alignment` 类别在 `main.mjs` 第 453-457 行仍返回 `{ success: false }`，注释写着 "This requires async TTS alignment, deferred for now"。**当前没有对 subtitle-alignment 失败的自动修复。**
- 字幕验证（`verifySubtitles`）需要 `videoPath`（渲染后才能做），并在有 `outputDir` 时做端到端音频同步检查。**不能在渲染前运行。**
- `compareWordSequence()` 比较的是 ASS 中的词 vs `subtitle-timing.json` 的词——两者都来自同一数据源，是"ASS 是否忠实于 timing"的检查，不是"timing 是否忠实于 scene-data"的检查。

### 2.2 状态追踪

当前 `pipeline-status.json` 按 stage 追踪：

```json
{
  "stage-4": { "status": "in-progress" },
  "stage-5": { "status": "pending" }
}
```

粒度是 stage 级别的，没有把 `render`、`subtitle`、`audio`、`creative` 分开追踪。无 `schemaVersion`、无合法状态迁移定义、无 `failed` 状态、无失败原因、无更新时间、无尝试次数。

### 2.3 封面

TikTok 的"封面"就是视频第一帧（hook scene 第一帧）。目前没有"封面"和"开场静帧"分离的概念。**需限定**：此认知基于普通发布路径（TikTok App 上传），创作者工具或 API 发布可能有独立封面槽位——实施前需按仓库规则做双源验证。

### 2.4 系列复用

多集视频使用 `content/{series}/ptN/` 独立目录，每集有自己的 `meta.mjs`、`scene-data.mjs`、`scenes.mjs`。没有跨集工程代码复用机制——每集的 `scenes.mjs` 是手写的，不 import 前集。

### 2.5 MRL

已有 MRL-1（文章）、MRL-2（scene-data）、MRL-3（视频成品）三层自审。MRL 是纯机器循环：Blocker FAIL → 修复 → 重新检查 → 循环到 0 Blockers。

## 3. Proposed Improvements

### 3.1 Subtitle AIL Gate（字幕 Agent 自审门）

**借鉴点：** lov-media-creator 的两阶段字幕交付（先 MKV + SRT 审校，批准后烧录）。

**我们的适配：** 我们不需要人类审校字幕。但可以借鉴"先验证文本再烧录"的思路。**但必须拆成两个门**，因为现有字幕验证需要 `videoPath`，不能在渲染前完成：

#### 门 1: 渲染前 Canonical Text 溯源门

在 ASS 生成后、渲染/合成前执行。验证 canonical transcript 的完整性和一致性：

```
text-align.py 强制对齐（scene-data voiceover → wav2vec2 → subtitle-timing.json）
  → ASS 生成（lib/subtitles/generate.mjs）
  → 🔄 Canonical Text 溯源门（新增）
    ├─ 检查 1: subtitle-timing.json 中的词序列 vs scene-data voiceover 规范化后文本
    │   （canonical-text 校验——区分于已有的 compareWordSequence）
    │   - 规范化规则（必须定义）：大小写折叠、标点剥离、缩写展开、
    │     数字读法统一（如 "20B" → "twenty billion"）、专有名词规范化
    │   - 成功条件：100% 序列匹配（不接受"错误总数下降"）
    ├─ 检查 2: subtitle-timing.json 版本/hash 与 scene-data + TTS 音频的 hash 一致
    │   - 输入变化时拒绝复用旧 timing
    │   - 为 scene-data、TTS 音频和 subtitle-timing.json 记录可比较的版本或 hash
    ├─ 检查 3: 断句合理性（单 cue ≤ MAX_WORDS，已有）
    ├─ 检查 4: 无空词/部分词（对齐产出空 segments 或 0 words 的场景检测）
    │
    ├─ Blocker: canonical-text 失配
    │   → 修复策略: 重做 text-align.py 强制对齐（从 scene-data voiceover 重新生成 timing）
    │   → 重新生成 ASS
    │   → 重验 Canonical Text 门
    │   → 如果重做对齐后仍失配 → 硬失败（不继续渲染）
    ├─ Blocker: timing hash 不匹配（scene-data 已变更但 timing 未重建）
    │   → 修复策略: 重做 text-align.py
    │   → 如果 TTS 音频也已变更 → 必须重做 TTS，然后重做对齐
    │   → 无法重新对齐时硬失败
    └─ PASS → 进入渲染/合成
```

**修复策略的接受条件：** canonical-text 失配的成功条件要求 **100% 序列匹配**，且所有既有硬门均通过。不能"修一个错引一个错"——"错误总数严格下降"不适用于文本修复。

#### 门 2: 渲染后成片字幕与音频同步验证（已有，保留为 MRL-3 子门）

在渲染/合成后执行，验证最终成片：

```
渲染/合成完成
  → 🔄 成片验证（已有 verifySubtitles + verify-retry）
    ├─ 检查 1: ASS 中的词序列 vs timing（已有 compareWordSequence）
    ├─ 检查 2: cue gap 合规（已有 analyzeGaps）
    ├─ 检查 3: 时间轴对齐（已有 analyzeSync）
    ├─ 检查 4: 端到端音频同步（已有 verifyAudioSync，需要 videoPath）
    │
    ├─ Blocker: audio-sync-drift → 已有 drift 补偿修复
    ├─ Blocker: cue-gaps → 已有重建 cue 修复
    ├─ Blocker: subtitle-alignment → 当前返回 success: false（需补全）
    └─ PASS → 进入 HITL
```

**两条渲染路径的覆盖：**

| 路径     | ASS 处理方式                                    | 门 1 位置                             | 门 2 位置                 |
| -------- | ----------------------------------------------- | ------------------------------------- | ------------------------- |
| Remotion | 渲染后 post-process 阶段 `burnSubtitles()` 烧录 | ASS 生成后、`renderRemotion()` 调用前 | `renderRemotion()` 完成后 |
| FFmpeg   | 合成时 `burnSubtitles()` 烧录                   | ASS 生成后、`assembleVideo()` 调用前  | `assembleVideo()` 完成后  |

**改动范围（完整影响面）：**

| 文件                                             | 改动类型 | 改动内容                                                                        |
| ------------------------------------------------ | -------- | ------------------------------------------------------------------------------- |
| `scripts/short-video/main.mjs`                   | 修改     | Step 4-5 间插入门 1；补全 `subtitle-alignment` 的 repairFn                      |
| `scripts/short-video/lib/verify-subtitles.mjs`   | 修改     | 新增 canonical-text 校验函数（scene-data vs timing）                            |
| `scripts/short-video/lib/verify-retry.mjs`       | 修改     | 新增 canonical-text 修复策略（重做 text-align.py）                              |
| `scripts/short-video/lib/tts/post-process.mjs`   | 修改     | `runWhisperAlignment` 函数重命名；manifest 增加 scene-data hash                 |
| `scripts/short-video/text-align.py`              | 修改     | 输出中增加 source text hash 和 manifest hash                                    |
| `scripts/short-video/lib/subtitles/generate.mjs` | 修改     | 无逻辑改动，但作为门 1 的验证对象                                               |
| `scripts/short-video/lib/render-remotion.mjs`    | 无改动   | 门 1 在调用前执行；门 2 在完成后执行                                            |
| `scripts/short-video/lib/assemble.mjs`           | 无改动   | 同上                                                                            |
| `scripts/short-video/lib/post-process.mjs`       | 无改动   | `burnSubtitles` 不变                                                            |
| 现有测试                                         | 修改     | `verify-subtitles.test.mjs`、`verify-retry.test.mjs` 需新增 canonical-text 场景 |

### 3.2 Status Dimension Separation（状态维度分离）

**借鉴点：** lov-media-creator 把交付状态分为 6 个独立维度。

**我们的适配：** 将 `pipeline-status.json` 的 stage 级状态扩展为每 stage 内的多维度状态。

**必须先建立的契约：**

1. `schemaVersion: "2.0"`（旧文件 `schemaVersion: "1.0"` 或缺失时向后兼容读取）
2. 合法状态迁移定义（`pending → in-progress → passed / failed`）
3. `failed` 状态必须附带 `failureReason` 和 `failedAt`（ISO 8601）
4. 每个维度记录 `updatedAt` 和 `attemptCount`
5. 不适用的维度标记为 `"n/a"`（如 Stage 4 无 `publish` 维度）
6. 原子写入规则：先写临时文件再 rename（防止写入中断产生半文件）
7. **不引入 `review-ready` 状态**——这是 HITL 语义，与 AIL 原则冲突

```json
{
  "schemaVersion": "2.0",
  "stage-4": {
    "status": "in-progress",
    "dimensions": {
      "render": { "status": "pending", "updatedAt": null, "attemptCount": 0 },
      "subtitle": { "status": "pending", "updatedAt": null, "attemptCount": 0 },
      "audio": { "status": "pending", "updatedAt": null, "attemptCount": 0 },
      "creative": { "status": "pending", "updatedAt": null, "attemptCount": 0 },
      "publish": { "status": "n/a" }
    }
  },
  "stage-5": {
    "status": "pending",
    "dimensions": {
      "render": { "status": "pending", "updatedAt": null, "attemptCount": 0 },
      "subtitle": { "status": "pending", "updatedAt": null, "attemptCount": 0 },
      "audio": { "status": "pending", "updatedAt": null, "attemptCount": 0 },
      "creative": { "status": "pending", "updatedAt": null, "attemptCount": 0 },
      "publish": { "status": "pending", "updatedAt": null, "attemptCount": 0 }
    }
  }
}
```

**维度定义：**

| 维度       | 含义                   | 合法值                                                       | 对应检查                    |
| ---------- | ---------------------- | ------------------------------------------------------------ | --------------------------- |
| `render`   | 视频是否已渲染且可解码 | `pending` / `in-progress` / `rendered` / `passed` / `failed` | ffprobe + `ffmpeg -v error` |
| `subtitle` | 字幕是否通过 AIL 门    | `pending` / `in-progress` / `passed` / `failed`              | 门 1 + 门 2                 |
| `audio`    | 音频质检是否通过       | `pending` / `in-progress` / `passed` / `failed`              | loudnorm + volumedetect     |
| `creative` | 品牌/视觉是否合规      | `pending` / `in-progress` / `passed` / `failed` / `n/a`      | brand-system 检查           |
| `publish`  | 发布状态               | `pending` / `in-progress` / `published` / `failed` / `n/a`   | TikTok + 文章发布回读       |

**改动范围：**

- `main.mjs` — 在每个 step 完成后原子更新对应维度状态
- `pipeline-status.json` schema 扩展 + 向后兼容读取
- `docs/content-pipeline.md` — 更新管线进度追踪章节
- **独立排期：** 状态 schema 与字幕修复解耦，待迁移、依赖及回滚策略明确后单独排期

### 3.3 Cover vs Opening Still Separation（封面 vs 开场静帧分离）

**借鉴点：** lov-media-creator 明确区分封面（3:4，平台卡片）和开场静帧（9:16，视频第一帧）。

**我们的适配：** TikTok 的"封面"就是视频第一帧（hook scene 第一帧），所以当前不需要分离。但如果将来扩展到视频号（需要 3:4 封面），需要这个分离。

**当前行动：** 记录这个设计认知到 `docs/video-workflow.md`，不做代码改动。

**触发扩展条件（需写明）：**

- 扩展到视频号平台时（视频号封面槽 3:4，成片 9:16）
- 封面资产责任方：`lov-channels-cover` 或等效的封面生成能力
- 触发前需按仓库规则做双源验证（TikTok 普通发布 vs 创作者工具 vs API 是否有独立封面槽位）

### 3.4 Series Template Reuse（系列片工程代码复用）

**借鉴点：** lov-media-creator 用 `series-template.md` 记录每期的成片标准，后续直接 import 前集代码。

**我们的适配：** 引入 `content/{series}/_series.mjs`，导出可复用的版式常量、场景模板函数和 BGM 选择逻辑。

**必须定义的接口契约：**

1. **稳定 export 接口：** `seriesConfig` 对象（版式常量）+ 可选的 `sceneTemplates` 函数（场景模板）
2. **版本/弃用策略：** `_series.mjs` 导出 `version: "1.0"`，breaking change 需 bump major version
3. **缺失时的行为：** `_series.mjs` 不存在时，`scenes.mjs` 降级为独立定义（当前行为）
4. **不兼容时的行为：** `_series.mjs` 的 `version` 与 `ptN/scenes.mjs` 期望的版本不匹配时，打印警告并降级
5. **回归场景：** "模板升级后旧集仍可重渲染"——如果 `_series.mjs` v2 删除了 v1 的某个字段，旧集必须仍能渲染（向后兼容）

```javascript
// content/{series}/_series.mjs
export const seriesConfig = {
  version: "1.0",
  visualStyle: {
    primaryColor: "#0a0a14",
    accentColor: "#3b82f6",
    fontFamily: "Inter, sans-serif",
  },
  sceneTemplates: {
    hook: /* shared hook template */,
    cta: /* shared CTA template */,
  },
  bgmSelection: "deterministic",
};
```

```javascript
// content/{series}/pt2/scenes.mjs
import { seriesConfig } from "../_series.mjs";
// 使用 seriesConfig 而非重新定义
// 如果 _series.mjs 不存在或版本不匹配，降级为独立定义
```

**改动范围：**

- 新增 `content/{series}/_series.mjs` 约定（非强制——新系列可选使用）
- `docs/video-workflow.md` — 新增系列复用章节
- 已有系列（如 `distillation/`）不强制迁移

### 3.5 Profile Persistence（偏好持久化）

**借鉴点：** lov-media-creator 用 `user-profile/v1` schema 把用户语言、时区、品牌偏好等跨 session 持久化。

**我们的适配：** 我们已有 `AGENTS.md` 作为跨 session 的规则源，但没有"用户偏好"级别的持久化。

**必须定义的契约：**

1. **发现路径：** `scripts/short-video/pipeline-profile.json`（本地文件）
2. **优先级：** CLI flag > content meta.mjs > pipeline-profile.json > AGENTS.md 默认值
3. **JSON schema 校验：** 无效文件时回退到默认值并打印警告
4. **边界：** 不得存储密钥、发布状态或任何敏感信息
5. **跨机器/跨 Agent：** gitignored 的本地 profile 不能跨机器持久化——如需跨机器，用户需手动复制或通过 content meta.mjs 传递

```json
{
  "language": "en",
  "timezone": "Asia/Shanghai",
  "brand": {
    "name": "China AI News",
    "tone": "analytical, direct, evidence-based"
  },
  "preferences": {
    "ttsEngine": "f5-mlx",
    "bgmEnabled": true,
    "defaultCanvas": "1080x1920"
  }
}
```

**改动范围：**

- 新增 `scripts/short-video/pipeline-profile.json`（gitignored，本地偏好）
- `main.mjs` 启动时读取 profile，用默认值填充未指定的参数
- `docs/video-workflow.md` — 新增 Profile 章节
- **独立排期：** Profile 与字幕修复解耦，待发现路径、优先级和回退策略明确后单独排期

## 4. Priority & Implementation Order

**P0 收敛为可验收缺口：** canonical-text 溯源、渲染前门、alignment 修复策略。状态 schema 和 profile 应与字幕修复解耦，待各自的迁移、依赖及回滚策略明确后单独排期。

| #   | 改进                                  | 优先级 | 改动量                      | 依赖     |
| --- | ------------------------------------- | ------ | --------------------------- | -------- |
| 1   | Subtitle AIL Gate（门 1 + 门 2 补全） | P0     | 中                          | 无       |
| 2   | Status Dimension Separation           | P1     | 中（需 schema 契约 + 迁移） | 独立排期 |
| 3   | Series Template Reuse                 | P2     | 中（需接口契约）            | 独立排期 |
| 4   | Profile Persistence                   | P3     | 中（需发现路径 + 回退）     | 独立排期 |
| 5   | Cover vs Opening Still                | P3     | 无（仅文档）                | 无       |

## 5. What We Explicitly Do NOT Adopt

| lov-media-creator 设计        | 不采用原因                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------- |
| 两阶段 MKV 审校交付           | 我们的字幕文本来自 scene-data（已知正确），不需要人类在 Subtitle Edit 中校对 |
| Subtitle Edit 工作流          | 不适用——我们没有人类字幕编辑环节                                             |
| 开场静帧画幅门禁              | TikTok 第一帧即封面，不需要 3:4 vs 9:16 分离（视频号扩展时再考虑）           |
| 作者字幕所有权                | 不适用——我们的"作者"是 Agent 自身                                            |
| `lov-channels-cover` 封面生成 | 不适用——我们用 Remotion hook scene 第一帧                                    |
| `lov-video-chapter` 章节条    | 已有自己的章节进度条设计                                                     |
| HITL 字幕批准                 | **明确拒绝**——改为 AIL 自审                                                  |
| 6 种状态分步记录              | 简化为 5 维度，去掉"字幕已批准"这个 HITL 状态                                |

## 6. Design Principles

1. **不新增 HITL，不改变既有 Stage 5 HITL。** 本方案不新增人工确认点，且不改变既有 Stage 5 内容包审阅的责任与时序。所有新增的"门"都是 Agent 自审循环（Blocker → 修复 → 重审 → 循环到 0）。
2. **Borrow the pattern, not the implementation.** 借鉴 lov-media-creator 的设计理念（状态分离、字幕门、系列复用），但用我们自己的技术栈（Node.js + Remotion + FFmpeg）实现。
3. **Extend MRL, don't replace it.** MRL-1/2/3 已有自审循环。新增的 Subtitle AIL Gate 是 MRL-3 的前置子门，不是独立的新 HITL。
4. **Backward compatible.** 已有 content 目录不需要迁移。系列复用和 Profile 是可选的。

## 7. Scenario & Risk Analysis

### Modified Files Impact（完整影响面）

| 文件                                                      | 改动类型 | 改动内容                                                                                               |
| --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `scripts/short-video/main.mjs`                            | 修改     | Step 4-5 间插入门 1；补全 `subtitle-alignment` 的 repairFn；pipeline-status.json 更新维度（P1 排期后） |
| `scripts/short-video/lib/verify-subtitles.mjs`            | 修改     | 新增 canonical-text 校验函数                                                                           |
| `scripts/short-video/lib/verify-retry.mjs`                | 修改     | 新增 canonical-text 修复策略                                                                           |
| `scripts/short-video/lib/tts/post-process.mjs`            | 修改     | `runWhisperAlignment` 重命名；manifest 增加 scene-data hash                                            |
| `scripts/short-video/text-align.py`                       | 修改     | 输出中增加 source text hash 和 manifest hash                                                           |
| `scripts/short-video/lib/subtitles/generate.mjs`          | 修改     | 作为门 1 的验证对象（无逻辑改动）                                                                      |
| `scripts/short-video/lib/render-remotion.mjs`             | 无改动   | 门 1 在调用前执行                                                                                      |
| `scripts/short-video/lib/assemble.mjs`                    | 无改动   | 同上                                                                                                   |
| `scripts/short-video/lib/post-process.mjs`                | 无改动   | `burnSubtitles` 不变                                                                                   |
| `scripts/short-video/__tests__/verify-subtitles.test.mjs` | 修改     | 新增 canonical-text 场景测试                                                                           |
| `scripts/short-video/__tests__/verify-retry.test.mjs`     | 修改     | 新增 canonical-text 修复策略测试                                                                       |

### Behavioral Scenarios

| #   | 场景                                                                                              | 预期行为                                                                             | 风险                                                           |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 1   | scene-data voiceover 中的专有名词（如 "DeepSeek"）在 text-align.py 输出中被分段为 "Deep" + "Seek" | 门 1 canonical-text 校验检测到失配 → 重做 text-align.py → 重验 → 如果仍失配 → 硬失败 | 规范化规则需覆盖专有名词；text-align.py 的分词可能不受我们控制 |
| 2   | 字幕所有检查通过                                                                                  | 门 1 PASS → 进入渲染/合成                                                            | 无                                                             |
| 3   | 渲染后字幕时间轴 drift 超过 80ms                                                                  | 门 2 verify-retry drift 补偿 → 重验证                                                | 无（已有逻辑）                                                 |
| 4   | pipeline-status.json 被新 session 读取                                                            | Agent 看到维度级状态，知道哪一步没完成                                               | 无                                                             |
| 5   | 系列第二集使用 _series.mjs                                                                        | import 复用版式常量                                                                  | 如果 _series.mjs 不存在，降级为独立定义                        |
| 6   | pipeline-profile.json 不存在                                                                      | 使用 AGENTS.md 中的默认值                                                            | 无                                                             |
| 7   | pipeline-profile.json 存在但字段缺失                                                              | 缺失字段用默认值填充                                                                 | 无                                                             |
| 8   | 用户修改了 scene-data voiceover 后重跑                                                            | 门 1 检测到 timing hash 不匹配 → 重做 text-align.py → 重验                           | 如果 TTS 音频也已变更需重做 TTS                                |
| 9   | scene-data 变更但 TTS 未重建                                                                      | 门 1 检测到 TTS 音频 hash 与 timing 不匹配 → 拒绝复用旧 timing → 要求重做 TTS        | 如果 TTS 引擎不可用则硬失败                                    |
| 10  | text-align.py 产出空词或部分词                                                                    | 门 1 检测到空 segments → 硬失败                                                      | 需区分"scene 无 voiceover"（合法）和"对齐失败"（错误）         |
| 11  | Remotion 和 FFmpeg 两条渲染路径行为差异                                                           | 门 1 在两条路径前执行；门 2 在两条路径后执行                                         | 需测试两条路径的 canonical-text 一致性                         |
| 12  | 修复后旧成片未替换                                                                                | 原子写入规则保证替换；门 2 重新验证新成片                                            | 需确保 burnSubtitles 后旧文件被清理                            |
| 13  | pipeline-status.json 写入中断                                                                     | 原子写入（先写临时文件再 rename）                                                    | 需实现原子写入                                                 |
| 14  | pipeline-profile.json 含未知字段                                                                  | 忽略未知字段，用默认值填充已知缺失                                                   | 需 JSON schema 校验                                            |

## 8. Next Steps

1. **验证现状与基线** — 使用包含专有名词、缩写、数字及 scene-data 重跑的 fixture，证明当前缺口、记录预期诊断并确认修复基线
2. **Grill with Docs** — 用 `grill-with-docs` skill 审视方案
3. **To Spec** — 合成 spec（含 Scenario Matrix）
4. **To Tickets** — 拆分为 tracer-bullet tickets
5. **TDD Implement** — 逐 ticket 实施

## 9. References

- `lovstudio/media-creator-skill` — GitHub: https://github.com/lovstudio/media-creator-skill, SKILL.md v0.9.1, MIT, accessed 2026-08-26
- `lovstudio/media-creator-skill` references/ — 12 个参考文件（audio-mix.md、cover-and-title.md、delivery-contract.md、edit-manifest.md、media-workflow.md、pip-research.md、project-workspace.md、series-template.md、skill-card-standard.md、skill-composition.md、user-profile.md）
- `docs/content-pipeline.md` — 我们的管线文档
- `scripts/short-video/lib/tts/post-process.mjs` — `runWhisperAlignment()` 实现（第 235 行）
- `scripts/short-video/lib/verify-retry.mjs` — 现有 AIL 循环实现
- `scripts/short-video/lib/verify-subtitles.mjs` — 现有字幕验证，`compareWordSequence()` 第 88 行
- `scripts/short-video/main.mjs` — 第 453-457 行 `subtitle-alignment` repair 返回 `success: false`
- `scripts/short-video/lib/post-process.mjs` — `burnSubtitles()` 第 28 行
- `scripts/short-video/lib/render-remotion.mjs` — Remotion 路径 post-process 第 158-166 行
- `scripts/short-video/lib/assemble.mjs` — FFmpeg 路径 burn-in 第 102-107 行
