# Spec: Remotion 渲染引擎增量迁移

> 状态：**Spec 完成，冲突 review 完成，可进入 tickets**
> 创建：2026-08-11
> Grill 轮次：Round 1-5（全部完成，27 个决策）
> 冲突 review：另一个 session 的 media-bg commit `0156089` 已评估，无冲突

## 1. 目标

将视频管线的渲染路径从 Playwright 录屏（HTML → WebM → FFmpeg）迁移到 Remotion（React → 逐帧渲染 → MP4），采用增量迁移策略。同时引入音频响度标准化和场景转场优化提升视频质量。

## 2. 决策记录（Grill 结论）

| ID | 决策 | 选择 | 理由 |
|----|------|------|------|
| Q1 | 迁移范围 | 增量迁移 | 先验证 Remotion 路径跑通，再逐个迁移现有 content |
| Q2 | 项目位置 | `scripts/short-video/remotion/` 子目录 | 离 scene-data/audio/assets 最近 |
| Q3 | 许可证 | 免费（年收入 < $50K） | 个人项目 |
| Q4 | 向后兼容 | 必须保持 Playwright 可用 | 迁移期间 fallback |
| Q5 | 渲染基础设施 | 先本地 SSR，后 Lambda | 开发用本地，批量用 Lambda |
| Q6 | scene-data.mjs | 直接复用 | 数据与渲染引擎无关 |
| Q7 | 替换步骤 | Step 3 (录屏) + Step 5 (拼接) | Remotion 输出完整 MP4，FFmpeg 只做字幕+BGM |
| Q8 | 动画映射 | 抽象动画层（React 组件） | 12 种 keyframe 逐个封装为 `<SlideUp>` 等 |
| Q9 | brand-system | 全部用 React 组件替代 | `safe-zones.mjs` 直接 import |
| Q10 | 第一个迁移 | `_test-fixtures/hook-standard` | 3 场景，非生产，用共享模板 |
| Q11 | 音频处理 | Remotion `<Audio>` 放 TTS | 帧级排布 = sample-exact 静音 |
| Q12 | timeline.mjs | 直接 import | 纯 JS 函数，无 fs 依赖 |
| Q13 | safe-zones.mjs | 直接 import | 纯 JS 常量 |
| Q14 | 语言 | 混合：组件 .tsx，脚本 .mjs | 与 Remotion 官方一致，管线脚本一致 |
| Q15 | props 传入 | `renderMedia({ props })` | 官方推荐方式 |
| Q16 | 转场 | @remotion/transitions | hook 硬切，其他 fade |
| Q17 | 字幕烧录 | 提取为独立函数 | `burnSubtitles()` + `mixBgm()` 共用 |
| Q18 | 渲染调用 | 子进程 CLI `npx remotion render` | 隔离依赖，退出码清晰 |
| Q19 | 响度标准化 | FFmpeg 后处理 `loudnorm` | EBU R128 -16 LUFS |
| Q20 | 项目结构 | 统一 Remotion 项目 + props 切换 | scene-data 统一结构 |
| Q21 | Brand SVG assets | symlink `remotion/public/assets` → `../../assets` | 单一数据源，Remotion `staticFile()` 可用 |
| Q22 | 测试策略 | 两者结合 | 动画组件用 snapshot，管线用输出级 verify-video.mjs |
| Q23 | node_modules | 自动安装 | `render-remotion.mjs` 检测不存在时 `npm install` |
| Q24 | loudnorm 范围 | 两条路径都加 | 与渲染引擎无关，所有视频统一 -16 LUFS |
| Q25 | glitchFlash 等多段 keyframe | `interpolate()` 多段映射 | `outputRange` 数组一行搞定 |
| Q26 | dom-config.mjs | Remotion 路径忽略 | 布局在 React 代码确定，无运行时漂移 |
| Q27 | 首帧 hook 内容 | 组件内部首帧 opacity=1 | background 全 opacity=1，focal 元素 scaleIn |

## 3. 架构设计

### 3.1 管线流程对比

```
当前 (Playwright):
  scene-data.mjs → scenes.mjs (HTML) → Playwright 录屏 WebM → FFmpeg concat → master track → ASS 烧录 → BGM 混音 → MP4

新增 (Remotion):
  scene-data.mjs → Remotion Composition (React) → renderMedia → MP4 → burnSubtitles → mixBgm → loudnorm → final MP4
```

### 3.2 路径检测

```javascript
// main.mjs 中的分支逻辑
const remotionDir = join(contentPath, "remotion");
const useRemotion = existsSync(remotionDir);

if (useRemotion) {
  // Remotion 路径
  const result = await renderRemotion({ scenes, audioPaths, durations, outputDir, pipelineId });
  // result.path = remotion-render.mp4 (视频+音频, 无字幕)
  // 后处理：burnSubtitles → mixBgm → loudnorm
} else {
  // Playwright 路径（现有逻辑不动）
  const videoResults = await recordScenes(sceneData, videoDir);
  const result = assembleVideo(videoResults, outputDir, ...);
}
```

### 3.3 Remotion 项目结构

```
scripts/short-video/remotion/
├── package.json              # @remotion/cli, @remotion/renderer, @remotion/transitions, react, react-dom
├── tsconfig.json
├── remotion.config.ts        # 渲染配置
├── public/
│   └── assets → ../../assets # symlink 到 scripts/short-video/assets (Q21)
└── src/
    ├── Root.tsx              # registerRoot — 注册所有 Composition
    ├── ShortVideo.tsx        # 主 Composition — 接收 props, 按 visualType 分发场景
    ├── types.ts              # SceneData, RenderProps, MediaField 类型定义
    ├── scenes/
    │   ├── HookScene.tsx     # visualType: "hook" — 忽略 media 字段
    │   ├── CtaScene.tsx      # visualType: "cta" — 忽略 media 字段
    │   ├── TimelineScene.tsx # visualType: "timeline" (后续迁移)
    │   ├── ContrastScene.tsx # visualType: "contrast" (后续迁移)
    │   └── ...               # 其他 visualType
    └── components/
        ├── MediaBackground.tsx # <Img>/<Video> + 5 animation presets (Q28-media)
        ├── BrandBar.tsx       # 品牌栏
        ├── BreakingBadge.tsx  # BREAKING 徽章
        ├── StatCard.tsx       # 统计卡片
        ├── GridBg.tsx         # 网格背景
        ├── Glow.tsx           # 辉光效果
        ├── Scanlines.tsx      # 扫描线
        ├── ScanSweep.tsx      # 扫描动画
        ├── Watermark.tsx      # 水印
        └── animations/        # 12 种动画组件
            ├── FadeIn.tsx
            ├── SlideUp.tsx
            ├── SlideLeft.tsx
            ├── ScaleIn.tsx
            ├── StampIn.tsx
            ├── SlideDown.tsx
            ├── PulseDot.tsx
            ├── NumberPulse.tsx
            └── ...
```

### 3.4 Media Background 支持（来自另一个 session 的 commit `0156089`）

另一个 session 已实现 `lib/media-bg.mjs`，为 scene-data 加入了 `media` 字段：

```javascript
media: {
  type: "image" | "video",       // 媒体类型
  path: "assets/xxx.jpg",         // 相对于 content 目录的路径
  source: "Unitree official",     // 出处（可选，用于 attribution）
  animation: "fade",             // 预设（可选，默认 "fade"）
  overlay: 0.7                    // 遮罩透明度 0-1（可选，默认 0.7）
}
```

**5 种动画预设 → Remotion `interpolate()` 映射**：

| 预设 | CSS 实现（当前） | Remotion 实现 |
|------|-----------------|---------------|
| `fade` | opacity 0→1 (0.8s in), 1→0 (0.5s out) | `interpolate(frame, [0, 0.8*fps, (dur-0.5)*fps, dur*fps], [0, 1, 1, 0])` |
| `ken-burns` | fade + scale 1.0→1.08 全程 | 同上 + `interpolate(frame, [0, dur*fps], [1.0, 1.08])` for scale |
| `slide` | translateX(100%→0 in), 0→-100% out | `interpolate(frame, ..., [100, 0, 0, -100])` for x |
| `zoom` | scale 1.2→1.0 in, 1.0→1.1 out | `interpolate(frame, ..., [1.2, 1.0, 1.0, 1.1])` for scale |
| `none` | 无动画 | 无 interpolate |

**渲染规则**：
- Hook 场景 和 CTA 场景忽略 `media` 字段
- 其他场景：有 `media` → `<MediaBackground>` 组件渲染背景层 + 半透明遮罩 + 文字层；无 `media` → 纯 React 背景
- 文件不存在 → fallback 到无背景（warn，不报错）
- `ken-burns` 对 `type: "video"` 无效 → 自动降级为 `fade`
- 路径解析：Remotion 用 `staticFile()` 替代 `resolveMediaPath()` 的 `file://` URL

**Remotion 组件**：`<MediaBackground media={scene.media} duration={duration} contentDir={contentDir} />`

### 3.5 后处理提取

新建 `lib/post-process.mjs`（或扩展已有），提取两个纯函数：

```javascript
// lib/post-process.mjs
export function burnSubtitles(videoPath, assPath, outputPath) { ... }
export function mixBgm(videoPath, bgmPath, outputPath, volume = 0.12) { ... }
export function normalizeLoudness(videoPath, outputPath, target = -16) { ... }
```

`assemble.mjs` 的字幕烧录和 BGM 混音段改为调用这些函数（Playwright 路径也受益）。

### 3.6 CSS 动画 → React 组件映射

| CSS keyframe | React 组件 | 转换公式 |
|--------------|-----------|---------|
| `fadeIn 0.4s ease-out delay` | `<FadeIn delay={delay}>` | `opacity: interpolate(frame, [d*fps, d*fps+12], [0, 1], {extrapolateRight: 'clamp'})` |
| `slideUp 0.4s ease-out 0.3s` | `<SlideUp delay={0.3}>` | `opacity + translateY: interpolate(frame, [9, 21], [0,1], [30,0])` |
| `slideLeft 0.5s ease-out` | `<SlideLeft>` | `opacity + translateX: [-50, 0]` |
| `scaleIn 0.6s cubic-bezier(0.16,1,0.3,1)` | `<ScaleIn easing={Easing.bezier(0.16,1,0.3,1)}>` | `opacity + scale: [0.7, 1]` |
| `stampIn 0.5s ease-out` | `<StampIn>` | `opacity + scale: [2, 1]` |
| `numberPulse 2s infinite` | `<NumberPulse>` | `textShadow: interpolate(frame % 60, ...)` |
| `scanSweep Ds linear infinite` | `<ScanSweep duration={D}>` | `top: interpolate(frame % (D*fps), [0, D*fps], [0, 1920])` |

帧转换公式：`delay_seconds * FPS = delay_frames`（FPS=30，0.3s = 9 帧）

**多段 keyframe（如 `glitchFlash`）**：用 `interpolate()` 的 `outputRange` 数组：
```tsx
// glitchFlash: 0%→10%→20%→30%→40%→100% opacity 变化
opacity: interpolate(frame, [0, 3, 6, 9, 12, 15], [0, 1, 0, 1, 0, 0], { extrapolateRight: 'clamp' })
```

### 3.7 视频质量优化

| 优化 | 实现方式 | 加在哪一步 |
|------|---------|-----------|
| 场景转场 | `@remotion/transitions` 的 `<TransitionSeries>` | Remotion Composition 内 |
| 弹簧动画 | `Easing.spring({ damping: 200 })` | 动画组件内 |
| 音频响度 | FFmpeg `loudnorm=I=-16:TP=-1.5:LRA=11` | 后处理 |
| 渐入精度 | `interpolate(frame, [0, 15], [0, 1], {extrapolateRight: 'clamp'})` | 动画组件内 |

## 4. Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `scripts/short-video/main.mjs` | 加 Remotion 路径检测分支 | **Medium** | 只追加 `if (useRemotion)` 分支，不修改现有 Playwright 逻辑。验证：无 `remotion/` 目录时行为不变 |
| `scripts/short-video/render-only.mjs` | 同上 | **Medium** | 同 main.mjs |
| `scripts/short-video/lib/assemble.mjs` | 提取 burnSubtitles/mixBgm/normalizeLoudness 为独立函数 | **Medium** | 重构现有逻辑为函数调用，行为不变。验证：Playwright 路径输出一致 |

**另一个 session 的改动（commit `0156089`，已合并）— 冲突评估**：

| 文件 | 另一个 session 改了什么 | 与本 spec 冲突？ | 说明 |
|------|------------------------|-----------------|------|
| `lib/media-bg.mjs` (NEW) | 332 行，media 背景支持 | ❌ 无冲突 | Remotion `<MediaBackground>` 组件消费同一 `media` 数据契约 |
| `lib/record-scenes.mjs` | +22 行，video readyState wait | ❌ 无冲突 | Playwright fallback 路径，不改 |
| `verify-video.mjs` | +29 行，media checks | ❌ 无冲突 | 对 Remotion 输出同样适用 |
| `lib/tts/post-process.mjs` | loudnorm (TTS 级) + alignment fallback | ❌ 无冲突 | TTS 级 loudnorm 管语音，视频级 loudnorm 管最终混合，两者互补 |
| `lib/tts/registry.mjs` | CSM engine | ❌ 无冲突 | TTS 引擎注册，与渲染无关 |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | `main.mjs --content _test-fixtures/hook-standard`，content 下有 `remotion/` 目录 | 走 Remotion 路径，输出 3 场景 MP4 (1080×1920, 30fps) | 跨 step 契约 | verify-video.mjs 验证输出规格 |
| 2 | `main.mjs --content deepseek`，content 下无 `remotion/` 目录 | 走 Playwright 路径，与当前行为完全一致 | 向后兼容 | diff 输出文件，规格一致 |
| 3 | Remotion MP4 → FFmpeg ASS 烧录 | 字幕时间戳与 `sceneTimeline()` 一致 | 跨 step 契约 | verify-subtitles.mjs 验证 |
| 4 | Remotion MP4 → `--bgm` 混音 | BGM 12% 音量，即时开始，3s fade out | 跨 step 契约 | ffprobe 验证音轨 |
| 5 | TTS duration 变化 → Remotion props | `renderMedia()` props 反映实际 duration | 跨 step 契约 | props 日志 + ffprobe 时长对比 |
| 6 | `renderMedia()` 失败 | 报错退出，不产出半成品 | 失败/降级 | 子进程退出码检查 |
| 7 | `verify-video.mjs` 跑在 Remotion 输出 | 1080×1920, 30fps, 时长一致 | 跨 step 契约 | 已有验证逻辑 |
| 8 | `texts.stats` 为 `[]` | Remotion 不崩，空 stats 区域留白 | Null/Empty | 组件条件渲染 |
| 9 | `texts.bigNumber` 为 `undefined` | Remotion 跳过 bigNumber 区域 | Null/Empty | 组件条件渲染 |
| 10 | 12 种 CSS keyframe 全有对应 React 组件 | 全覆盖，无遗漏 | 状态转换 | 逐个 keyframe 对照测试 |
| 11 | 同一 content 先 Playwright 再 Remotion | verify-video.mjs 结果一致（规格层面） | 渲染一致性 | 两次输出 ffprobe 对比 |
| 12 | `render-only.mjs` 走 Remotion | 跳过 TTS，从已有音频读 duration，渲染 Remotion | 跨 step 契约 | 与 main.mjs Remotion 路径输出对比 |
| 13 | loudnorm 后处理 | 输出响度 -16 LUFS ±1 | 数值精度 | ffmpeg loudnorm 双 pass 验证 |
| 14 | 转场：hook 场景硬切，其他 fade | hook 首帧有内容，其他场景 6 帧 fade in | 状态转换 | 逐帧检查 |
| 15 | scene 有 `media` 字段 (type=image) | `<MediaBackground>` 渲染图片背景 + 遮罩 + 文字 | 跨 step 契约 | 与 `lib/media-bg.mjs` 数据契约一致 |
| 16 | scene 有 `media` 字段 (type=video) | `<MediaBackground>` 用 `<Video>` 渲染视频背景 | 跨 step 契约 | Remotion `@remotion/media` |
| 17 | scene 有 `media` 但文件不存在 | fallback 到无背景，warn 不报错 | 失败/降级 | `existsSync` 检查 |
| 18 | `media.animation` = `ken-burns` + `type` = `video` | 自动降级为 `fade` | 状态转换 | 预设兼容性检查 |
| 19 | Hook/CTA 场景有 `media` 字段 | 忽略，不渲染 media 背景 | 状态转换 | 组件 visualType 检查 |
| 20 | `inDuration + outDuration > duration` | 按比例缩放动画时长 | 数值精度 | 与 `media-bg.mjs` 逻辑一致 |
| 21 | Brand SVG assets via symlink | `staticFile('assets/logos/deepseek.svg')` 正确解析 | 跨 step 契约 | symlink 验证 |
| 22 | `remotion/node_modules` 不存在 | `render-remotion.mjs` 自动 `npm install` | 失败/降级 | 首次运行检测 |

## 5. 依赖

- `remotion` — 核心
- `@remotion/cli` — CLI 渲染
- `@remotion/renderer` — Node.js 渲染 API
- `@remotion/transitions` — 转场
- `react` / `react-dom` — Remotion 基于 React

## 6. 不在本次范围

- Lambda 批量渲染（后续 P5）
- Remotion 字幕替代 ASS（后续）
- 迁移 deepseek 及其他 content（后续，hook-standard 跑通后）
- 数字人视频集成（独立工作流）
