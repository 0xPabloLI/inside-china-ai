# Agent 驱动视频编辑自动化 — 调研报告

> 调研日期：2026-08-11
> 触发：用户询问 OpenCut 可否 agent 驱动后，进一步问 Remotion 及其他方案如何增强现有管线

## 1. 你现有的管线 vs 行业最佳实践

### 1.1 你的管线架构（当前）

```
scene-data.mjs → HTML 模板 → Playwright 录屏 WebM → FFmpeg 拼接 → TTS 音频 → wav2vec2 对齐 → ASS 字幕烧录 → MP4
```

**核心组件**：
- **渲染**：Playwright headless 录制 CSS 动画 → WebM（`record-scenes.mjs`）
- **TTS**：4 级优先级链（CosyVoice 3 → Qwen3-TTS → edge-tts → macOS say）
- **时间线**：帧级精确（`timeline.mjs`，120,000 ticks/sec）
- **字幕**：wav2vec2 强制对齐 → ASS 格式 → FFmpeg 烧录
- **组装**：FFmpeg concat + voiceover master track
- **验证**：`verify-video.mjs` + `verify-scene-dom.mjs` DOM 几何检查
- **批量**：`batch-main.mjs` 多场景并行

### 1.2 行业 Agent 视频方案对比

| 项目 | Stars | 核心思路 | 渲染引擎 | Agent 集成 | 与你的关系 |
|------|-------|---------|---------|-----------|-----------|
| **Remotion** | 56k | React 代码 = 视频源码 | React → Chromium → MP4 | 12 个官方 Agent Skills，Claude Code/Codex 原生支持 | **直接可替换 Playwright 录屏** |
| **OpenMontage** | 46.7k | 全流程 Agent 视频生产系统 | Remotion + HyperFrames | 12 条管线，700+ skill 文件 | **架构参考**，pipeline 模式几乎一致 |
| **oh-my-cassette** | 140 | Chat-to-Edit 蒙太奇 | Cassette 云端 + FFmpeg | Claude Code/Codex/OpenCode MCP | 后期剪辑思路可借鉴 |
| **kinocut** | 105 | Guardrailed MCP 视频编辑 | FFmpeg | 194 MCP tools，Video Receipts | **MCP 封装模式参考** |
| **video-podcast-maker** | 1.5k | Topic → 4K 视频 | Remotion | Claude Code/Codex skill | **最接近你的管线**，用 Remotion 替代了录屏 |
| **Claude-Code-Video-Toolkit** | 66 | Claude Code 视频工具集 | Remotion + Manim + FFmpeg | Skills + MCP | 工具集合参考 |
| **VideoDB Skills** | 117 | 服务端视频理解+编辑 | VideoDB 云端 | Claude Code/Cursor skill | 视频搜索/理解能力 |
| **ComfyUI-MCP** | 545 | AI 图像/视频生成控制面 | ComfyUI | 178 MCP tools，36 AI skills | AI 生成素材接入 |

## 2. Remotion：最值得引入的升级

### 2.1 为什么 Remotion 适合你的管线

你当前的渲染路径是 **HTML 模板 → Playwright 录屏 → WebM → FFmpeg 拼接**。这条路径有三个结构性问题：

| 问题 | 根因 | Remotion 如何解决 |
|------|------|-----------------|
| **录屏帧率不稳定** | Playwright `waitForTimeout` 不保证帧率，WebM 帧时间戳可能有抖动 | Remotion 用 `useCurrentFrame()` 逐帧渲染，每帧精确对齐 |
| **动画时序难控** | CSS animation 时间线与 TTS 音频不同步，靠 buffer 0.5s 补偿 | Remotion 的 `<Sequence>` + `<Audio>` 组件在帧级别同步音视频 |
| **DOM 验证脆弱** | 需要 `verify-scene-dom.mjs` 检查安全区/溢出，因为 CSS 布局在运行时才确定 | Remotion 用绝对定位 + `interpolate()` 声明式动画，布局在代码层确定 |

### 2.2 Remotion 官方 Agent 生态

Remotion 已发布 **12 个官方 Agent Skills**（`npx skills add remotion-dev/skills`）：

| Skill | 用途 | 对你的价值 |
|-------|------|-----------|
| `/remotion-best-practices` | 总体最佳实践 | 入门 |
| `/remotion-create` | 创建新项目/composition | 初始化 |
| `/remotion-markup` | 写 Remotion React 标记的最佳实践 | **核心**：替代你的 `scenes.mjs` 模板 |
| `/remotion-studio` | 启动 Studio 预览 | 调试 |
| `/remotion-render` | 渲染为 MP4/still | **核心**：替代 Playwright 录屏 |
| `/remotion-captions` | 字幕指导 | 可替代 ASS 烧录 |
| `/remotion-maps` | 地图动画 | 如需地理可视化 |
| `/remotion-saas` | 产品架构指导 | 如需做 SaaS |
| `/remotion-interactivity` | Studio 可编辑性 | UI 编辑 |
| `/remotion-docs` | 文档搜索 | 查 API |
| `/remotion-upgrade` | 升级 | 维护 |
| `/remotion-multimedia` | 浏览器多媒体处理 | 元数据提取 |

> **注意**：Remotion 的 MCP 已标记为 deprecated（`/docs/ai/mcp`），官方转向 Agent Skills 路线。这意味着 Remotion 的策略是让 Agent 直接写 React 代码，而不是通过 MCP 间接操作。

### 2.3 Remotion 渲染方式对比

| 渲染方式 | 适用场景 | 你的管线适配 |
|---------|---------|-------------|
| **本地 Node.js SSR** | 开发/单视频渲染 | ✅ 直接替代 Playwright |
| **Lambda** | 批量/云端渲染 | 批量生产时可用 |
| **Client-side** | 浏览器内预览 | 网站端预览 |
| **Studio** | 可视化编辑/调试 | 替代 DOM 验证 |

### 2.4 迁移路径（如果要做）

```
当前：scene-data.mjs → scenes.mjs(HTML) → Playwright → WebM → FFmpeg
目标：scene-data.mjs → Remotion Composition(React) → renderMediaOnLambda/SSR → MP4
```

**保留不变**：
- `scene-data.mjs` 数据结构（scene/voiceover/duration）
- TTS 管线（CosyVoice/Qwen/edge-tts/say）
- `timeline.mjs` 帧级时间线
- `verify-video.mjs` 视频规格验证
- `assemble.mjs` 的音频 master track 逻辑

**替换**：
- `scenes.mjs`（HTML 模板）→ Remotion Composition（React 组件）
- `record-scenes.mjs`（Playwright 录屏）→ `renderMedia()` SSR 渲染
- `verify-scene-dom.mjs`（DOM 几何检查）→ Remotion Studio 预览 + 类型检查
- ASS 字幕烧录 → Remotion `<Captions>` 组件（或保留 FFmpeg 烧录，二选一）

**新增**：
- Remotion Agent Skills（让 CatPaw 直接写 Remotion 代码）
- 可选：Lambda 渲染（批量生产时加速）

## 3. 其他可引入的方案

### 3.1 OpenMontage 架构模式（参考，不直接引入）

OpenMontage 的管线流程与你几乎一致，但更成熟：

```
research → proposal → script → scene_plan → assets → edit → compose
```

对应你的：
```
素材 → MRL-1 自审 → 文章 → scene-data → TTS+录制 → 拼接 → 验证
```

**可借鉴的模式**：

1. **Backlot Living Storyboard** — 可视化看板，Agent 执行时实时更新场景卡片、资产状态、成本。你的 MRL 报告是文本形式，可以考虑做可视化版本。

2. **Reference-driven creation** — 粘贴一个参考视频，Agent 分析其 transcript/pacing/scenes/style 后生成差异化的生产计划。你的管线目前是"从零写 scene-data"，可以加"从参考视频生成 scene-data"的入口。

3. **Provider scored selector** — 7 维评分（task fit, quality, control, reliability, cost, latency, continuity）自动选最优 provider。你的 TTS 4 级 fallback 是硬编码优先级，可以改为动态评分。

4. **Delivery promise enforcement** — 渲染前验证"不会产出幻灯片效果"。你的 `verify-scene-dom.mjs` 是局部检查，可以升级为全局质量门。

### 3.2 kinocut 的 Video Receipts 模式

kinocut 的核心创新是 **Video Receipt**：每次编辑操作都生成一个可追溯的收据（操作类型、参数、输入/输出路径、校验和），形成可审计的操作链。

**你的管线可以引入**：
- 在 `assemble.mjs` 的每步操作中记录 Receipt（已有 console.log，升级为结构化 JSON）
- HITL 审阅时附带 Receipt 链，让用户知道视频是怎么组装出来的
- 便于回溯："为什么这个场景的字幕偏移了 200ms？"

### 3.3 VideoDB Skills — 视频理解能力

VideoDB 提供 **服务端视频理解**：语音识别、场景检测、物体识别、OCR、品牌识别，然后索引为可搜索的语义时间线。

**适用场景**：
- **HITL 后的自动质检**：不需要人工逐帧看，Agent 可以问"视频里有没有出现 logo？" "第 15 秒的画面是什么？"
- **从成品视频反向生成 scene-data**：给一个参考视频，VideoDB 提取语义时间线 → 自动生成 scene-data
- **Analytics 闭环**：TikTok 发布后，用 VideoDB 分析竞品视频的节奏/场景结构

**注意**：VideoDB 是云服务（$20 free credits），非本地。如果你需要完全本地，可以用 Whisper + CLIP + SceneDetect 组合替代。

### 3.4 FFmpeg MCP Server — 让 Agent 直接剪辑

目前有多个 FFmpeg MCP server 实现：

| 项目 | Stars | 特点 | 适用场景 |
|------|-------|------|---------|
| video-creator/ffmpeg-mcp | 142 | 对话式本地视频搜索/裁剪/拼接/播放 | 快速剪辑操作 |
| egoist/ffmpeg-mcp | 120 | 简洁的 FFmpeg MCP | 轻量集成 |
| kinocut | 105 | 194 tools + Video Receipts + 质量门 | 最完整的 agent 视频编辑 |
| misbahsy/video-audio-mcp | 83 | 基础音视频编辑 | 简单操作 |

**你的管线已经直接调 FFmpeg**（`assemble.mjs`、`post-process.mjs`），所以 MCP server 的价值不在于包装 FFmpeg，而在于：
- 让 **Agent 可以在对话中动态调整**视频（"把第 3 个场景缩短 2 秒" → MCP 调 trim → 重新拼接）
- 不需要每次都跑完整管线，支持 **增量编辑**

### 3.5 ComfyUI-MCP — AI 生成素材接入

ComfyUI-MCP（545 ⭐）提供 178 个 MCP tools 控制 ComfyUI，可以生成图像、视频、音频。

**适用场景**：
- 你的 scene-data 中如果需要 AI 生成背景图/B-roll 素材，可以通过 ComfyUI-MCP 让 Agent 自动生成
- 数字人画面（你在调研的 Hallo2/LivePortrait）可以作为 ComfyUI 工作流接入

## 4. 推荐行动方案（按优先级）

### P0：Remotion 替代 Playwright 录屏（最高价值）

**收益**：
- 消除录屏帧率不稳定问题
- 消除 DOM 验证脆弱性
- 获得 Studio 可视化预览
- 获得官方 Agent Skills 支持（Agent 直接写 Remotion 代码）
- 获得批量 Lambda 渲染能力

**成本**：
- 需要 rewrite `scenes.mjs` → Remotion Composition
- 需要 rewrite `record-scenes.mjs` → `renderMedia()`
- Remotion 商业许可（年收入 >$50K 需付费，个人/小项目免费）

**风险**：
- Remotion 的 React 渲染与你的 CSS 动画风格不完全对应，需要重新设计动画系统
- 字幕烧录路径变化（可以从 FFmpeg 烧录平滑迁移到 `<Captions>` 组件）

### P1：引入 Remotion Agent Skills

```bash
npx skills add remotion-dev/skills
```

安装后 CatPaw 可以直接写 Remotion 代码，不需要你手动查 API。

### P2：增量编辑能力（FFmpeg MCP 或自建）

让 Agent 可以在 HITL 阶段做增量调整（"把第 3 场景缩短 2 秒"、"字幕下移 50px"），而不是每次都跑完整管线。

选项：
- **轻量**：用你现有的 `render-only.mjs` + 参数化 FFmpeg 命令
- **中量**：封装几个核心操作（trim/concat/overlay/subtitle）为 MCP tools
- **重量**：引入 kinocut 作为 MCP server

### P3：VideoDB 或本地等价物（视频理解）

用于 HITL 自动质检和参考视频分析。

### P4：OpenMontage 架构参考（不引入代码，借鉴模式）

- Backlot 可视化看板
- Reference-driven creation
- Provider scored selector

## 5. 不推荐引入的

| 方案 | 原因 |
|------|------|
| OpenCut | 重写中，无 API/MCP，至少 6-12 个月才可用 |
| oh-my-cassette | 依赖 Cassette 云服务，核心价值在蒙太奇而非程序化生成 |
| Adobe Premiere MCP | 需要 Premiere 许可证，你的管线不需要 NLE |
| Manim | 适合数学/科学动画，与你的新闻简报风格不匹配 |

## 6. Design Decisions & References

- **Remotion 官方文档**：https://www.remotion.dev/docs/ai/skills
- **Remotion GitHub**：https://github.com/remotion-dev/remotion (56k ⭐)
- **OpenMontage**：https://github.com/calesthio/OpenMontage (46.7k ⭐)
- **video-podcast-maker**：https://github.com/Agents365-ai/video-podcast-maker (1.5k ⭐) — 最接近你管线的 Remotion 实现
- **kinocut**：https://github.com/KyaniteLabs/kinocut (105 ⭐) — Video Receipts 模式
- **VideoDB Skills**：https://github.com/video-db/skills (117 ⭐) — 视频理解
- **ComfyUI-MCP**：https://github.com/artokun/comfyui-mcp (545 ⭐) — AI 素材生成
- **Claude-Code-Video-Toolkit**：https://github.com/wilwaldon/Claude-Code-Video-Toolkit (66 ⭐) — 工具集合参考
