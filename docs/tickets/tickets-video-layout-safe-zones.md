# Tickets — Video Layout Safe Zones（字幕安全区分离 / 槽位布局 / 品牌 Logo 可见性）

> Spec: `docs/specs/spec-video-layout-safe-zones.md`（含场景矩阵）
> 状态: 已确认（2026-08-08）· 依赖序：T1 →（T2/T4/T5 并行）→ T6 → T7；T3 独立；T8 收尾

## T1 — 区域常量与字幕带分离

**What to build:** 单一事实源 `lib/safe-zones.mjs` 定义完整区域映射：内容安全区下边界从 y=1470 上移到 y=1340（`bottom` 450→580），新增 `SUBTITLE_LANE`（marginV=390 → 字幕底边 y=1530，按两行高度预留，顶 ≈1417）。ASS 字幕样式引用 `SUBTITLE_LANE.marginV`，不再是硬编码 450。「内容底 < 字幕带顶 < 字幕带底 < TikTok caption 区」不变式链由测试锁定。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `SAFE_ZONES.bottom` 450→580；新增 `SUBTITLE_LANE`（marginV 390 / fontSize 42 / maxLines 2 / lineHeight 1.35 / maxWidth 950）及派生 `top≈1417` / `bottom=1530`
- [ ] `ass.mjs` DEFAULT_STYLE.marginV 引用 `SUBTITLE_LANE.marginV`（marginL/R 由 maxWidth 派生 → 650→ 保持 65）
- [ ] 不变式测试：1340 < 1417 < 1530 < 1600；带高 ≥ 两行（fontSize×lineHeight×maxLines）
- [ ] 既有断言更新：scene-drift（SAFE_ZONES toEqual 580）、scene-templates（bottom ≥ 450 → 与 marginV 关系）
- [ ] 全部测试绿 + lint 过

## T2 — 字幕像素宽度分块

**What to build:** 字幕分块从字符数启发式（38/49 chars）改为 Helvetica Neue Bold 42px 实测像素宽度（软断 820px / 硬断 950px = `SUBTITLE_LANE.maxWidth`），保证 cue 单行不超宽；句子边界 / MAX_WORDS=6 / 孤儿合并规则保留但检查改用 px。

**Blocked by:** T1

**Status:** ready-for-agent

- [ ] 像素宽度测量函数（Helvetica Bold 字宽表，em 系数 × 42px）
- [ ] 分块逻辑 SOFT_PX/HARD_PX 替代 SOFT_CHARS/HARD_CHARS（含孤儿合并、canMerge 的 px 化）
- [ ] 单行 cue ≤ 950px 的测试；超宽词在 HARD_PX 断开；时间轴逻辑不回归
- [ ] 既有 cues 测试适配 + 全绿

## T3 — 品牌 mark 修复（viewBox + 品牌色）

**What to build:** 幂等构建脚本 `build-mark-svg.mjs` 从 `assets/china-ai-news-mark.svg` 产出 `assets/china-ai-news-mark-video.svg`：补 `viewBox="0 0 648 420"`（恢复缩放），暗蓝 fill（#0000xx 系）→ 品牌蓝 #4d8bff、红系（#FF0000/#770046）→ #ef4444。`scene-templates.mjs` 的 `BRAND_MARK_SVG` 改读该文件（brandBar/水印/CTA 三处自动生效）；水印 opacity 0.18→0.35。Playwright 渲染测试证明 48/55/130px 三尺寸可见。

**Blocked by:** None — independent

**Status:** ready-for-agent

- [ ] 构建脚本幂等产出 mark-video.svg（含 viewBox、无 #0000xx/#FF0000 fill 残留、源文件不变）
- [ ] `BRAND_MARK_SVG` 换源；水印 opacity 0.35
- [ ] 渲染可见性测试（Playwright 截图采样非空像素）
- [ ] 抽帧目视确认（并入 T6 HITL）

## T4 — 槽位布局系统（scene-layout.mjs）

**What to build:** 新增 `lib/scene-layout.mjs`：`SLOTS`（brandHeader 60-140 / kickerTitle 220-400 / hero 400-1080 / support 1080-1340，数值与 safe-zones 同源校验）、`slotCss()`、`sceneFrame({kicker, hero, support})` 组装器。场景模板不再写全屏 flex + padding + space-between。

**Blocked by:** T1

**Status:** ready-for-agent

- [ ] SLOTS 与 SAFE_ZONES 一致（槽位 x 区间、support 底 ≤1340、互不重叠）
- [ ] slotCss/sceneFrame 输出结构正确
- [ ] 测试全绿

## T5 — DOM 校验校准（verify-scene-dom.mjs）

**What to build:** DOM 校验底线从 y=1470 收紧到 y=1340（`1920-SAFE_ZONES.bottom`）：任何内容元素底边 >1340 = FAIL（= 禁止进入字幕带）。新增 bytedance-distillation EXPECTATIONS（skipWatermark 全场景）。对**未迁移**的 bytedance 现状运行必须产出 FAIL（证明校验有效，red）。

**Blocked by:** T1

**Status:** ready-for-agent

- [ ] BAND.bottom = 1920 − SAFE_ZONES.bottom（1340）
- [ ] bytedance EXPECTATIONS 条目
- [ ] red 验证：迁移前 bytedance 被 FAIL（记录输出）

## T6 — bytedance 迁移槽位 + 端到端视觉验证

**What to build:** `bytedance-distillation/scenes.mjs` 全部 8 个非 CTA 场景改用 `sceneFrame` 槽位组装（S1 hook：主视觉→hero、source→support；S2-S8：badge/title→kicker、主视觉→hero、来源/结论→support；S9 CTA 不动）。scene-data 文案一字不改（drift 测试守护）。DOM 校验全绿（green）。`render-only` 重渲染 + 抽帧 HITL 目视确认（字幕不再压内容、排版对齐、logo 可见）。

**Blocked by:** T2, T3, T4, T5

**Status:** ready-for-agent

- [ ] scenes.mjs 槽位化（scene-data 不变；drift/模板测试仍绿）
- [ ] verify-scene-dom 全场景 PASS
- [ ] render-only 重渲染成功，抽帧目视确认 3 项问题全部解决
- [ ] 用户 HITL 确认

## T7 — DOM 校验接入 pipeline

**What to build:** `main.mjs` / `render-only.mjs` 在 Step 2（HTML 生成后）自动运行 DOM 校验，FAIL 中止出片；提供 `--skip-dom-check` 逃生口；未迁移老 content（deepseek/distillation/restraint）被阻断时报错含迁移指引。

**Blocked by:** T6

**Status:** ready-for-agent

- [ ] 两个入口接入校验（FAIL → exit 1，信息含场景/元素/迁移指引）
- [ ] `--skip-dom-check` 逃生口
- [ ] 老 content 阻断行为验证（不实跑 TTS，用 render-only + 已有音频）

## T8 — 文档同步

**What to build:** `docs/brand-system.md`：Layout Safety 区域表重写（含字幕带定义）、Subtitle Specification MarginV 390、Logo 章节记 mark-video.svg 生成方式、修正「1080−450=630」错误公式、实施章节注明新 content 必须用 sceneFrame。`docs/video-workflow.md`：Subtitle Best Practices（Position/单行宽度）、Logo Handling、Pipeline Steps（加 Step 2.5 DOM 校验）。

**Blocked by:** T6（内容以最终实现为准）

**Status:** ready-for-agent

- [ ] brand-system.md 更新
- [ ] video-workflow.md 更新
