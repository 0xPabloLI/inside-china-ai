# Spec: 场景提取 + 共享视觉系统分离 + 基础设施迁移

## Problem Statement

短视频管线的 `generate-scenes.mjs` 是一个 1006 行的巨型文件，混合了：共享基础设施（CSS、SVG 资产、动画）、DeepSeek 专属场景模板（硬编码所有显示文字）、已废弃的字幕函数（`splitSubtitles`/`alignWithWhisper`/`buildSubtitleHTML` — 字幕已改用 FFmpeg ASS 烧录）、visualType 注册表。

这导致：

- 其他文章（如蒸馏系列）无法拥有自己的视觉设计，只能 fallback 到 DeepSeek 模板
- DeepSeek 模板里硬编码了 `$1.4B`、`LEAKED MEETING` 等文字，蒸馏视频跑出来显示的是 DeepSeek 的内容
- 基础设施文件（TTS、录制、拼接）散落在根目录，不符合 spec-pipeline-isolation.md 定义的目标架构
- `assemble.mjs` 硬编码输出文件名为 `deepseek-short.mp4`，所有管线产出都叫这个名字
- `generate-bgm.mjs` 把 BGM 写到全局 `output/audio/bgm.wav`，多管线并行会冲突

## Solution

将共享视觉系统与内容专属场景设计分离：

1. **`lib/base-styles.mjs`** — 共享视觉系统（色彩变量、背景层、动画 keyframes、品牌 SVG、UI 组件积木），所有视频共享，确保频道辨识度
2. **`content/*/scenes.mjs`** — 每篇文章自己写独特场景函数，调用 lib 积木，场景设计自由
3. **基础设施迁移** — TTS/录制/拼接/SRT/BGM 全部移到 `lib/`，修复 `__dirname` 路径引用
4. **删除死代码** — 废弃的字幕函数直接删除
5. **修复 bug** — 输出文件名用 `pipelineId`，BGM 写到隔离目录

## User Stories

1. 作为视频制作者，我希望每篇文章有独特的视觉场景设计，而不是套用同一个模板，这样观众不会觉得枯燥
2. 作为视频制作者，我希望所有视频共享统一的色彩/背景/字体/品牌水印，这样观众能一眼认出是同一个频道
3. 作为开发者，我希望 DeepSeek 的场景文字从 `scene.texts` 读取，而不是硬编码在模板里，这样修改文字不用改代码
4. 作为开发者，我希望基础设施文件在 `lib/` 目录，内容文件在 `content/` 目录，这样架构清晰
5. 作为开发者，我希望跑 `--content distillation/pt1` 时得到明确的"未实现"错误，而不是产出一个显示错误文字的视频
6. 作为开发者，我希望每个管线的输出文件名包含 `pipelineId`，这样多个视频不会互相覆盖
7. 作为开发者，我希望 BGM 文件生成在管线隔离目录内，这样多管线并行不冲突
8. 作为开发者，我希望删除废弃的字幕函数，这样代码库没有死代码
9. 作为视频制作者，我希望新增公司 logo 只需下载 SVG 到 `assets/logos/`，不用改任何代码
10. 作为开发者，我希望场景函数能调用可复用的 UI 组件（brandBar、statCard 等），这样不用每次从零写 CSS

## Implementation Decisions

### 1. 共享视觉系统 (`lib/base-styles.mjs`)

新建文件，导出：

- `baseStyles(duration)` — CSS reset + `:root` 变量（`--blue`, `--red`, `--amber`, `--green`, `--cyan`, `--white`, `--sec`, `--muted`）+ 背景层（grid-bg, glow-red, glow-blue, scanlines）+ keyframe 动画（fadeIn, slideUp, slideLeft, scaleIn, stampIn）+ `.scene` 容器规格（1080×1920）
- `BRAND_MARK_SVG` — 频道品牌 logo（从 `assets/china-ai-news-logo-vector.svg` 读取，XML 注释和声明已清理）
- `withWatermark(html)` — 在场景 HTML 闭合前注入 `.brand-watermark` div，返回处理后的 HTML
- 可复用 UI 组件函数：`brandBar(text)`, `breakingBadge(text)`, `statCard({num, unit, label, color})`, `fadeToBlack(duration)` — 可选积木，content 按需调用

### 2. DeepSeek 场景提取 (`content/deepseek/scenes.mjs`)

将 `generate-scenes.mjs` 中的 `s1`-`s12` 函数移入此文件，重命名为语义化名称（`scene1`-`scene12`），改为接收 `(scene, duration)` 参数。

- 硬编码文字从 `scene.texts` 读取（`scene.texts` 已有数据，补全缺失字段）
- DeepSeek 公司 logo 从 `assets/logos/deepseek.svg` 读取
- 导出 `generateScene(scene, duration)` — 按 `scene.id` 分发到对应函数，调用 `withWatermark()` 包装
- `visualType` 字段保留在 scene-data 中作为标签，不再作为代码分发依据

### 3. 字幕死代码删除

删除 `generate-scenes.mjs` 中的：

- `splitSubtitles(voiceover, duration, sceneId)` — 已被 `generate-srt.mjs` 替代
- `alignWithWhisper(segments, duration)` — 同上
- `buildSubtitleHTML(subtitles, duration)` — 同上
- `splitByWordCount(voiceover, duration)` — 同上
- `WHISPER_TIMING` 加载逻辑 — 同上
- `.subtitle-bar` CSS — 同上

### 4. 基础设施迁移到 `lib/`

| 原路径              | 新路径                  | `__dirname` 修复                                            |
| ------------------- | ----------------------- | ----------------------------------------------------------- |
| `generate-tts.mjs`  | `lib/generate-tts.mjs`  | 8 处：`join(__dirname, "x")` → `join(__dirname, "..", "x")` |
| `assemble.mjs`      | `lib/assemble.mjs`      | 无（不用 `__dirname`）                                      |
| `generate-srt.mjs`  | `lib/generate-srt.mjs`  | 无                                                          |
| `record-scenes.mjs` | `lib/record-scenes.mjs` | 无                                                          |
| `generate-bgm.mjs`  | `lib/generate-bgm.mjs`  | 1 处 + 修复输出路径                                         |

### 5. `main.mjs` import 路径更新

```javascript
// 旧
import { generateTTS } from "./generate-tts.mjs";
import { recordScenes } from "./record-scenes.mjs";
import { assembleVideo } from "./assemble.mjs";
import { generateBGM } from "./generate-bgm.mjs";
import { generateSRT } from "./generate-srt.mjs";

// 新
import { generateTTS } from "./lib/generate-tts.mjs";
import { recordScenes } from "./lib/record-scenes.mjs";
import { assembleVideo } from "./lib/assemble.mjs";
import { generateBGM } from "./lib/generate-bgm.mjs";
import { generateSRT } from "./lib/generate-srt.mjs";
```

### 6. `assemble.mjs` 输出文件名修复

```javascript
// 旧
export function assembleVideo(scenes, outputDir, bgmPath = null, srtPath = null) {
  const finalPath = join(outputDir, "deepseek-short.mp4");

// 新
export function assembleVideo(scenes, outputDir, pipelineId, bgmPath = null, srtPath = null) {
  const finalPath = join(outputDir, `${pipelineId}-short.mp4`);
```

`main.mjs` 调用处传入 `meta.pipelineId`。

### 7. `generate-bgm.mjs` 输出路径修复

```javascript
// 旧 — 写到全局 output/audio/bgm.wav
const audioDir = join(__dirname, "output", "audio");

// 新 — 接收 outputDir 参数，写到管线隔离目录
export function generateBGM(duration, outputDir) {
  const audioDir = join(outputDir, "audio");
```

`main.mjs` 调用处传入 `outputDir`。

### 8. 蒸馏 pt1 stub

`content/distillation/pt1/scenes.mjs` 改为：

```javascript
// TODO: Create distillation-specific visual scenes (Task 3)
throw new Error("Distillation pt1 scenes not yet implemented.");
```

### 9. 公司 logo 目录

`assets/deepseek-logo.svg` → `assets/logos/deepseek.svg`（文件移动）

### 10. 删除 `generate-scenes.mjs`

所有内容搬走后删除此文件。

### 11. `content/deepseek/scene-data.mjs` 补全 `texts` 字段

当前部分场景的 `texts` 字段不完整（只有少量字段，但模板渲染了更多文字）。补全所有场景的 `texts`，使模板函数能完全从 `scene.texts` 读取显示文字。

## Testing Decisions

### 测试接缝（Seams）

**主接缝：场景生成输出** — 测试 `generateScene(scene, duration)` 返回的 HTML 包含预期结构元素。这是最高价值测试点，因为：

- 验证了场景函数正确导出和分发
- 验证了 `scene.texts` 数据被正确消费
- 验证了共享视觉系统被正确引用
- 验证了品牌水印被注入

**次接缝：路径解析** — 测试迁移后的 infra 文件能正确解析资产/脚本路径。通过 import 模块后检查引用的文件是否存在。

**集成验证：完整管线运行** — `node main.mjs --content deepseek --bgm` 端到端跑通，产出视频文件。这不是单元测试，而是运行时验证。

### 测试模块

| 模块                                  | 测试内容                                                                                                             | 类型 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---- |
| `lib/base-styles.mjs`                 | `baseStyles()` 返回含 CSS 变量和 keyframes 的字符串；`withWatermark()` 注入 watermark div；UI 组件返回正确 HTML 结构 | 单元 |
| `content/deepseek/scenes.mjs`         | `generateScene(scene, duration)` 对每个 scene 返回有效 HTML；HTML 含品牌水印、CSS 变量引用、`scene.texts` 中的文字   | 单元 |
| `content/distillation/pt1/scenes.mjs` | 调用 `generateScene` 抛出明确错误                                                                                    | 单元 |
| `lib/assemble.mjs`                    | `assembleVideo` 使用 `pipelineId` 命名输出文件（mock exec）                                                          | 单元 |
| 路径解析                              | `lib/generate-tts.mjs` 引用的 `f5_mlx_batch_tts.py`、`voice-sample-24k.wav`、`text-align.py` 路径存在                | 单元 |
| `lib/generate-bgm.mjs`                | `generateBGM` 使用传入的 `outputDir` 而非硬编码路径（mock exec）                                                     | 单元 |

### 测试风格

- 测试外部行为（HTML 输出结构），不测试实现细节（CSS 具体值）
- 使用现有的测试模式（参考 `scripts/short-video/lib/` 下已有的 `*.test.mjs` 或 `*.spec.mjs`）
- 优先使用 Node.js 内置 `assert` 或项目已有测试框架

## Out of Scope

- Task 3: 蒸馏系列专用视觉模板（下一 session）
- Task 5: `verify-subtitles.mjs` 自动集成
- Task 6: 字幕同步自动化测试
- `scene.texts` 的完整 schema 文档化（随使用迭代沉淀）
- Python 脚本（`f5_mlx_batch_tts.py`、`text-align.py`）的位置不变

## Further Notes

- 品牌水印注入从 `generateSceneHTML` 迁移到各 content 的 `generateScene`，通过 `withWatermark()` 调用
- `visualType` 字段在 scene-data 中保留作为人类阅读标签，不参与代码分发逻辑
- 共享视觉系统的术语：shared visual system（非"视觉 DNA"）
- 重构后需跑一次完整 DeepSeek 管线验证，确保 TTS → 录制 → 拼接 → 字幕烧录 → BGM 全链路正常

---

## Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件                                                     | 修改内容                                                                                     | 风险等级 | 评估                                                                                                                                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `generate-scenes.mjs`                                    | 删除整个文件（内容全部提取到其他位置）                                                       | High     | 核心文件删除。验证：DeepSeek pipeline 完整跑通产出视频。下游消费者：`main.mjs`（不再 import）、`content/*/scenes.mjs`（不再 re-export）。最坏后果：pipeline 报错无法运行。缓解：所有内容先搬走再删文件 |
| `content/deepseek/scenes.mjs`                            | 从 re-export 改为完整 s1-s12 场景函数                                                        | High     | 新实现替代旧逻辑。验证：HTML 输出与重构前对比。下游消费者：`main.mjs` 通过 `import` 调用。最坏后果：场景 HTML 不正确，视频视觉错误。缓解：逐场景对比重构前后 HTML                                      |
| `lib/base-styles.mjs`                                    | 新建 — 共享视觉系统                                                                          | Low      | 纯新建文件，不修改现有逻辑。验证：import 成功，函数返回预期值                                                                                                                                          |
| `main.mjs`                                               | 更新 5 个 import 路径 + 传 `pipelineId` 给 `assembleVideo` + 传 `outputDir` 给 `generateBGM` | Medium   | 入口文件修改。验证：pipeline 启动无 import 错误。下游消费者：无（main 是顶层入口）。最坏后果：pipeline 启动失败。缓解：import 路径修改是机械操作                                                       |
| `generate-tts.mjs` → `lib/`                              | 移动 + 8 处 `__dirname` 路径修复                                                             | Medium   | 路径引用修改。验证：TTS 能找到 Python 脚本和参考音频。下游消费者：`main.mjs`。最坏后果：TTS 报 "file not found"。缓解：路径修复是 `join(__dirname, "..", "x")` 机械模式                                |
| `assemble.mjs` → `lib/`                                  | 移动 + 输出文件名修复 + 新增 `pipelineId` 参数                                               | Medium   | 接口变更 + 移动。验证：输出文件名正确。下游消费者：`main.mjs`。最坏后果：输出文件名错误或 pipeline 报错。缓解：`pipelineId` 参数已在 `main.mjs` 可用                                                   |
| `generate-srt.mjs` → `lib/`                              | 移动                                                                                         | Low      | 无 `__dirname` 引用，无接口变更。验证：import 成功                                                                                                                                                     |
| `record-scenes.mjs` → `lib/`                             | 移动                                                                                         | Low      | 无 `__dirname` 引用，无接口变更。验证：import 成功                                                                                                                                                     |
| `generate-bgm.mjs` → `lib/`                              | 移动 + 1 处 `__dirname` 修复 + 输出路径修复                                                  | Medium   | 路径 + 接口变更（新增 `outputDir` 参数）。验证：BGM 写到管线隔离目录。下游消费者：`main.mjs`。最坏后果：BGM 写到错误位置。缓解：`outputDir` 已在 `main.mjs` 可用                                       |
| `content/distillation/pt1/scenes.mjs`                    | 从 re-export 改为 stub throw                                                                 | Low      | 当前已 broken（显示 DeepSeek 文字）。验证：调用时抛出明确错误                                                                                                                                          |
| `assets/deepseek-logo.svg` → `assets/logos/deepseek.svg` | 文件移动                                                                                     | Low      | 纯文件移动。验证：新路径可读取。下游消费者：`content/deepseek/scenes.mjs`                                                                                                                              |
| `content/deepseek/scene-data.mjs`                        | 补全 `texts` 字段                                                                            | Medium   | 数据 schema 变更。验证：模板函数能从 `texts` 读取所有显示文字。最坏后果：缺失字段导致 `undefined` 显示在视频中。缓解：缺失字段安全降级（不渲染该元素）                                                 |

### Section 2: Behavioral Scenarios

| #   | Scenario                          | Expected Behavior                                                        | Risk   | Mitigation                               |
| --- | --------------------------------- | ------------------------------------------------------------------------ | ------ | ---------------------------------------- |
| 1   | `--content deepseek` 完整管线运行 | 产出 `output/deepseek/deepseek-short.mp4`，含 TTS + 视觉 + 字幕 + BGM    | High   | 端到端运行验证                           |
| 2   | 每个 scene HTML 含品牌水印        | `withWatermark()` 注入 `.brand-watermark` div                            | Medium | 单元测试验证 HTML 包含 watermark         |
| 3   | 每个 scene HTML 引用共享 CSS 变量 | HTML 中含 `var(--blue)` 等，来自 `baseStyles()`                          | Medium | 单元测试验证 HTML 包含 `baseStyles` 输出 |
| 4   | `--content distillation/pt1`      | 抛出 `Error("Distillation pt1 scenes not yet implemented.")`             | Low    | 单元测试验证 stub 抛错                   |
| 5   | `assembleVideo` 输出文件名        | 文件名为 `{pipelineId}-short.mp4`，非硬编码 `deepseek-short.mp4`         | Medium | 单元测试 mock exec 验证文件名            |
| 6   | BGM 生成在管线隔离目录            | BGM 路径为 `output/{pipelineId}/audio/bgm.wav`                           | Medium | 单元测试 mock 验证路径参数               |
| 7   | TTS 找到 `f5_mlx_batch_tts.py`    | 脚本路径解析到 `scripts/short-video/f5_mlx_batch_tts.py`                 | High   | 路径存在性检查测试                       |
| 8   | TTS 找到 `voice-sample-24k.wav`   | 资产路径解析到 `scripts/short-video/assets/voice-sample-24k.wav`         | High   | 路径存在性检查测试                       |
| 9   | TTS 找到 `text-align.py`          | 脚本路径解析到 `scripts/short-video/text-align.py`                       | High   | 路径存在性检查测试                       |
| 10  | DeepSeek scene 1 含公司 logo      | HTML 包含 `deepseek-logo.svg` 的 SVG 内容                                | Medium | 单元测试验证 HTML 含 SVG                 |
| 11  | lib/ 中无字幕死代码               | `splitSubtitles`/`alignWithWhisper`/`buildSubtitleHTML` 不存在于任何文件 | Low    | grep 验证                                |
| 12  | 两个管线并行跑 BGM 不冲突         | 各自 `output/{pipelineId}/audio/bgm.wav` 独立                            | Medium | 验证 `generateBGM` 使用传入 `outputDir`  |
| 13  | scene.texts 缺失字段安全降级      | 缺失的 `texts` 字段不渲染对应元素，不显示 `undefined`                    | Medium | 单元测试验证缺失字段场景                 |
| 14  | `generate-scenes.mjs` 已删除      | 文件不存在，无 import 引用它                                             | Low    | grep 验证无残留 import                   |
| 15  | `main.mjs` import 路径正确        | 5 个 import 指向 `./lib/` 目录                                           | Medium | 启动时 import 失败会立即报错             |
