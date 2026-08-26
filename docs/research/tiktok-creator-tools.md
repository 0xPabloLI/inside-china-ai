# TikTok Creator Tools 调研报告

> **调研日期**: 2026-08-26
> **调研方法**: Brave Search + Jina Reader（TikTok Creator Academy 官方文档）+ TikTok Research API 文档
> **用途**: 评估 TikTok Creator Tools 对我们视频生产管线（Content Pipeline + Analytics Workflow）的集成价值
> **状态**: 调研完成，待用户确认后进入实施

---

## 1. 工具全景

### 1.1 Creator Search Insights (CSI)

**是什么**：TikTok 官方的搜索趋势工具，让创作者看到平台用户在搜什么话题。

**核心功能**：
- **Recommended topics**：基于你的内容niche和粉丝搜索行为，推荐热门搜索话题
- **Content Gap**：高搜索量、低供给的话题（最值得做的内容机会）
- **Search Analytics**：你自己视频在搜索维度的表现数据
- **Detail Page**：点任意话题 → 查看近 7 天趋势、相关视频、相关搜索词

**可用地区**（23 个）：美国、加拿大、英国、爱尔兰、澳大利亚、新西兰、新加坡、印尼、菲律宾、马来西亚、南非、肯尼亚、尼日利亚、日本、德国、巴西、西班牙/ES*、越南、土耳其、泰国、法国、韩国。

**粉丝门槛**：≥1,000 粉丝才能看 "searches by followers" 功能。

**入口**：
- **移动端**：TikTok App 搜索栏输入 "Creator Search Insights" → 点 View
- **桌面端**：`https://www.tiktok.com/inspiration`（2025 年 7 月上线桌面版，需登录态）
- **TikTok Studio**：Profile → 菜单(☰) → TikTok Studio → Creation inspirations → Recommended → Searched for

**有 API 吗？** ❌ **没有面向商业用户的 API。**
- TikTok Research API (`open.tiktokapis.com/v2/research/`) 仅限学术/非营利机构，FAQ 明确说 creators/advertisers/commercial users 不可申请
- Phyllo 博客提到 2026 年 TikTok "扩展了 API surface" 含 "Creator Search Insights API"，但本质还是 Research API 体系下的，同样不面向商业用户
- **CDP 是唯一可行路径**

### 1.2 AI Outline

**是什么**：AI 驱动的内容创作工具，输入 prompt 或选择 CSI 话题 → 自动生成 video title、hashtags、hooks、六段式 script outline。

**六段式结构**：
1. Intro suggestions（开场建议）
2. Core talking points（核心要点）
3. A highlight moment for retention（留存亮点）
4. A climatic build（高潮递进）
5. Engagement-driven outro（互动结尾）
（官方文档列了 5 个 section，部分第三方报道说是 "six parts"——实际是包含 title + 5 段内容结构）

**可编辑操作**：refresh 获取新版本、缩短/加长、改风格（"Make this a tutorial"、"Refine the hook to be more engaging"）

**保存**：Save → Favorites → My Outlines

**可用性**：18+ 岁，美国/加拿大及部分市场。正在逐步扩展。

**入口**：CSI 话题详情页内（搜索 "Creator Search Insights" → 选任意话题 → AI Outline section）

**有 API 吗？** ❌ **完全无 API。** 只在 App/网页内交互使用。

### 1.3 Smart Split

**是什么**：AI 自动将长视频（>1分钟）切片为多条短视频，自动 clip、reframe 竖屏、加字幕、转写。

**对我们的价值**：❌ 不适合。我们已经是竖屏短视频，不需要从长视频切片。

**入口**：TikTok Studio Web (`tiktok.com/tiktokstudio`)，全局可用。

### 1.4 Creator Assistant

**是什么**：TikTok Studio 内的 AI 对话助手，帮写 captions、hashtags、内容灵感。

**对我们的价值**：⚠️ 有限。功能与 AI Outline 重叠，但更偏聊天式交互。适合临时灵感，不适合管线自动化。

### 1.5 Trending Topics

**是什么**：显示平台热门话题。

**对我们的价值**：⚠️ 补充价值。我们已有 `search-sources.mjs` 做趋势发现，Trending Topics 可作为额外数据源。CDP 可抓取。

### 1.6 Symphony Creative Studio

**是什么**：AI 生成 TikTok 风格视频广告，端到端从 top ad trends / templates / 参考视频生成。

**对我们的价值**：❌ 面向广告主，不是内容创作者。

### 1.7 Creator Weekly Report

**是什么**：每周自动生成账号表现摘要。

**对我们的价值**：✅ 有用。可作为 Analytics Workflow 的补充数据源。CDP 可抓取。

---

## 2. 对我们管线的集成价值评估

### 2.1 CSI + AI Outline — 最高价值

| 管线阶段 | 用途 | 数据/输出 | 接入方式 |
|----------|------|-----------|---------|
| Stage 0（选题） | Content Gap 话题发现 | 高搜索低供给的话题列表 JSON | CDP 抓取 `tiktok.com/inspiration` |
| Stage 1（scene-data 生成后） | AI Outline 生成 description + hashtags 候选 | title 候选、hashtags、hooks | CDP 在 AI Outline 输入 prompt → 提取输出 |
| Analytics Workflow ④b | Search Analytics 数据 | 搜索观看、搜索展示、CTR、搜索排名 | CDP 抓取 CSI 中的 Search Analytics 页面 |

### 2.2 为什么 AI Outline 应在 scene-data 生成后使用

**关键设计决策**：AI Outline 不应该参与 scene-data 的结构设计，而是在 scene-data 完成后，基于已有的视频内容生成最适合平台的 description 和 hashtags。

**理由**：

1. **不破坏场景结构**：我们的 scene-data 结构（hook → narrative → data → cta）是基于品牌系统、视觉模板、Remotion 渲染管线设计的。AI Outline 的六段式结构（intro → core points → highlight → climatic build → outro）是通用模板，如果让它参与 scene 设计，会破坏我们已有的视觉+渲染一致性。

2. **平台算法优化 vs 品牌一致性**：AI Outline 的优势在于它基于 TikTok 平台真实搜索数据生成 title/hashtags/hooks，更符合平台算法规则。但我们的品牌一致性（视觉风格、配色、字幕样式、品牌 bar）不能让 TikTok AI 来决定。正确做法是：**场景和视觉我们做，description 和 hashtags 让 AI Outline 优化**。

3. **metadata 字段的用途**：scene-data 中的 `metadata` 对象（`{ title, description, hashtags, commentHook, primaryEntity, trendingHashtags }`）是 `caption-utils.mjs` 的 `deriveTitle()` / `deriveDescription()` / `deriveHashtags()` 的**可选输入**。如果 `metadata` 存在且非空，这些函数会**直接使用 metadata 中的值**（而不是从 scenes 自动推导）。这意味着 AI Outline 的输出可以直接写入 `metadata`，管线会自动使用。

4. **管线已有降级机制**：`deriveHashtags()` 中有 `BLACKLISTED_HASHTAGS` 过滤器，即使 AI Outline 返回了 `#creatorsearchinsights`，管线也会自动过滤掉。所以让 AI Outline 生成 hashtags 是安全的——管线有兜底。

**正确的集成流程**：

```
Stage 0: 选题（CSI Content Gap 辅助）
  ↓
Stage 1: 写 scene-data（Agent 基于素材写 scenes + voiceover + texts）
  ↓
Stage 1b: AI Outline 生成（CDP，基于 scene-data 内容输入 prompt）
  → 提取 AI 生成的 title 候选、hashtags、hooks
  → 写入 scene-data 的 metadata 对象
  ↓
Stage 2: generate-caption.mjs 读取 metadata
  → deriveTitle/deriveDescription/deriveHashtags 使用 metadata 值
  → BLACKLISTED_HASHTAGS 过滤
  → SEO keyword 检查
  → 输出 tiktok-metadata.json
  ↓
Stage 5: 发布
```

### 2.3 为什么不一定要映射到我们的 scene 类型

AI Outline 的六段式结构（intro → core points → highlight → climatic build → outro）**不需要映射**到我们的 scene 类型（hook → narrative → data → cta）。

**原因**：
- AI Outline 生成的是 **description（帖文文字）和 hashtags**，不是视频结构
- 我们的视频结构由 scene-data 的 `visualType` 字段决定，由 Remotion 模板渲染
- description 是发布时写在帖文里的文字，观众在看视频时可能根本不读
- AI Outline 的六段式结构是用来帮创作者**想内容思路**的，不是用来规定视频结构的
- 我们已经有了自己的 scene 结构和 voiceover 脚本，AI Outline 的 script outline 可以作为**参考**（看它的 hook 写法、关键词选择），但不需要强制映射

**唯一值得参考的**：AI Outline 生成的 **title** 和 **hashtags**，因为这两个直接出现在帖文中，影响搜索和推荐。

### 2.4 `#creatorsearchinsights` 禁用是否合理

**结论：禁用是合理的，但原因需要更精确理解。**

**证据回顾**（`tiktok-competitor-intelligence.md` §3.2）：

| 视频 | 使用 `#creatorsearchinsights`? | 播放 | 搜索词 |
|------|-----|------|--------|
| #1（DeepSeek v1） | ❌ 没用 | 247（最高） | "deepseek" 22% |
| #2（DeepSeek v2） | ✅ 用了 | 119 | "creator insights part 3 4 5" |
| #3（Seedance） | ✅ 用了 | 104 | — |
| #4（Unitree） | ❌ 没用 | 98 | "robot seeks china" |

**分析**：
- 使用 `#creatorsearchinsights` 的两条视频平均播放 112，未使用的平均 172
- 更关键的是：使用该 tag 的视频 #2 的搜索词变成了 "creator insights part 3 4 5"——这说明这个 tag 把**想看 "Creator Search Insights 工具本身教程" 的用户**引到了我们的 DeepSeek 新闻视频里
- 这些用户的完播率极低（因为内容不匹配），导致算法判定内容质量差，减少推荐
- 这不是 tag 本身"有害"，而是 **tag 与内容不匹配** 导致受众错位

**但需要注意**：
- 样本量太小（4 条视频，2 条用了 tag），不能下统计学结论
- `#creatorsearchinsights` 是 TikTok 官方推广的工具名，很多创作者用它来标记 CSI 相关内容
- 如果我们做一条**关于 CSI 工具本身的教程视频**，用这个 tag 是合理的
- 当前禁用策略（`BLACKLISTED_HASHTAGS`）是对的——除非内容确实关于 CSI 工具本身，否则不用

**建议**：维持禁用。但改为 **条件禁用** 而非绝对禁用：如果视频内容是关于 TikTok 创作工具的，可以例外。目前管线中没有这类内容，所以绝对禁用实际效果等同。

### 2.5 Search Analytics — 比原来多什么维度

当前 Analytics CSV 导出（`analytics-utils.mjs`）包含的字段：

| 字段 | 来源 |
|------|------|
| title | CSV |
| postedAt | CSV |
| views | CSV |
| avgWatchTime | CSV |
| completionRate | CSV |
| shares | CSV |
| saves | CSV |
| comments | CSV |
| likes | CSV |

当前 CDP 抓取 TikTok Studio Analytics（`analytics-workflow.md` 步骤 ④b）追加的字段：

| 字段 | 来源 |
|------|------|
| hashtags | tiktok-metadata.json |
| searchQueries | CDP 抓取 Top 5 搜索词 |
| fypPercent | CDP 抓取流量来源分布 |
| searchPercent | CDP 抓取流量来源分布 |

**CSI Search Analytics 能多的维度**：

| 字段 | CSI 提供? | 当前有? | 价值 |
|------|-----------|---------|------|
| searchViews（搜索观看数） | ✅ | ❌ | 知道多少播放来自搜索 |
| searchImpressions（搜索展示数） | ✅ | ❌ | 视频在搜索结果中出现了多少次 |
| searchViewPercentage（搜索观看占比） | ✅ | ⚠️ 有 fypPercent/searchPercent 但不是 per-video | 每条视频的搜索流量占比 |
| averageCTR（平均点击率） | ✅ | ❌ | 搜索结果中用户点击你视频的比例 |
| searchRanking（搜索排名） | ✅ | ❌ | 视频在某个搜索词下的排名 |

**结论**：CSI Search Analytics 比当前方式多 5 个维度，其中 **searchViews + averageCTR + searchRanking** 是最有价值的——它们能直接回答"我的视频在搜索中表现如何"和"哪个搜索词给我带来最多流量"。

当前 `hashtag-effect-tracker.jsonl` 只有 `searchQueries`（总账号级别的搜索词 Top 5），不是 per-video 的。CSI 的 Search Analytics 可以提供 per-video 的搜索维度数据。

---

## 3. CDP 集成方案

### 3.1 总体架构

```
┌─────────────────────────────────────────────────────────┐
│  Content Pipeline                                       │
│                                                         │
│  Stage 0: 选题                                          │
│    ├── search-sources.mjs（现有趋势发现）               │
│    └── CSI Content Gap（CDP 抓取，新增）                │
│                                                         │
│  Stage 1: scene-data 生成                               │
│    └── Agent 写 scenes + voiceover + texts              │
│                                                         │
│  Stage 1b: AI Outline 生成（CDP，新增）                  │
│    ├── CDP 打开 tiktok.com/inspiration                  │
│    ├── 搜索相关话题 → 进入详情页                        │
│    ├── 在 AI Outline 输入 prompt（基于 scene-data 内容）│
│    ├── 提取生成的 title 候选、hashtags、hooks            │
│    └── 写入 scene-data 的 metadata 对象                 │
│                                                         │
│  Stage 2: generate-caption.mjs（现有）                  │
│    └── 读取 metadata → deriveTitle/Description/Hashtags │
│                                                         │
│  Stage 5: 发布                                          │
│    └── tiktok-metadata.json → 帖文                      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Analytics Workflow                                     │
│                                                         │
│  ④b: CSI Search Analytics（CDP，新增）                  │
│    ├── CDP 打开 CSI Search Analytics 页面               │
│    ├── 提取 per-video 搜索观看、CTR、搜索排名            │
│    └── 追加到 hashtag-effect-tracker.jsonl              │
└─────────────────────────────────────────────────────────┘
```

### 3.2 CDP 自动化风险与缓解

| 风险 | 严重性 | 缓解方案 |
|------|--------|---------|
| 页面 DOM 变化 | 中 | 用语义选择器 + 多个 fallback |
| 需要登录态 | 低 | web-access CDP 已有用户 TikTok session |
| 地区限制（AI Outline 可能不在我们地区可用） | 中 | 先手动检查可见性；CSI 23 国含美/加/新/日 |
| 反爬检测 | 低 | CDP 用真实浏览器 + 真实 session |
| AI Outline 生成质量不稳定 | 中 | 多次 refresh + 人工选择最佳 |
| AI Outline 输出含 BLACKLISTED_HASHTAGS | 低 | `deriveHashtags()` 已有自动过滤 |

### 3.3 CDP 前置验证结果（2026-08-26 已完成）

**验证方法**：用 web-access CDP 连接用户 Chrome（已登录 TikTok），打开 `tiktok.com/inspiration`。

**验证结果**：

| 验证项 | 结果 | 详情 |
|--------|------|------|
| CSI 可见 | ✅ 可见 | `tiktok.com/inspiration` 重定向到 `tiktok.com/csi`，话题列表正常加载 |
| 话题列表 | ✅ 正常 | 每页 ~20 个话题，含搜索热度、增长率 |
| Content Gap 过滤 | ✅ 可用 | 点击"内容缺口" chip 后过滤生效，返回高搜索低供给话题 |
| 话题详情页 | ✅ 可用 | URL: `tiktok.com/csi/detail/{topicId}`，含搜索热度、地区分布、人口统计、相关视频 |
| AI Outline | ❌ 桌面版不可用 | 话题详情页没有 AI Outline 交互组件。AI Outline 仅在移动端 App 内可用 |
| Search Analytics | ❌ 即将上线 | `tiktok.com/csi/analytics` 显示"数据分析功能即将在电脑端上线" |
| 用户登录态 | ✅ 已登录 | 页面显示中文界面，有通知、粉丝数据 |

**关键 DOM 结构**：

| 元素 | 选择器 | 用途 |
|------|--------|------|
| 话题行 | `tr` (含 4 个 `td`) | 话题名 + 搜索热度 + AI tips + 操作 |
| 话题名 | `td[class*=TdCell]` 第 1 列 | `tds[0].textContent` |
| 搜索热度+增长率 | `td[class*=TdCell]` 第 2 列 | `tds[1].textContent`（如 `148K1000%+`） |
| Content Gap chip | `[class*=Chip]` 文本含"内容缺口" | 点击切换过滤 |
| 导航-数据分析 | `span.HeaderTuxText` 文本="数据分析" | Search Analytics 入口（暂不可用） |

**方案调整**：

| Phase | 原计划 | 调整后 | 状态 |
|-------|--------|--------|------|
| Phase 1 (AI Outline) | CDP 生成 description/hashtags | ❌ 桌面版无 AI Outline。改为：Agent 在移动端手动使用 AI Outline | 搁置 |
| Phase 2 (Content Gap) | CDP 抓取话题列表 | ✅ 已实施 | `scripts/short-video/lib/tiktok-csi.mjs` |
| Phase 3 (Search Analytics) | CDP 抓取 per-video 搜索数据 | ❌ 桌面版"即将上线"。搁置 | 待 TikTok 上线后实施 |

**已实现功能**（`scripts/short-video/lib/tiktok-csi.mjs`）：

```bash
# 检查 CSI 可用性
node scripts/short-video/lib/tiktok-csi.mjs --check

# 获取 Content Gap 话题（高搜索低供给）
node scripts/short-video/lib/tiktok-csi.mjs --content-gap [--limit 20]

# 获取推荐话题
node scripts/short-video/lib/tiktok-csi.mjs --recommended [--limit 20]

# 获取话题详情（搜索热度、地区分布、人口统计）
node scripts/short-video/lib/tiktok-csi.mjs --detail <topicId>
```

---

## 4. 其他 Creator Tools 评估

| 工具 | 功能 | 对我们的价值 | 接入方式 |
|------|------|-------------|---------|
| Smart Split | 长视频→短视频自动切片 | ❌ 不适合，我们已是竖屏短视频 | - |
| Creator Assistant | AI 对话助手，帮写 captions/hashtags | ⚠️ 与 AI Outline 重叠，更偏聊天式 | CDP |
| Trending Topics | 平台热门话题 | ⚠️ 补充 `search-sources.mjs` 的数据源 | CDP 可抓取 |
| Creation Inspirations | 推荐内容创意 | ⚠️ 与 CSI 重叠 | CDP 可抓取 |
| Symphony Creative Studio | AI 生成 TikTok 风格视频广告 | ❌ 面向广告主 | - |
| Creator Weekly Report | 每周账号表现摘要 | ✅ Analytics Workflow 补充数据源 | CDP/邮件 |
| Content Library (Film & TV) | 正版影视片段 | ❌ 非我们内容类型 | - |
| TikTok Studio Analytics | 视频数据分析 | ✅ 已在用（CDP 抓取方式） | 已集成 |

---

## 5. TikTok API 体系总结

| API | 覆盖范围 | 对我们可用? | 原因 |
|-----|---------|------------|------|
| Research API (`open.tiktokapis.com/v2/research/`) | 公开视频/用户数据查询 | ❌ | 仅限学术/非营利，creators/commercial 不可申请，4周审核 |
| Business API (`business-api.tiktok.com`) | 广告管理（campaign/ad 管理+分析） | ❌ | 只覆盖广告数据，不覆盖 CSI/AI Outline |
| Content Posting API | 从第三方发布视频到 TikTok | ✅ 已用（通过 Publora） | 只管发布，不管 CSI/AI Outline |
| Creator Marketplace API | 影响者营销数据 | ❌ | 面向广告主找 KOL |
| Login & Identity / Share to TikTok | 第三方登录 + 分享 | ❌ | 不相关 |
| CSI / AI Outline | 搜索趋势 + AI 生成内容 | ❌ 无 API | 只在 App/网页内交互 |

**结论**：TikTok 没有任何官方 API 提供 CSI 或 AI Outline 的数据。**CDP 是唯一可行的自动化路径。**

---

## 6. 数据来源

- TikTok Creator Academy — AI Outline: https://www.tiktok.com/creator-academy/article/ai-outline
- TikTok Creator Academy — Creator Search Insights: https://www.tiktok.com/creator-academy/article/creator-search-insights
- TikTok Creator Academy — Finding Creator Search Insights: https://www.tiktok.com/creator-academy/article/finding-creator-search-insights
- TikTok Newsroom — AI-powered tools: https://newsroom.tiktok.com/new-ai-powered-tools-to-make-it-easier-to-create-and-share-on-tiktok
- TikTok Developers — Research API: https://developers.tiktok.com/docs/en/research-api-get-started
- TikTok Developers — Research API FAQ: https://developers.tiktok.com/doc/research-api-faq
- TikTok Developers — Research Tools eligibility: https://developers.tiktok.com/products/research-api/
- Mashable — TikTok AI Outline and Smart Split: https://mashable.com/article/tiktok-features-ai-outline-smart-split
- Metricool — TikTok's New AI Tools: https://metricool.com/tiktok-new-ai-tools/
- Storrito — How TikTok's Smart Split and AI Outline Tools Work: https://storrito.com/resources/tiktok-smart-split-ai-outline-how-it-works/
- 9to5Mac — TikTok U.S. Creator Summit: https://9to5mac.com/2025/10/28/three-new-features-announced-today-at-the-tiktok-u-s-creator-summit/
- Reddit r/TikTokSearchInsights — CSI desktop launch: https://www.reddit.com/r/TikTokSearchInsights/comments/1lxdnaa/creator_search_insights_is_now_on_desktop/
- ScrapeBadger — TikTok Scraping APIs in 2026: https://scrapebadger.com/blog/tiktok-scraping-apis-in-2026-the-complete-deep-guide
- Xpoz — TikTok Research API limits: https://www.xpoz.ai/blog/guides/tiktok-research-api-limits-access-and-alternatives/
