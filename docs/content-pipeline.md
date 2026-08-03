# Content Pipeline — 统一内容管线

> 创建于 2026-08-03。合并原 article-workflow.md + video pipeline 入口。
> Agent 按此文档操作。用户只需对 Agent 说一句话即可启动。

## 管线概览

```
入口 → [Stage 1 文章生成] → ⏸️ HITL-1 文章审阅 → [Stage 2 网站发布] → [Stage 3 scene-data] → ⏸️ HITL-2 脚本审阅 → [Stage 4 视频制作] → [Stage 5: 验证 → ⏸️ HITL-3 视频审阅 → 发布] → [Stage 6 Analytics]
```

所有 stage 必经。文章不再是某个工作流的专属步骤，而是管线的必选 stage。

### 语言规则

**所有文章发布为英文。** 无论源素材是中文、英文还是其他语言，Agent 在 Stage 1b 中必须输出英文文章。源素材如为中文，Agent 在总结和扩展时翻译为英文。

**Widget 统一使用英文。** Widget 数据和 UI 文案不需要双语 toggle，直接用英文。现有 DeepSeek widget 中的 EN/中文 toggle 后续移除（技术债务，不影响新文章生产）。

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

#### 趋势发现源（15 个）

`discover-trends.mjs` 通过 CDP 抓取 15 个源，覆盖新闻媒体、自媒体平台、技术社区和定向公众号监控：

| 类型 | 源 | 平台 | 登录需求 |
|------|---|------|---------|
| 新闻 | 量子位 | qbitai.com | 无 |
| 新闻 | 机器之心 | jiqizhixin.com | 无 |
| 新闻 | 36氪 | 36kr.com | 无 |
| 新闻 | TechCrunch AI | techcrunch.com | 无 |
| 新闻 | Bloomberg Tech | bloomberg.com | 无 |
| 新闻 | 观察者网 | guancha.cn | 无 |
| 新闻 | iThome | ithome.com | 无 |
| 自媒体 | 小红书 | xiaohongshu.com | 需要 |
| 自媒体 | 搜狗微信 | weixin.sogou.com | 无 |
| 自媒体 | 微博热搜 | s.weibo.com | 无 |
| 自媒体 | B站搜索 | search.bilibili.com | 无 |
| 自媒体 | 抖音搜索 | douyin.com | 需要 |
| 自媒体 | TikTok Creator | tiktok.com/creator-center | 需要 |
| 社区 | 知乎 | zhihu.com | 无（搜索无需登录） |
| 定向监控 | 动察Beating（公众号） | Google 搜索转载平台 | 无 |

源定义在 `scripts/short-video/lib/trend-sources.mjs`，可插拔架构，新增源只需添加 collector 对象。

##### 定向公众号监控

通过 Google 搜索 `"来自微信公众号" "公众号名称"` 实现定向监控。微信文章通过虎嗅、新浪、ZAKER 等平台转载后可被 Google 索引。

**为什么不用搜狗微信 / 微信网页版？**
- 搜狗微信搜索反爬严重，CDP 访问返回空结果（实测 3 次均失败）
- `mp.weixin.qq.com/mp/profile_ext` 要求微信客户端内打开，Chrome 登录态无效
- Google `site:mp.weixin.qq.com` 索引率极低（只搜到 1 篇）

**增强方案（可选）：微信后台 API 直爬**
如果有微信公众平台的 cookie + token（登录 `mp.weixin.qq.com` 后获取，有效期约 2 小时），可启用 `WECHAT_API_CONFIG` 直接调后台 API 获取完整文章列表。参考 `mashukui/wechat_official_account_crawler`。设置环境变量 `WX_COOKIE` 和 `WX_TOKEN` 后将 `WECHAT_API_CONFIG.enabled` 设为 `true`。

**添加新公众号监控**：在 `trend-sources.mjs` 的 `WECHAT_ACCOUNT_SOURCES` 数组中复制一条，修改 `name`、`label`、`account` 即可。

```bash
# 运行趋势发现（默认关键词 "AI大模型"）
node scripts/short-video/discover-trends.mjs

# 指定关键词
node scripts/short-video/discover-trends.mjs --keyword "DeepSeek"
```

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

#### 素材存放约定

所有用户提供的原始素材文件（PDF、报告、录音转文本等）统一存放到：

```
docs/refs/source-materials/
```

- 用户给出文件路径时，agent 先将文件复制（或移动）到此目录再读取
- 用户给出 URL 时，agent 抓取后将内容保存为 `.md` 或 `.txt` 放到此目录（留档可追溯）
- 命名建议：`<话题关键词>-<简短描述>.<ext>`（如 `deepseek-投资者会议录音.pdf`）
- 此目录纳入 git 跟踪，不加入 `.gitignore`

### 1b. 富文章生成（ISSUE-15 — 核心）

**关键理念**：不是纯总结，是 **总结 + 扩展**。

步骤：

1. **总结核心叙事** → 拆分为 6-10 个章节
2. **对每个章节思考**：「什么交互内容能增强这段？」
3. **为每个 widget curate 数据** → 从素材提取 + 外部调研补充（见下方「调研搜索矩阵」）
4. **写 widget 组件**（如需新的）→ 注册 → 部署（**英文 only，不需要双语 toggle**）
5. **写 markdown 文章**（**英文**） → 在合适位置嵌入 `<!-- widget:widget-id -->` 标记
6. **（可选）加原创分析章节**（「My Take」）→ 敏感内容不添加
7. **输出 frontmatter markdown 文件** → 供 `publish-article.mjs` 消费

#### 调研搜索矩阵

Stage 1b 中的「外部调研补充」和 Widget 数据 curate 需要覆盖中文和英文双维度。Agent 使用 `web-access` skill (CDP) 搜索以下渠道：

| 信息类型 | 搜索渠道 | 方法 | 说明 |
|----------|----------|------|------|
| **中文综合** | Google 中文关键词 | CDP 直接搜 | 搜中文关键词，覆盖观察者网、中国网、Yahoo財經等 |
| **深度技术讨论** | 知乎 | `site:zhihu.com` + 站内搜索 | 原始分析帖、行业深度讨论、测评博主内容 |
| **微信公众号** | 搜狗微信 + 百度 | `weixin.sogou.com`（CDP，可能有验证码）+ `site:mp.weixin.qq.com`（Google/百度） | 微信文章被删除快，需及时抓取留档 |
| **小红书** | 百度 + 站内搜索 | `site:xiaohongshu.com`（Google/百度覆盖率低）+ CDP 站内搜（需登录） | 小红书内容 Google 基本不索引 |
| **视频内容** | B站 | `site:bilibili.com` + 站内搜索 | AI 相关视频和评论区讨论 |
| **微博舆情** | 微博 | `s.weibo.com`（CDP 直接搜） | 热搜、大 V 评论、实时舆情 |
| **英文社区** | Reddit | `site:reddit.com` + 站内搜索 | r/LocalLLM、r/MachineLearning 等英文技术讨论 |
| **代码/文档存档** | GitHub | `site:github.com` + 站内搜索 | 技术事件常有代码仓库/文档留档（可能被删） |
| **英文权威媒体** | Google + Context7 | 原有流程 | Anthropic 博客、Bloomberg、PCMag、SCMP、BBC 等 |

**搜索策略**：

1. **先中文后英文** — 先搜中文关键词获取国内视角，再搜英文获取国际报道
2. **交叉验证** — 同一事件至少两个独立来源确认后才写入文章
3. **及时留档** — 微信文章/小红书帖子可能被删，抓取后保存到 `docs/refs/source-materials/`
4. **引用来源** — 文章中标注每个关键信息的来源（媒体名 + 日期），敏感信息标注「据素材记录」

#### Widget 定位：补充背景信息

Widget 的核心定位是**补充背景信息**，不是文章正文的替代或总结。Widget 应提供文章中未展开的、但能增强读者理解的**公开可验证信息**。

**Widget 适合放置的内容**：

- **新闻报道链接**：文章提到某公司裁员 → Widget 列出相关新闻报道链接和摘要
- **公开数据**：文章提到股价崩盘 → Widget 展示股价走势图和关键事件节点
- **融资时间线**：文章提到某公司估值暴涨 → Widget 展示融资轮次、金额、投资方
- **时间线**：文章提到一系列事件 → Widget 以可视化时间线呈现
- **对比数据**：文章提到多公司对比 → Widget 展示结构化对比表

**Widget 不适合放置的内容**：

- 文章正文的重复总结
- 无法公开验证的内部信息
- 纯主观评价

> 💡 **设计原则**：读者看完正文章节后，Widget 提供"想了解更多？这里是公开报道/数据"的入口。Widget 数据由 Agent 在 Stage 1b 中通过 web-access 调研获取，硬编码在组件中。Widget 数据和 UI 文案统一使用英文。

#### Widget 决策树

| 章节内容 | 推荐 Widget 类型 | 已有注册？ |
|---------|-------------|-----------|
| 大量文本/发言（全文概览） | 词云 | ✅ `deepseek-cloud` |
| 融资/投资 | 融资时间线 + 媒体来源 | ✅ `deepseek-funding` |
| 定价/对比 | 定价对比表 | ✅ `deepseek-pricing` |
| 人事变动 | 人才流动卡片 | ✅ `deepseek-talent` |
| 多公司关系 | 公司生态图 | ✅ `deepseek-companies` |
| 新闻报道/公开事件 | 新闻链接卡片（标题+摘要+链接+日期） | ❌ 需创建通用 widget |
| 股价/市场数据 | 股价时间线（日期+价格+事件标注） | ❌ 需创建 |
| 融资轮次 | 融资时间线（日期+金额+估值+投资方） | ❌ 可复用 `deepseek-funding` 模式 |
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

1. 在 `src/components/widgets/{topic}/` 创建组件（**英文 only，不需要双语 toggle**）
2. 在 `src/components/widgets/{topic}/data/` 写数据文件（英文）
3. 在 `src/components/widgets/registry.ts` 注册
4. **`npm run build` + 部署** — Widget 是前端代码，必须打包部署后才可用
5. 然后才能运行 `publish-article.mjs` 发布含该 widget 的文章

> ⚠️ Widget 数据是代码硬编码，不存数据库。这是架构约束（见 Phase 2 Grill 纪录）。

> ⚠️ 现有 DeepSeek widget 有 EN/中文 双语 toggle，后续统一移除为英文 only。新 widget 不应添加双语 toggle。

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

#### 原创分析要求（可选）

文章可以包含「My Take」章节，但**不是必须的**。是否添加取决于内容性质：

- **适合添加 My Take 的情况**：技术分析、行业趋势、产品对比等非敏感话题
- **不适合添加 My Take 的情况**：涉及敏感话题、争议性事件、仍在发展中的新闻

如果添加「My Take」章节：
- 不是总结，是 agent 的原创分析
- 回答「为什么这件事重要？」
- 提供独家视角或预测
- 引用素材中的数据点支撑论点

#### 源引用要求（Source Citation Requirement）

**所有参考过的资料必须作为 source attach 到文章中，并在文中注明出处。**

具体要求：

1. **原始素材文件**（PDF、报告、录音转文本等）→ 通过 `upload-attachments.mjs` 上传到文章的 attachments
2. **网页/外部文章引用** → 在文章正文中用 Markdown 链接 `[文字](URL)` 注明出处
3. **数据点引用** → 在数据附近标注来源（如「据 Bloomberg 2026 年 7 月 29 日报道」）
4. **引用语句** → 使用 Markdown 引用块 `> 原话` 并注明说话人和来源
5. **禁止域名级别链接** → 所有链接必须指向**具体文章/页面的完整 URL**，不允许只链接到域名根目录（如 ❌ `https://www.bloomberg.com`）。如果因付费墙无法获取完整 URL，改用报道相同数据的其他可访问来源

> 💡 **设计原则**：读者可以点击文章底部的 Attachments 区域下载原始素材，也可以通过文中链接验证每个数据点。每篇文章的引用来源必须可追溯。

参考现有 DeepSeek 文章的引用模式：Widget 中标注「Data Sources (All Verified)」，正文数据标注媒体来源和日期。

#### 声明验证标注规范（Claim Verification Annotation）

当文章基于匿名/内部信源，并与公开报道交叉验证时，使用四级标注体系标注每个关键声明的验证状态。标注应**简洁、内联**，不使用大段引用块。

**四级标注：**

| 标记 | 含义 | 使用场景 | 格式 |
|------|------|---------|------|
| ✅ | 公开源验证 | 有可靠公开信息支持 | `*(✅ Verified: [source](url))*` |
| ⚠️ | 部分验证 | 公开信息部分支持，或有细节差异 | `*(⚠️ Partially verified: 简要说明)*` |
| ❌ | 未验证 | 无公开信息支持（可能为非公开内部信息） | `*(❌ Unverified: 简要说明)*` |
| 🔴 | 矛盾 | 公开信息与素材声明不一致 | `*(🔴 Contradicts public data: 简要说明)*` |

**使用规则：**

1. **标注位置**：放在声明所在段落的末尾，用斜体括号包裹
2. **简洁原则**：每条标注不超过 1-2 句话，包含来源链接（如有）
3. **不使用大段引用块**：避免 `> ✅ **Verified**: [长段落]` 的格式，改用内联标注
4. **文末汇总**：文章末尾附 Verification Summary 表（统计各类标注数量 + 整体评估）
5. **适用范围**：所有基于匿名信源、内部记录、行业传闻的文章。纯公开报道的文章不需要标注。

**示例：**

```markdown
Anthropic framed this as a national security risk. *(✅ Verified: [Anthropic blog](https://anthropic.com/...))*

CEO Yang Zhilin cited "cost reduction" as the rationale for downsizing the RL team. *(🔴 Contradicts public data: no public reports of RL team layoffs; Yang still described as leading RL per [Business Insider](https://businessinsider.com/...))*
```

#### ⏸️ HITL-1: 文章审阅检查点

Agent 生成 frontmatter markdown 后 **必须暂停**，执行以下步骤：

1. **输出完整文章内容**（frontmatter + markdown body + widget 标记位置）供用户审阅
2. **提示审阅要点**：
   - 叙事逻辑是否通顺
   - 数据点是否准确
   - Widget 选择是否合适
   - 如有「My Take」章节：是否有独立见解（My Take 为可选）
   - **源引用是否完整**：所有参考过的资料是否已列出、是否已上传为 attachment 或在文中标注了出处
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

### 上传源文件附件（Stage 2b）

文章发布成功后，将所有引用的原始素材文件上传为 article attachments：

```bash
# 上传单个文件
node scripts/article/upload-attachments.mjs --post <slug> --files <path/to/source.pdf>

# 上传多个文件
node scripts/article/upload-attachments.mjs --post <slug> --files <path1.pdf> <path2.csv> <path3.docx>

# 使用 post ID 直接指定
node scripts/article/upload-attachments.mjs --post-id <uuid> --files <path>

# 查看已有附件
node scripts/article/upload-attachments.mjs --post <slug> --list

# 详细输出
node scripts/article/upload-attachments.mjs --post <slug> --files <path> --verbose
```

脚本流程：
1. Admin 登录 → 通过 slug 查找 post ID（或直接用 `--post-id`）
2. 验证文件（存在性、大小 ≤50MB、MIME 类型合规）
3. 逐个上传到 Supabase Storage `post-attachments` bucket（路径：`{postId}/{fileName}`）
4. 逐个插入 `post_attachments` 元数据行
5. 如遇错误，停止后续上传并报告已上传的文件

上传后文件显示在文章页底部的「Attachments」区域，读者可点击下载。

详见 `docs/manual-ops.md` 的「每次发布文章时」部分。

发布后验证：访问 `/posts/{slug}` 确认文章显示正常，widget 渲染正确，attachments 列表完整。

---

## Stage 3: 文章 → scene-data（ISSUE-17）

> **前置条件**：HITL-1 已通过（文章已发布到网站）。

从已发布文章提炼视频脚本。

### Step 0: 分集评估（新增）

Agent 在生成 scene-data 前，先运行分集评估器：

```bash
# Agent 在 Node.js 中调用评估器
node -e "import { evaluateArticle } from './scripts/short-video/lib/episode-evaluator.mjs'; const r = evaluateArticle(articleText); console.log(JSON.stringify(r, null, 2));"
```

**评估器输出**：
- `recommendedParts`（1-5）
- `splitMethod`（"none" | "thematic" | "narrative"）
- `reasoning`（人类可读理由数组）

**Agent 行为**：
- `recommendedParts === 1`：走单集流程（当前步骤 1-5）
- `recommendedParts > 1`：输出分集评估报告，等待用户确认后生成 N 份 scene-data

**分集评估报告格式**（Agent 输出给用户）：

```
📊 分集评估报告
━━━━━━━━━━━━━━━━━━━━
文章：[标题]
估算单条时长：[X] 秒
推荐集数：[N] 集
拆分方式：[主题拆分 / 叙事拆分]
━━━━━━━━━━━━━━━━━━━━
理由：
1. [评估器 reasoning]
2. [Agent 补充的语义分析]
3. ...
━━━━━━━━━━━━━━━━━━━━
各集概览：
| 集 | 标题 | 核心内容 | Hook 类型 | 时长(估) |
| 1  | ... | ... | ... | ... |
| ... | ... | ... | ... | ... |
━━━━━━━━━━━━━━━━━━━━
合集计划：
- 合集形态：[A拼接 / B重构]
- 合集发布时间：所有集发完后 3-5 天
━━━━━━━━━━━━━━━━━━━━
```

**多集 scene-data 命名**：`scene-data-pt1.mjs`、`scene-data-pt2.mjs` 等，每份含 `seriesMeta` 字段。

**`main.mjs` 支持**：`node main.mjs --scene scene-data-pt1.mjs`

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
- 文章的「My Take」章节（如有）→ 视频的结论/CTA 场景
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
| 源文件附件上传 | Stage 2b | 脚本执行 | Agent | ✅ 必须 |
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
