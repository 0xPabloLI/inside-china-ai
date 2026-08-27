# Handoff: SVE Media Extraction (图片/视频同时提取 + Logo 排除 + Metadata)

> Created: 2026-08-20
> Updated: 2026-08-27 — SVE (#114) **已实现**，commit `f7c3567` + `cdcc8c7`
> Parent discussion: `docs/research/pipeline-simplification-discussion.md` (Topic 4)
> Issue: #114 (OPEN — 代码已实现，Issue 未关闭)

## ✅ 实现状态：已完成

SVE 三层全部实现并通过验证（2026-08-27）：

| Layer | 文件 | 状态 |
|-------|------|------|
| Layer 1: `enrichWithMedia` | `search-sources.mjs` + `trends-utils.mjs` | ✅ 完成 |
| Layer 2: `extract-media.mjs` | `scripts/short-video/lib/extract-media.mjs`（新） | ✅ 完成 |
| Layer 3: Phase 0b | `asset-sourcer.mjs` | ✅ 完成 |
| 文档 | `content-pipeline.md` Stage 0 SVE 规则 | ✅ 完成 |

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

### 1. ⚠️ 未做运行时集成测试

`extract-media.mjs` 需要 CDP 连接（Chrome 后台运行在 localhost:3456）才能工作。当前只有单元测试（mock CDP eval 输出），没有端到端 smoke test。

**下一步**：在下次实际跑 Stage 0 流程时（有真实 URL），Agent 应手动调用 `extract-media.mjs` 验证：
1. CDP 打开详情页
2. 运行 `node scripts/short-video/lib/extract-media.mjs --tab <tabId> --content <slug>`
3. 检查 `content/<slug>/research/media-cache.json` 是否生成且内容正确
4. 在 Stage 4 跑 `main.mjs` 时检查 asset-sourcer Phase 0b 是否读到缓存

### 2. ⚠️ enrichWithMedia 未做运行时验证

`enrichWithMedia` 的 CDP eval 脚本只在单元测试中验证了逻辑（通过 `buildOutputJson` 的纯函数测试间接验证）。实际 CDP eval 脚本在真实搜索结果页上的行为未验证。

**下一步**：跑 `search-sources --trend` 时检查 `trending-topics.json` 是否包含 `videos[]` 和 `metadata{}` 字段。

### 3. Issue #114 未关闭

GitHub Issue #114 仍为 OPEN 状态。已评论完成摘要，但未关闭——等运行时集成测试通过后再关闭。

### 4. 旧 handoff 中的未实现部分

以下在旧 handoff 中提到但**本次未实现**的设计点：

- **Logo/Icon 排除增强**（旧 handoff §2）：`naturalWidth < 200` 尺寸过滤、`/loading|blank|default|skeleton/` 路径模式、SVG data URI 过滤、`/ad-|advert|sponsor/` 广告类过滤、`/emoji|reaction|clap|heart|share|comment/` 平台 UI 图标过滤 — 这些**没有做**。当前 `isLogoOrIcon()` 保持原样。如需增强，单独开 issue。
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
