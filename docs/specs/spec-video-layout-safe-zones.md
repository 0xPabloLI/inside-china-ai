# Spec: 视频视觉系统修复 — 字幕安全区分离 / 槽位布局 / 品牌 Logo 可见性

> 日期：2026-08-08 · 状态：已确认（Grill Round 1+2 全部通过）
> 证据：`/tmp/video-frames/` 抽帧（字幕压内容）、`/tmp/logo-test/` 渲染测试（SVG 不可见）

## Problem Statement

频道主发现当前生成的 TikTok 视频视觉质量差，三个问题：

1. **字幕与场景内容重叠**。抽帧证据（bytedance-distillation 最新版）：15s 字幕压 "THE PAPER / REUTERS" 来源行；30s 字幕贴 "ALL REJECTED" 印章框；46s 字幕压 "ByteDance: CLEAN" 框。根因：字幕带（ASS `MarginV=450` → 单行 y≈1425–1470，两行上探至 ≈1370）与内容安全区下限（`SAFE_ZONES.bottom=450` → 内容允许到达 y=1470）是**同一区间**；`verify-scene-dom.mjs` 的底线（1470）没有为字幕带预留空间，场景通过校验却照样压字。
2. **内容排版乱**。场景统一用 `flex + justify-content: space-between` + 底部 470px padding：子元素被拉向顶/中/底三端，中间留大段死区（frame-46s 卡片与 CLEAN 框之间空 ~200px），底部元素被推进字幕带；各场景标题/内容锚点无统一网格。
3. **品牌 mark logo 从未显示**。`china-ai-news-logo-vector.svg`（1024×1024）与 `china-ai-news-mark.svg`（648×420）都只有 `width/height` 属性、**没有 `viewBox`** — CSS 缩放变为裁剪，容器只显示画布左上角的空白切片。Playwright 渲染测试证实 48/55/130px 三个尺寸下 SVG 完全不可见。brandBar、水印、CTA 大 logo 三处品牌位全部无效，品牌暴露只剩文字。此外路径 fill 为 `#0000FC` 系深蓝，在 `#050508` 背景上即使可见也偏暗。

## Solution

建立「区域分离」的视频视觉系统，单一事实源在 `lib/safe-zones.mjs`：

1. **字幕专用带（SUBTITLE_LANE）与内容区严格分离**：字幕 MarginV 450→390（字幕底边 y=1530，高于 TikTok caption 区 ~1600）；内容区下边界 y=1470→1340（`SAFE_ZONES.bottom` 450→580）；字幕带按两行高度预留（y≈1417–1530），与内容区留 ~77px 空隙。字幕分块从字符数启发式改为**像素实测宽度**（Helvetica Neue Bold 42px，上限 950px），目标单行；极端折行落在预留带内也不压内容。DOM 校验底线从 1470 收紧到 1340 并接入 pipeline（FAIL 即阻断出片）。
2. **固定垂直槽位布局系统**（新 `lib/scene-layout.mjs`）：1080×1920 划分为 `brandHeader`(60–140) / `kickerTitle`(220–400) / `hero`(400–1080) / `support`(1080–1340) 四个内容槽 + 字幕带 + TikTok UI 保留区。场景模板按槽位组装，废除 `space-between`。`bytedance-distillation` 作为首个迁移样本。
3. **修复品牌 mark**：构建脚本一次性生成 `china-ai-news-mark-video.svg`（补 `viewBox` + 暗蓝 fill 映射为品牌蓝 `#4d8bff`、红 `#FF0000`→`#ef4444`）；`BRAND_MARK_SVG` 换用该纯图形 mark，brandBar(48px) / 水印(55px, opacity 0.18→0.35) / CTA(130px) 三处同时生效。

## User Stories

1. As a TikTok viewer, I want 字幕永远不压画面内容, so that 信息清晰可读。
2. As a TikTok viewer, I want 字幕和关键内容不被平台 UI（顶部标签/右侧操作栏/底部 caption）遮挡, so that 任何设备上都能完整观看。
3. As a 静音观看者（85% 场景）, I want 字幕单行、稳定、位置固定, so that 不用追跳动的字幕块。
4. As a 频道主, I want 每个场景的标题/主视觉/来源信息落在固定位置, so that 视频有统一的编辑节奏、不显得业余。
5. As a 频道主, I want 品牌 mark（不只是文字）出现在所有场景, so that 观众形成品牌视觉记忆。
6. As a 频道主, I want CTA 结尾卡有清晰可见的品牌 logo, so that 关注意愿被品牌识别承接。
7. As an agent, I want 布局规则由 DOM 校验在 pipeline 内自动执行（FAIL 即阻断）, so that 不合规的场景无法出片、不靠人眼抽查。
8. As an agent, I want 字幕分块按像素宽度实测, so that 任何文案都不会意外折行破坏布局。
9. As an agent, I want 区域常量在 safe-zones.mjs 单一事实源且测试锁定, so that 字幕、内容、校验三方不会再次发生数值漂移。
10. As a 频道主, I want 布局改动用 render-only 快速重渲染验证（不重跑 TTS）, so that 视觉迭代成本低。

## Implementation Decisions

### D1 — 区域映射（`lib/safe-zones.mjs` 单一事实源）

> **2026-08-08 截图重校准**：初版数值来自 2026 调研文字区间；本版改用真实 FYP 播放截图（576 宽 ×1.875 放大）实测 + 交叉验证（quso/Moda 17 万帖子分析、Kreatli、vSubtitle、Blitzcut）。实测：右侧操作栏 x≈880–1080 / y≈655–1775；底部 caption 最高 y≈1500；底部 tab 栏 y≈1790–1905；TikTok 原生字幕 ~60px em（≈帧高 3.1%）位于 62–70% 高可读带。

1080×1920 画布的最终分区：

| y 区间 | 区域 | 规则 |
|---|---|---|
| 0–220 | TikTok 顶部 UI 区 | 仅品牌 chrome（水印 top:60 / brandBar top:80，靠边避开居中标签） |
| 220–400 | `kickerTitle` 槽 | 徽章/标题 |
| 400–950 | `hero` 槽 | 主视觉（大数字/卡片/对比），内容居中 |
| 950–1150 | `support` 槽 | 来源/结论/补充 |
| 1150–1188 | 空隙带 | 无内容（呼吸区） |
| 1188–1350 | **字幕专用带** | 场景内容禁止进入；60px Bold，bottom-center，单行优先 |
| 1350–1500 | 干净边距 | 无内容 |
| 1500–1920 | TikTok 底部 UI 区 | 我方内容归零（caption 最高 ~1500，tab 栏 1790–1905） |
| x 方向 | 左 60 / 右 200 | 内容网格 x∈[60,880]，宽 820px；右栏 y>640 为 FAIL 级 |

常量定义：

- `SAFE_ZONES = { top: 220, right: 200, bottom: 770, left: 60 }`（right 160→200 → 内容右缘 x=880 清开操作栏；bottom 450→770 → 内容下边界 y=1150）
- 新增 `SUBTITLE_LANE = { marginV: 570, fontSize: 60, maxLines: 2, lineHeight: 1.35, maxWidth: 720 }`，并导出派生值 `SUBTITLE_LANE.bottom = 1350` / `SUBTITLE_LANE.top ≈ 1188`。60px 对标 TikTok 原生字幕；maxWidth 720 → marginL/R=180 → 字幕右缘 x=900 清开操作栏
- `WATERMARK_POS = { top: 60, left: 60 }` 不变
- 不变式由测试锁定：内容下边界（1150）< 字幕带顶（1188）< 字幕带底（1350）< TikTok caption 区（1500 实测最差值）

### D2 — 字幕单行强制（`lib/subtitles/`）

- `ass.mjs`：`DEFAULT_STYLE.marginV` 引用 `SUBTITLE_LANE.marginV`（570）；`marginL/marginR=180` 由 `maxWidth=720` 派生（与 `SUBTITLE_LANE.maxWidth` 同源）。
- `cues.mjs`：分块约束用**像素实测宽度**。实现：内嵌 Helvetica Neue Bold 的 ASCII 字符宽度表（AFM 度量，em 系数），`measureLine(text) = Σ charWidth × 60px`；`SOFT_PX = round(HARD_PX × 0.85) = 612`（软断，由 HARD 派生避免再次超过硬上限）、`HARD_PX = SUBTITLE_LANE.maxWidth = 720`（硬断，绝不超宽）。`MAX_WORDS=6`、句子边界、孤儿合并规则保留，但合并检查同样改用 px。
- 兜底（Q6-A）：极端情况下 libass 仍可能折行 — 字幕带已按两行预留高度，两行也不会压内容。不压缩字号。
- 时间轴逻辑（lead-in/hold-out/gap 规则）不变。

### D3 — 槽位布局系统（新增 `lib/scene-layout.mjs`）

- 导出 `SLOTS`（与 safe-zones.mjs 数值同源校验）与 `slotCss()`（生成四个槽位的绝对定位 CSS：left/right 按 SAFE_ZONES，hero 槽 flex 居中）。
- 导出 `sceneFrame({ kicker, hero, support })` 组装器：返回三段槽位容器 HTML。场景不再自己写全屏 flex + padding。
- `bytedance-distillation/scenes.mjs` 迁移为槽位组装：S1 hook（subject/hookText/revealText → hero 槽，source → support 槽）、S2–S8（badge/title → kicker 槽，主视觉 → hero 槽，来源/结论 → support 槽）、S9 CTA 不动（共享 ctaScene 自动获益 logo 修复）。**scene-data.mjs 文案一字不动**。
- `brandBar` 保持 top:80（位于品牌 chrome 区，属豁免元素，不占内容槽）。

### D4 — DOM 校验校准 + 接入 pipeline（`verify-scene-dom.mjs` / `main.mjs` / `render-only.mjs`）

- `BAND.bottom` 改为 `1920-SAFE_ZONES.bottom=1150`（FAIL）；`BAND.right` 改为 `1080-SAFE_ZONES.right=880`。
- 内容元素底边 >1150 = FAIL（等价于「禁止进入字幕带」，因为字幕由 libass 烧录不在 DOM 中）。
- **右栏分级**（截图实测操作栏纵向范围 y≈655–1775）：右缘 >880 **且元素底边 y>640**（在操作栏内）= **FAIL**；y≤640（顶部 chrome 区，无遮挡）= WARN。右栏不再是统一的 WARN。
- **竖向堆叠规则**：对比/VS 场景必须竖向 A/VS/B 堆叠，禁止横向多列（横屏硬塞竖屏会在 1080 宽内溢出右安全区或把字压到不可读）。由 `scene-drift.test.mjs` 禁用 side-by-side class（`accused-row`/`chip-compare`/`vs-circle`/`.cols`）守住已迁移 content。
- 新增 bytedance-distillation 的 EXPECTATIONS 条目（skipWatermark: 全场景都有 brandBar + CTA）。
- `main.mjs` 与 `render-only.mjs` 在 Step 2（生成 HTML）之后、Step 3（录制）之前自动运行 DOM 校验；FAIL 则 pipeline 中止。保留命令行独立运行能力。
- **刻意的防回退**：未迁移的老 content（deepseek / distillation/pt1 / restraint/pt1，padding-bottom 470 → 内容底 1450）跑 pipeline 会被 FAIL 阻断，报错信息指引「该 content 未迁移到槽位布局，按 spec-video-layout-safe-zones 迁移」。这是 Q4 确认的强制迁移机制。

### D5 — 品牌 mark 修复（`scripts/short-video/build-mark-svg.mjs` + 资产）

- 新增一次性构建脚本 `build-mark-svg.mjs`：读 `assets/china-ai-news-mark.svg`（648×420 纯图形）→ 注入 `viewBox="0 0 648 420"`（恢复缩放能力）→ fill 映射：所有 `#0000xx` 系深蓝 → `#4d8bff`（品牌蓝），`#FF0000`/`#770046` 系红 → `#ef4444` → 写 `assets/china-ai-news-mark-video.svg`。源文件不动，脚本可重复运行（幂等）。
- `scene-templates.mjs`：`BRAND_MARK_SVG` 改读 `china-ai-news-mark-video.svg`（纯图形，48px 下干净；文字由 brandBar 的 HTML 文本承担）。brandBar / withWatermark / ctaScene 三处自动生效。
- `base-styles.mjs`：`.brand-watermark` opacity 0.18→**0.35**（Q5-A），尺寸/位置不变。
- 网站端不受影响（用 `china-ai-news-logo-gpt.png` 位图做 og:image，不经此 SVG）；TikTok 头像（`china-ai-news-mark.svg` 手动导出 PNG）不受影响。

### D6 — 文档同步

- `docs/brand-system.md`：Layout Safety 章节重写（新区域表 + 字幕带定义；**修正现有错误公式**「1080−450=630」）；Subtitle Specification 的 MarginV 450→390、新增单行强制说明；Logo 章节记录 mark-video.svg 的生成方式。
- `docs/video-workflow.md`：Subtitle Best Practices 表（Position / 单行宽度）、Logo Handling 段落、Pipeline Steps 表（新增 Step 2.5 DOM 校验）。

## Testing Decisions

好测试的标准：只测外部行为/契约（常量值、HTML 结构、分块结果的宽度上限），不测实现细节；DOM 几何用真实 Chromium 测量（既有 seam）。

**Seams（优先复用既有 seam）**：

1. `__tests__/*.test.mjs`（vitest，模块契约）— 主 seam
2. `verify-scene-dom.mjs`（Playwright 真实 DOM 几何）— 布局 seam
3. 抽帧 HITL（Step 6 Runtime Verify，人工视觉确认）

**更新既有测试**：

- `scene-drift.test.mjs`：SAFE_ZONES toEqual 断言 450→580
- `scene-templates.test.mjs`：`bottom ≥ 450` 断言 → 与新不变式对齐
- `subtitle-cues.test.mjs` / `subtitle-ass.test.mjs`：分块/样式断言适配像素宽度与 marginV 390

**新增测试**（每行对应场景矩阵）：

- `safe-zones`：不变式链（content bottom 1340 < lane top < lane bottom 1530 < 1600；lane 高度 ≥ 两行 42px）
- `cues` 像素分块：超宽词组在 HARD_PX 处断开；单行 cue ≤950px；孤儿合并不超 HARD_PX；MAX_WORDS/句子边界不回归
- `build-mark-svg`：输出含 viewBox、无暗色 fill（`#0000`/`#FF0000` 不残留）、源文件不变、幂等
- `scene-layout`：槽位互不重叠、槽位在 SAFE_ZONES 内、support 槽底 ≤1340
- `verify-scene-dom`：bytedance 全场景 PASS（内容 ≤1340）

**Prior art**：`subtitle-cues.test.mjs`（分块规则）、`scene-templates.test.mjs`（常量契约）、`verify-scene-dom.mjs`（几何断言）。

## Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `lib/safe-zones.mjs` | bottom 450→580；新增 SUBTITLE_LANE | Medium | 下游消费者：base-styles（水印位置，仅读 top/left 不受影响）、verify-scene-dom（BAND 重算，预期行为变化=本 spec 目标）、2 个测试文件（断言同步更新）。最坏后果：常量错误导致全场景 FAIL — 由不变式测试锁定，可接受 |
| `lib/subtitles/ass.mjs` | marginV 450→390（引用 SUBTITLE_LANE） | Medium | 影响所有视频字幕位置（上移 60px）。验证：subtitle-ass 测试 + render-only 抽帧。最坏后果：字幕压内容 — 字幕带与内容区已结构性分离，不可能 |
| `lib/subtitles/cues.mjs` | 分块改像素宽度（SOFT_PX/HARD_PX） | Medium | 影响所有视频字幕分块。时间轴逻辑不动。验证：cues 测试全量 + verify-subtitles（端到端对齐校验在 pipeline 内）。最坏后果：某句超宽折行 — 字幕带按两行预留，不压内容 |
| `lib/scene-templates.mjs` | BRAND_MARK_SVG 换读 mark-video.svg | Medium | 影响 brandBar/水印/CTA 三处品牌位。验证：模板测试（含 BRAND_MARK_SVG 引用）+ 渲染可见性抽帧。最坏后果：SVG 仍不可见 — 构建脚本测试锁 viewBox + fill |
| `lib/base-styles.mjs` | 水印 opacity 0.18→0.35 | Low | 纯样式常量，无逻辑变化 |
| `lib/scene-layout.mjs` | 新增（SLOTS/slotCss/sceneFrame） | Low | 纯追加，无现有逻辑受影响 |
| `scripts/short-video/build-mark-svg.mjs` + `assets/china-ai-news-mark-video.svg` | 新增 | Low | 纯追加 |
| `verify-scene-dom.mjs` | BAND.bottom 1470→1340；EXPECTATIONS 加 bytedance | Medium | 老 content 会被 FAIL 阻断（刻意防回退，见 D4）。bytedance 迁移后 PASS。最坏后果：误伤合规场景 — 由迁移样本全绿验证 |
| `main.mjs` / `render-only.mjs` | Step 2 后接入 DOM 校验（FAIL 中止） | Medium | 修改核心出片路径。缓解：校验是独立进程调用，失败信息明确；`--skip-preflight` 不影响此校验（它是渲染级不是数据级）— 提供 `--skip-dom-check` 逃生口 |
| `content/bytedance-distillation/scenes.mjs` | 迁移槽位组装 | Medium | 内容 copy 不动（scene-data 不变，drift 测试锁）；视觉布局变化由 DOM 校验 + 抽帧 HITL 验收 |
| `__tests__/scene-drift.test.mjs` / `scene-templates.test.mjs` / `subtitle-cues.test.mjs` / `subtitle-ass.test.mjs` | 断言适配新常量 | Low | 测试文件自身 |
| `docs/brand-system.md` / `docs/video-workflow.md` | 区域表/字幕表/Logo 段落 | Low | 文档 |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | bytedance 任一场景内容底边 ≤1150 | DOM check PASS | — | 迁移后全场景验证 |
| 2 | 场景内容元素底边 >1150（侵入字幕带） | DOM check FAIL，pipeline 中止 | 误伤 | bytedance 样本全绿后才算完成；报错含元素类名+实测 y |
| 3 | 字幕 cue ≤720px | 单行渲染在字幕带内 | — | cues 像素分块测试 |
| 4 | 字幕文案实测 >720px | 分块在 HARD_PX=720 强制断词，保持单行 | 断词点生硬 | 软断 612px 优先在词边界；句子边界规则保留 |
| 5 | 极端折行（libass WrapStyle 0 仍折行） | 落在两行预留带（y≤1350），不压内容（内容 ≤1150） | 低 | 带高度测试锁定 |
| 6 | 内容元素右边 >880 且底边 y>640（操作栏内） | FAIL（操作栏为不透明遮挡，内容不可读） | 误伤顶部 chrome | y≤640 才降级为 WARN；bytedance S1 曾因 reveal-text 越界被此规则捕获并修复 |
| 6b | 内容元素右边 >880 但底边 y≤640（顶部 chrome 区） | WARN（不阻断，顶部无操作栏遮挡） | 低 | 分级行为 |
| 7 | brandBar / 水印 / CTA logo 渲染 | SVG 真实可见（viewBox 生效，品牌色 fill） | 修复无效 | 构建脚本测试 + 抽帧 HITL 目视确认 |
| 8 | CTA 场景输出 | 与共享 ctaScene byte-identical（现有契约） | 回归 | 现有 drift 测试保持 |
| 9 | withWatermark 跳过逻辑 | brand-bar/brand-logo-large 场景不注水水印（现有契约） | 回归 | 现有测试保持 |
| 10 | 老 content（deepseek/distillation/restraint）跑 pipeline | DOM check FAIL 阻断，报错指引迁移 | 体验中断 | 刻意设计（Q4 确认）；报错信息含迁移指引；`--skip-dom-check` 逃生口 |
| 11 | render-only 无 subtitle-timing.json | 不生成 ass，流程不变（现有行为） | 回归 | 现有条件分支不动 |
| 12 | Hook 场景首帧 | brandBar 保留（品牌早期曝光符合 TikTok 最佳实践），首帧不出现 logo-only 画面 | 低 | 现有结构不变 |
| 13 | 空 texts / 缺失 key 的场景 | t() 访问器返回 ""，不渲染 undefined（现有契约） | 回归 | 现有测试保持 |
| 14 | Reels/Shorts 跨平台复用 | 字幕底 1350 对 Reels 底部 UI（~1570 起）留 220px；右 200/顶 220 兼容 | 低 | 一套布局三平台通用，无需分支 |
| 15 | 字幕时间轴（lead-in/hold-out/gap/合并） | 不回归 | 中 | cues 既有时间测试不动 + verify-subtitles 端到端校验 |
| 16 | 对比/VS 场景（S6/S7/S8）竖向堆叠 | A/VS/B 自上而下，无横向多列；右缘 ≤880 | 横屏硬塞竖屏 | scene-drift 禁用 side-by-side class；DOM 校验右栏 FAIL 兜底 |
| 17 | CTA 行动框进入字幕带（y>1150） | ctaScene 走槽位系统，action-box 落在 support 槽（≤1150） | 共享模板回归 | bytedance S9 曾因 action-box B1194 被捕获并修复（ctaScene 接入 sceneFrame） |

## Out of Scope

- 老 content（`deepseek` / `distillation/pt1` / `restraint/pt1` / `evergreen-templates`）的槽位迁移 — 下次使用时按新规范迁移（Q4-A）
- 视觉 DNA 重设计：配色、字体、动画库、grid/scanlines 背景层全部不变
- `bytedance-distillation/scene-data.mjs` 文案修改（只动布局层）
- TikTok 发布侧（caption/hashtag/发布脚本）
- 水印/品牌条的交互或动画增强

## Further Notes

- `docs/brand-system.md` 现有「No content anchor below y = 1080−450 = 630px」公式有误（应为 1920 底），本次一并修正。
- `docs/video-workflow.md` 的 Logo Handling 提到 `china-ai-news-logo-image-only.png`，该文件实际不存在（文档漂移），本次同步修正为 mark-video.svg 体系。
- 验证路径：`render-only.mjs --content bytedance-distillation`（不重跑 TTS，数分钟）→ 抽帧 → HITL 视觉确认 → commit。
- 后续所有新 content 的 scenes.mjs 必须用 `sceneFrame` 槽位组装（写入 brand-system.md 实施章节）。

## 2026-08-08 重校准 + 规范落地（本轮新增）

- **截图重校准**：safe-zones 从调研文字区间改为真实 FYP 截图实测（×1.875）：右 160→200（x880 清开操作栏）、底 450→770（y1150）；字幕 42px→60px（对标原生）、marginV 450→570、maxWidth 950→720（marginL/R 65→180，字幕右缘 x900 清开操作栏）。
- **竖向堆叠**：bytedance S6/S7/S8 从横向多列改为竖向 A/VS/B 堆叠（`accused-stack`/`chip-stack`/`vstack`），修复「横屏硬塞竖屏」三岛问题。
- **共享模板修复**：`ctaScene` 接入 `sceneFrame` 槽位（行动框从字幕带 y1194 上移到 support 槽）；hook `focal-reveal` 与 S1 `reveal-text` 限宽，修复右栏溢出。
- **规范落地（约束机制）**：
  1. `verify-scene-dom.mjs` 接入 `main.mjs`/`render-only.mjs` 为 Step 2.5 硬门（FAIL 即中止录制），`--skip-dom-check` 为老 content 逃生口。
  2. `scene-drift.test.mjs` 新增 side-by-side class 禁令（守住竖向堆叠）。
  3. `docs/brand-system.md` 升级为现行生产标准（字幕表/安全区表/竖向堆叠规则/Enforcement 章节）。
- 详细标准与强制执行链见 `docs/brand-system.md` → Layout Safety / Scene Layout Templates / Implementation → Enforcement。
