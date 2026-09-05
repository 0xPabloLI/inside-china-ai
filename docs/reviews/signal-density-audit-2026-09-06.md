# Signal Density 审计报告（Issue #68，ADR-0016 Rule 2）

> 审计日期：2026-09-06（第十八 session）。范围：`scripts/short-video/` 全管线（trend discovery / asset sourcing / TTS / rendering / verification）。原则：`docs/adr/0016-cascade-filtering-signal-density.md` Rule 2——「一次昂贵调用产出多个信号，而不是每次调用一个信号」。行号基于 2026-09-06 HEAD（69d4877）。

## 0. 总体结论

**设计时调用点（VLM/CDP/GPU 批处理/级联结构）已全面达标**——ADR-0016 声明的 5 条 Already applied 在当前代码全部成立（VLM 实际为 8 信号，见 §1）。#68 开票后交付的 #189（VLM pool+缓存）、#100（focus/vlm envelope 缓存）、#98/#99/#101（ASR/时间线融合/temporal focus）进一步收窄了缺口。

**残留违规集中在两类**：① ffmpeg 后处理链的 pass 堆叠（每 render 最多 4 次全量处理同一 mp4）；② 跨 run 缓存缺失（TTS/forced alignment 每次整段 GPU 重算、b-roll gate VLM 绕过 vlm-cache）。另有 1 个跨阶段信号断层（focus crop hint 未进 VLM 视图）。

## 1. ADR-0016 五条 Already applied 复核（全部成立）

| # | 声明 | 现状 |
| --- | --- | --- |
| 1 | VLM 单次 6 信号 | `vlm_analyzer.py:63-123`（prompt 6 段）+ `:317-456`（解析 8 字段，含 relevance/relevanceReason）— 实际 8 信号 |
| 2 | pre-filter 阈值 20 下载前拦截 | `asset-sourcer.mjs:2266`，应用于全部 6 类下载点（:2526/:2651/:2745/:2819/:2883/:2986） |
| 3 | pre-filter → focus → VLM 级联 | `asset-sourcer.mjs:1231-1450`（Phase 1/2/2.5/3a 逐层收缩） |
| 4 | articleScript 同 DOM 产出文章+imageUrl | source-registry 多处 + `asset-sourcer.mjs:2500-2547` Phase 0 零请求消费；且 `search-sources.mjs:124-190` enrichWithMedia 同 tab 追加 video/og 信号（密度高于 ADR 描述） |
| 5 | 9 CDP 源双能力 | `source-registry.mjs:3262-3270` 自动注入 + `asset-sourcer.mjs:1849` 消费 |

## 2. 残留违规（→ follow-up issue）

### 违规 1（最大收益）：render 后处理链 4-pass ffmpeg

`render-remotion.mjs:194-245` 对同一 mp4 连续：burnSubtitles（视频重编码，`post-process.mjs:38`）→ mixBgm（音频 AAC 重编码 + 1 次 ffprobe，`post-process.mjs:77-104`）→ normalizeLoudness（音频再次 AAC 重编码，`:125-142`）→ realignAudioToTimeline（音频第三次重编码 + 内部 verify 先做 N+1 次 wav 解码，`audio/sync.mjs:292-294`）。

合并方案：单 pass `-filter_complex`（ass 字幕 + bgm amix + loudnorm + atrim 一次完成）。预估每 render 省 2-3 个完整 pass（1080×1920×60s 约 1-3 分钟）+ 消除 3 代 AAC 世代损失。`main.mjs:433-459` retry 修复路径的重烧属修复语义，不算违规。

### 违规 2：verify-remotion-frames 逐帧从头解码

`verify-remotion-frames.mjs:151-156`：`select=eq(n\,midFrame)` 每帧一个进程、从 0 解码到目标帧；N scene = N 次接近全片解码。合并：单进程多输出或按时间戳 `-ss` seek。10 scene × 60s 约省 9 次全片解码。

### 违规 3（缓存缺失）：TTS + forced alignment 无跨 run 缓存

`tts/registry.mjs:82-99` 每 run 对全部 scene 重新生成 TTS + 重跑 wav2vec2 forced alignment（`tts/post-process.mjs:226-258`）；Gate 1 修复（`main.mjs:380-395`）与 subtitle-alignment 修复（`main.mjs:471-489`）还会再跑。scene 文本未变时整段 GPU 推理重复。方案：scene 文本 hash + voice/ref 配置为 key 跳过已存在音频。

### 已缓解（部分，一并记录）

- **b-roll gate VLM 绕过 vlm-cache**：`b-roll/gate.mjs:41` 直调 analyzer，未包缓存（`orchestrator.mjs:243-247`）；escalated 重跑对同一文件重复 20-120s。gate 走 vlm-cache（key 已含 claim+model+fingerprint）即修。
- **search-sources ↔ asset-sourcer 同搜索页双开**：两进程对同一 source+keyword 各开一次 tab（`asset-sourcer.mjs:2769-2847` vs `search-sources.mjs`）；search-cache.json 只在 asset-sourcer 侧落盘（24h TTL），trending-topics.json 只缓存图 URL。search-sources 落盘同格式 search-cache 可省一次 CDP tab（5-15s/源/关键词）。

### 跨阶段信号断层（密度增强，非违规）

VLM 图像预处理 `simulate_crop` 固定中心裁切 `focus=(0.5,0.5)`（`vlm_analyzer.py:755`），而 Phase 2 已算出的 saliency centroid / cropFocus 未传入——VLM 对 fit/criticalEdgeText 的判断基于中心裁切视图，Phase 3b crop 决策却可能选 saliency 偏移裁切，坐标系错位。把 `asset.cropFocus` 作为 crop hint 传入 `analyzeAssetSemantics`，一次调用即让 VLM 看到「最终观众看到的画面」。

## 3. 良性（记录在案，不修）

- 同一视频 3× ffprobe/run（Phase 2.5 probe → Step 1.5b upscale 检查 → Step 2b 复查），单次 <100ms；main 与 render-remotion 的双重 upscale 检查可传参消掉一次，trivial。
- escalation 重复抽帧（`vlm_analyzer.py:855-864`）——级联设计使然，2B 结果保留作 fallback。
- verifyWithRetry 重跑 silencedetect/N+1 解码（max 2 次，量级小）。
- fetch-page.mjs 无生产调用方（死模块，#187 已核）；search-pool/bigsong-api 无请求缓存但结果持久化到 discovery 产物。
- temporal-focus / asr-analyzer 缓存已建未接线（#98/#101 记录的设计态），无重复调用发生。

## 4. 四问直接回答

1. **多调用可合并残留**：§2 违规 1/2/3 + 两项部分缓解。
2. **VLM 窗口分析密度**：window 与 deep_analyze 经同一 seam（`run_vlm_inference`，`vlm_analyzer.py:725-766`），单次产出 8 字段 + window + sourceMode，达标；per-frame 时间维在独立的 temporal-focus（未接线，无重复调用）。
3. **重复 fetch/计算无缓存**：TTS/alignment GPU（最实在）、b-roll gate VLM、verify 音频解码；缓存族（vlm/focus/search-results/media-cache/b-roll report/temporal/asr）覆盖其余全部昂贵调用。
4. **级联信号复用**：focus→crop、VLM→crop/layout、probe window→VLM 均已复用；唯一断层是 focus crop hint 未进 VLM 视图（§2 末）。

## 处置

实现项集中到 follow-up issue（沿用 #140 承接模式）；本票审计职责完成即关闭。优先级建议：违规 1（render pass 合并，每次渲染都省）> 违规 3（TTS 缓存，重跑场景省）> 信号断层（一致性收益）> b-roll gate 缓存 > 违规 2 / search-cache 落盘。
