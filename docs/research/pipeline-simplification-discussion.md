# Pipeline Simplification Discussion

> Created: 2026-08-19
> Status: **Active Discussion**
> Participants: User + Agent
> Purpose: 追踪 Stage 0.5 简化 + Single-Visit Extraction 架构的讨论和决策

## Background

用户启动 Research Evidence Pipeline 实施后，发现 spec 设计过度工程化（academic-level 事实审计），与实际需求（TikTok 短视频素材挖掘）不匹配。经 5 轮讨论后形成简化方向。

## Discussion Topics

### Topic 1: evidence 那套东西怎么处理？

**状态**: 已决定

已实现的 evidence 相关模块：
- `lib/research/schemas.mjs` — 定义了 `evidence-pack.json` 和 `article-claim-map.json` 的 schema
- `lib/research/claim-auditor.mjs` — MRL-1 审计门，检查 fact claim 是否有 verified evidence
- `lib/research/scene-claims.mjs` — scene-data 里的 claimIds 追溯
- `research-pipeline.mjs` — CLI 编排脚本，含 audit 流程

**问题**：用户不需要 academic 级事实审计。可信度应该是标注（影响话术），不是门卫（阻断 pipeline）。

**决定**：
- 代码 + 测试全部保留，不接入管线，不调用
- 可信度由 agent 在 web-access CDP 提取全文后自行标注（prompt 级判断，非代码逻辑）
- 不改造 web-deep-research skill（通用 skill，不能为 evidence 改）

**Future feature（发 issue + handoff，另外做）**：
- 用户要求 Agent 审计某条内容时，Agent 能召唤 claim-auditor + evidence-pack 生成
- 要实现这个需要：
  1. evidence-pack 生成逻辑（目前不存在，web-deep-research 不改）
  2. claim-map 生成逻辑（目前不存在）
  3. 在某个 skill 或 AGENTS.md 加"审计触发"指引
- Issue: [#60](https://github.com/0xPabloLI/inside-china-ai/issues/60)
- Handoff: `docs/handoffs/handoff-on-demand-audit.md` ✅

---

### Topic 2: (merged with Topic 1)

web-deep-research skill 的 8-phase 流程不适合做视频的场景。用户需要的是 web-access CDP 直接提取，不是研究报告。

**结论**: 砍掉 web-deep-research skill 的 8-phase 流程。agent 用 web-access CDP 直接提取全文 + 自行判断可信度。

**补充**: 不改造 web-deep-research skill 本身。它是通用研究 skill，不能为 evidence 审计去改它的输出格式。

---

### Topic 3: search-sources 信源选择机制 + DOM 选择器问题

**状态**: 已决定（Jina fallback 方案）

#### 3a. 信源选择是规则还是硬编码？

**事实**：硬编码列表。`source-registry.mjs` 里每个信源是手写的对象。~53 个信源分 8 类。规则化不可行——每个信源的 URL pattern、搜索参数、DOM 结构都不同，规则引擎的复杂度 ≥ 硬编码，且可维护性更差。

#### 3b. DOM 选择器问题 — "网站一变就失效"

**事实**：CDP 是传输层（不失效），`extractScript` 是解析层（网站改版会失效）。

**解决方案**：在 `search-sources.mjs` 的 `collectFromSource()` fallback 链中插入 Jina 层：

```
apiSearch → CDP（extractScript）→ Jina fallback（新增）→ cdpFallback（Google site:）→ mcpFallback（Grok）
```

- CDP `extractScript` 返回空 → Jina 用 `r.jina.ai/{url}` 重新请求同一 URL，返回 Markdown，parser 提取 `{title, url}[]`
- Jina 也失败 → Google `site:domain keyword` 搜索
- 以上全失败 → Grok 全网搜索关键词

**Jina 测试结果**（2026-08-19，53 源 × 3 参数）：
- default 模式：44/52 成功（84.6%）——主力模式
- browser 模式（`X-Engine: browser`）：47/52 成功——额外救活 GitHub、Threads、DataCube AI、百度、Reddit
- readerlm-v2 模式：22/52 成功（42.3%）——超时率太高，不使用
- 3 种全失败：新智元、arXiv——只能走 CDP 或 API direct-connect

**适用范围**：只改 `search-sources.mjs`。`asset-sourcer.mjs` 暂不改——图片来源走 Pexels/Unsplash API + yt-dlp，不走 CDP DOM 选择器。SVE 架构实现后，Jina 的 `X-With-Images-Summary: true` 可一次性提取文章+图片 URL，asset-sourcer 直接从 SVE 产物读取。

**Fallback 语义区分**：
- Jina fallback = "同一个网页换一种方式提取"（CDP DOM 选择器失效 → Jina 无选择器提取）
- Grok fallback = "放弃这个网页，用搜索引擎找替代内容"（全网搜索关键词）


---

### Topic 4: Single-Visit Extraction 架构

**状态**: 待讨论

**原则**：一个视频 pipeline 内，每个 URL 只用 CDP 访问一次，这一次就把文章、图片、视频全部提取完。后续步骤按需引用已有素材。

**现状问题**：
```
Stage 0: search-sources 打开 jiqizhixin.com → 提取文章 → 关闭
Stage 3: asset-sourcer 打开 jiqizhixin.com → 提取图片 → 关闭
         ↑ 同一个网站被 CDP 打开了两次！
```

**现有缓存**：
- 图片：`loadCachedImages()` 从 `trending-topics.json` 读 URL 缓存 + `downloadAsset()` 文件级缓存
- 视频：只有 `downloadAsset()` 文件级缓存（`existsSync`），无 URL 级缓存
- 文章：无缓存

**目标架构**：
```
Unified Page Visitor 打开 URL（一次）
  ├─ extractArticles → 文章标题+链接+摘要
  ├─ extractImages → 页面图片 URL + 上下文
  ├─ extractVideos → 内嵌视频 URL + 元数据
  └─ extractFullText → 全文内容（供 agent 深度理解）
  全部存入 content/<slug>/research/ 目录
  后续步骤（asset-sourcer, scene-data）从目录引用
```

**待设计**：
- Unified Page Visitor 的接口（打开 URL → 返回多种资源类型）
- 与现有 search-sources.mjs 和 asset-sourcer.mjs 的关系（替换？包装？重构？）
- URL 去重逻辑（跨 Stage 的 URL registry）
- 缓存层级（URL → 文件 → 结构化数据）

---

## Decisions Log

| # | Decision | Date | Rationale |
|---|----------|------|-----------|
| 1 | 砍掉 web-deep-research 8-phase 流程 | 2026-08-19 | 不适合做视频的场景，agent 用 web-access CDP 直接提取 |
| 2 | 简化 Stage 0.5（从 evidence audit 改为素材挖掘） | 2026-08-19 | 用户不需要 academic 级事实审计 |
| 3 | 可信度从门卫改成标注 | 2026-08-19 | 不误删独家报道，用话术区分可信度 |
| 4 | 文章和 video script 并行产出（双轨） | 2026-08-19 | 不从文章翻译成视频，各自为优化目标写 |
| 5 | evidence 模块保留但不接入 | 2026-08-19 | 代码+测试留着，不调用，不删。未来按需接回 |
| 6 | 不改 web-deep-research skill | 2026-08-19 | 通用 skill 不能为 evidence 审计改输出格式 |
| 7 | on-demand audit 作为 future feature | 2026-08-19 | 发 issue + handoff，另外做 |
| 8 | Jina Reader API 作为 CDP fallback | 2026-08-19 | 84.6% 信源 default 模式可用，不依赖 per-site DOM 选择器 |
| 9 | Jina 文档合并入 tools-catalog.md | 2026-08-19 | 已完成：tools-catalog.md 新增 Jina Reader API 条目（速览表 + 详细说明） |
| 10 | Jina fallback 只改 search-sources.mjs | 2026-08-19 | asset-sourcer 走 API+yt-dlp，不走 CDP DOM 选择器 |
| 11 | readerlm-v2 模式不使用 | 2026-08-19 | 超时率 57.7%，性能最差 |
| 12 | 硬编码信源列表不改为规则引擎 | 2026-08-19 | URL pattern + 搜索参数 + DOM 结构每个站不同，规则化复杂度 ≥ 硬编码 |
| 13 | per-site extractScript 不删除 | 2026-08-20 | 返回结构化数据（title+url+imageUrl），精确匹配网站 DOM。auto-fallback 使其从「必须维护」变为「有空再维护」 |
| 14 | CDP 搜索不能进 Search API Pool | 2026-08-20 | Pool 只含程序化 API 调用的搜索服务。CDP 是浏览器代理，不是 API |
| 15 | Bing API 退役，不可用 | 2026-08-20 | 2025-08 退役，2026-08-11 完全关闭。bing_news 走 CDP 仍可用 |
| 16 | Wikipedia 作为独立 reference source | 2026-08-20 | 不属于 general search，是实体背景信息查询。category=reference，不进 Pool |
| 17 | accessMethod.fallbacks 字段是文档性的 | 2026-08-20 | collectFromSource() 硬编码 fallback 链，不读该字段。实施时可删除简化 |
| 18 | Jina 可本地 Docker 部署 | 2026-08-20 | ghcr.io/jina-ai/reader:oss，2-4GB RAM，无状态模式无限调用。Pipeline 代码可直接 fetch 而非 MCP |
| 13 | Entry points unified; three entries converge at Stage 0 | 2026-08-20 | Grill Q1: 入口统一为单入口，差异仅是 keyword 来源和是否有 primary source |
| 14 | Stage 0.5 renamed to Stage 0: Source Discovery & Material Gathering | 2026-08-20 | Grill Q8: 管线起点编号清晰化，去掉 0.5 |
| 15 | MRL-1 B4/B6 inline markers as source for structured evidence (non-blocking) | 2026-08-20 | Grill Q4: inline 标注保留，作为 evidence schema 来源；audit 非阻塞，输出 warning。#61 追踪 |
| 16 | Research mode filter expanded to include cdpFallback sources | 2026-08-20 | Grill Q2: 不支持 keyword 的源走 Google site: fallback |
| 17 | WESTERN_SOURCES renamed to INTERNATIONAL_SOURCES | 2026-08-20 | Grill Q6: "western" 不准确，这些源是国际/多语种的 |
| 18 | Optional locale field added; English sources not marked | 2026-08-20 | Grill Q6: 中文限定源标 zh-CN，英文/多语种源不标 |
| 19 | No separate issue for Discussion; all tasks in existing issues | 2026-08-20 | Grill Q9: 所有未完成项已有对应 issue |

## Open Questions

1. ~~evidence 模块删还是留？~~ → 留，不接入
2. ~~信源选择能否规则化？~~ → 不能，硬编码是唯一可行方案
3. ~~DOM 选择器是否要替换成 Jina/通用提取？~~ → Jina 作为 CDP fallback 插入 fallback 链（被 #66 /extract 替代）
4. ~~Unified Page Visitor 的设计细节？~~ → Tracked in #62
5. ~~已有 143 个测试怎么处理？~~ → 全部保留

## Next Steps

- [x] 讨论 Topic 1: evidence 处理方式 → 保留不接入，on-demand audit 发 issue (#60)
- [x] 讨论 Topic 3: 信源 + DOM 选择器 → Jina fallback 方案（被 #66 /extract 替代）
- [x] 讨论 Topic 4: Single-Visit Extraction 架构 → Tracked in #62
- [x] 创建 on-demand audit 的 GitHub issue + handoff 文档 ✅ Issue #60
- [x] Jina Reader API 测试（53 源 × 3 参数）
- [x] Jina 文档合并入 docs/tools-catalog.md ✅
- [x] 形成简化后的 spec ✅ Issue #70
- [x] 实施 Jina fallback → Superseded by #66 (extractScript auto-fallback uses /extract)
- [x] 实施 pipeline simplification: category rename + locale field + research filter expansion ✅ Issues #71, #72, #73, #74
