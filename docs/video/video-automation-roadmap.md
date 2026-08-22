# Video Automation Roadmap

> 创建于 2026-08-02。分 Phase 文档，支持跨 session 续接。
> 每开新 session 时，agent 读此文档，找到下一个 `TODO` 的 Phase，继续执行。
> 参考来源：ManiClones（全流程 pipeline）、sickn33（TikTok API 发布）、sergebulaev/tiktok-skills（知识层 + Publora 发布）。

---

## 已代码化 ✅

| 维度                   | 实现方式                                     | 文件                        |
| ---------------------- | -------------------------------------------- | --------------------------- |
| Hook 公式选择          | Agent 在 Step 2 遵循 + verify 检查           | SKILL.md + verify-video.mjs |
| 去 AI 味 3 层 scrub    | verify-video.mjs B1/B3/B4/B7/B9              | verify-video.mjs            |
| 一口气检查             | verify-video.mjs W6（>25 词 = warning）      | verify-video.mjs            |
| 循环闭合检查           | verify-video.mjs W3（关键词重叠）            | verify-video.mjs            |
| 提词器节奏             | verify-video.mjs W4（行长度变化）            | verify-video.mjs            |
| CTA 堆叠               | verify-video.mjs W7（>=3 CTA = warning）     | verify-video.mjs            |
| 主要目标聚焦           | verify-video.mjs W9（<=2 goal signals）      | verify-video.mjs            |
| Caption + Hashtag 生成 | Agent 在 Step 7 生成                         | SKILL.md                    |
| 视频制作 pipeline      | main.mjs (TTS -> HTML -> Record -> Assemble) | scripts/short-video/        |
| 验收门禁               | verify-video.mjs（20+ 自动检查）             | scripts/short-video/        |

---

## Phase 1: 发布效率（低依赖，立即可做）

> 目标：减少每次发布的人工操作。不依赖外部服务审批。
> 预计：2 个 issue，可在 1-2 个 session 内完成。

### ISSUE-02: Caption + Hashtag 自动输出为文件

- **状态**: DONE
- **现状**: verify 通过后自动生成 tiktok-caption.txt + tiktok-metadata.json
- **目标**: verify-video.mjs 通过后，自动生成 `output/tiktok-caption.txt`（caption <=2200 chars + 3-5 hashtag + title <=60 chars）
- **方案**: 在 verify-video.mjs 末尾加 caption 生成逻辑，从 scene-data 提取关键词 + 组装 caption
- **文件**: `scripts/short-video/verify-video.mjs`（扩展）或 `scripts/short-video/generate-caption.mjs`（新建）
- **依赖**: 无
- **完成标志**: verify-video.mjs 通过后 `output/tiktok-caption.txt` 存在且内容正确

### ISSUE-04: 新闻趋势监控脚本

- **状态**: DONE
- **现状**: search-sources.mjs 抓取 5 源，输出 trending-topics.json
- **目标**: 脚本自动抓取多源（36氪/量子位/机器之心/TechCrunch/Bloomberg），提取 China AI 相关标题，按爆发/发酵/数据/科普分类，输出 `output/trending-topics.json`
- **方案**: 用 web-access skill（Chrome CDP）抓取 -> 提取标题 -> 分类
- **命令设计**: `node scripts/short-video/search-sources.mjs` -> 输出 JSON -> agent 可直接读取选题
- **文件**: `scripts/short-video/search-sources.mjs`（新建）
- **依赖**: 无（web-access skill 已安装）
- **完成标志**: 运行脚本后 `output/trending-topics.json` 存在，含至少 5 条分类好的选题

**Phase 1 完成标志**: ISSUE-02 + ISSUE-04 均为 DONE

---

## Phase 2: 发布自动化（需要 TikTok 开发者账号）

> 目标：脚本直接发布到 TikTok，不再手动上传。
> 前提：TikTok 开发者 App 通过审核（见下方 FAQ）。

### ISSUE-01: TikTok API 发布自动化

- **状态**: TODO
- **现状**: 手动在 TikTok App 里上传视频、粘贴 caption、设 AIGC 标签
- **目标**: 脚本自动上传 MP4 -> 写 caption -> 设参数 -> 发布/排期
- **参考**:
  - sickn33 `tiktok-automation`（Rube MCP/Composio）：`TIKTOK_UPLOAD_VIDEO` -> `FETCH_PUBLISH_STATUS` -> `TIKTOK_PUBLISH_VIDEO`
  - sergebulaev `lib/publora_client.py`（Publora API）：`create_draft` -> `get_upload_url` -> `upload_to_presigned` -> `schedule_post`
- **方案**: 先试 Publora（中间层，不需要 App Review）；如果 Publora 不行，走 TikTok Direct API（需要 App Review）
- **参数**: `privacy_level: PUBLIC_TO_EVERYONE`、`disable_duet`、`disable_stitch`、`disable_comment`
- **风险**: 未审核 App = SELF_ONLY；布尔反转 bug；AIGC 标签可能 API 不支持
- **文件**: `scripts/short-video/publish-tiktok.mjs`（新建）
- **依赖**: TikTok 开发者账号（见 FAQ）
- **完成标志**: 运行脚本后视频出现在 TikTok 账号且为 public

### ISSUE-03: 跨平台排期

- **状态**: TODO
- **现状**: 无排期工具
- **目标**: 一个脚本管理 TikTok / YouTube Shorts / Instagram Reels 的发布排期
- **参考**: ManiClones 用 Postiz CLI（`postiz schedule --file ... --platform tiktok --time ...`）
- **方案**: 用 Postiz（开源 Docker 自部署）或直接调各平台 API
- **文件**: `scripts/short-video/schedule.mjs`（新建）
- **依赖**: ISSUE-01（TikTok 发布能力）
- **完成标志**: 一个命令可以排期到 3 个平台

**Phase 2 完成标志**: ISSUE-01 + ISSUE-03 均为 DONE

---

## Phase 3: 选题与规划自动化

> 目标：从"手动想选题"到"脚本推荐选题 + 生成周计划"。
> 依赖：Phase 1 的 ISSUE-04（趋势监控）

### ISSUE-06: 内容日历生成器

- **状态**: TODO
- **现状**: News Content Calendar 只是方法论指南
- **目标**: 输入 trending-topics.json -> 按支柱比例（突发 40% / 分析 30% / 数据 20% / 科普 10%）分配 -> 输出 `output/weekly-plan.json`（每天：类型/Hook 公式/时长/目标）
- **方案**: 读取 ISSUE-04 输出的 JSON -> 按支柱分配 -> 输出日历
- **命令设计**: `node scripts/short-video/generate-calendar.mjs` -> 输出周计划 -> agent 按计划写 scene-data
- **文件**: `scripts/short-video/generate-calendar.mjs`（新建）
- **依赖**: ISSUE-04
- **完成标志**: 运行脚本后 `output/weekly-plan.json` 存在，含 7 天计划

### ISSUE-05: 竞品情报脚本

- **状态**: TODO
- **现状**: Competitive Intelligence 只是方法论指南
- **目标**: 脚本自动搜索 TikTok "China AI" 相关账号，提取高播放视频的前 3 秒结构、时长、字幕风格，输出 `output/competitor-analysis.json`
- **方案**: 用 web-access skill 抓取 TikTok 搜索页 -> 解析视频列表 -> 输出分析
- **文件**: `scripts/short-video/competitor-intel.mjs`（新建）
- **依赖**: 无
- **完成标志**: 运行脚本后 `output/competitor-analysis.json` 存在，含至少 3 个竞品账号分析

**Phase 3 完成标志**: ISSUE-05 + ISSUE-06 均为 DONE

---

## Phase 4: 规模化生产

> 目标：从"一次做一条"到"一次做一批"。
> 依赖：Phase 3（选题自动化）

### ISSUE-07: 批量脚本生成

- **状态**: TODO
- **现状**: 每次只生成一条视频的 scene-data
- **目标**: 给定多个话题（来自 weekly-plan.json），一次生成多个 scene-data 文件
- **参考**: ManiClones 一次生成 14 个脚本 + content-calendar.csv
- **方案**: agent 批量处理话题列表 -> 输出 `scene-data-{topic-slug}.mjs` x N
- **文件**: `scripts/short-video/batch-generate.mjs`（新建）
- **依赖**: ISSUE-06（内容日历）
- **完成标志**: 运行后生成 >=3 个 scene-data 文件

### ISSUE-08: 批量视频制作

- **状态**: TODO
- **现状**: pipeline 每次只处理一个 scene-data -> 一个视频
- **目标**: 顺序处理多个 scene-data 文件，批量输出多个视频
- **方案**: main.mjs 循环调用，或新写 batch-main.mjs
- **文件**: `scripts/short-video/batch-main.mjs`（新建）
- **依赖**: ISSUE-07
- **完成标志**: 一次运行产出 >=3 个 MP4 文件

### ISSUE-09: Hook 批处理（常青草稿预制）

- **状态**: TODO
- **现状**: 无常青模板库
- **目标**: 维护 `evergreen-templates/` 目录，预存 5-10 个常青话题的 scene-data 草稿，事件来时只需改 Hook
- **文件**: `scripts/short-video/evergreen-templates/`（新建目录 + 5-10 个 .mjs 文件）
- **依赖**: 无
- **完成标志**: 目录存在，含 >=5 个常青 scene-data 草稿

**Phase 4 完成标志**: ISSUE-07 + ISSUE-08 + ISSUE-09 均为 DONE

---

## Phase 5: 分析与优化闭环

> 目标：发布后追踪数据 -> 反馈到下一批脚本生成。
> 依赖：Phase 2（发布自动化）

### ISSUE-10: 发布后分析追踪

- **状态**: TODO
- **现状**: 发布后无数据追踪
- **目标**: 每周导出 TikTok 分析数据（播放/完成率/分享/收藏/评论），输出 `output/analytics-weekXX.json`
- **参考**: ManiClones 用 Postiz analytics -> CSV 导出
- **方案**: TikTok Analytics API 或手动导出 -> JSON 标准化
- **文件**: `scripts/short-video/export-analytics.mjs`（新建）
- **依赖**: ISSUE-01（API 发布，需要 API access 才能读 analytics）
- **完成标志**: 运行脚本后输出含 7 天数据的 JSON

### ISSUE-11: 分析 -> 脚本优化闭环

- **状态**: TODO
- **现状**: 无反馈机制
- **目标**: 分析上周 top 3 / bottom 3 视频 -> 提取成功/失败模式 -> 调整下周脚本生成策略
- **参考**: ManiClones "Analyze the performance data..."
- **方案**: agent 读取 analytics JSON -> 生成优化建议 -> 注入下周 scene-data 生成
- **文件**: SKILL.md 扩展（新增 Step 8: Analytics & Optimization）
- **依赖**: ISSUE-10
- **完成标志**: SKILL.md 含 Step 8，agent 能读取 analytics 并生成建议

### ISSUE-12: A/B 测试框架

- **状态**: TODO
- **现状**: 无系统化 A/B 测试
- **目标**: 每次只改一个变量（Hook / 长度 / 发布时间 / caption），跑 7+ 条对比
- **方案**: 维护 A/B 测试矩阵 -> 追踪结果 -> 输出胜出版本
- **文件**: `scripts/short-video/ab-test-tracker.mjs`（新建）
- **依赖**: ISSUE-10
- **完成标志**: 脚本能记录 A/B 测试变量和结果，输出胜出版本

**Phase 5 完成标志**: ISSUE-10 + ISSUE-11 + ISSUE-12 均为 DONE

---

## Phase 6: 内容再利用

> 目标：视频做完后反向生成文章/Newsletter/社交媒体帖子。
> 依赖：无（可独立做）

### ISSUE-13: 视频内容 -> 文章/Newsletter/社交媒体

- **状态**: DONE
- **现状**: repurpose-content.mjs 已实现，仅在明确要求时运行（不在默认工作流中）
- **目标**: 从视频 scene-data 反向生成 blog 文章、newsletter、X thread
- **参考**: ManiClones "Repurpose top-performing scripts into blog posts, newsletters, Twitter threads"
- **方案**: agent 读取 scene-data -> 按平台格式重写 -> 输出到各平台模板
- **文件**: `scripts/short-video/repurpose-content.mjs`（新建）
- **依赖**: 无
- **完成标志**: 运行后从 scene-data 生成 blog + newsletter + X thread 三种格式

**Phase 6 完成标志**: ISSUE-13 为 DONE

---

## Phase 7: 文章创作管线（源素材 → 富文章 → 网站发布）

> 目标：从源素材（PDF/链接/调研）自动生成带可交互 widget 的富文章，并发布到网站。
> 这是一条独立工作流，与视频管线并行存在。
> 大多数内容先有文章，再从文章做视频。

### ISSUE-14: 源素材读取与结构化

- **状态**: DONE
- **现状**: `docs/article-workflow.md` Part 1 文档化了 agent 读取 PDF/网页/文本的工作流
- **目标**: agent 工作流 — 给定任意源素材（PDF/URL/话题/报告）→ agent 读取 → 提取关键信息 → 输出结构化内容
- **素材类型**: PDF 转文本、新闻 URL、研究报告、社交媒体帖子、视频脚本 — 任何包含信息的输入
- **方案**: **Agent 工作流（非脚本）**
  - PDF: agent 用 `web-access` skill 或 `pdf-parse` 读取
  - 网页: agent 用 `web-access` skill (CDP) 抓取
  - 输出: agent 直接理解素材，不需要中间 JSON
  - 参考: DeepSeek 文章创作过程 — 读 42 页投资者会议录音 → 提取核心叙事、人物、数据点
- **文件**: `docs/article-workflow.md` Part 1
- **依赖**: 无
- **完成标志**: 给 agent 任意源素材 → agent 能读取并提取核心信息

### ISSUE-15: 富文章生成（markdown + widget 标记 + 扩展内容）

- **状态**: DONE
- **现状**: `docs/article-workflow.md` Part 2 文档化了富文章生成工作流
- **目标**: agent 工作流 — 读源素材 → 总结核心叙事 → **根据内容主动扩展** → 选择/创建增强 widget → 写富文章
- **方案**: **Agent 工作流（非脚本）**
  - agent 读 `src/components/widgets/registry.ts` 获取已有 widget 列表
  - agent 根据素材内容决定用哪些 widget + 在哪里插入
  - agent 可以创建新 widget（需要写 React 组件 + 注册）
  - agent curate widget 数据（从素材提取 + 补充调研）
  - 输出: frontmatter markdown 文件，供 `publish-article.mjs` 消费
- **关键**: 不是纯总结，是 **总结 + 扩展**。agent 要根据素材主动增加交互内容和原创分析
- **文件**: `docs/article-workflow.md` Part 2
- **依赖**: ISSUE-14
- **完成标志**: 给 agent 源素材 → agent 写出带 widget 标记 + 原创分析的富文章

### ISSUE-16: 文章发布到网站（Supabase API）

- **状态**: DONE
- **现状**: `scripts/article/publish-article.mjs` 已实现，通过 Admin 账号登录 Supabase Auth，REST API upsert by slug
- **目标**: 脚本直接写入 Supabase `posts` 表 → 自动发布
- **方案**: **代码实现**
  - 用 Admin 账号（`.env.local` 中 ADMIN_EMAIL/ADMIN_PASSWORD）登录 Supabase Auth 拿 access token
  - 调用 Supabase REST API upsert by slug（INSERT 或 UPDATE，保留 published_at）
  - 输入: frontmatter markdown 文件（title, slug, excerpt, content, published）
- **文件**: `scripts/article/publish-article.mjs` + `scripts/article/lib/supabase-auth.mjs` + `scripts/article/lib/publish-utils.mjs`
- **依赖**: ISSUE-15
- **完成标志**: 运行脚本后文章出现在网站 `/posts/{slug}`

### ISSUE-17: 文章 → scene-data 桥接

- **状态**: DONE
- **现状**: `docs/article-workflow.md` Part 3 文档化了文章→视频的桥接工作流
- **目标**: agent 工作流 — 读已发布文章 → 提炼核心叙事 → 写 scene-data
- **方案**: **Agent 工作流（非脚本）**
  - agent 从 Supabase 或 admin editor 读取文章 content
  - 按文章结构提炼核心叙事线
  - 直接写 scene-data.mjs（不需要中间脚本）
  - 参考: DeepSeek 文章 → 视频的过程
- **文件**: `docs/article-workflow.md` Part 3
- **依赖**: ISSUE-16
- **完成标志**: 给 agent 一篇已发布文章 → agent 生成可用的 scene-data

**Phase 7 完成标志**: ISSUE-14 + ISSUE-15 + ISSUE-16 + ISSUE-17 均为 DONE

---

## Phase 8: 分析自动化（消除手动录入）

> 目标：自动获取 TikTok 播放数据，不再手动从 dashboard 录入。
> 依赖：Phase 2（ISSUE-01 发布能力）

### ISSUE-18: TikTok Analytics 自动获取

- **状态**: DONE（方案 C 先行）
- **现状**: `scripts/short-video/fetch-tiktok-analytics.mjs` 已实现，解析 TikTok Analytics CSV 导出为标准化 JSON
- **目标**: 脚本自动获取已发布视频的播放数据
- **方案**: 方案 C（CSV 解析）先行，方案 A（TikTok 开发者 API）待 App Review 通过后切换
  - 方案 A: 注册自己的 TikTok 开发者 App → Content Posting API → analytics 端点（需要 App Review）
  - 方案 B: CDP 抓取 TikTok Analytics 页面（需要登录态，fragile）
  - 方案 C: 手动导出 CSV → 脚本解析（半自动）✅ 已实现
- **文件**: `scripts/short-video/fetch-tiktok-analytics.mjs` + `scripts/short-video/lib/analytics-utils.mjs`
- **依赖**: ISSUE-01
- **完成标志**: 运行脚本后输出含 views/completion/shares/saves 的 JSON

### ISSUE-19: 发布后自动触发分析

- **状态**: DONE
- **现状**: `publish-tiktok.mjs` 发布成功后自动写入 `pending-analysis.json` + 打印分析指引
- **目标**: publish-tiktok.mjs 发布成功后 → 自动写入 pending-analysis.json + 输出操作指引
- **方案**: 在 publish-tiktok.mjs 末尾加 pending-analysis.json 写入 + 控制台提示（agent 后续 session 检查）
- **文件**: `scripts/short-video/publish-tiktok.mjs`（扩展）+ `scripts/short-video/lib/publish-utils.mjs`（buildPendingAnalysis + buildAnalyticsGuidance）
- **依赖**: ISSUE-18
- **完成标志**: 发布后 agent 自动提示分析步骤

**Phase 8 完成标志**: ISSUE-18 + ISSUE-19 均为 DONE

---

## 依赖关系图

```
Phase 1                    Phase 2                  Phase 3
ISSUE-02 (caption)         ISSUE-01 (API发布)       ISSUE-05 (竞品)
ISSUE-04 (趋势监控) ──→ ISSUE-03 (排期) ←─┘        ISSUE-06 (日历) ← ISSUE-04
                               │
                               ▼
Phase 4                    Phase 5                  Phase 6
ISSUE-07 (批量脚本) ← ISSUE-06    ISSUE-10 (分析) ← ISSUE-01   ISSUE-13 (再利用)
ISSUE-08 (批量制作) ← ISSUE-07   ISSUE-11 (优化) ← ISSUE-10
ISSUE-09 (常青模板)               ISSUE-12 (A/B) ← ISSUE-10
```

---

## 跨 Session 续接指南

新开 session 时，agent 应：

1. 读取此文档
2. 找到第一个含 `TODO` 状态的 ISSUE
3. 确认该 ISSUE 的依赖项是否已完成
4. 按 AGENTS.md 标准工作流执行（Grill -> Spec -> Tickets -> TDD -> Review -> Validate -> Commit）
5. 完成后将该 ISSUE 状态改为 `DONE`，写入完成日期和 commit hash
6. 继续下一个 TODO ISSUE

### 进度追踪

| Phase | Issue                    | 状态 | 完成日期   | Commit                                                                   |
| ----- | ------------------------ | ---- | ---------- | ------------------------------------------------------------------------ |
| 1     | ISSUE-02 (Caption 输出)  | DONE | 2026-08-02 | feat(video): add caption generation + trend discovery                    |
| 1     | ISSUE-04 (趋势监控)      | DONE | 2026-08-02 | feat(video): add caption generation + trend discovery                    |
| 2     | ISSUE-01 (API 发布)      | DONE | 2026-08-02 | feat(video): add TikTok publish via Publora                              |
| 2     | ISSUE-03 (跨平台排期)    | DONE | 2026-08-02 | feat(video): add batch roadmap scripts (Phase 2-6)                       |
| 3     | ISSUE-05 (竞品情报)      | DONE | 2026-08-02 | feat(video): add batch roadmap scripts (Phase 2-6)                       |
| 3     | ISSUE-06 (内容日历)      | DONE | 2026-08-02 | feat(video): add batch roadmap scripts (Phase 2-6)                       |
| 4     | ISSUE-07 (批量脚本)      | DONE | 2026-08-02 | feat(video): add batch roadmap scripts (Phase 2-6)                       |
| 4     | ISSUE-08 (批量制作)      | DONE | 2026-08-02 | feat(video): add batch roadmap scripts (Phase 2-6)                       |
| 4     | ISSUE-09 (常青模板)      | DONE | 2026-08-02 | feat(video): add batch roadmap scripts (Phase 2-6)                       |
| 5     | ISSUE-10 (分析追踪)      | DONE | 2026-08-02 | feat(video): add batch roadmap scripts (Phase 2-6)                       |
| 5     | ISSUE-11 (优化闭环)      | DONE | 2026-08-02 | feat(video): add batch roadmap scripts (Phase 2-6)                       |
| 5     | ISSUE-12 (A/B 测试)      | DONE | 2026-08-02 | feat(video): add batch roadmap scripts (Phase 2-6)                       |
| 6     | ISSUE-13 (内容再利用)    | DONE | 2026-08-02 | feat(video): add batch roadmap scripts (Phase 2-6)                       |
| 7     | ISSUE-14 (源素材读取)    | DONE | 2026-08-03 | feat(article): Phase 2 roadmap — article pipeline + analytics automation |
| 7     | ISSUE-15 (富文章生成)    | DONE | 2026-08-03 | feat(article): Phase 2 roadmap — article pipeline + analytics automation |
| 7     | ISSUE-16 (网站发布)      | DONE | 2026-08-03 | feat(article): Phase 2 roadmap — article pipeline + analytics automation |
| 7     | ISSUE-17 (文章→视频)     | DONE | 2026-08-03 | feat(article): Phase 2 roadmap — article pipeline + analytics automation |
| 8     | ISSUE-18 (Analytics自动) | DONE | 2026-08-03 | feat(article): Phase 2 roadmap — article pipeline + analytics automation |
| 8     | ISSUE-19 (发布后触发)    | DONE | 2026-08-03 | feat(article): Phase 2 roadmap — article pipeline + analytics automation |

---

## FAQ

### Q: "TikTok App 必须通过审核"是什么意思？

你在 TikTok App 里发视频 = **个人用户行为**，不需要任何审核。

但如果要用**代码/API 自动发布**到 TikTok，你需要：

1. 注册 [TikTok 开发者账号](https://developers.tiktok.com)
2. 创建一个 App（拿到 client key + secret）
3. 申请 Content Posting API 权限
4. TikTok 审核 App（可能需要几天到几周）
5. 审核通过后 = 可以 public 发布
6. **审核未通过 = 所有 API 发布强制 SELF_ONLY（仅自己可见）**

**变通方案**：

- **Publora**（sergebulaev 社区 skill 用的）：中间层服务，用他们的 App 审核过的 API key，你不需要自己过审核。但需要注册 Publora 账号。
- **Rube MCP/Composio**（sickn33 社区 skill 用的）：类似中间层，OAuth 连接你的 TikTok 账号。

**所以 Phase 2 的 ISSUE-01 建议先试 Publora 或 Rube**，不走自己的 App Review。

### Q: 为什么吸收了 X (Twitter) 上的 skill？

ManiClones 的 skill 发布在 X 的 article 功能上（`x.com/i/article/...`）。它不是"X 的 skill"——它是一个用 X 作为发布平台的社区作者写的 skill，内容讲的是 TikTok/Instagram/YouTube 自动化。

来源分类：

- **sergebulaev/tiktok-skills**：GitHub 开源仓库，8 个 skill + Python 库。专做 TikTok。
- **ManiClones**：X article，全流程自动化 pipeline。讲 TikTok + IG + YT。
- **sickn33**：GitHub 仓库，TikTok API 发布。专做 TikTok。
- **nanoskill.ai 博客**：博客文章，6 个 TikTok skill 综述。

### Q: 方法论代码化后，我能发一条命令让 agent 一路监控处理吗？

**可以，但分两种**：

**已代码化**（verify-video.mjs 里的 20+ 检查）：你不需要发命令。agent 跑 pipeline 时自动执行，失败自动修。你只说"做视频"，agent 全程自动。

**未代码化**（Roadmap 里的 ISSUE）：需要先开发成脚本，开发完成后你可以：

```bash
# Phase 1 完成后
node scripts/short-video/search-sources.mjs    # 抓趋势
node scripts/short-video/verify-video.mjs --tiktok  # 验证 + 输出 caption
```

或者对 agent 说：

> "跑 search-sources，然后选一个话题做视频"

Agent 会执行：discover -> 读 JSON -> 选话题 -> 写 scene-data -> 跑 pipeline -> verify -> 输出 caption。

这就是 Phase 1 的最终目标——你发一条命令，agent 从选题到输出 caption 全自动。

### Q: Profile 设置在哪？

见 `docs/tiktok/tiktok-profile-setup.md`（独立文档，手动操作参考）。
