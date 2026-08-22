# Archive

已完成的 spec、tickets、roadmap 和 handoff 文档。保留作历史参考，不再活跃维护。

当前规范行为见根目录的活跃文档和 [`DOCS-INDEX.md`](../DOCS-INDEX.md)。

## 归档清单

### Phase 文档

| 文件 | 完成时间 | 说明 |
|------|----------|------|
| `phase1-spec.md` / `phase1-tickets.md` | 2026-08-02 | 发布效率（ISSUE-02 + ISSUE-04） |
| `roadmap-phase2.md` / `spec-phase2.md` / `tickets-phase2.md` | 2026-08-03 | 文章创作管线 + 分析自动化 |

### 视频管线 Specs

| 文件 | 完成时间 | 说明 |
|------|----------|------|
| `spec-audio-diagnostics.md` / `tickets-audio-diagnostics.md` | 2026-08-06 | 验证失败诊断包 |
| `spec-gapless-audio-track.md` / `tickets-gapless-audio-track.md` | 2026-08-06 | 无间隙连续音轨 + 音频同步验证 |
| `spec-subtitle-karaoke-timeline.md` / `tickets-subtitle-karaoke-timeline.md` | 2026-08-06 | Karaoke 字幕漏词与不同步修复 |
| `spec-subtitle-rendering.md` / `tickets-subtitle-rendering.md` | 2026-08-06 | 字幕渲染重构（CSS→JS rAF + ASS 烧录） |
| `spec-subtitle-verification.md` / `tickets-subtitle-verification.md` | 2026-08-06 | 字幕验证系统 |
| `spec-scene-extraction.md` / `tickets-scene-extraction.md` | 2026-08-06 | 场景提取 + 共享视觉系统分离 |
| `spec-pipeline-isolation.md` / `tickets-pipeline-isolation.md` | 2026-08-06 | 多 Pipeline 隔离架构 |
| `spec-multi-video-splitting.md` / `tickets-multi-video-splitting.md` | 2026-08-07 | 多视频拆分管线集成 |
| `spec-cta-end-card-standard.md` / `tickets-cta-end-card-standard.md` | 2026-08-07 | 标准 CTA 结尾页（共享 ctaScene + 契约规则 + 全量迁移） |
| `spec-hook-opening-card.md` / `tickets-hook-opening-card.md` | 2026-08-08 | 标准 Hook 开场卡（共享 hookScene + 槽位骨架 + 焦点二选一契约 + 顶部安全带检查） |
| `spec-video-layout-safe-zones.md` / `tickets-video-layout-safe-zones.md` | 2026-08-08 | 字幕安全区分离 + 槽位布局 + 品牌 Logo 修复 + 截图重校准（右栏 x880/底 y1150/字幕 60px）+ 竖向堆叠规则 + DOM 校验接入管线硬门 |
| `spec-color-scheme-optimization.md` / `tickets-color-scheme-optimization.md` | 2026-08-08 | TikTok 视频色调优化 — Feed 分离度增强（Frame Glow 边框 + Flash Hook 闪帧 + Accent Boost 背景微调/尺寸扩大/透明度提升） |
| `spec-media-fullscreen-mode.md` / `tickets-media-fullscreen-mode.md` | 2026-08-13 | Media fullscreen 模式 — 新增 `mode` 字段支持全屏独立呈现（无文字叠加，仅视频+字幕）。FullscreenMedia 组件 + MediaBackground overlay 强制 0 + validateMedia mode 验证。5 new tests。 |
| `spec-remotion-frame-verification.md` / `tickets-remotion-frame-verification.md` | 2026-08-13 | Remotion 帧图片分析验证 — `lib/frame-analysis.mjs` 纯函数像素分析（safe zone / content presence / all-black）+ `verify-remotion-frames.mjs` CLI（ffmpeg 提取帧 + pngjs 解析）+ `verify-video.mjs` 集成。29 tests。填补 Remotion 路径无视觉验证的空白。 |
| `spec-asset-sourcer.md` / `tickets-asset-sourcer.md` | 2026-08-14 | 自动化媒体素材搜索与下载 — `lib/asset-sourcer.mjs` 独立工具。API (Pexels/Unsplash/Pixabay/Coverr/Wikimedia) + CDP (IT之家/澎湃) + yt-dlp (YouTube/B站) 三路搜索。关键词提取 (meta.keyEntities → CLI → voiceover) + 评分排序 + 下载。 |
| `spec-issue-84-search-cache.md` / `tickets-issue-84-search-cache.md` | 2026-08-21 | Issue #84 搜索结果缓存 — 以内容、来源与规范化关键词为键，复用 API/CDP/yt-dlp 图片和视频候选结果；24 小时 TTL、版本化 envelope、原子单次写入与失败降级。 |
| `spec-voice-prosody-optimization.md` / `tickets-voice-prosody-optimization.md` | 2026-08-14 | 语音质量与韵律优化 4 层方案 — 参考音频替换 + 音频清洗链 (highpass + afftdn) + rubberband per-scene prosody + 消除双重 MP3 编码。F5 A/B 测试后确定 prosody DISABLED for F5。 |
| `spec-media-volume-autofill.md` / `tickets-media-volume-autofill.md` | 2026-08-14 | Per-scene volume + envelope ducking + asset-sourcer auto-fill — `MediaField.volume` 字段 + `videoVolume = baseVolume * opacity` 渐变 + `validateMedia()` range check [0,1] + `assignAssetsToScenes()` 批量分配 + `media-patch.json` + `apply-media-patch.mjs` HITL 审查。 |

### 趋势 & 发布 Specs

| 文件 | 完成时间 | 说明 |
|------|----------|------|
| `spec-trend-sources-expansion.md` / `tickets-trend-sources-expansion.md` | 2026-08-06 | 自媒体趋势源接入 |
| `spec-mcp-fallback.md` | 2026-08-06 | MCP Fallback for Trend Sources |
| `spec-x-source-and-wechat-update.md` | 2026-08-06 | X.com 搜索源 + cdpFallback + 微信配置更新 |
| `spec-tiktok-rules-sync.md` / `tickets-tiktok-rules-sync.md` | 2026-08-07 | TikTok 规则同步 & drift 防护 |

### UI & Widget Specs

| 文件 | 完成时间 | 说明 |
|------|----------|------|
| `spec-design-optimization.md` / `tickets-design-optimization.md` | 2026-08-07 | 设计系统优化（视频视觉 + 网站 UI） |
| `spec-ui-consistency-fix.md` | 2026-08-07 | UI 一致性修复（容器宽度 + 调色板） |
| `spec-widget-inline-dashboards.md` / `tickets-widget-inline-dashboards.md` | 2026-08-07 | Widget 内联嵌入 + Registry |
| `spec-video-guard-widget-a11y.md` / `tickets-video-guard-widget-a11y.md` | 2026-08-07 | Video Guard 固化 + Widget A11y |
| `spec-widget-preview-route.md` / `tickets-widget-preview-route.md` | 2026-08-07 | Widget 预览路由 + --preview 模式 |
| `spec-widget-techdebt-cleanup.md` / `tickets-widget-techdebt-cleanup.md` | 2026-08-08 | Widget 技术债清理 — English-only（删 toggle/i18n zh/数据 zh 字段）+ hover 键盘等价物（useHoverPin + button 化 + data-widget 探针作用域） |

### RAG Pre-Work Specs

| 文件 | 完成时间 | 说明 |
|------|----------|------|
| `spec-rag-prework-wp4-7-8-11.md` / `tickets-rag-prework-wp4-7-8-11.md` | 2026-08-08 | RAG 前置工作 WP-4/7/8/11 + Slug 一致性修正 |
| `rag-prework.md` | 2026-08-08 | RAG 前置工作总览（WP-1~WP-11 全部完成，D1-D5 决策确认，Q1-Q19 grilled）|
| `spec-rag.md` / `tickets-rag.md` | 2026-08-09 | RAG Pipeline 实施 — Phase 1 (T-10~T-16: migration + ollama/chunker/normalizer/supabase-client/index/query) + Phase 2 (T-20~T-23: extract-widget-sources + publish reindex trigger + eval.mjs + golden queries)。106 tests passing。 |
| `spec-dom-config-extraction.md` | 2026-08-09 | DOM 验证配置从中心 `verify-scene-dom.mjs` 的 EXPECTATIONS 提取到各内容目录的 `dom-config.mjs`。动态加载 + 默认值降级。14 tests。 |

### TikTok Embed Specs

| 文件 | 完成时间 | 说明 |
|------|----------|------|
| `spec-tiktok-embed.md` / `tickets-tiktok-embed.md` | 2026-08-10 | TikTok Embed 替换 MP4 附件 — tiktok_url 列 + TikTokEmbed 组件 + PostEditor 字段 + publish-tiktok.mjs 自动保存 URL + 管线文档更新。14 new tests。 |

### Upscale Specs

| 文件 | 完成时间 | 说明 |
|------|----------|------|
| `spec-realesrgan-upscale.md` / `tickets-realesrgan-upscale.md` | 2026-08-16 | Real-ESRGAN 超分辨率集成 — `lib/upscale.mjs` 独立模块 (checkResolution + upscaleVideo + upscaleImage + autoUpscaleIfNeeded)。Real-ESRGAN ncnn-vulkan v0.2.5.0 (Metal/Vulkan)。视频用 realesr-animevideov3 模型，图片用 realesrgan-x4plus。集成到 asset-sourcer.mjs 3 处下载点。27 new tests。 |
| `spec-verify-retry-loop.md` / `tickets-verify-retry-loop` | 2026-08-17 | Pipeline Verify-Retry Loop — `lib/verify-retry.mjs`: classifyFailure() + applyDriftCorrection() + relaxGapParams() + verifyWithRetry() bounded auto-repair。Remotion `ShortVideo.tsx` audio placement fix (TransitionSeries → Sequence offset)。`--max-retries N` CLI flag (default 2)。34 new tests，139 total green。 |

### AI Analyzer Specs

| 文件 | 完成时间 | 说明 |
|------|----------|------|
| `spec-ai-analyzer.md` / `tickets-ai-analyzer.md` | 2026-08-17 | VLM 驱动的素材理解层 — `lib/ai_analyzer.py` Python 子进程 (mlx-vlm + Qwen3-VL-8B) + `lib/ai-analyzer.mjs` Node.js 库 (stdin/stdout JSON IPC) + `scoreCandidate` aiDescription 评分 (0-30) + asset-sourcer 集成 (`analyzeAssets` + `aiAnalysis` report)。151 tests passing。 |
| `spec-visual-focus-detection.md` / `spec-visual-focus-detection-review.md` / `spec-visual-focus-detection-remediation.md` | 2026-08-18 | 视觉焦点检测 + AI 分析层重构 — `focus_detector.py` (OpenCV Haar + Saliency) + `visual-analyzer.mjs` (Node 网关, requestId 路由, generation 隔离) + `vlm_analyzer.py` (重命名自 ai_analyzer.py) + two-phase analysis (Phase 1 focus → Phase 2 VLM) + `review-media-patch.mjs` (人工审阅 formatter)。P0/P1 修复: fit/focus 解耦 + smoke golden 断言修正 + CLI 重命名 + 集成断言。81 tests passing。 |
| `spec-vlm-semantic-merge.md` / `tickets-vlm-semantic-merge/` | 2026-08-18 | VLM 语义合并 — 单次 VLM 调用替代双调用 (describeImage/Video + analyzeFit → analyzeAssetSemantics)。Markdown 输出替代 JSON。`parse_markdown_to_dict()` 纯字符串解析。`asset-analysis.json` 结构化 artifact。`scoreCandidate` 重平衡 (70 technical + 30 AI) + boundary matching + 预过滤门控。`types.ts` 新增 contentKind + subjects。189 Node tests + 10 Python parser tests。 |
| `spec-vlm-semantic-merge-remediation.md` / `tickets-vlm-semantic-merge-remediation/` | 2026-08-19 | VLM 语义合并修复 — P0: 路径隔离 (normalizePathForPatch + contentDir + 路径逃逸检测); P1-1: scoreCandidate 接受 {description, subjects} + recommendScene contentKind 映射; P1-2: pre-filter 统一为 hard gate; P1-3: artifact 按 contentSlug 隔离 (output/{slug}/); P1-4: legacy 文件标记。18 行场景矩阵全覆盖，203 tests passing。 |
| `spec-research-evidence-pipeline.md` / `tickets-research-evidence-pipeline/` | 2026-08-18 | Research Evidence Pipeline — Stage 0.5 证据层接入内容管线。4 个 canonical data contracts (discovery/brief/evidence-pack/claim-map) + schema validators + content-scoped research workspace + 确定性 brief builder (URL normalize/dedup/prioritize) + search-sources.mjs run-scoped output + Claim-Evidence Auditor (MRL-1 gate) + scene-data claimIds (optional, backward compat)。124 tests across 6 files。 |
| `spec-unified-source-registry.md` | 2026-08-19 | 统一数据源注册表 — `source-registry.mjs` 作为所有数据类型 (articles/images/videos) 的单一事实来源。`capabilities` 字段声明式定义获取方式。`asset-sourcer.mjs` 删除 `API_SOURCES`/`YTDLP_SOURCES`/`CDP_SOURCES` 改为按 capability 查询。跨阶段图片缓存 (trend discovery extractScript 提取 imageUrl → asset-sourcer 消费)。T05 pre-download filter gate (threshold 20)。T06 cascade order fix (pre-filter before detectFocus)。1545 tests passing。 |
| `spec-p4-video-windows-audit-fix.md` | 2026-08-20 | P4 VLM 视频时间窗口 + 审计修复 + 误过滤测试 — `lib/media-probe.mjs` (probeMedia ffprobe 封装 + parseProbeOutput 纯函数); `analyzeAssetSemantics` 扩展可选 window 参数 { startMs, endMs, sampleFps }; `vlm_analyzer.py` 接收 window 字段, `extract_frames` 支持 -ss/-t 窗口化; Python 报告 sourceMode (native/frames/degraded); `analyzeAssets` Phase 2.5 probe + window 计算; searchYtdlp 平台守卫 (T2); CDP download loop type 检查 (T3); SOURCE_ATTRIBUTIONS 全量补全 (T1)。426 tests passing。 |

### Documentation Hierarchy Specs

| 文件 | 完成时间 | 说明 |
|------|----------|------|
| `spec-doc-hierarchy-optimization.md` / `tickets-doc-hierarchy-01~04` | 2026-08-15 | 文档层次体系优化 — DOCS-INDEX.md Layer Placement Rules + 语义标签 (L1: Execution reference / L2: Deep research) + video-workflow.md Gapless Audio Track 抽离到 L2 + AGENTS.md 双向指针 + 7 个遗留 spec/tickets 归档。 |
| `spec-doc-hierarchy-lint.md` / `01-lint-core-checks.md` / `02-npm-script-and-pre-commit-hook.md` | 2026-08-16 | 文档层次自动化 Lint — lint-doc-hierarchy.mjs (3 项检查: DOCS-INDEX 一致性 + L1 Design Decisions + L2 命令行启发式) + npm run lint:docs + pre-commit hook 集成 + DOCS-INDEX rule 5 (sync after changes)。17 tests。 |

### ADR Remediation Trackers

| 文件 | 完成时间 | 说明 |
|------|----------|------|
| `adr-0008-0014-remediation-tracker.md` | 2026-08-18 | ADR 0008-0014 修复执行追踪器 — PR #45 合并 + Issue #46 延迟验收全部完成。8 个工作项全部 VERIFIED。覆盖 F5 TTS CJK 时长、Remotion 时间线统一、venv 锁定、LFS pointer 校验、Kaggle/Colab GPU smoke、VLM Golden Asset 评估方案。 |

### Research Docs (Archived)

| 文件 | 归档时间 | 说明 |
|------|----------|------|
| `media-asset-strategy.md` | 2026-08-15 | 短视频素材策略全量研究 — §4.1 (参考视频提取) 已提取为 `docs/research/reference-video-extraction.md` 独立追踪。其余 sections (§4.2-§4.7, §6-§8) 均已完成实现或研究，不再活跃维护。实现状态见顶部 summary。 |

### Handoff Docs (Archived)

| 文件 | 完成时间 | 说明 |
|------|----------|------|
| `handoff-cloud-gpu-kaggle-setup.md` | 2026-08-16 | Cloud GPU 配置 — Kaggle CLI v2.2.4 + API 配置 + P100 16GB 全链路验证 + Colab T4 验证 + CDP Colab 自动化验证。后续参考 `docs/research/cloud-gpu-options.md` 和 `docs/research/digital-human-test-progress.md`。 |
| `handoff-cloud-gpu-fallback-pool.md` | 2026-08-16 | Cloud GPU Fallback Pool 脚本 — `scripts/cloud-gpu/run-gpu.mjs` 实现。Colab CLI（首选）→ Kaggle（fallback）→ 手动（AutoDL/CDP）。30 tests。 |
| `handoff-tiktok-embed-and-pipeline-cleanup.md` | 2026-08-10 | TikTok Embed 替换 MP4 — 已在 `spec-tiktok-embed.md` 归档。 |
| `handoff-video-layout-standard.md` | 2026-08-08 | 视频布局安全区标准 — 已在 `spec-video-layout-safe-zones.md` 归档。 |
| `handoff-media-mode-design.md` | 2026-08-12 | Media fullscreen 模式 — 已在 `spec-media-fullscreen-mode.md` 归档。 |
| `handoff-spacing-fix.md` | 2026-08-12 | HookScene/CtaScene 间距修复 — 已在布局标准中完成。 |
| `handoff-doc-hierarchy-review.md` | 2026-08-15 | 文档层次审查 — 已在 `spec-doc-hierarchy-optimization.md` + `spec-doc-hierarchy-lint.md` 归档。 |

> **未归档的 handoff**（`docs/handoffs/` 中仍活跃）：
> - `handoff-asset-source-unification.md` — 素材源统一命名，待实施
> - `handoff-license-risk-policy.md` — License 风险策略，待实施
> - `handoff-realesrgan.md` — Real-ESRGAN 超分辨率集成，已完成（spec/tickets 已归档）
> - `handoff-write-for-agents-enforcement.md` — write-for-agents 执行机制，待实施
> - `handoff-verify-retry-loop.md` — Verify-retry loop，已完成（spec/tickets 已归档为 `spec-verify-retry-loop.md`）
> - `handoff-source-layer-comparison.md` — Source layer CDP/MCP/API 对比 + selector 修复，已完成（spec/tickets 已归档为 `spec-source-registry-selector-fix.md`）
