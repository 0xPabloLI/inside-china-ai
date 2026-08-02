# Phase 2 Roadmap — 文章创作管线 + 分析自动化

> 创建于 2026-08-02。Phase 1（视频管线 ISSUE-01~13）全部完成后的二期计划。
> 核心目标：补全「源素材 → 富文章 → 网站发布 → 视频」这条独立工作流。

---

## 两条工作流的关系

```
工作流 A（视频优先）：discover-trends → 写 scene-data → 视频 → 发布 TikTok
                     [Phase 1 已完成，全部脚本化]

工作流 B（文章优先）：源素材 → 读+扩展 → 富文章（含 widget）→ 发布网站 → 提炼 scene-data → 视频 → 发布 TikTok
                     [Phase 2 要做的]
```

工作流 B 大多数步骤是 **agent 工作流**，不是脚本。agent 手动操作没问题，只要工作流文档清晰。

---

## ISSUE 总览

| Issue | 类型 | 内容 | 依赖 |
|-------|------|------|------|
| ISSUE-14 | Agent 工作流 | 源素材读取（任意格式） | 无 |
| ISSUE-15 | Agent 工作流 | 富文章生成（总结+扩展+widget+原创分析） | ISSUE-14 |
| ISSUE-16 | 代码 | 文章发布到网站（Supabase API） | ISSUE-15 |
| ISSUE-17 | Agent 工作流 | 文章→scene-data 桥接 | ISSUE-16 |
| ISSUE-18 | 代码 | TikTok Analytics 自动获取 | ISSUE-01 |
| ISSUE-19 | 代码 | 发布后自动触发分析 | ISSUE-18 |

---

## ISSUE-14: 源素材读取（Agent 工作流）

**素材类型**：PDF、新闻 URL、研究报告、社交媒体帖子、视频脚本 — 任何包含信息的输入

**Agent 工作流**：
1. 用户提供源素材路径/URL/内容
2. Agent 读取素材：
   - PDF → 用 `web-access` skill 或 npm `pdf-parse` 读取文本
   - 网页 → 用 `web-access` skill (CDP) 抓取
   - 纯文本 → 直接读取
3. Agent 理解素材，提取：
   - 核心叙事线
   - 关键人物/公司
   - 数据点（金额/比例/时间）
   - 引用语句
4. Agent 不需要输出中间 JSON — 直接在记忆中理解

**参考案例**：读 42 页投资者会议录音转文本 PDF → 提取 DeepSeek 融资叙事、梁文锋发言、定价策略、人才策略

**不需要脚本**：agent 直接读素材即可

---

## ISSUE-15: 富文章生成（Agent 工作流 — 核心 ISSUE）

**关键理念**：不是纯总结，是 **总结 + 扩展**

**Agent 工作流**：
1. 读源素材（ISSUE-14 输出）
2. 总结核心叙事 → 拆分为章节
3. **对每个章节思考：「什么交互内容能增强这段？」**
   - 有大量文本/发言？→ 词云
   - 涉及融资/投资？→ 融资时间线
   - 涉及定价/对比？→ 定价对比表
   - 涉及人事变动？→ 人才流动卡片
   - 涉及多个公司？→ 公司生态图
4. 为每个 widget curate 数据：
   - 从素材提取核心数据
   - 外部调研补充（天眼查/Wikipedia/Bloomberg 等）
   - 写入 `src/components/widgets/{topic}/data/*.ts`
5. 写 widget 组件（如需要新的）：
   - 在 `src/components/widgets/registry.ts` 注册
   - 组件自包含：hardcoded data + 语言切换
6. 写 markdown 文章：
   - 在合适位置嵌入 `<!-- widget:widget-id -->` 标记
   - 加原创分析章节（「My Take」）
7. 输出 markdown 供用户审阅

**参考案例**（DeepSeek 文章）：
```
引言 "What follows is a summary..."
  ↓
<!-- widget:deepseek-cloud -->     ← 词云：全文关键词
  ↓
## 1. 融资背景
  ↓
<!-- widget:deepseek-funding -->   ← 融资时间线 + 媒体来源
  ↓
## 2. API 定价策略
  ↓
<!-- widget:deepseek-pricing -->   ← 定价对比表
  ↓
## 6. 团队策略
  ↓
<!-- widget:deepseek-talent -->    ← 人才流动卡片
  ↓
## My Take: 为什么这次泄露代价...
  ↓
<!-- widget:deepseek-companies -->  ← 公司生态图
```

**已有 widget 注册表**：`src/components/widgets/registry.ts`
- `deepseek-cloud` — 词云
- `deepseek-talent` — 人才流动
- `deepseek-funding` — 融资时间线
- `deepseek-pricing` — API 定价对比
- `deepseek-companies` — 公司生态

**不需要脚本**：agent 直接写文章。但需要文档记录工作流。

---

## ISSUE-16: 文章发布到网站（代码）

**需要脚本**：直接写入 Supabase `posts` 表

**实现**：
- 调用 Supabase REST API
- 字段: title, slug, excerpt, content (markdown), published=true
- 需要: Supabase URL + Service Role Key（从环境变量读取）

**文件**: `scripts/publish-article.mjs`

---

## ISSUE-17: 文章 → scene-data 桥接（Agent 工作流）

**Agent 工作流**：
1. 读已发布文章的 content
2. 提炼核心叙事线（去掉 widget 标记，取 markdown 内容）
3. 按 TikTok 节奏重构为 10-12 个场景
4. 直接写 `scene-data.mjs`
5. 然后走工作流 A 的 ④⑤⑥（main.mjs → verify → publish-tiktok）

**不需要脚本**：agent 直接读文章写 scene-data

---

## ISSUE-18: TikTok Analytics 自动获取（代码）

**三个方案**：
| 方案 | 可行性 | 需要什么 |
|------|--------|---------|
| A: TikTok 开发者 App API | 最可靠但需审核 | 注册 TikTok 开发者 + App Review |
| B: CDP 抓 Analytics 页面 | 不需审核但 fragile | Chrome 登录态 + DOM 解析 |
| C: 手动导出 CSV → 脚本解析 | 最简单 | 用户手动导出 |

**推荐**：先做方案 C（半自动），方案 B 作为后续优化

---

## ISSUE-19: 发布后自动触发分析（代码）

**实现**：在 `publish-tiktok.mjs` 末尾加提示，agent 自动跑分析

---

## Phase 1 中更适合 Agent 工作流的脚本

| 脚本 | 问题 | 调整 |
|------|------|------|
| `batch-generate.mjs` (ISSUE-07) | 只生成空模板+TODO，真正的内容全靠 agent 写 | 保留脚本作为辅助工具，但工作流文档应说明 agent 可直接创建 scene-data |
| `repurpose-content.mjs` (ISSUE-13) | 只做 voiceover 文本拼接，输出质量低 | 保留脚本作为快速草稿工具，但工作流文档应说明 agent 重写才是真正 repurpose |

这两个脚本不删除，但标注为「辅助工具」，agent 工作流文档中说明 agent 可以直接操作不需要经过这些脚本。

---

## 执行计划

| 顺序 | Issue | 方式 | 预计 |
|------|-------|------|------|
| 1 | ISSUE-14 + ISSUE-15 | 写 `docs/article-workflow.md` 工作流文档 + 更新 AGENTS.md | Agent 工作流文档 |
| 2 | ISSUE-16 | 写 `scripts/publish-article.mjs` + 测试 | 代码 |
| 3 | ISSUE-17 | 更新工作流文档（文章→scene-data 部分） | Agent 工作流文档 |
| 4 | ISSUE-18 | 调研 TikTok API 可行性 + 写脚本 | 代码 |
| 5 | ISSUE-19 | 扩展 publish-tiktok.mjs | 代码 |
