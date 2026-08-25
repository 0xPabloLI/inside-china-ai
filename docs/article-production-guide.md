# Article Production Guide — 文章生产指南

> **创建于**: 2026-08-25
> **被引用**: `docs/content-pipeline.md` Stage 1/2（写文章或修订文章时加载）
> **研究依据**: `docs/research/china-ai-article-pipeline-2026.md`（内容策略、Widget 设计、SEO 方法论）

## 概述

Stage 1 的文章生成不是纯总结，是 **总结 + 扩展**。Agent 从 Stage 0 共享素材出发，生成含交互 Widget 的富文章。

前置条件：Stage 0 共享素材已完成。

## 公司档案查阅（前置）

Agent 在开始写文章前，先检查 `docs/refs/company-profiles/` 下是否有内容涉及的主要公司的档案。如有，读取相关档案获取：

- 公司基本信息（创始时间、创始人、业务板块）
- AI 团队与产品线（团队名、消费品牌、企业 API、开源策略）
- 模型发布时间线、融资历史、关键人物
- 计算基础设施（芯片、出口管制、云平台）
- **Platform Context**（如有）— 公司与 TikTok / 发布平台的关联信息
- 值得提及的背景事件

当前已有档案：DeepSeek、ByteDance（含 TikTok 关系）、Moonshot/Kimi、MiniMax、Alibaba/Qwen、Baidu/ERNIE、Huawei/Ascend。

## 步骤

1. **总结核心叙事** → 拆分为 6-10 个章节
2. **对每个章节思考**：「什么交互内容能增强这段？」
3. **为每个 widget curate 数据** → 从素材提取 + 外部调研补充
4. **写 widget 组件**（如需新的）→ 注册 → 部署（**英文 only**）
5. **写 markdown 文章**（**英文**） → 在合适位置嵌入 `<!-- widget:widget-id -->` 标记
6. **（可选）加原创分析章节**（「My Take」）→ 敏感内容不添加
7. **输出 frontmatter markdown 文件** → 供 `publish-article.mjs` 消费

## Widget 定位：补充新信息（非重复正文）

Widget 的核心定位是**补充文章中不存在的新信息**，不是文章正文的替代、总结或可视化复述。Widget 应提供文章中未展开的、但能增强读者理解的**公开可验证信息**。

**核心原则：Widget 必须带来正文没有的新信息。** 如果一个 Widget 的内容可以从文章正文中直接推导出来，它就不应该存在。

**Widget 适合放置的内容**：

- **新闻报道链接**：文章提到某公司裁员 → Widget 列出相关新闻报道链接和摘要
- **公开数据**：文章提到股价崩盘 → Widget 展示股价走势图和关键事件节点
- **融资时间线**：文章提到某公司估值暴涨 → Widget 展示融资轮次、金额、投资方
- **时间线**：文章提到一系列事件 → Widget 以可视化时间线呈现
- **对比数据**：文章提到多公司对比 → Widget 展示结构化对比表（含文章未提及的对比维度）
- **行业基线**：文章提到某公司 API 降价 → Widget 展示竞争对手定价对比表
- **技术规格**：文章提到某模型发布 → Widget 展示与竞品的参数量、上下文长度等规格对比

**Widget 不适合放置的内容**：

- **文章正文的重复总结** — 如果 Widget 内容是对正文的复述或重新排版，删除它
- **文章已有数据的可视化** — 如果正文已给出数字，Widget 只是用图表重新展示同一个数字，没有新信息
- **无法公开验证的内部信息**
- **纯主观评价**

### Widget 决策树

| 章节内容                  | 推荐 Widget 类型                    | 已有注册？                        |
| ------------------------- | ----------------------------------- | --------------------------------- |
| 大量文本/发言（全文概览） | 词云                                | ✅ `deepseek-cloud`               |
| 融资/投资                 | 融资时间线 + 媒体来源               | ✅ `deepseek-funding`             |
| 定价/对比                 | 定价对比表                          | ✅ `deepseek-pricing`             |
| 人事变动                  | 人才流动卡片                        | ✅ `deepseek-talent`              |
| 多公司关系                | 公司生态图                          | ✅ `deepseek-companies`           |
| 新闻报道/公开事件         | 新闻链接卡片（标题+摘要+链接+日期） | ❌ 需创建通用 widget              |
| 股价/市场数据             | 股价时间线（日期+价格+事件标注）    | ❌ 需创建                         |
| 融资轮次                  | 融资时间线（日期+金额+估值+投资方） | ❌ 可复用 `deepseek-funding` 模式 |
| 其他类型                  | 需创建新 widget                     | ❌ 需开发                         |

### Widget 宽度规则

文章正文约束在 `65ch`（约 620px）阅读列宽度。Widget 默认也使用 `max-w-prose`（65ch）与正文对齐，保证视觉一致。

**Breakout Widget**：少数 widget 因布局需要（如双列图表、宽矩阵）标记为 breakout，渲染时使用文章全宽（`max-w-4xl` ≈ 896px）。在 `registry.ts` 的 `BREAKOUT_WIDGETS` 集合中注册。

判断标准：
- widget 含双列并排布局（如图表 + 图例）且在 65ch 内会换行挤压 → breakout
- widget 含宽表格/矩阵且 `min-w` > 600px → breakout
- 单列、卡片列表、柱状图等 → 默认 65ch

创建新 widget 时，先按 65ch 设计；如确实需要更宽，在 `BREAKOUT_WIDGETS` 中添加 ID 并在注释中说明理由。

### 已有 Widget 注册表

见 `src/components/widgets/registry.ts`。当前注册的 widget：

- `deepseek-cloud` — 词云
- `deepseek-talent` — 人才流动
- `deepseek-funding` — 融资时间线 _(breakout)_
- `deepseek-pricing` — API 定价对比
- `deepseek-companies` — 公司生态
- `distillation-news-coverage` — 新闻覆盖矩阵
- `kimi-benchmark-controversy` — 基准测试争议
- `kimi-identity-bleed` — 身份泄露
- `moonshot-funding-timeline` — Moonshot 融资时间线
- `minimax-stock-timeline` — MiniMax 股价时间线

### 创建新 Widget 流程

如果素材涉及新话题（非 DeepSeek），需要创建新 widget：

1. 在 `src/components/widgets/{topic}/` 创建组件（**英文 only**）
2. 在 `src/components/widgets/{topic}/data/` 写数据文件（英文）
3. 在 `src/components/widgets/registry.ts` 注册
4. 如 widget 需要超出 65ch 的宽度，在 `BREAKOUT_WIDGETS` 中添加 ID
5. `npm run build` + 部署 — Widget 是前端代码，必须打包部署后才可用
6. `node scripts/verify-widget-a11y.mjs --preview` — 发布前运行时验证（dev-only `/widgets` 预览路由）：0 FAIL 才算部署合格
7. 然后才能运行 `publish-article.mjs` 发布含该 widget 的文章

> Widget 数据是代码硬编码，不存数据库。这是架构约束（见 ADR-0003）。

### Widget 部署

如果 Stage 1 创建了新 widget 组件：

1. `npm run build` 构建（包括 widget 代码）
2. 访问 Lovable 编辑器 → 点击「Publish」部署
3. `npm run dev` 后运行 `node scripts/verify-widget-a11y.mjs --preview` 做发布前运行时验证
4. 不要直接用 `npx wrangler deploy`，会丢失 Lovable 注入的环境变量

> Widget 部署需要在文章发布前完成。Agent 在 Stage 1 创建 widget 后即可部署。

## Frontmatter 格式

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

## 原创分析要求（可选）

文章可以包含「My Take」章节，但**不是必须的**。是否添加取决于内容性质：

- **适合添加 My Take 的情况**：技术分析、行业趋势、产品对比等非敏感话题
- **不适合添加 My Take 的情况**：涉及敏感话题、争议性事件、仍在发展中的新闻

如果添加「My Take」章节：

- 不是总结，是 agent 的原创分析
- 回答「为什么这件事重要？」
- 提供独家视角或预测
- 引用素材中的数据点支撑论点

## 源引用要求

**所有参考过的资料必须作为 source attach 到文章中，并在文中注明出处。**

1. **原始素材文件**（PDF、报告、录音转文本等）→ 通过 `upload-attachments.mjs` 上传到文章的 attachments
2. **网页/外部文章引用** → 在文章正文中用 Markdown 链接 `[文字](URL)` 注明出处
3. **数据点引用** → 在数据附近标注来源（如「据 Bloomberg 2026 年 7 月 29 日报道」）
4. **引用语句** → 使用 Markdown 引用块 `> 原话` 并注明说话人和来源
5. **禁止域名级别链接** → 所有链接必须指向**具体文章/页面的完整 URL**，不允许只链接到域名根目录（如 ❌ `https://www.bloomberg.com`）。如果因付费墙无法获取完整 URL，改用报道相同数据的其他可访问来源

## 声明验证标注规范

当文章基于匿名/内部信源，并与公开报道交叉验证时，使用四级标注体系标注每个关键声明的验证状态。标注应**简洁、内联**，不使用大段引用块。

**四级标注：**

| 标记 | 含义       | 使用场景                               | 格式                                       |
| ---- | ---------- | -------------------------------------- | ------------------------------------------ |
| ✅   | 公开源验证 | 有可靠公开信息支持                     | `*(✅ Verified: [source](url))*`           |
| ⚠️   | 部分验证   | 公开信息部分支持，或有细节差异         | `*(⚠️ Partially verified: 简要说明)*`      |
| ❌   | 未验证     | 无公开信息支持（可能为非公开内部信息） | `*(❌ Unverified: 简要说明)*`              |
| 🔴   | 矛盾       | 公开信息与素材声明不一致               | `*(🔴 Contradicts public data: 简要说明)*` |

**使用规则：**

1. **标注位置**：放在声明所在段落的末尾，用斜体括号包裹
2. **简洁原则**：每条标注不超过 1-2 句话，包含来源链接（如有）
3. **不使用大段引用块**：避免 `> ✅ **Verified**: [长段落]` 的格式，改用内联标注
4. **文末汇总**：文章末尾附 Verification Summary 表（统计各类标注数量 + 整体评估）
5. **适用范围**：所有基于匿名信源、内部记录、行业传闻的文章。纯公开报道的文章不需要标注。

## 🔄 MRL-1: 文章自审

Agent 生成 frontmatter markdown 后，**先运行 MRL-1 自审循环**；0 Blockers 后保存 article draft，并与视频轨并行推进。

**Blockers（任一 FAIL = 必须修复后重新检查）：**

| #   | 检查项           | 阈值 / 规则                                                                                       | 修复方式                      |
| --- | ---------------- | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| B1  | Frontmatter 格式 | 必须有 `title`, `slug`, `excerpt`, `published: true`                                              | 补全缺失字段                  |
| B2  | 语言             | 文章 body 必须为英文（不允许中文字符出现在正文中，中文人名/公司名除外）                           | 翻译中文段落为英文            |
| B3  | Widget 注册     | 所有 `<!-- widget:xxx -->` 的 ID 必须在 `registry.ts` 中已注册                                    | 修正 ID 或创建+注册新 widget  |
| B3a | Widget 可视化  | Widget 必须使用图表、图形等可视化方式呈现，纯文本链接列表不通过（至少使用柱状图、矩阵、流程图等任一） | 重设计 widget 为可视化形式  |
| B4  | 源引用           | 每个数据点（金额、日期、比例、引用语）必须有内联来源标注（媒体名+日期 或 URL）                    | 补充来源                      |
| B5  | 链接完整性       | 所有 URL 必须指向具体文章/页面，禁止域名根链接（如 ❌ `https://bloomberg.com`）                   | 替换为完整 URL 或换可访问来源 |
| B6  | 声明验证标注     | 如使用匿名/内部信源，每个关键声明必须有 ✅/⚠️/❌/🔴 标注。Inline 标注是未来结构化 evidence 数据的来源（#61）；audit 非阻塞，仅输出 warning                                          | 补充标注                      |
| B7  | My Take 门控     | 如话题标记为敏感/争议性，不得包含 My Take 章节                                                    | 删除 My Take                  |
| B8  | AI 词汇          | 不得出现 scrub-rules Tier 2 黑名单词（leverage, utilize, facilitate, delve, seamless, robust 等） | 替换为口语化表达              |

**Warnings（列出但不阻塞 HITL）：**

| #   | 检查项       | 阈值                             |
| --- | ------------ | -------------------------------- |
| W1  | 正文字数     | < 800 或 > 3000 词               |
| W2  | Excerpt 长度 | > 160 字符                       |
| W3  | Widget 数量  | > 5 个（可能信息过载）           |
| W4  | 章节数量     | < 6 或 > 10                      |
| W5  | SEO 关键词   | slug 或 excerpt 中缺少核心关键词 |

**循环流程**：Agent 逐项检查 → 发现 Blocker → 修复 → 从 B1 重新检查 → 全部 Blocker PASS → 输出 MRL-1 报告 → **保存 article draft，并继续与视频轨并行推进（不暂停）**。

> 如有新 widget，Agent 仍需提示用户需要 `npm run build` + 部署后才能发布（这是部署依赖，非审阅检查点）。

## Design Decisions & References

| Topic | Reference | Content |
|-------|-----------|---------|
| Article pipeline research | `docs/research/china-ai-article-pipeline-2026.md` (L2) | Content strategy, widget design, SEO methodology |
| Widget registry architecture | ADR-0003 | Widget registry as extension point |
| Widget embedding mechanism | ADR-0001 | HTML comment markers for inline embedding |
| Widget breakout layout | ADR-0017 | Breakout widget width rules |
