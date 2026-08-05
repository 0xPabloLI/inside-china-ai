# Spec: Phase 2 Roadmap — 文章创作管线 + 分析自动化

## Summary

Phase 2 Roadmap 实现「源素材 → 富文章 → 网站发布 → 视频」这条独立工作流（工作流 B），并补全 TikTok Analytics 自动获取与发布后触发分析。共 6 个 ISSUE（14-19），分为三类交付物：

1. **Agent 工作流文档**（ISSUE-14, 15, 17）— 不需要代码，记录 agent 操作规范
2. **代码脚本**（ISSUE-16, 18, 19）— 需 TDD 实现
3. **手工操作文档**（新增）— 集中所有需要人工执行的步骤

## Background

Phase 1（ISSUE-01~13）已完成视频管线的全部脚本化。Phase 2 补全文章优先工作流：大多数内容先有文章，再从文章做视频。同时解决 Analytics 数据的手动获取问题。

### 架构约束（Grill 确认）

- **Widget 数据保持代码硬编码**：Widget 组件 + 数据打包在前端，不迁移到数据库。新 widget 需要 `npm run build` + 部署后才能发布含该 widget 的文章。
- **`publish-article.mjs` 用 Admin 账号登录**：`.env.local` 中已有 `ADMIN_EMAIL` + `ADMIN_PASSWORD`，通过 Supabase Auth API 登录拿 access token，RLS 正常工作。不使用 Service Role Key（Lovable 管理的 Supabase，本地无此 key）。
- **ISSUE-18 方案 C 先行**：普通 TikTok 账号可从 `analytics.tiktok.com` 导出 CSV，脚本解析为标准化 JSON。预留方案 A（TikTok 开发者 API）切换空间。
- **ISSUE-19 发布时写 `pending-analysis.json`**：不自动执行分析（TikTok 数据需 24-48h 才可用），只记录待分析状态 + 输出操作指引。

## Requirements

### ISSUE-14: 源素材读取（Agent 工作流文档）

**交付物**: `docs/article-workflow.md` 的「源素材读取」章节

**内容**:

- PDF → 用 `web-access` skill 或 npm `pdf-parse` 读取文本
- 网页 → 用 `web-access` skill (CDP) 抓取
- 纯文本 → 直接读取
- Agent 提取：核心叙事线、关键人物/公司、数据点、引用语句
- 不需要中间 JSON 输出，agent 直接在记忆中理解

### ISSUE-15: 富文章生成（Agent 工作流文档 — 核心 ISSUE）

**交付物**: `docs/article-workflow.md` 的「富文章生成」章节

**内容**:

- 读源素材（ISSUE-14 输出）→ 总结核心叙事 → 拆分章节
- 对每个章节思考「什么交互内容能增强这段？」→ 选择 widget
- 为每个 widget curate 数据（从素材提取 + 外部调研补充）
- 写 widget 组件（如需新 widget）→ 在 `registry.ts` 注册 → `npm run build` 部署
- 写 markdown 文章，在合适位置嵌入 `<!-- widget:widget-id -->` 标记
- 加原创分析章节（「My Take」）
- 输出 frontmatter markdown 文件供 `publish-article.mjs` 消费

**Frontmatter 格式**:

```yaml
---
title: "Article Title"
slug: "article-slug"
excerpt: "Short description for SEO and preview"
published: true
---
```

### ISSUE-16: 文章发布到网站（代码）

**交付物**:

- `scripts/article/lib/supabase-auth.mjs` — 共享认证模块
- `scripts/article/publish-article.mjs` — 发布脚本
- `scripts/article/__tests__/publish-article.test.mjs` — 单元测试

**认证模块** (`supabase-auth.mjs`):

- 从 `.env.local` 读取 `ADMIN_EMAIL` + `ADMIN_PASSWORD` + `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY`
- 调用 Supabase Auth API (`POST /auth/v1/token?grant_type=password`) 登录
- 返回 `{ access_token, user: { id } }`
- 失败时抛出明确错误

**发布脚本** (`publish-article.mjs`):

- 输入：frontmatter markdown 文件路径（CLI 参数 `--file <path>`）
- 解析 frontmatter（title, slug, excerpt, published）+ body（markdown content）
- 如 frontmatter 无 slug，从 title 自动生成（与 admin.tsx `slugify` 逻辑一致）
- 用 `supabase-auth.mjs` 登录拿 access token
- 调用 Supabase REST API upsert by slug：
  - slug 不存在 → INSERT（设 `author_id` = 登录用户 UUID，`published_at` = now if published）
  - slug 已存在 → UPDATE（保留原 `published_at`，不覆盖）
- 输出：文章 URL（`/posts/{slug}`）或错误信息

### ISSUE-17: 文章 → scene-data 桥接（Agent 工作流文档）

**交付物**: `docs/article-workflow.md` 的「文章 → 视频」章节

**内容**:

- Agent 读已发布文章的 content
- 提炼核心叙事线（去掉 widget 标记，取 markdown 内容）
- 按 TikTok 节奏重构为 10-12 个场景
- 直接写 `scene-data.mjs`
- 然后走工作流 A 的 main.mjs → verify → publish-tiktok

### ISSUE-18: TikTok Analytics 自动获取（代码，方案 C）

**交付物**:

- `scripts/short-video/fetch-tiktok-analytics.mjs` — CSV 解析脚本
- `scripts/short-video/__tests__/fetch-tiktok-analytics.test.mjs` — 单元测试

**脚本设计**:

- 输入：CSV 文件路径（CLI 参数 `--csv <path>`）
- 输出：`output/analytics-weekXX.json`（XX = 从 CSV 数据推导的周数或当前周数）
- CSV 列名容错匹配（模糊匹配，如 "Views" vs "Video views" vs "视频播放量"）
- 缺失列 → 对应字段设为 `null`
- 输出 JSON schema:

```json
{
  "exportedAt": "ISO timestamp",
  "source": "csv",
  "videos": [
    {
      "title": "string",
      "postedAt": "ISO timestamp",
      "views": number | null,
      "avgWatchTime": string | null,
      "completionRate": number | null,
      "shares": number | null,
      "saves": number | null,
      "comments": number | null,
      "likes": number | null
    }
  ]
}
```

- 预留方案 A 切换：解析逻辑封装为独立函数，未来加 API fetcher 时输出同一 schema

### ISSUE-19: 发布后自动触发分析（代码）

**交付物**: 扩展 `scripts/short-video/publish-tiktok.mjs`

**行为**:

- 发布成功后：
  1. 控制台打印分析指引（24-48h 后导出 CSV + 运行脚本命令）
  2. 写入/覆盖 `output/pending-analysis.json`:

```json
{
  "postGroupId": "string",
  "publishedAt": "ISO timestamp",
  "suggestedAnalysisTime": "ISO timestamp (+48h)",
  "status": "pending"
}
```

- 发布失败或 draft 模式 → 不写 `pending-analysis.json`

### 新增：手工操作文档

**交付物**: `docs/manual-ops.md`

集中所有需要人工执行的步骤，按频率分：

- **每次发布视频时**：AIGC 标签、趋势音频、地理标签、pinned comment、回复评论
- **每次发布文章时**：审阅 agent 生成的文章、新 widget 需 `npm run build` + 部署
- **定期检查（每周）**：导出 TikTok Analytics CSV、运行分析脚本、检查 `pending-analysis.json`

### 文档更新

- `AGENTS.md` — 新增「Article Workflow」section，引用 `docs/article-workflow.md`
- `docs/video-automation-roadmap.md` — ISSUE-14~19 状态改为 DONE

## Scenario & Risk Verification Matrix

### publish-article.mjs + supabase-auth.mjs

| #   | Scenario                                                   | Expected Behavior                                  | Risk   | Mitigation                               |
| --- | ---------------------------------------------------------- | -------------------------------------------------- | ------ | ---------------------------------------- |
| 1   | 新文章（slug 不存在），published=true                      | INSERT，设 author_id + published_at=now            | Low    | 标准 insert 路径                         |
| 2   | 已存在文章（slug 存在），published=true，已有 published_at | UPDATE，保留原 published_at 不覆盖                 | Medium | 查询已有记录的 published_at，不覆盖      |
| 3   | 已存在文章（slug 存在），原为 draft，现 published=true     | UPDATE，设 published_at=now（首次发布）            | Medium | 检查原记录 published_at 为 null 时设 now |
| 4   | Frontmatter 缺少 title                                     | 报错：`title is required`                          | Low    | Frontmatter 解析后校验                   |
| 5   | Frontmatter 缺少 slug                                      | 自动从 title 生成 slug                             | Low    | 复用 admin.tsx slugify 逻辑              |
| 6   | Frontmatter slug 格式不合法（大写/空格）                   | 报错：`slug must match [a-z0-9-]+`                 | Low    | 正则校验，与 postInput schema 一致       |
| 7   | Auth 失败（密码错误）                                      | 报错：`Auth failed: Invalid credentials`           | Medium | 明确错误信息，不泄漏细节                 |
| 8   | Auth 失败（网络错误）                                      | 报错：`Auth failed: <network error>`               | Low    | 捕获 fetch 异常                          |
| 9   | 缺少环境变量（ADMIN_EMAIL 等）                             | 报错：`Missing env: ADMIN_EMAIL. Check .env.local` | Low    | 启动时检查                               |
| 10  | Content 含 `<!-- widget:xxx -->` 标记                      | 原样写入 DB，标记被 content-splitter 渲染时处理    | Low    | 脚本不处理标记，透传                     |
| 11  | Content 含 CJK 字符                                        | 正确保存，不乱码                                   | Low    | UTF-8 编码                               |
| 12  | Content 为空字符串                                         | 允许（postInput schema 允许空 content）            | Low    | 透传空字符串                             |
| 13  | Frontmatter 含未知字段                                     | 忽略未知字段，只取 title/slug/excerpt/published    | Low    | 只读取已知字段                           |
| 14  | 无 frontmatter（纯 markdown 文件）                         | 报错：`Frontmatter is required`                    | Low    | 检测 `---` 开头                          |
| 15  | Supabase REST API 返回错误（如 slug 冲突）                 | 报错并显示 API 返回的错误信息                      | Medium | 捕获 API error response                  |
| 16  | published=false（草稿模式）                                | INSERT/UPDATE，published_at=null                   | Low    | 与 savePost 逻辑一致                     |
| 17  | 同一文件重复运行（幂等性）                                 | 第二次 UPDATE，不创建重复记录                      | Medium | upsert by slug                           |

### fetch-tiktok-analytics.mjs

| #   | Scenario                                     | Expected Behavior              | Risk   | Mitigation                                 |
| --- | -------------------------------------------- | ------------------------------ | ------ | ------------------------------------------ |
| 18  | CSV 含所有标准列                             | 正确解析所有字段               | Low    | 标准解析路径                               |
| 19  | CSV 缺少某列（如无 Saves）                   | 对应字段设为 null，不报错      | Medium | 列名匹配后，缺失列给 null                  |
| 20  | CSV 含额外列                                 | 忽略额外列                     | Low    | 只取已知列                                 |
| 21  | CSV 只有表头行（无数据）                     | 输出空 videos 数组 + 警告      | Low    | 检测数据行数                               |
| 22  | CSV 列名略有差异（"Views" vs "Video views"） | 模糊匹配，正确识别             | High   | 列名 normalize（小写 + 去空格 + 子串匹配） |
| 23  | CSV 含多条视频                               | 全部解析为数组                 | Low    | 遍历所有行                                 |
| 24  | CSV 文件不存在                               | 报错：`File not found: <path>` | Low    | existsSync 检查                            |
| 25  | 输出文件已存在                               | 覆盖                           | Low    | 直接 writeFileSync                         |
| 26  | CSV 视频标题含特殊字符/emoji                 | 正确保存                       | Low    | UTF-8 解析                                 |
| 27  | CSV 含非数值数据（如 "N/A"）                 | 对应数值字段设为 null          | Medium | parseInt/parseFloat 失败时给 null          |

### publish-tiktok.mjs 扩展

| #   | Scenario                     | Expected Behavior                       | Risk | Mitigation         |
| --- | ---------------------------- | --------------------------------------- | ---- | ------------------ |
| 28  | 发布成功                     | 写 pending-analysis.json + 打印分析指引 | Low  | 标准路径           |
| 29  | 发布失败                     | 不写 pending-analysis.json              | Low  | 仅成功后执行       |
| 30  | Draft 模式（未排期/未发布）  | 不写 pending-analysis.json              | Low  | 检查 status        |
| 31  | pending-analysis.json 已存在 | 覆盖为新记录                            | Low  | writeFileSync 覆盖 |
| 32  | Auth/key 失败                | 不写 pending-analysis.json，报错        | Low  | 错误前置           |

## Out of Scope

- Widget 数据迁移到数据库（保持代码硬编码）
- TikTok 开发者 API 集成（方案 A，等 App Review 通过后再做）
- CDP 自动抓取 TikTok Analytics 页面（方案 B，维护成本高）
- `scripts/` 根目录散落脚本的整理搬迁（避免无关重构）
- 自动定时执行分析（不设常驻进程，agent 在 session 中检查）
- 自动从文章内容生成 widget 组件代码（agent 手动编写）
