# Handoff: SVE Media Extraction (图片/视频同时提取 + Logo 排除 + Metadata)

> Created: 2026-08-20
> Updated: 2026-08-27 — SVE (#114) **已实现 + 运行时验证通过**，commit `f7c3567` + `cdcc8c7`，Issue #114 **已关闭**
> Parent discussion: `docs/research/pipeline-simplification-discussion.md` (Topic 4)
> Issue: #114 (CLOSED — 运行时集成测试通过，2026-08-27)

## ✅ 实现状态：已完成 + 运行时验证通过

SVE 三层全部实现并通过验证（2026-08-27），运行时集成测试通过（2026-08-27）：

| Layer                        | 文件                                              | 状态    |
| ---------------------------- | ------------------------------------------------- | ------- |
| Layer 1: `enrichWithMedia`   | `search-sources.mjs` + `trends-utils.mjs`         | ✅ 完成 |
| Layer 2: `extract-media.mjs` | `scripts/short-video/lib/extract-media.mjs`（新） | ✅ 完成 |
| Layer 3: Phase 0b            | `asset-sourcer.mjs`                               | ✅ 完成 |
| 文档                         | `content-pipeline.md` Stage 0 SVE 规则            | ✅ 完成 |

**验证**：28 new tests，302 total passing，lint + tsc + build 全绿。
**Spec/tickets/review**：已归档到 `docs/archive/`。

## 已实现的内容

### Layer 1: enrichWithMedia（搜索结果页媒体提取）

`search-sources.mjs` 中 `enrichWithImages` → `enrichWithMedia`：

- 单次 CDP eval 同时提取 images + videos + metadata
- 视频：`<video>` src, `<source>` child, `<iframe>` YouTube/Bilibili/Douyin/Youku embeds, `og:video` meta
- Metadata：`og:image`, `og:title`, `article:published_time`
- Articles 获得 `videoUrls: string[]` 和 `metadata: {ogImage?, ogTitle?, publishedTime?}` 字段
- `buildOutputJson` 在 `trends-utils.mjs` 中写入 `videos[]` 和 `metadata{}` 到 topic entries（additive，backward compatible）

### Layer 2: extract-media.mjs（详情页媒体缓存）

新脚本 `scripts/short-video/lib/extract-media.mjs`：

- Agent 在 Stage 0 打开详情页后调用
- CLI: `--url <url> --content <slug>` 或 `--tab <tabId> --content <slug>`（复用已开 tab）
- CDP eval 提取所有 `<img>` (naturalWidth > 400), `<video>`, `<iframe>`, `og:image`
- 过滤 logos/icons（复用 `isLogoOrIcon()` from asset-sourcer）
- 输出 `content/<slug>/research/media-cache.json`（versioned schema, merge by sourceUrl）
- 视频平台识别：youtube, bilibili, douyin, youku, direct

### Layer 3: asset-sourcer Phase 0b（缓存媒体消费）

`asset-sourcer.mjs` 新增：

- `loadCachedMedia(filePath, keywords)` — 读 `media-cache.json`，按 keyword 匹配
- `toCachedMediaCandidate(candidate)` — 规范化为 score/filter/download pipeline
- Phase 0b 在 Phase 0 (cached images) 和 Phase 1 (API sources) 之间运行
- 复用 `downloadCandidate()`，cross-phase dedup via `downloadedUrls` Set

### content-pipeline.md 更新

Stage 0 入口 1/2 加入 SVE 规则：Agent 打开详情页后必须调用 `extract-media.mjs` 缓存媒体 URL。

## 遗留问题与下一步

### 1. ✅ 运行时集成测试（已完成 2026-08-27）

`extract-media.mjs` 端到端测试通过：

1. ✅ CDP 打开微信公众号文章详情页（`https://mp.weixin.qq.com/s/YG4UPmy3M-zaJZjFrTSo0w`）
2. ✅ 运行 `node scripts/short-video/lib/extract-media.mjs --url <url> --content doubao-work`
3. ✅ `content/doubao-work/research/media-cache.json` 生成且内容正确（19 images, og:image, og:title）
4. ✅ Phase 0b `loadCachedMedia()` 代码逻辑确认（4 unit tests + code review）

### 2. ✅ enrichWithMedia 运行时验证（已完成 2026-08-27）

`enrichWithMedia` 的 CDP eval 脚本在真实 Bing News 搜索结果页上验证通过：

- 提取到 36 张图片（文章链接附近的 `<img>`）
- 视频提取为 0（搜索结果页无 `<video>`/`<iframe>` embeds，合理）
- Metadata 为空（搜索结果页无 `og:image` 等标签，合理）
- `buildOutputJson` 正确写入 `videos[]` 和 `metadata{}`（7 unit tests）

### 3. ✅ Issue #114 已关闭（2026-08-27）

GitHub Issue #114 已关闭，评论包含运行时验证摘要。

### 4. 旧 handoff 中的未实现部分

以下在旧 handoff 中提到但**本次未实现**的设计点：

- **Logo/Icon 排除增强**（旧 handoff §2）：`naturalWidth < 200` 尺寸过滤、`/loading|blank|default|skeleton/` 路径模式、SVG data URI 过滤、`/ad-|advert|sponsor/` 广告类过滤、`/emoji|reaction|clap|heart|share|comment/` 平台 UI 图标过滤 — 这些**没有做**。当前 `isLogoOrIcon()` 保持原样。**运行时测试发现**：微信公众号文章的 1×1 SVG data URI 占位图被提取（`data:image/svg+xml,...`），`naturalWidth > 400` 过滤对 SVG data URI 无效（浏览器对 SVG 的 naturalWidth 报告行为不同）。如需修复，在 `buildMediaExtractScript` 的 eval 脚本中加 `img.src.startsWith('data:')` 过滤，或在 `isLogoOrIcon()` 中加 `data:image` 匹配。单独开 issue。
- **Jina Reader 本地部署**（旧 handoff §Design Clarifications）：**未实现**。Jina 仍作为 MCP tool 供 Agent 直接调用，pipeline 代码中没有 Jina 引用。
- **`collectFromApi` 也调用 `enrichWithMedia`**（旧 handoff §Implementation Scope §1）：**未实现**。`enrichWithMedia` 只在 `collectFromCdp` 内调用，API 路径不调用。
- **source-registry.mjs `CDP_IMAGE_CAPABILITIES` → `CDP_MEDIA_CAPABILITIES`**（旧 handoff §Implementation Scope §3）：**未实现**。source-registry 未改动。
- **视频 duration/poster 字段**（旧 handoff §3）：**未实现**。视频候选只有 `url` 和 `platform`，没有 `duration` 和 `poster`。

### 5. 非 session 改动

git status 中有大量非本 session 的未提交改动（`docs/research/` 下的多个文件、`scripts/short-video/lib/` 下的 normalize-currency/base-styles/source-registry/visual-analyzer 等）。这些不是 SVE 工作引入的，不碰。

## Key References

- 实现文件：`scripts/short-video/lib/extract-media.mjs`（新）
- 实现文件：`scripts/short-video/search-sources.mjs`（`enrichWithMedia` 函数）
- 实现文件：`scripts/short-video/lib/trends-utils.mjs`（`buildOutputJson` videos/metadata）
- 实现文件：`scripts/short-video/lib/asset-sourcer.mjs`（`loadCachedMedia`, `toCachedMediaCandidate`, Phase 0b）
- 测试文件：`__tests__/extract-media.test.mjs`（17 tests）
- 测试文件：`__tests__/trends-utils.test.mjs`（7 SVE tests）
- 测试文件：`__tests__/asset-sourcer.test.mjs`（4 SVE tests）
- Spec（归档）：`docs/archive/spec-sve-single-visit-extraction.md`
- Tickets（归档）：`docs/archive/tickets-sve-single-visit-extraction.md`
- Review（归档）：`docs/archive/reviews/sve-single-visit-extraction-review-2026-08-27.md`
- content-pipeline.md SVE 规则：Stage 0 入口 1/2 + blockquote
