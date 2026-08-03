# Content Pipeline — 统一内容管线

> 创建于 2026-08-03。合并原 article-workflow.md + video pipeline 入口。
> Agent 按此文档操作。用户只需对 Agent 说一句话即可启动。

## 管线概览

```
入口 → [Stage 1 文章生成] → ⏸️ HITL-1 文章审阅 → [Stage 2 网站发布] → [Stage 3 scene-data] → ⏸️ HITL-2 脚本审阅 → [Stage 4 视频制作] → [Stage 5: 验证 → ⏸️ HITL-3 视频审阅 → 发布] → [Stage 6 Analytics]
```

所有 stage 必经。文章不再是某个工作流的专属步骤，而是管线的必选 stage。

### Human-in-the-Loop (HITL) 检查点

管线设 3 个强制人工确认点。Agent 到达 HITL 检查点时 **必须暂停**，输出审阅内容，等待用户在对话中明确确认后方可继续。

| 检查点 | 位置 | 审阅内容 | 确认方式 |
|--------|------|----------|----------|
| **HITL-1** | Stage 1 完成后 | 文章全文（frontmatter + markdown + widget 标记） | 用户说「文章 OK，继续」 |
| **HITL-2** | Stage 3 完成后 | scene-data.mjs（场景脚本、voiceover、视觉描述） | 用户说「脚本 OK，做视频」 |
| **HITL-3** | Stage 5 内部（验证后、发布前） | 视频成品 mp4 + verify-video.mjs 报告 | 用户说「视频 OK，发布」 |

> **Agent 行为约束**：用户未明确确认前，Agent 不得执行后续 Stage。确认必须是用户主动发出（如「继续」「OK」「确认」「发布」等），Agent 不得自行假设确认。

## 如何启动

### 入口 1：有源素材（PDF / 报告 / 长文 / URL）

**用户对 Agent 说**：
> "读这个素材写一篇文章：[PDF 路径 / URL / 文本]"

Agent 从 Stage 1 开始执行。

### 入口 2：只有话题或趋势

**用户对 Agent 说**：
> "跑 discover-trends，选一个话题做内容"

或直接给话题：
> "用「华为 AI 芯片突破」这个话题做一条内容"

Agent 先用 web-access skill 调研话题（收集素材），然后从 Stage 1 开始执行。

### 入口 3：新 session，未指定任务

Agent 读 `AGENTS.md` Session Start Checklist → 检查 `pending-analysis.json` → 检查未完成工作流 → 简要提示：
> "可以写文章（给素材）或做视频（给话题/跑 trends）"

---

## Stage 1: 文章生成

### 1a. 源素材读取（ISSUE-14）

Agent 接收任意格式的源素材，读取并理解核心内容。

| 素材类型 | 读取方法 | 工具 |
|---------|---------|------|
| PDF | 用 `pdf-parse` 或 `web-access` skill 读取文本 | `npm install pdf-parse` 或 CDP |
| 网页 URL | 用 `web-access` skill (CDP) 抓取 | Chrome 后台 tab |
| 纯文本 | 直接 `read_file` | 内置工具 |
| 研究报告 | 同 PDF 或网页 | 同上 |
| 社交媒体帖子 | 用 `web-access` skill 抓取 | CDP |
| 话题/趋势（无素材） | Agent 用 `web-access` skill 调研 | CDP |

读素材后，agent 在记忆中提取（不需要输出 JSON）：

1. **核心叙事线** — 这篇素材在讲什么故事？
2. **关键人物/公司** — 谁在做什么？
3. **数据点** — 金额、比例、时间、对比
4. **引用语句** — 直接引用的原话
5. **因果关系** — 事件之间的逻辑链

### 1b. 富文章生成（ISSUE-15 — 核心）

**关键理念**：不是纯总结，是 **总结 + 扩展**。

步骤：

1. **总结核心叙事** → 拆分为 6-10 个章节
2. **对每个章节思考**：「什么交互内容能增强这段？」
3. **为每个 widget curate 数据** → 从素材提取 + 外部调研补充
4. **写 widget 组件**（如需新的）→ 注册 → 部署
5. **写 markdown 文章** → 在合适位置嵌入 `<!-- widget:widget-id -->` 标记
6. **加原创分析章节**（「My Take」）
7. **输出 frontmatter markdown 文件** → 供 `publish-article.mjs` 消费

#### Widget 决策树

| 章节内容 | 推荐 Widget | 已有注册？ |
|---------|-------------|-----------|
| 大量文本/发言（全文概览） | 词云 | ✅ `deepseek-cloud` |
| 融资/投资 | 融资时间线 + 媒体来源 | ✅ `deepseek-funding` |
| 定价/对比 | 定价对比表 | ✅ `deepseek-pricing` |
| 人事变动 | 人才流动卡片 | ✅ `deepseek-talent` |
| 多公司关系 | 公司生态图 | ✅ `deepseek-companies` |
| 其他类型 | 需创建新 widget | ❌ 需开发 |

#### 已有 Widget 注册表

见 `src/components/widgets/registry.ts`。当前注册的 widget：
- `deepseek-cloud` — 词云
- `deepseek-talent` — 人才流动
- `deepseek-funding` — 融资时间线
- `deepseek-pricing` — API 定价对比
- `deepseek-companies` — 公司生态

#### 创建新 Widget 流程

如果素材涉及新话题（非 DeepSeek），需要创建新 widget：

1. 在 `src/components/widgets/{topic}/` 创建组件
2. 在 `src/components/widgets/{topic}/data/` 写数据文件
3. 在 `src/components/widgets/registry.ts` 注册
4. **`npm run build` + 部署** — Widget 是前端代码，必须打包部署后才可用
5. 然后才能运行 `publish-article.mjs` 发布含该 widget 的文章

> ⚠️ Widget 数据是代码硬编码，不存数据库。这是架构约束（见 Phase 2 Grill 纪录）。

#### Frontmatter 格式

```yaml
---
title: "Article Title"
slug: "article-slug"
excerpt: "Short description for SEO and preview"
published: true
---

# Introduction

Article body in Markdown...

<!-- widget:deepseek-cloud -->

## Section 1

More content...

<!-- widget:deepseek-funding -->

## My Take: Why this matters...

<!-- widget:deepseek-companies -->
```

#### 原创分析要求

每篇文章必须包含「My Take」章节：
- 不是总结，是 agent 的原创分析
- 回答「为什么这件事重要？」
- 提供独家视角或预测
- 引用素材中的数据点支撑论点

#### ⏸️ HITL-1: 文章审阅检查点

Agent 生成 frontmatter markdown 后 **必须暂停**，执行以下步骤：

1. **输出完整文章内容**（frontmatter + markdown body + widget 标记位置）供用户审阅
2. **提示审阅要点**：
   - 叙事逻辑是否通顺
   - 数据点是否准确
   - Widget 选择是否合适
   - 「My Take」章节是否有独立见解
3. **如有新 widget**：提示用户需要 `npm run build` + 部署后才能发布
4. **等待用户确认** — 用户说「文章 OK，继续」或类似确认语后才可进入 Stage 2

> ⚠️ Agent 不得在用户未确认前自动执行 Stage 2 发布脚本。

---

## Stage 2: 网站发布（ISSUE-16）

用户确认文章后，运行发布脚本：

```bash
node scripts/article/publish-article.mjs --file <path>

# 或保存为草稿（不发布）
node scripts/article/publish-article.mjs --file <path> --draft
```

脚本通过 Supabase Auth API 登录（Admin 账号），REST API upsert by slug。

详见 `docs/manual-ops.md` 的「每次发布文章时」部分。

发布后验证：访问 `/posts/{slug}` 确认文章显示正常，widget 渲染正确。

---

## Stage 3: 文章 → scene-data（ISSUE-17）

> **前置条件**：HITL-1 已通过（文章已发布到网站）。

从已发布文章提炼视频脚本。

### 步骤

1. **读文章 content** — 从 Supabase 或 admin editor 获取
2. **去掉 widget 标记** — `<!-- widget:xxx -->` 不出现在视频中
3. **提炼核心叙事线** — 从文章结构提取 3-5 个关键点
4. **按 TikTok 节奏重构为 10-12 个场景**：
   - Scene 1: Hook（前 3 秒抓住注意力）
   - Scene 2-10: 叙事展开
   - Scene 11-12: CTA（关注引导）
5. **直接写 `scene-data.mjs`** — 不需要中间脚本

### 文章 → 视频的节奏适配

| 文章 | 视频 |
|------|------|
| 6-10 个章节 | 10-12 个场景 |
| 详细论述 | 精简为 1-2 句 voiceover |
| 数据表格 | 数据可视化场景 |
| 引用语句 | 大字引用场景 |
| Widget | 不出现（视频无法交互） |

### 注意事项

- 文章的 SEO 关键词也应出现在视频 voiceover 中
- 文章的「My Take」章节 → 视频的结论/CTA 场景
- 文章的数据点 → 视频的视觉强调元素
- 视频时长：TikTok 60-70s，YouTube Shorts ≤170s

### ⏸️ HITL-2: 视频脚本审阅检查点

Agent 写完 `scene-data.mjs` 后 **必须暂停**，执行以下步骤：

1. **输出场景概览表**供用户审阅：

   | Scene | Voiceover 摘要 | 视觉描述 | 时长(估) |
   |-------|---------------|----------|----------|
   | 1 (Hook) | ... | ... | ... |
   | ... | ... | ... | ... |

2. **提示审阅要点**：
   - Hook 是否足够吸引人（前 3 秒）
   - 叙事逻辑是否从文章自然提炼
   - 数据点是否准确
   - 场景数量和总时长是否在目标范围（TikTok 60-70s）
   - CTA 场景是否有效
3. **等待用户确认** — 用户说「脚本 OK，做视频」或类似确认语后才可进入 Stage 4

> ⚠️ 视频渲染是最耗时的步骤（TTS + HTML + Playwright 录制 + FFmpeg 合成，通常 5-10 分钟）。脚本审阅只需 1-2 分钟，能显著减少返工。Agent 不得在用户未确认前自动启动视频制作管线。

---

## Stage 4: 视频制作

> **前置条件**：HITL-2 已通过（视频脚本已确认）。

`short-video-pipeline` skill 自动加载，`brand-system` skill 同时加载控制视觉一致性。

```bash
node scripts/short-video/main.mjs --bgm          # TTS → HTML → 录制 → 合成
```

视频制作的技术细节（TTS 引擎、渲染参数、文件位置）见 `docs/video-workflow.md`。

---

## Stage 5: 视频验证 + TikTok 发布

> **前置条件**：HITL-2 已通过（视频脚本已确认）。

### 验证（MANDATORY）

```bash
node scripts/short-video/verify-video.mjs --tiktok  # TikTok 合规检查
```

验证不通过时 Agent 自动修复并重跑，直到 0 failures。

### ⏸️ HITL-3: 视频成品审阅检查点

`verify-video.mjs` 通过后，Agent **必须暂停**，执行以下步骤：

1. **输出视频文件路径**：`output/deepseek-short.mp4`（或实际文件名）
2. **输出 verify-video.mjs 合规报告**（所有检查项的 pass/fail 状态）
3. **提示用户审阅要点**：
   - 实际观看视频，检查整体观感
   - TTS 语音是否清晰、自然
   - 字幕是否准确、可读
   - 视觉动画是否流畅
   - Hook 场景是否抓人
   - CTA 场景是否有效
   - 有无明显的渲染问题（黑屏、错位、卡顿）
4. **等待用户确认** — 用户说「视频 OK，发布」或类似确认语后才可执行发布

> ⚠️ Agent 不得在用户未确认前自动执行 TikTok 发布。`verify-video.mjs` 的自动合规检查是必要条件但非充分条件 — 自动检查无法判断内容质量、叙事流畅度、TTS 自然度等主观维度。

### 发布

```bash
node scripts/short-video/publish-tiktok.mjs         # 通过 Publora API 发布
```

### ⏸️ 用户手工操作检查点

发布后需要用户在 TikTok App 中手动完成：AIGC 标签、趋势音频、地理标签、pinned comment、回复评论。
完整清单见 `docs/manual-ops.md` 的「每次发布视频时」部分。

发布成功后，脚本自动写入 `output/pending-analysis.json` 记录待分析状态。

---

## Stage 6: Analytics 闭环

TikTok 数据通常需要 24-48h 才能在 dashboard 中看到。

### 流程

1. 检查 `output/pending-analysis.json`（Agent 在新 session 时被动检查）
2. 超过 48h → 提醒用户导出 CSV
3. 用户登录 `analytics.tiktok.com` → Content → 选时间范围 → Export
4. 运行分析脚本：`node scripts/short-video/fetch-tiktok-analytics.mjs --csv <csv-path>`
5. 录入 A/B 测试：`node scripts/short-video/ab-test-tracker.mjs --result output/analytics-export.json`
6. Agent 将 `pending-analysis.json` 的 status 改为 "done"

详见 `docs/manual-ops.md` 的「定期检查」部分。

---

## 检查点总结

| 检查点 | 位置 | 类型 | 谁操作 | 必须？ |
|--------|------|------|--------|--------|
| **HITL-1** 文章审阅 | Stage 1 → Stage 2 | 人工确认 | 用户 | ✅ 必须 |
| 新 widget 部署 | Stage 1 → Stage 2 | 人工操作 | 用户 | 仅当有新 widget |
| **HITL-2** 视频脚本审阅 | Stage 3 → Stage 4 | 人工确认 | 用户 | ✅ 必须 |
| 视频自动验证 | Stage 5 内部 | 自动检查 | Agent | ✅ 必须 |
| **HITL-3** 视频成品审阅 | Stage 5 内部（验证后、发布前） | 人工确认 | 用户 | ✅ 必须 |
| TikTok 手工操作 | Stage 5 之后 | 人工操作 | 用户 | ✅ 必须 |
| Analytics 导出 | Stage 6 | 人工操作 | 用户 | ✅ 必须 |

### Agent 行为准则

1. **到达 HITL 检查点时必须暂停** — 输出审阅内容 + 提示审阅要点 + 等待用户确认
2. **不得自行假设确认** — 确认必须是用户主动发出（「继续」「OK」「确认」「发布」等）
3. **用户提出修改意见时** — 按意见修改后重新进入该 HITL 检查点
4. **Agent 驱动的 stage 全自动** — 在需要用户介入时会暂停提醒，不连续跨越 HITL 检查点
