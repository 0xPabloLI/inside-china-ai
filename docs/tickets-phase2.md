# Tickets: Phase 2 Roadmap — 文章创作管线 + 分析自动化

## Dependency Graph

```
T1 (supabase-auth.mjs) ──→ T2 (publish-article.mjs) ──→ T5 (article-workflow.md)
                                                          │
T3 (fetch-tiktok-analytics.mjs) ──────────→ T6 (manual-ops.md)
T4 (publish-tiktok.mjs 扩展) ─────────────→ T6 (manual-ops.md)
                                              │
T5 ──────────────────────────────────────→ T7 (AGENTS.md + roadmap 更新)
T6 ──────────────────────────────────────→ T7
```

执行顺序：T1 → T2 → T3 → T4 → T5 → T6 → T7

---

## T1: supabase-auth.mjs — 共享认证模块

**Depends on**: none
**Delivers**: `scripts/article/lib/supabase-auth.mjs` + `scripts/article/__tests__/supabase-auth.test.mjs`
**Covers scenarios**: 7, 8, 9

Tasks:

- 创建 `scripts/article/lib/supabase-auth.mjs`
- 从 `.env.local` 读取 `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`
- 调用 Supabase Auth API: `POST {SUPABASE_URL}/auth/v1/token?grant_type=password`
  - Headers: `apikey: SUPABASE_PUBLISHABLE_KEY`, `Content-Type: application/json`
  - Body: `{ email, password }`
- 返回 `{ access_token, user: { id } }`
- 启动时检查环境变量是否存在，缺失时报错（scenario 9）
- 网络错误时捕获并报错（scenario 8）
- 认证失败时报错（scenario 7）
- 新 key 格式支持：`sb_publishable_` 开头的 key 不设 Authorization header（与 client.server.ts 逻辑一致）
- 测试：mock fetch 验证成功/失败/缺环境变量三种路径

---

## T2: publish-article.mjs — 文章发布脚本

**Depends on**: T1
**Delivers**: `scripts/article/publish-article.mjs` + `scripts/article/__tests__/publish-article.test.mjs`
**Covers scenarios**: 1-6, 10-17

Tasks:

- 创建 `scripts/article/publish-article.mjs`
- CLI 参数：`--file <path>` (必选), `--draft` (可选, 覆盖 frontmatter published=false)
- Frontmatter 解析：
  - 用 `gray-matter` npm 包（需 `npm install gray-matter`）
  - 无 frontmatter → 报错（scenario 14）
  - 缺 title → 报错（scenario 4）
  - 缺 slug → 从 title 自动生成（scenario 5）
  - slug 格式校验：`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`（scenario 6）
  - 未知字段忽略（scenario 13）
  - published 默认 false
- Upsert 逻辑：
  - 先 `GET /rest/v1/posts?slug=eq.{slug}&select=id,published,published_at` 检查是否存在
  - 不存在 → INSERT（scenario 1）：`author_id` = 登录 user.id, `published_at` = published ? now : null
  - 存在 → UPDATE（scenario 2, 3）：保留原 `published_at`（除非原为 null 且现 published=true）
  - Headers: `apikey`, `Authorization: Bearer {access_token}`, `Content-Type: application/json`
- 成功输出：`✅ Published: /posts/{slug}` 或 `✅ Draft saved: /posts/{slug}`
- Content 含 widget 标记 → 透传不处理（scenario 10）
- 测试：
  - mock auth + mock fetch，验证 insert/update/错误路径
  - frontmatter 解析测试（有/无 frontmatter, 缺字段, 未知字段）
  - slug 自动生成 + 校验
  - published_at 保留逻辑（scenario 2, 3）

---

## T3: fetch-tiktok-analytics.mjs — CSV 解析脚本

**Depends on**: none
**Delivers**: `scripts/short-video/fetch-tiktok-analytics.mjs` + `scripts/short-video/__tests__/fetch-tiktok-analytics.test.mjs`
**Covers scenarios**: 18-27

Tasks:

- 创建 `scripts/short-video/fetch-tiktok-analytics.mjs`
- CLI 参数：`--csv <path>` (必选)
- CSV 解析逻辑（提取到 `lib/analytics-utils.mjs`）：
  - 列名 normalize：小写 + 去空格 + 去特殊字符
  - 模糊匹配表：
    | 标准字段       | 匹配关键词                     |
    | -------------- | ------------------------------ |
    | title          | "title", "video", "名称"       |
    | postedAt       | "post", "time", "date", "发布" |
    | views          | "view", "播放", "观看"         |
    | avgWatchTime   | "watch", "time", "观看时长"    |
    | completionRate | "completion", "完成", "rate"   |
    | shares         | "share", "分享"                |
    | saves          | "save", "收藏", "favorite"     |
    | comments       | "comment", "评论"              |
    | likes          | "like", "点赞"                 |
  - 数值字段解析失败 → null（scenario 27）
  - 缺失列 → null（scenario 19）
- 输出 JSON schema（见 spec）
- 文件不存在 → 报错（scenario 24）
- 空数据 → 警告 + 空数组（scenario 21）
- 测试：
  - 标准 CSV → 正确解析
  - 缺列 CSV → null
  - 列名变体 → 模糊匹配
  - 非数值数据 → null
  - 空文件 → 报错

---

## T4: publish-tiktok.mjs 扩展 — pending-analysis.json

**Depends on**: none (扩展已有脚本)
**Delivers**: 更新 `scripts/short-video/publish-tiktok.mjs`
**Covers scenarios**: 28-32

Tasks:

- 读取现有 `publish-tiktok.mjs`，在发布成功分支末尾添加：
  1. 控制台输出分析指引（24-48h 提示 + 命令）
  2. 写入 `output/pending-analysis.json`:
     ```json
     {
       "postGroupId": "<from publish response>",
       "publishedAt": "<ISO timestamp>",
       "suggestedAnalysisTime": "<publishedAt + 48h>",
       "status": "pending"
     }
     ```
- 发布失败/draft 模式分支不添加任何内容
- 测试：
  - mock 发布成功 → 验证 pending-analysis.json 写入
  - mock 发布失败 → 验证不写入
  - 已有 pending-analysis.json → 覆盖

---

## T5: docs/article-workflow.md — Agent 工作流文档

**Depends on**: T2 (引用 publish-article.mjs)
**Delivers**: ISSUE-14 + ISSUE-15 + ISSUE-17 合并文档

Tasks:

- 创建 `docs/article-workflow.md`，包含三部分：

### Part 1: 源素材读取（ISSUE-14）

- PDF 读取方法（web-access skill / pdf-parse）
- 网页抓取方法（web-access skill CDP）
- 纯文本直接读取
- Agent 提取要点：叙事线、人物/公司、数据点、引用

### Part 2: 富文章生成（ISSUE-15）

- 总结 → 拆分章节 → 选择 widget → curate 数据 → 写文章
- Widget 决策树：
  - 大量文本/发言 → 词云
  - 融资/投资 → 融资时间线
  - 定价/对比 → 定价对比表
  - 人事变动 → 人才流动卡片
  - 多公司关系 → 公司生态图
- 新 widget 流程：写组件 → 注册 → npm run build → 部署
- Frontmatter markdown 输出格式
- 「My Take」原创分析章节要求

### Part 3: 文章 → 视频（ISSUE-17）

- 读文章 content → 去掉 widget 标记 → 提炼叙事
- 按 TikTok 节奏重构 10-12 场景
- 写 scene-data.mjs → 走 main.mjs → verify → publish-tiktok

---

## T6: docs/manual-ops.md — 手工操作文档

**Depends on**: T3, T4 (引用两个脚本)
**Delivers**: 集中所有手工操作清单

Tasks:

- 创建 `docs/manual-ops.md`，按频率分三部分：

### 每次发布视频时

| 操作           | 说明                                       |
| -------------- | ------------------------------------------ |
| AIGC 标签      | TikTok 发布界面打开 "AI-generated content" |
| 趋势音频       | 从 TikTok 音频库选热门音乐，音量 5-10%     |
| 地理标签       | 添加 China/US 位置标签                     |
| Pinned comment | 发布后置顶含文章 URL 的评论                |
| 回复评论       | 发布后 1 小时内回复所有评论                |
| 非高峰时段     | 查看粉丝活跃时间，选低峰发布               |

### 每次发布文章时

| 操作          | 说明                                                     |
| ------------- | -------------------------------------------------------- |
| 审阅文章      | agent 生成后人工审阅 frontmatter markdown                |
| 部署新 widget | 如有新 widget，`npm run build` + 部署后再发布文章        |
| 运行发布脚本  | `node scripts/article/publish-article.mjs --file <path>` |

### 定期检查（每周）

| 操作                       | 说明                                                               |
| -------------------------- | ------------------------------------------------------------------ |
| 检查 pending-analysis.json | 新 session 时 agent 自动检查，超 48h 提醒                          |
| 导出 TikTok Analytics CSV  | 登录 analytics.tiktok.com → Export                                 |
| 运行分析脚本               | `node scripts/short-video/fetch-tiktok-analytics.mjs --csv <path>` |
| 录入 A/B 测试              | `node scripts/short-video/ab-test-tracker.mjs --result <json>`     |

---

## T7: 文档更新

**Depends on**: T5, T6
**Delivers**: Updated `AGENTS.md` + `docs/video-automation-roadmap.md`

Tasks:

- `AGENTS.md` 新增 section：
  ```markdown
  ## Article Workflow

  文章创作管线（源素材 → 富文章 → 网站发布 → 视频）工作流文档：`docs/article-workflow.md`
  手工操作清单：`docs/manual-ops.md`
  ```
- `docs/video-automation-roadmap.md`：
  - ISSUE-14~19 状态改为 DONE
  - 进度追踪表更新完成日期 + commit hash
