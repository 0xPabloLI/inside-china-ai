# Spec — 长视频预处理：VLM 分段分析 + 渲染 offset 语义（#360）

Status: active（2026-09-26） · Parent issue: #360 · Planning scale: S2 · Risk: R3（核心管线 + Python/Node 跨进程契约 + Remotion 渲染 + TS/.mjs 双写契约）

## Problem Statement

两个长视频资产（>8s）缺陷（`docs/research/omni-model-selection-2026.md` §14-§15 发现）：

1. **VLM 分析只看前 8s**：`vlm_analyzer.py` `MAX_VIDEO_SECONDS=8`（`vlm_analyzer.py:114`）对无窗口请求生效；生产唯一窗口调用方 `asset-sourcer.mjs` Phase 2.5 恒传 `{startMs: 0, endMs: min(dur, 8000)}`（`:1189`）。15-60s 新闻片段/访谈的后半段语义（B-roll 匹配、contentKind、fit 决策）完全缺失。
2. **长资产渲染截断**：scene 时长由 TTS 决定（`timeline.mjs:51-56`），`MediaBackground.tsx` 用 `<Video loop>` 从源文件 frame 0 播，无任何起点偏移字段。issue 正文假设「多 scene 共指同一文件导致后半段永不渲染」——**事实修正（2026-09-26 实测）**：自动管线按 path 去重、一资产一 scene（`asset-sourcer.mjs:860-862`），截断是单 scene 绑定的固有结果；跨 scene 共享只出现在手工 scene-data。

**用户裁决（2026-09-26，A+ 分期）**：本轮只做 **schema + 渲染层 + offset 流转**（含 Problem 1 分段分析）；**跨 Scene 绑定（assignment 层）留到 #354/#355 的 assignment 重构一起做**，避免两次重写 `asset-sourcer.mjs`。

## Solution

- **Problem 1**：按资产时长分级分析——≤8s 单 pass 不变；8-30s 全程降频采样；>30s 等长分段（每段复用 #361 window 机制）+ 合并。合并结果维持 `parse_markdown_to_dict()` 八字段 Markdown 契约。`probeMedia` 已算出的 `durationMs` 落盘到资产与 `asset-analysis.json`（现在算了就丢，`:1189`）。
- **Problem 2（A+ 范围）**：`MediaField` 新增可选 `videoStartOffsetMs`，渲染层从源文件该偏移起播；`types.ts` 与 `lib/media-bg.mjs` 双写同步；patch 校验放行合法值。管线本轮**不产生** offset（等 #354/#355）；手工 scene-data / patch 可设。

## Implementation Decisions

1. **分级阈值（triage 2026-09-25 建议，采纳）**：≤8s / 8-30s / >30s 三档。档内采样参数（fps、max_frames、分段数）实施时按实测推理开销调优，预算约束：单资产分析耗时 ≤ 现状 8s 单 pass 的 3×。
2. **分段复用 #361 window 机制**：`>30s` 资产拆成 N 个 ≤8s 等长窗口（非零 `startMs`——该能力已全链就位但生产从未使用），逐窗分析后 Python 侧合并为单一八字段 Markdown；`8-30s` 单窗 `{0, dur}` + 降 fps。窗口/分段参数进缓存 key 材料（`vlm-cache.mjs`）——不同覆盖范围的分析是不同结果，防 stale 命中（#351 教训：key 必须命名真实跑过的东西）。
3. **probe 失败 fail-open 到现状**：`probeMedia` 为 null 或 duration 缺失 → 回退现状单 pass 8s 行为（与 graceful-degradation 模式一致），不阻断。
4. **offset 字段命名**：`videoStartOffsetMs`（int，毫秒，≥0，可选，缺省=0）——与 window 字段 `startMs/endMs` 单位一致；只加 start 一个字段（end 由 scene 时长隐含；endOffset 等跨 Scene 绑定时随 #354/#355 需求再加）。与 issue 正文设想的 `videoStartOffset/videoEndOffset` 双字段不同，理由如上。
5. **渲染语义（实施修正 2026-09-26）**：`MediaBackground.tsx` 用 `@remotion/media` 4.0.517 的 `<Video trimBefore={...}>`（**帧单位**，非秒——`ms→frames` 转换 helper，已从安装包源码核实）从偏移起播；`loop` 与 `trimBefore` 组合 = 循环「offset→源末尾」段，偏移前画面不会再出现（源码级证明：`calculateMediaDuration` 减去 `trimBefore` 后取模）。越界偏移：渲染侧**无源时长可知**（schema 不穿 duration），无法数值 clamp——实测 still 正常出图不炸渲染，定为 graceful 降级、作者责任；渲染管线层（`render-remotion.mjs` 持有 ffprobe）可后续补越界告警。
6. **校验**：`apply-media-patch.mjs` 与 `.mjs` 镜像 `lib/media-bg.mjs` 的校验放行/类型检查（非负 int、可选）；TS 侧 `types.ts` 同步。双写规则照 `types.ts:18-20` 注释执行。
7. **e2v 不在本票范围**：`analyzeAssetEmotion`/`fuseAudioEmotion` 未接入 scene-asset 管线（仅测试引用），本票不接线。
8. **assignment 层不动**：去重、`reusedCap`、patch 生成逻辑维持现状；`videoStartOffsetMs` 在自动化产物中缺省。

## Modified Files Impact（R3）

- `scripts/short-video/lib/vlm_analyzer.py`（分段抽取 + 合并 + 八字段契约保持）
- `scripts/short-video/lib/asset-sourcer.mjs`（Phase 2.5 分级窗口 + durationMs 落盘 + 缓存 key 材料）
- `scripts/short-video/lib/vlm-cache.mjs`（key 材料扩展）
- `scripts/short-video/lib/visual-analyzer.mjs`（如分段需 IPC 透传参数）
- `scripts/short-video/remotion/src/types.ts` + `scripts/short-video/lib/media-bg.mjs`（`videoStartOffsetMs` 双写）
- `scripts/short-video/remotion/src/components/MediaBackground.tsx`（offset 起播 + clamp）
- `scripts/short-video/lib/apply-media-patch.mjs`（校验）
- 测试：`asset-sourcer.test.mjs`、`asset-sourcer-visual-integration.test.mjs`、`lib/__tests__/vlm-cache.test.mjs`、`__tests__/media-bg.test.mjs`、`__tests__/test_vlm_segmentation.py`（新增 pytest）、Remotion still 证据
- 文档：`docs/DOCS-INDEX.md`（本 spec 登记）；`asset-analysis.json` 产物加 `durationMs`

## Behavioral Scenarios（R3）

| #   | 场景 | 期望 |
| --- | --- | --- |
| S1  | ≤8s 资产分析 | 行为与现状完全一致（单 pass，window `{0, min(dur,8s)}`） |
| S2  | 8-30s 资产分析 | 全程覆盖（降频单窗），八字段 Markdown 契约兼容 |
| S3  | >30s 资产分析 | N 个非零 startMs 窗口逐段分析 → 合并结果八字段契约兼容 |
| S4  | probe 失败 / 无 duration | 回退现状 8s 单 pass，降级路径不抛错 |
| S5  | 缓存 key | 同资产不同窗口参数 → 不同 key，无 stale 命中 |
| S6  | `MediaField` 无 `videoStartOffsetMs` | 渲染与现状逐帧一致（无回归） |
| S7  | `videoStartOffsetMs: 5000` | `<Video>` 从源 5s 起播（still/composition 证据） |
| S8  | 偏移超出源时长 | 不炸渲染：graceful 降级（渲染侧无源时长，越界属作者责任；实测 still 正常出图）——实施修正，原「clamp + warn」不可行 |
| S9  | patch 携带合法/非法 offset | 合法放行；负数/非 int 拒绝 |

## Out of Scope

- assignment 层跨 Scene 绑定、`videoEndOffsetMs`、offset 自动产生（→ #354/#355）
- e2v 接入 scene-asset 管线
- `AvatarField` 偏移（avatar 是 freeze-frame 语义，另一套）
- 分析端 >8s 之外的模型能力变化（仍走抽帧，无原生视频）

## Tickets

- `.scratch/long-video-360/issues/ticket-1-vlm-segmentation.md`（S1-S5 + durationMs 落盘；Python + asset-sourcer + cache）
- `.scratch/long-video-360/issues/ticket-2-offset-schema-render.md`（S6-S9；schema 双写 + 渲染 + 校验）
- 两票无 blocking edges，可独立交付；每票 fresh context。

## Completion

- S1-S9 全部有 evidence（自动化测试 + Remotion still + 既有 content 目录 Real Data Smoke）。
- Verification Gate 按 `implementation-workflow.md` §7：视频管线逻辑 → affected tests + Real Data Smoke；Remotion 视觉 → still 检查。
