# Article Workflow — 源素材 → 富文章 → 网站发布 → 视频

> 创建于 2026-08-03。Phase 2 Roadmap ISSUE-14 + ISSUE-15 + ISSUE-17。
> Agent 工作流文档，非脚本。Agent 按此文档操作即可。

## 工作流概览

```
工作流 B（文章优先）：

① 源素材 ──→ ② 读+扩展 ──→ ③ 富文章（含 widget） ──→ ④ 发布网站 ──→ ⑤ 提炼 scene-data ──→ ⑥ 视频 ──→ ⑦ 发布 TikTok
  ISSUE-14      ISSUE-15         ISSUE-15              ISSUE-16        ISSUE-17           Phase 1      Phase 1
  (本文档)      (本文档)          (本文档)             (脚本)           (本文档)           (已有)       (已有)
```

大多数内容先有文章，再从文章做视频。

---

## Part 1: 源素材读取（ISSUE-14）

Agent 接收任意格式的源素材，读取并理解核心内容。

### 素材类型与读取方法

| 素材类型 | 读取方法 | 工具 |
|---------|---------|------|
| PDF | 用 `pdf-parse` 或 `web-access` skill 读取文本 | `npm install pdf-parse` 或 CDP |
| 网页 URL | 用 `web-access` skill (CDP) 抓取 | Chrome 后台 tab |
| 纯文本 | 直接 `read_file` | 内置工具 |
| 研究报告 | 同 PDF 或网页 | 同上 |
| 社交媒体帖子 | 用 `web-access` skill 抓取 | CDP |

### Agent 提取要点

读素材后，agent 在记忆中提取（不需要输出 JSON）：

1. **核心叙事线** — 这篇素材在讲什么故事？
2. **关键人物/公司** — 谁在做什么？
3. **数据点** — 金额、比例、时间、对比
4. **引用语句** — 直接引用的原话
5. **因果关系** — 事件之间的逻辑链

### 参考案例

读 42 页投资者会议录音转文本 PDF → 提取：
- 叙事线：DeepSeek 泄露的投资者会议 → 融资暂停
- 人物：梁文锋（创始人）、投资者
- 数据点：$7.4B 第一轮、$1.4B 第二轮目标、$66B 估值
- 引用："Vision isn't a slogan on the wall."
- 因果：泄露 → 梁不满 → 通知投资者暂停 → Bloomberg 报道

---

## Part 2: 富文章生成（ISSUE-15 — 核心 ISSUE）

**关键理念**：不是纯总结，是 **总结 + 扩展**。

### 步骤

1. **总结核心叙事** → 拆分为 6-10 个章节
2. **对每个章节思考**：「什么交互内容能增强这段？」
3. **为每个 widget curate 数据** → 从素材提取 + 外部调研补充
4. **写 widget 组件**（如需新的）→ 注册 → 部署
5. **写 markdown 文章** → 在合适位置嵌入 `<!-- widget:widget-id -->` 标记
6. **加原创分析章节**（「My Take」）
7. **输出 frontmatter markdown 文件** → 供 `publish-article.mjs` 消费

### Widget 决策树

| 章节内容 | 推荐 Widget | 已有注册？ |
|---------|-------------|-----------|
| 大量文本/发言（全文概览） | 词云 | ✅ `deepseek-cloud` |
| 融资/投资 | 融资时间线 + 媒体来源 | ✅ `deepseek-funding` |
| 定价/对比 | 定价对比表 | ✅ `deepseek-pricing` |
| 人事变动 | 人才流动卡片 | ✅ `deepseek-talent` |
| 多公司关系 | 公司生态图 | ✅ `deepseek-companies` |
| 其他类型 | 需创建新 widget | ❌ 需开发 |

### 已有 Widget 注册表

见 `src/components/widgets/registry.ts`。当前注册的 widget：
- `deepseek-cloud` — 词云
- `deepseek-talent` — 人才流动
- `deepseek-funding` — 融资时间线
- `deepseek-pricing` — API 定价对比
- `deepseek-companies` — 公司生态

### 创建新 Widget 流程

如果素材涉及新话题（非 DeepSeek），需要创建新 widget：

1. 在 `src/components/widgets/{topic}/` 创建组件
2. 在 `src/components/widgets/{topic}/data/` 写数据文件
3. 在 `src/components/widgets/registry.ts` 注册
4. **`npm run build` + 部署** — Widget 是前端代码，必须打包部署后才可用
5. 然后才能运行 `publish-article.mjs` 发布含该 widget 的文章

> ⚠️ Widget 数据是代码硬编码，不存数据库。这是架构约束（见 Phase 2 Grill 纪录）。

### Frontmatter 格式

文章文件头部使用 YAML frontmatter：

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

### 原创分析要求

每篇文章必须包含「My Take」章节：
- 不是总结，是 agent 的原创分析
- 回答「为什么这件事重要？」
- 提供独家视角或预测
- 引用素材中的数据点支撑论点

### 发布

写好 frontmatter markdown 文件后，运行：

```bash
node scripts/article/publish-article.mjs --file <path>
```

详见 `docs/manual-ops.md` 的「每次发布文章时」部分。

---

## Part 3: 文章 → 视频（ISSUE-17）

从已发布文章提炼视频脚本，然后走 Phase 1 的视频管线。

### 步骤

1. **读文章 content** — 从 Supabase 或 admin editor 获取
2. **去掉 widget 标记** — `<!-- widget:xxx -->` 不出现在视频中
3. **提炼核心叙事线** — 从文章结构提取 3-5 个关键点
4. **按 TikTok 节奏重构为 10-12 个场景**：
   - Scene 1: Hook（前 3 秒抓住注意力）
   - Scene 2-10: 叙事展开
   - Scene 11-12: CTA（关注引导）
5. **直接写 `scene-data.mjs`** — 不需要中间脚本
6. **走 Phase 1 管线**：
   ```bash
   node scripts/short-video/main.mjs --bgm          # 生成视频
   node scripts/short-video/verify-video.mjs --tiktok  # 验证
   node scripts/short-video/publish-tiktok.mjs       # 发布
   ```

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
