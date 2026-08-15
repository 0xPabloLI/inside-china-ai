# Archive

已完成的 spec、tickets 和 roadmap。保留作历史参考，不再活跃维护。

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
| `spec-voice-prosody-optimization.md` / `tickets-voice-prosody-optimization.md` | 2026-08-14 | 语音质量与韵律优化 4 层方案 — 参考音频替换 + 音频清洗链 (highpass + afftdn) + rubberband per-scene prosody + 消除双重 MP3 编码。F5 A/B 测试后确定 prosody DISABLED for F5。 |

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

### Documentation Hierarchy Specs

| 文件 | 完成时间 | 说明 |
|------|----------|------|
| `spec-doc-hierarchy-optimization.md` / `tickets-doc-hierarchy-01~04` | 2026-08-15 | 文档层次体系优化 — DOCS-INDEX.md Layer Placement Rules + 语义标签 (L1: Execution reference / L2: Deep research) + video-workflow.md Gapless Audio Track 抽离到 L2 + AGENTS.md 双向指针 + 7 个遗留 spec/tickets 归档。 |
