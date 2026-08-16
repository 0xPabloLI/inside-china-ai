# Content Pipeline — 统一内容管线

> 创建于 2026-08-03。合并原 article-workflow.md + video pipeline 入口。
> Agent 按此文档操作。用户只需对 Agent 说一句话即可启动。

## 管线概览

```
入口 → [Stage 1 文章生成] → 🔄 MRL-1 自审 → [Stage 2 文章发布 + 附件上传] → 📚 RAG reindex → [Stage 3 scene-data] → 🔄 MRL-2 自审 → 📚 RAG reindex → [Stage 4 视频制作] → 📚 RAG reindex（多媒体素材） → [Stage 5: 🔄 MRL-3 验证 → ⏸️ HITL 视频审阅 → 确认后发布] → [Stage 6 Analytics]
```

> **📚 RAG reindex** 在文章发布后自动触发，确保新文章、源素材和 scene-data 立即进入知识库。文章在 Stage 2 发布（HITL 之前），RAG 随即收录。Stage 3 scene-data 就绪后再次触发 reindex。Stage 4 视频制作完成后，如有多媒体素材变更（新增/修改 catalog.yml 条目），再次触发 reindex（见 Stage 4b）。

所有 stage 必经。文章不再是某个工作流的专属步骤，而是管线的必选 stage。

MRL-1 和 MRL-2 自审通过后直接进入下一 Stage，不暂停。唯一的人工确认点是 **HITL 视频审阅**：用户看视频成品后确认视频质量，然后发布视频 MP4 到网站文章 + TikTok。文章在 Stage 2 已发布（HITL 之前），HITL 仅控制视频发布。

### 语言规则

**所有文章发布为英文。** 无论源素材是中文、英文还是其他语言，Agent 在 Stage 1b 中必须输出英文文章。源素材如为中文，Agent 在总结和扩展时翻译为英文。

**Widget 统一使用英文。** Widget 数据和 UI 文案不需要双语 toggle，直接用英文。现有 DeepSeek widget 中的 EN/中文 toggle 已于 2026-08-08 移除。

### Human-in-the-Loop (HITL) 检查点

管线设 1 个强制人工确认点。Agent 到达 HITL 检查点时 **必须暂停**，输出审阅内容，等待用户在对话中明确确认后方可继续。

| 检查点   | 位置                           | 审阅内容                                                        | 确认方式              |
| -------- | ------------------------------ | --------------------------------------------------------------- | --------------------- |
| **HITL** | Stage 5 内部（验证后、发布前） | 视频成品 mp4 + verify-video.mjs 报告 + 文章 markdown 内容 + 场景概览表 | 用户说「视频 OK，发布」 |

> **Agent 行为约束**：用户未明确确认前，Agent 不得执行 TikTok 发布。确认必须是用户主动发出（如「继续」「OK」「确认」「发布」等），Agent 不得自行假设确认。

### Machine Review Loop (MRL) — 机器自审循环

每个 HITL 检查点前，Agent **必须先运行 MRL**。MRL 是一轮纯机器自审：Agent 按检查清单逐项验证自己的输出，发现 Blocker 立即修复，然后重新验证，**循环直到 0 Blockers** 才输出 MRL 报告并进入 HITL。

```
[Agent 生成输出] → 🔄 MRL 检查
  ├─ Blocker FAIL → 修复 → 重新检查（循环）
  ├─ Blocker PASS, Warning 存在 → 输出 MRL 报告（PASS with warnings）
  └─ Blocker PASS, Warning 0 → 输出 MRL 报告（PASS）
→ ⏸️ HITL（附 MRL 报告供用户参考）
```

**设计理念**：机器能检查的全自动检查完，用户只需审阅机器无法判断的主观维度（叙事流畅度、语气、观感等）。减少 HITL 往返次数。

| MRL       | 位置                         | 检查对象                    | Blocker 数              | Warning 数 |
| --------- | ---------------------------- | --------------------------- | ----------------------- | ---------- |
| **MRL-1** | Stage 1（自审，不暂停）      | 文章 frontmatter + markdown | 8                       | 5          |
| **MRL-2** | Stage 3（自审，不暂停）      | scene-data.mjs（每集）      | 10                      | 6          |
| **MRL-3** | Stage 5 → HITL 前            | 视频成品 mp4                | `verify-video.mjs` 已有 | +内容检查  |

**MRL 报告格式**（Agent 在 HITL 输出中附带）：

```
🤖 MRL-N 报告
━━━━━━━━━━━━━━━
状态：✅ PASS（或 ✅ PASS with warnings）
Blockers：0/8 通过
Warnings：2 项（列出但不阻塞）
━━━━━━━━━━━━━━━
✅ B1 Frontmatter — 通过
✅ B2 语言 — 通过
⚠️ W1 字数 3200（建议 800-3000）
...
━━━━━━━━━━━━━━━
```

> **MRL 与 HITL 的关系**：MRL 是 HITL 的前置过滤器。MRL 不替代 HITL — 机器无法判断叙事质量、语气得体性、主观观感等维度。MRL 通过后，用户仍需审阅。但 MRL 确保用户看到的不是「草稿」，而是「经机器校验的草稿」，显著减少「数据错了」「链接不对」「字数超标」这类机械性返工。

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

> **趋势发现有两个工具，按信息源分工（非语言分工）**：
> - `discover-trends.mjs` — **中文平台**（量子位、机器之心、知乎、B站、微博、小红书等 16 源，CDP 登录态）
> - `last30days-skill` — **西方社媒 + 学术 + 科技新闻**（Reddit、HN、X、YouTube、arXiv、Techmeme、Digg、Polymarket、GitHub、Threads、Grounding 等 11+ 源，`--emit=json`）
>
> 交叉源：X 和 TikTok 两边都有（机制不同——CDP DOM vs API），保留两边。小红书只在 discover-trends 里用（CDP 登录态更适合）。两者可同时运行交叉比对。详见下方「趋势发现源」章节。
>
> **与 RAG 的区别**：RAG（`scripts/rag/`）搜索项目已有内容（已发布文章、scene-data、研究报告、源素材），用本地 Ollama bge-m3 做语义向量搜索，零费用。last30days 搜索实时互联网讨论（最近 30 天）。两者不重复——RAG 查「我写过什么」，last30days 查「外界在说什么」。

#### 趋势发现源（15 个）

`discover-trends.mjs` 通过 CDP 抓取 15 个源，覆盖新闻媒体、自媒体平台、技术社区和定向公众号监控：

| 类型     | 源                    | 平台                      | 登录需求           |
| -------- | --------------------- | ------------------------- | ------------------ |
| 新闻     | 量子位                | qbitai.com                | 无                 |
| 新闻     | 机器之心              | jiqizhixin.com            | 无                 |
| 新闻     | 36氪                  | 36kr.com                  | 无                 |
| 新闻     | TechCrunch AI         | techcrunch.com            | 无                 |
| 新闻     | Bloomberg Tech        | bloomberg.com             | 无                 |
| 新闻     | 观察者网              | guancha.cn                | 无                 |
| 新闻     | iThome                | ithome.com                | 无                 |
| 自媒体   | 小红书                | xiaohongshu.com           | 需要               |
| 自媒体   | 搜狗微信              | weixin.sogou.com          | 无                 |
| 自媒体   | 微博热搜              | s.weibo.com               | 无                 |
| 自媒体   | B站搜索               | search.bilibili.com       | 无                 |
| 自媒体   | 抖音搜索              | douyin.com                | 需要               |
| 自媒体   | TikTok Creator        | tiktok.com/creator-center | 需要               |
| 社区     | 知乎                  | zhihu.com                 | 无（搜索无需登录） |
| 社交     | X (Twitter)           | x.com/search              | 需要（CDP）/ mcp-search-bridge fallback |
| 西方源   | YouTube               | youtube.com               | 无（mcp-search-bridge） |
| 西方源   | arXiv                 | arxiv.org                 | 无（mcp-search-bridge） |
| 西方源   | GitHub                | github.com/search         | 无（mcp-search-bridge） |
| 西方源   | Threads               | threads.net               | 无（mcp-search-bridge） |
| 西方源   | Web Search (Grounding) | google.com               | 无（mcp-search-bridge） |
| 定向监控 | 动察Beating（公众号） | Google 搜索转载平台       | 无                 |

源定义在 `scripts/short-video/lib/trend-sources.mjs`，可插拔架构，新增源只需添加 collector 对象。

**mcp-search-bridge**：X 搜索的 MCP fallback（Grok 有原生 X/Twitter 数据），也是 5 个西方源的主要搜索方式。Fallback 链：CDP → cdpFallback (Google site:搜索) → mcpFallback (mcp-search-bridge/Grok)。配置在 `.env.local` 的 `SEARCH_BASE_URL`/`SEARCH_API_KEY`/`SEARCH_MODEL`。安装在 `~/mcp-search-bridge/`。

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

#### 西方社媒趋势补充（last30days-skill）

`discover-trends.mjs` 覆盖中文平台（16 源），`last30days-skill` 覆盖西方社媒 + 学术 + 科技新闻（11 默认源 + 2 opt-in）。两个都输出 JSON，Agent 可交叉比对。

**分工原则（按信息源，非语言）**：
- discover-trends 独占：知乎、B站、微博、抖音、36氪、量子位、机器之心、TechCrunch、Bloomberg、观察者网、IT之家、搜狗微信、动察Beating（13 源）
- last30days 独占：Reddit、Hacker News、YouTube、arXiv、Techmeme、Digg、Polymarket、GitHub、Threads、Grounding（10 源）
- 两边都有：X（CDP vs API，机制不同）、TikTok（Creator Center vs hashtag 搜索，角度不同）
- 小红书：只在 discover-trends 里用（CDP 登录态更适合），last30days 不启用

**什么时候用 last30days**：
- 需要了解西方对中国 AI 话题的讨论态度和热度
- 需要跨平台 engagement 信号（Reddit upvotes、HN points）辅助判断话题优先级
- 话题在中文平台发酵后，验证西方社区是否也在讨论
- 需要学术信号（arXiv 论文趋势）

**默认配置**（`~/.config/last30days/.env`）：
```bash
# 默认搜 11 个免费源（不消耗 ScrapeCreators credits）
LAST30DAYS_DEFAULT_SEARCH=reddit,hackernews,youtube,x,polymarket,github,digg,arxiv,techmeme,threads,grounding
INCLUDE_SOURCES=threads,grounding  # opt-in 免费源

# 需要时加 TikTok/Instagram（消耗 credits）：
python3 ~/.agents/skills/last30days/scripts/last30days.py --emit=json --search reddit,hackernews,youtube,x,polymarket,github,digg,arxiv,techmeme,threads,grounding,tiktok,instagram "topic"
```

**用法**（Reddit + HN 无需 API key，开箱即用）：
```bash
# 基础搜索（JSON 输出，默认 11 源）
python3 ~/.agents/skills/last30days/scripts/last30days.py --emit=json --quick "DeepSeek"

# 限制源（只搜 Reddit + HN，快速）
python3 ~/.agents/skills/last30days/scripts/last30days.py --emit=json --search "reddit,hackernews" "DeepSeek"

# 自定义 subreddits
python3 ~/.agents/skills/last30days/scripts/last30days.py --emit=json --subreddits "MachineLearning,LocalLLaMA" "DeepSeek"
```

**输出格式**：`{clusters: [{title, summary, engagement_total, sources}]}`，Agent 读取后与 `trending-topics.json` 按 topic 关键词交叉比对。

**协作流程**：
```
discover-trends.mjs → trending-topics.json（中文平台，CDP 登录态）
last30days --emit=json → JSON（西方社媒 + 学术，API）
Agent 读两个 JSON → 按 topic 关键词匹配 → 交叉比对 engagement → 选 topic
```

> 详细配置见 `docs/skills-catalog.md` → 已集成工具 → last30days-skill。

### 入口 3：新 session，未指定任务

Agent 读 `AGENTS.md` Session Start Checklist → 检查 `pending-analysis.json` → 检查未完成工作流 → 简要提示：

> "可以写文章（给素材）或做视频（给话题/跑 trends）"

### 内容品类战略优先级

本项目聚焦**品类 A：热点 + 大咖解读**（⭐⭐⭐）——最适合冷启动、成本最低、与 AI 辅助生产天然适配。来源：自媒体实战方法论（乱码老师 × 小川，2026-08-05）。

| 品类 | 评级 | 特点 | 适用性 |
| ---- | ---- | ---- | ------ |
| **A: 热点 + 大咖解读** | ⭐⭐⭐ | 最快上手、成本最低、AI 天然适配 | ✅ 本项目核心定位 |
| B: 社区生活短剧 | ⭐⭐ | 利用已有素材，不需额外生产成本 | ❌ 不适用（非社区型账号） |
| C: 播客 / 嘉宾对谈 | ⭐ | 流量不好但必须做（知识库积累） | ❌ 当前无嘉宾管线 |

**核心洞察**："AI 天生适合把复杂东西讲解得让人好理解"——本项目的 AI 辅助内容生产方向（文章 → scene-data → 视频）天然适配品类 A。discover-trends → 文章 → 视频管线即为品类 A 的自动化实现。

---

## Stage 1: 文章生成

### 1a. 源素材读取（ISSUE-14）

Agent 接收任意格式的源素材，读取并理解核心内容。

| 素材类型            | 读取方法                                      | 工具                           |
| ------------------- | --------------------------------------------- | ------------------------------ |
| PDF                 | 用 `pdf-parse` 或 `web-access` skill 读取文本 | `npm install pdf-parse` 或 CDP |
| 网页 URL            | 用 `web-access` skill (CDP) 抓取              | Chrome 后台 tab                |
| 纯文本              | 直接 `read_file`                              | 内置工具                       |
| 研究报告            | 同 PDF 或网页                                 | 同上                           |
| 社交媒体帖子        | 用 `web-access` skill 抓取                    | CDP                            |
| 话题/趋势（无素材） | Agent 用 `web-access` skill 调研              | CDP                            |

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

#### 公司档案查阅（前置）

Agent 在开始写文章前，先检查 `docs/refs/company-profiles/` 下是否有内容涉及的主要公司的档案。如有，读取相关档案获取：
- 公司基本信息（创始时间、创始人、业务板块）
- AI 团队与产品线（团队名、消费品牌、企业 API、开源策略）
- 模型发布时间线、融资历史、关键人物
- 计算基础设施（芯片、出口管制、云平台）
- **Platform Context**（如有）— 公司与 TikTok / 发布平台的关联信息
- 值得提及的背景事件

当前已有档案：DeepSeek、ByteDance（含 TikTok 关系）、Moonshot/Kimi、MiniMax、Alibaba/Qwen、Baidu/ERNIE、Huawei/Ascend。

> 这些档案是 RAG 前置工作（WP-2）的一部分，未来 RAG 管线建成后会被自动索引。目前 Agent 手动查阅。

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

| 信息类型          | 搜索渠道          | 方法                                                                            | 说明                                            |
| ----------------- | ----------------- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| **中文综合**      | Google 中文关键词 | CDP 直接搜                                                                      | 搜中文关键词，覆盖观察者网、中国网、Yahoo財經等 |
| **深度技术讨论**  | 知乎              | `site:zhihu.com` + 站内搜索                                                     | 原始分析帖、行业深度讨论、测评博主内容          |
| **微信公众号**    | 搜狗微信 + 百度   | `weixin.sogou.com`（CDP，可能有验证码）+ `site:mp.weixin.qq.com`（Google/百度） | 微信文章被删除快，需及时抓取留档                |
| **小红书**        | 百度 + 站内搜索   | `site:xiaohongshu.com`（Google/百度覆盖率低）+ CDP 站内搜（需登录）             | 小红书内容 Google 基本不索引                    |
| **视频内容**      | B站               | `site:bilibili.com` + 站内搜索                                                  | AI 相关视频和评论区讨论                         |
| **微博舆情**      | 微博              | `s.weibo.com`（CDP 直接搜）                                                     | 热搜、大 V 评论、实时舆情                       |
| **英文社区**      | Reddit            | `site:reddit.com` + 站内搜索                                                    | r/LocalLLM、r/MachineLearning 等英文技术讨论    |
| **代码/文档存档** | GitHub            | `site:github.com` + 站内搜索                                                    | 技术事件常有代码仓库/文档留档（可能被删）       |
| **英文权威媒体**  | Google + Context7 | 原有流程                                                                        | Anthropic 博客、Bloomberg、PCMag、SCMP、BBC 等  |

**搜索策略**：

1. **先中文后英文** — 先搜中文关键词获取国内视角，再搜英文获取国际报道
2. **交叉验证** — 同一事件至少两个独立来源确认后才写入文章
3. **及时留档** — 微信文章/小红书帖子可能被删，抓取后保存到 `docs/refs/source-materials/`
4. **引用来源** — 文章中标注每个关键信息的来源（媒体名 + 日期），敏感信息标注「据素材记录」

#### Widget 定位：补充新信息（非重复正文）

Widget 的核心定位是**补充文章中不存在的新信息**，不是文章正文的替代、总结或可视化复述。Widget 应提供文章中未展开的、但能增强读者理解的**公开可验证信息**。

**核心原则：Widget 必须带来正文没有的新信息。** 如果一个 Widget 的内容可以从文章正文中直接推导出来，它就不应该存在。Widget 的价值在于引入外部上下文、对比数据、历史背景等正文未覆盖的维度。

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

> 💡 **设计原则**：
> 1. **新信息优先**：每个 Widget 必须包含至少一个正文中没有的数据点或视角。Agent 在 MRL-1 自审时检查：Widget 内容是否可在正文中找到？如果是 → Blocker。
> 2. **可视化优先**：Widget 应以图表、图形、数据可视化为主，文字量最小化。避免纯文本列表。
> 3. **交互性**：Widget 应提供 hover、click、toggle 等交互方式，让用户探索数据。
> 4. **多样性**：一篇文章的多个 widget 应使用不同的可视化技术（矩阵、柱状图、流程图、折线图等），避免同质化。
> 5. **英文 only**：Widget 数据和 UI 文案统一使用英文，不需要双语 toggle（历史遗留的 toggle 已于 2026-08-08 移除）。
> 6. **数据硬编码**：Widget 数据由 Agent 在 Stage 1b 中通过 web-access 调研获取，硬编码在组件代码中（不存数据库）。

#### Widget 决策树

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

#### 已有 Widget 注册表

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

#### Widget 宽度规则

文章正文约束在 `65ch`（约 620px）阅读列宽度。Widget 默认也使用 `max-w-prose`（65ch）与正文对齐，保证视觉一致。

**Breakout Widget**：少数 widget 因布局需要（如双列图表、宽矩阵）标记为 breakout，渲染时使用文章全宽（`max-w-4xl` ≈ 896px）。在 `registry.ts` 的 `BREAKOUT_WIDGETS` 集合中注册：

```typescript
export const BREAKOUT_WIDGETS = new Set<string>([
  "deepseek-funding", // donut chart + investor legend side-by-side
]);
```

**判断标准**：
- widget 含双列并排布局（如图表 + 图例）且在 65ch 内会换行挤压 → breakout
- widget 含宽表格/矩阵且 `min-w` > 600px → breakout
- 单列、卡片列表、柱状图等 → 默认 65ch

创建新 widget 时，先按 65ch 设计；如确实需要更宽，在 `BREAKOUT_WIDGETS` 中添加 ID 并在注释中说明理由。

#### 创建新 Widget 流程

如果素材涉及新话题（非 DeepSeek），需要创建新 widget：

1. 在 `src/components/widgets/{topic}/` 创建组件（**英文 only，不需要双语 toggle**）
2. 在 `src/components/widgets/{topic}/data/` 写数据文件（英文）
3. 在 `src/components/widgets/registry.ts` 注册
4. 如 widget 需要超出 65ch 的宽度，在 `BREAKOUT_WIDGETS` 中添加 ID（见上方「Widget 宽度规则」）
5. **`npm run build` + 部署** — Widget 是前端代码，必须打包部署后才可用
6. 然后才能运行 `publish-article.mjs` 发布含该 widget 的文章

> ⚠️ Widget 数据是代码硬编码，不存数据库。这是架构约束（见 Phase 2 Grill 纪录）。

> ⚠️ DeepSeek widget 的 EN/中文 双语 toggle 已于 2026-08-08 移除（英文 only）。新 widget 不应添加双语 toggle。

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

**示例：**

```markdown
Anthropic framed this as a national security risk. _(✅ Verified: [Anthropic blog](https://anthropic.com/...))_

CEO Yang Zhilin cited "cost reduction" as the rationale for downsizing the RL team. _(🔴 Contradicts public data: no public reports of RL team layoffs; Yang still described as leading RL per [Business Insider](https://businessinsider.com/...))_
```

#### 🔄 MRL-1: 文章自审

Agent 生成 frontmatter markdown 后，**先运行 MRL-1 自审循环**，0 Blockers 后直接进入 Stage 2。

**Blockers（任一 FAIL = 必须修复后重新检查）：**

| #   | 检查项           | 阈值 / 规则                                                                                       | 修复方式                      |
| --- | ---------------- | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| B1  | Frontmatter 格式 | 必须有 `title`, `slug`, `excerpt`, `published: true`                                              | 补全缺失字段                  |
| B2  | 语言             | 文章 body 必须为英文（不允许中文字符出现在正文中，中文人名/公司名除外）                           | 翻译中文段落为英文            |
| B3  | Widget 注册     | 所有 `<!-- widget:xxx -->` 的 ID 必须在 `registry.ts` 中已注册                                    | 修正 ID 或创建+注册新 widget  |
| B3a | Widget 可视化  | Widget 必须使用图表、图形等可视化方式呈现，纯文本链接列表不通过（至少使用柱状图、矩阵、流程图等任一） | 重设计 widget 为可视化形式  |
| B4  | 源引用           | 每个数据点（金额、日期、比例、引用语）必须有内联来源标注（媒体名+日期 或 URL）                    | 补充来源                      |
| B5  | 链接完整性       | 所有 URL 必须指向具体文章/页面，禁止域名根链接（如 ❌ `https://bloomberg.com`）                   | 替换为完整 URL 或换可访问来源 |
| B6  | 声明验证标注     | 如使用匿名/内部信源，每个关键声明必须有 ✅/⚠️/❌/🔴 标注                                          | 补充标注                      |
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

**循环流程**：Agent 逐项检查 → 发现 Blocker → 修复 → 从 B1 重新检查 → 全部 Blocker PASS → 输出 MRL-1 报告 → **直接进入 Stage 2（不暂停）**。

> ⚠️ 如有新 widget，Agent 仍需提示用户需要 `npm run build` + 部署后才能发布（这是部署依赖，非审阅检查点）。

---

## Stage 2: 文章发布 + 附件上传

MRL-1 通过后，Agent 发布文章到网站并上传源素材附件。文章在 HITL 之前发布，这样视频 caption 可以引用到 live article URL，RAG 也能立即收录新内容。

### 2a. Widget 部署（如有新 widget）

如果 Stage 1 创建了新 widget 组件：

1. `npm run build` 构建（包括 widget 代码）
2. 访问 Lovable 编辑器 → 点击「Publish」部署
3. `npm run dev` 后运行 `node scripts/verify-widget-a11y.mjs --preview` 做发布前运行时验证：`/widgets` 预览路由为 dev-only（生产构建静态 404），可对每个 registry widget 渲染真实预览页验证 HTTP 200、容器配方、宽度类（breakout `max-w-none` / 常规 `max-w-prose`）、键盘可达、交互状态切换、未知 id 渲染 404。**0 FAIL 才算部署合格**，再进入 Stage 3
4. **注意**：不要直接用 `npx wrangler deploy`，会丢失 Lovable 注入的环境变量

> Widget 部署需要在文章发布前完成。Agent 在 Stage 1 创建 widget 后即可部署。

### 2b. 文章发布到网站

```bash
node scripts/article/publish-article.mjs --file <path>
```

脚本通过 Supabase Auth API 登录（Admin 账号），REST API upsert by slug。发布后 `triggerRagReindex()` 自动触发 RAG 收录。

### 2c. 上传源文件附件

将所有引用的原始素材文件上传为 article attachments：

```bash
# 上传单个文件
node scripts/article/upload-attachments.mjs --post <slug> --files <path/to/source.pdf>

# 上传多个文件
node scripts/article/upload-attachments.mjs --post <slug> --files <path1.pdf> <path2.csv> <path3.docx>
```

文章发布后即可上传附件，不依赖 HITL 确认。

### 2d. RAG Reindex（文章发布后自动触发）

文章发布后，立即触发 RAG 增量重建，确保新内容进入知识库供后续文章引用和 Agent 查询：

```bash
node scripts/rag/index.mjs
```

`publish-article.mjs` 内置 `triggerRagReindex()` 调用，发布成功后自动触发。即使自动触发失败，也不阻塞管线。

> **非阻塞**：如果 Ollama 未运行或 reindex 失败，不阻塞管线后续 stage。Agent 会输出警告并建议手动 `node scripts/rag/index.mjs`。

---

## Stage 3: 文章 → scene-data（ISSUE-17）

> **前置条件**：Stage 1 已完成（文章 markdown 已生成）。
>
> **公司档案**：如内容涉及已建档公司（见 `docs/refs/company-profiles/`），确保 scene-data 中的公司信息与档案一致。特别注意 ByteDance 的 Platform Context（TikTok 关系）— 如视频涉及 ByteDance，考虑在 voiceover 中简要提及 ByteDance 是 TikTok 的母公司（因为我们发布在 TikTok 上，观众会对这个"在 ByteDance 平台上看 ByteDance 故事"的自指关联感兴趣）。

从文章 markdown 提炼视频脚本。

> **脚本写作方法论**：写或改 voiceover 和叙事弧线时，参照 `docs/video-script-writing-guide.md`（S.T.A.R.T. 框架 + open loop / pattern interrupt / loop closure + hook 公式 + CTA 公式 + 逐 scene beat-by-beat 迭代方式）。研究依据见 `docs/research/short-video-script-writing-best-practices.md`。

### Step 0: 分集评估（新增）

Agent 在生成 scene-data 前，先运行分集评估器：

```bash
# Agent 在 Node.js 中调用评估器
node -e "import { evaluateArticle } from './scripts/short-video/lib/episode-evaluator.mjs'; const r = evaluateArticle(articleText); console.log(JSON.stringify(r, null, 2));"
```

**评估器输出**：

- `recommendedParts`（1-5，但 Agent 强制 cap 为 3，见下方规则）
- `splitMethod`（"none" | "thematic" | "narrative"）
- `reasoning`（人类可读理由数组）

**三集上限规则**：

根据多视频拆分最佳实践调研（`docs/research/multi-video-splitting-best-practices.md`），2-3 集为最佳，超过 3 集观众流失率显著上升。因此：

- 评估器输出 `recommendedParts > 3` 时，Agent **强制 cap 为 3**，并在报告中说明「评估器推荐 N 集，已调整为 3 集（最佳实践上限）」
- 除非用户明确要求更多集数，否则不超过 3 集
- 发布节奏：1-3 天内发完所有集，超过 1 周观众会忘记上下文

**Agent 行为**：

- `recommendedParts === 1`：走单集流程（当前步骤 1-5）
- `recommendedParts > 1`：cap 为 3 后输出分集评估报告，等待用户确认后生成 N 份 scene-data

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
发布节奏：
- Day 1: Part 1 (TikTok)
- Day 2: Part 2 (TikTok)
- Day 3: Part 3 (TikTok)
- 每集间隔不超过 3 天，超过 1 周观众会忘记上下文
━━━━━━━━━━━━━━━━━━━━
```

**多集 scene-data 结构**：每集一个 `content/<series>/pt<N>/` 目录，内含 `meta.mjs`（文章级 metadata）+ `scene-data.mjs`（场景数组 + `seriesMeta` 字段）+ `scenes.mjs`（视觉模板）。可选 `dom-config.mjs`（DOM 验证配置，不写则用默认值）。示例：`content/distillation/pt1/`、`content/restraint/pt1/`。根目录 `scene-data-pt*.mjs` 遗留命名已废弃（2026-08-08 清理完毕）。

### 管线进度追踪

每次启动管线时，Agent 在 `scripts/short-video/output/` 下创建 `pipeline-status.json`，记录当前管线的进度状态。用户随时可以打开此文件查看「现在到哪了，下一步做什么」。

```json
{
  "articleSlug": "china-llm-distillation-storm",
  "articleTitle": "The Distillation Storm: Inside China's LLM Distillation Controversy",
  "startedAt": "2026-08-04T10:00:00Z",
  "currentStage": "stage-3",
  "stages": {
    "stage-1": {
      "status": "done",
      "completedAt": "2026-08-04T10:30:00Z",
      "mrl": { "status": "pass", "blockers": 0, "warnings": 1 }
    },
    "stage-2": {
      "status": "done",
      "completedAt": "2026-08-04T10:35:00Z",
      "postId": "9d05cf9b-..."
    },
    "stage-2b": { "status": "done", "completedAt": "2026-08-04T10:36:00Z" },
    "stage-3": {
      "status": "in-progress",
      "note": "scene-data generation, 3 parts",
      "mrl": { "status": "pass", "blockers": 0, "warnings": 2 }
    },
    "stage-4": { "status": "pending" },
    "stage-5": { "status": "pending" },
    "stage-6": { "status": "pending" }
  },
  "videoParts": [
    {
      "part": 1,
      "sceneData": "content/distillation/pt1/scene-data.mjs",
      "status": "review-ready",
      "mrl": { "status": "pass", "blockers": 0, "warnings": 1 }
    },
    {
      "part": 2,
      "sceneData": "content/distillation/pt2/scene-data.mjs",
      "status": "review-ready",
      "mrl": { "status": "pass", "blockers": 0, "warnings": 0 }
    },
    {
      "part": 3,
      "sceneData": "content/distillation/pt3/scene-data.mjs",
      "status": "review-ready",
      "mrl": { "status": "pass", "blockers": 0, "warnings": 1 }
    }
  ],
  "nextAction": "Stage 4: 视频制作（MRL-2 已通过，直接进入，不暂停）"
}
```

**Agent 行为**：

- 每个 stage 完成后更新 `pipeline-status.json`
- MRL 通过后，在对应 stage 或 videoPart 中写入 `mrl` 状态（`pass` / `fail` / `pending`）
- HITL 检查点暂停时，`nextAction` 字段写明等待什么，并标注 MRL 状态
- 新 session 启动时，Agent 先读此文件判断是否有未完成管线，以及 MRL 是否已通过

**`main.mjs` 支持**：`node main.mjs --content <dir>`（如 `deepseek`、`distillation/pt1`、`restraint/pt1`；要求目录内 `meta.mjs` + `scene-data.mjs` + `scenes.mjs` 三者齐备。`dom-config.mjs` 可选——不写则 DOM 验证使用默认值，新建管线无需编辑中心文件）

### 步骤

1. **读文章 content** — 从 Supabase 或 admin editor 获取
2. **去掉 widget 标记** — `<!-- widget:xxx -->` 不出现在视频中
3. **提炼核心叙事线** — 从文章结构提取 3-5 个关键点
4. **按内容类型选择叙事结构**（见下方「叙事结构模板」），按 TikTok 节奏重构为 10-12 个场景
5. **设计 SEO 标题**（≤60 chars）——在 scene-data 中显式设计 caption 第一行，包含核心关键词（如主公司名 / China AI），而非依赖 generate-caption.mjs 自动推导
6. **直接写 `scene-data.mjs`** — 不需要中间脚本
7. **检查 TikTok Creative Center trending 标签** — 通过 web-access skill 打开 `https://ads.tiktok.com/creative/creativeCenter/trends/hashtag?period=7&region=US`，检查所有类别的 trending 标签。如果发现与视频内容高度相关的 trending 标签，记录到 scene-data 的 `metadata.trendingHashtags` 字段中。`generate-caption.mjs` 会自动将这些标签纳入候选。如果没有相关的 trending 标签（当前常态），跳过此步骤，使用 curated 标签池。详见 `docs/tiktok/tiktok-best-practices.md` → Hashtag 策略章节。

### 叙事结构模板（按内容类型选择）

不同内容类型适用不同的叙事结构。Agent 在 Stage 3 步骤 3 提炼核心叙事线后，根据文章内容判断类型，选择对应模板。来源：自媒体实战方法论四层公式 + 项目内容支柱适配。

| 内容类型 | 叙事结构 | 适用场景 | 四层公式适用？ |
| -------- | -------- | -------- | -------------- |
| **深度分析** | 钩子 → 共情 → 获得感 → 升华 | 技术解读、行业趋势、战略分析 | ✅ 首选 |
| **突发新闻** | 事实冲击 → 背景 → 影响 → 下一步 | 融资、发布、人事变动 | ❌ |
| **数据对比** | 数字冲击 → 对比 → 解读 → 结论 | 定价、性能、市场份额 | ❌ |
| **争议事件** | 钩子 → 各方观点 → 核心矛盾 → 可能走向 | 基准测试争议、安全辩论 | ❌ |

#### 四层叙事结构（深度分析首选）

来自自媒体实战方法论（乱码老师），适合需要建立受众信任感的分析类内容：

1. **钩子**（前 3 秒）：戏剧化的东西放在最前面。封面（第一帧）给眼球，标题给算法
2. **共情**：让受众感觉"你和我是一伙的"。不是讲道理——是讲"我也有这个困惑"、"你也被这个东西困扰过对吧"
3. **获得感**："我关注你是有好处的"。不一定是干货——情绪共鸣、视角转换、"原来是这样"的感觉都算获得感
4. **升华**：给出新视角，让钩子变强、共情变深、获得感变厚

**完整示例**（阿里云演讲结构）：
1. 共鸣开头（让人感同身受）→ 2. 解释原因（让人听进去）→ 3. 给出证据（让人信服）→ 4. 升华（给出新视角）

> 注意：四层结构不是唯一模板。突发新闻的核心是事实冲击，不需要共情——观众要的是"发生了什么 + 对我有什么影响"。按内容类型选择，不做强制统一。

### 文章 → 视频的节奏适配

| 文章        | 视频                    |
| ----------- | ----------------------- |
| 6-10 个章节 | 10-12 个场景            |
| 详细论述    | 精简为 1-2 句 voiceover |
| 数据表格    | 数据可视化场景          |
| 引用语句    | 大字引用场景            |
| Widget      | 不出现（视频无法交互）  |

### 注意事项

- 文章的 SEO 关键词也应出现在视频 voiceover 中
- 文章的「My Take」章节（如有）→ 视频的结论/CTA 场景
- 文章的数据点 → 视频的视觉强调元素
- 视频时长：TikTok 60-70s

#### 标题策略：封面给眼球，标题给算法

TikTok 没有独立封面图——视频的第一帧就是封面。封面（hook scene 第一帧）已在 `video-workflow.md` 的 First Frame Best Practices 中规范。标题（caption 第一行 ≤60 chars）是给算法的 SEO 信号。

**Agent 在 scene-data 阶段应显式设计标题**，而非依赖 `generate-caption.mjs` 的自动推导：
- 标题包含核心 SEO 关键词（如主公司名、China AI、模型名）
- 标题 ≤60 chars（TikTok 限制）
- 标题是事实性陈述，不是 clickbait
- 可在 scene-data.mjs 的 `metadata.title` 字段中设置，`generate-caption.mjs` 会优先使用

> 来源：自媒体实战方法论——"封面给眼球，标题给算法（GEO/SEO）。标题不重要——没人看你的标题。大家只看封面。标题是给搜索和推荐算法看的，封面是给活人的眼睛看的。"

#### 内容拆分原则

- **不要一次把所有素材全用了**——如文章内容丰富无法在 60 秒内讲完，优先拆分多集（Stage 3 Step 0 分集评估），而非塞入单集导致信息过载
- 每集独立可看——不看前集也能看懂
- 分开用的素材比一次全用更有价值——"一次全用就浪费了"

### 🔄 MRL-2: 脚本自审

Agent 写完每集 `content/<dir>/scene-data.mjs` 后，**先运行 MRL-2 自审循环**（每集单独检查），0 Blockers 后直接进入 Stage 4（不暂停）。

**Blockers（任一 FAIL = 必须修复后重新检查）：**

| #   | 检查项          | 阈值 / 规则                                                                              | 修复方式           |
| --- | --------------- | ---------------------------------------------------------------------------------------- | ------------------ |
| B1  | Voiceover 字数  | 每集 ≤ 180 词（目标 ~165 词 = 60-70s @ 2.5 wps）                                         | 精简 voiceover     |
| B2  | 场景数          | 每集 8-12 个 scene                                                                       | 合并或拆分场景     |
| B3  | Hook 场景       | 第一个 scene 的 `visualType` 必须为 `"hook"`                                             | 调整场景顺序或类型 |
| B4  | CTA 场景        | 最后一个 scene 的 `visualType` 必须为 `"cta"`                                            | 调整场景顺序或类型 |
| B5  | 无 Widget 引用  | voiceover 文本中不得包含 `<!-- widget:xxx -->`                                           | 删除 widget 标记   |
| B6  | 数据一致性      | voiceover 中的数字/日期/金额必须与文章正文一致                                           | 修正数据           |
| B7  | 集数上限        | 总集数 ≤ 3（最佳实践上限）                                                               | 合并集数           |
| B8  | AI 词汇         | 不得出现 scrub-rules Tier 2 黑名单词                                                     | 替换为口语化表达   |
| B9  | 无 Dead Closers | 不得以 "thanks for watching" / "don't forget to subscribe" / 裸 "what do you think" 结尾 | 改写为具体 CTA     |
| B10 | Series Meta     | `seriesMeta` 存在，`partNumber`/`totalParts`/`prevPartSlug`/`nextPartSlug` 正确          | 修正 seriesMeta    |

**Warnings（列出但不阻塞 HITL）：**

| #   | 检查项        | 阈值                                                     |
| --- | ------------- | -------------------------------------------------------- |
| W1  | 估算时长      | 每集 < 55s 或 > 75s（字数 / 2.5 wps）                    |
| W2  | Hook 具体性   | Hook voiceover 中无具体数字                              |
| W3  | 节奏均一      | 所有 voiceover 句子长度差异 < 15%（teleprompter rhythm） |
| W4  | 长句          | 任何单句 > 25 词（一口气读不完）                         |
| W5  | Hook = 字幕   | spoken hook 与 on-screen text 完全相同                   |
| W6  | 无 Loop-close | CTA 前最后一个内容场景未回扣 Hook                        |

**循环流程**：Agent 对每集 scene-data 逐项检查 → 发现 Blocker → 修复 → 从 B1 重新检查 → 全部集数全部 Blocker PASS → 输出 MRL-2 报告 → **直接进入 Stage 4（不暂停）**。

### 3b. RAG Reindex（scene-data 就绪后自动触发）

MRL-2 通过后，scene-data 已就绪。触发 RAG 增量重建，将新的 scene-data 内容（voiceover 文本、视觉描述）索引进知识库：

```bash
node scripts/rag/index.mjs
```

> **非阻塞**：reindex 失败不阻塞 Stage 4 视频制作。Agent 输出警告并建议手动重跑。

---

## Stage 4: 视频制作

> **前置条件**：Stage 3 已完成（MRL-2 通过）。

`short-video-pipeline` skill 自动加载，`brand-system` skill 同时加载控制视觉一致性。

```bash
node scripts/short-video/main.mjs                    # TTS → HTML → 录制 → 合成（不含 BGM）
```

> **BGM 不在 Stage 4 自动添加**。视频先以纯 VO 产出，BGM 在 Stage 5 HITL 确认后通过 `mix-bgm.mjs` 独立混入。这样用户可以在 HITL 审阅时决定：是否加 BGM、用哪个 BGM、还是用 TikTok trending sound（在 App 内手动加，算法加权更高）。

视频制作的技术细节（TTS 引擎、渲染参数、文件位置）见 `docs/video-workflow.md`。

> **云 GPU 资源**：当需要跑 CUDA 模型（数字人推理等，M2 Pro MPS 不支持的）时，使用云 GPU 资源 pool。优先级和 fallback 规则见 `docs/research/digital-human-test-progress.md` → 「云 GPU 资源 Pool 与 Fallback」章节。

### 4b. RAG Reindex（多媒体素材）

视频制作完成后，如本管线下载了新素材或修改了 `assets/catalog.yml`，触发 RAG 增量重建，确保多媒体素材元数据进入知识库：

```bash
node scripts/rag/index.mjs
```

**Agent 行为**：
- 如 Stage 4 中使用了 `asset-sourcer.mjs` 下载新素材 → Agent 在 `assets/catalog.yml` 中写入条目（description, keywords, source, license）→ 触发 reindex
- 如未新增素材（仅使用已有素材或纯 CSS 场景）→ 跳过此步骤
- HITL 阶段用户要求修改视频导致素材变更时 → 同样触发 reindex

> **非阻塞**：reindex 失败不阻塞 Stage 5。Agent 输出警告并建议手动重跑。增量索引是默认模式——只 embed 文本内容变化的 chunks，未变化的跳过。全量重建用 `node scripts/rag/index.mjs --full`。catalog 条目质量影响 RAG 搜索相关性——Agent 应在 reindex 前审查 description 和 keywords 的准确性。详见 `docs/media-asset-management.md` §2「When to trigger RAG reindex」。

---

## Stage 5: 视频验证 + TikTok 发布

> **前置条件**：Stage 4 已完成（视频已制作）。

### 🔄 MRL-3: 视频自审（HITL 前置）

MRL-3 即现有的 `verify-video.mjs` 流程，正式命名为 MRL-3。验证不通过时 Agent 自动修复并重跑，**循环直到 0 failures** 才进入 HITL。

```bash
node scripts/short-video/verify-video.mjs --tiktok  # TikTok 合规检查 = MRL-3
```

**MRL-3 Blockers**（verify-video.mjs 已覆盖）：

- 视频文件存在且为有效 mp4
- 视频时长在 TikTok 60-70s 范围
- 分辨率、码率、编码合规
- 字幕文件存在且时间轴对齐
- 无黑屏/空帧检测

**MRL-3 内容补充检查**（Agent 手动执行，verify-video.mjs 无法自动检测的）：

- TTS 音频时长与 voiceover 估算一致（±5s）
- 字幕文本与 scene-data voiceover 一致（无 Whisper 识别误差导致的 "deep seeks" vs "DeepSeek's"）
- 品牌元素（logo、配色）符合 brand-system 规范

### ⏸️ HITL: 视频成品审阅检查点（唯一人工确认点）

MRL-3 通过后，Agent **暂停**，执行以下步骤：

1. **输出 MRL-3 报告**（verify-video.mjs 合规报告 + 内容补充检查结果）
2. **输出视频文件路径**：`output/deepseek-short.mp4`（或实际文件名）
3. **输出文章内容预览**：输出文章 markdown 全文（供用户一并审阅文章质量，文章已在 Stage 2 发布到网站）
4. **输出场景概览表**（供用户审阅脚本质量）
5. **提示用户审阅要点**（聚焦主观维度）：
   - 实际观看视频，检查整体观感
   - TTS 语音是否清晰、自然
   - 字幕是否准确、可读
   - 视觉动画是否流畅
   - Hook 场景是否抓人
   - CTA 场景是否有效
   - 有无明显的渲染问题（黑屏、错位、卡顿）
   - **文章内容是否准确**（如有问题可在此反馈，Agent 修改后重新发布）
   - **脚本叙事是否合理**（如有问题可在此反馈，Agent 修改后重新制作）
6. **输出 TikTok 发布前最佳实践提醒**（每次必输出，提醒用户发布时和发布后的操作）：

   ```
   📱 TikTok 发布前最佳实践提醒
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   
   【发布时在 TikTok App 手动操作】
   □ AIGC 标签：打开 "AI-generated content" 开关
   □ 背景音乐：使用 HITL 推荐的 BGM 或 TikTok trending sound（见下方 BGM 推荐），音量 5-12%
   □ 地理标签：添加 China/US 位置标签
   □ Caption：≤2,200 chars，包含 SEO 关键词，3-5 个 hashtag
   □ Hashtag 示例：#ainews #chinaai #deepseek #technews（根据内容自动推导，主公司名动态匹配）
   □ Trending 检查：Agent 已通过 Creative Center 检查当前 trending 标签
   
   【发布后 1 小时内】
   □ 自己发第一条评论 → 长按 → Pin comment（置顶）
      → 内容模板见下方「Pinned Comment 模板」
   □ 有人评论 → 逐条回复（首小时互动信号影响算法推荐）
   □ 没人评论 → 正常（100-200 播放阶段评论很少），去同领域热门视频下留有质量的评论
   □ 监控前 1h 播放数据：0 播放=可能 shadowban；100-200=200-View Jail；500+=正常
   
   【发布后 24-48h】
   □ 检查 TikTok Analytics：完成率、For You 流量占比、分享/收藏率
   □ 完成率 <30% → 下一条改进 Hook
   □ For You 占比 <30% → 算法未推荐，检查内容是否触发降权
   
   【长期维护】
   □ 不删除旧视频（删除移除算法数据点）
   □ 不为了发而发（低质量内容损害账号健康）
   □ 元素迭代法：每轮只换一个元素，用数据说话
   
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   完整指南：docs/tiktok/tiktok-best-practices.md
   ```

   **📦 发布包**（Agent 从 generate-caption.mjs 输出中读取，直接给用户复制粘贴）：

   ```
   📋 Caption（复制粘贴到 TikTok 发布界面）
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   [读取 output/tiktok-caption.txt 内容，原样输出]
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   
   📌 Pinned Comment（发布后在评论区手动发这条，然后长按置顶）
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   [读取 output/tiktok-pinned-comment.txt 内容，原样输出]
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

   > Agent 每次根据当期视频内容自动生成 Caption（含评论钩子）和 Pinned Comment。如果用户修改了 scene-data（如更新了文章 URL），重新运行 `generate-caption.mjs` 后这些内容会自动更新。Agent 在 HITL 输出时读取最新生成的文件内容。

7. **BGM 选择与确认**（HITL 内）— Agent 自动执行：
   a. 从 BGM 池中按 pipelineId 确定性选择一个 CC-BY BGM（`lib/bgm.mjs` → `selectBGM`）
   b. 获取 TikTok trending sounds 并按内容关键词匹配（`trending-sounds.mjs --content <dir>`）
   c. 输出推荐：
      ```
      🎵 BGM 推荐
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      选项 A — 混入视频（CC-BY BGM）：
        {selected_bgm} | {duration}s | 即刻起声 ✅
        → 确认后执行：node mix-bgm.mjs --video <path> --pipeline-id <id>

      选项 B — TikTok trending sound（App 内手动加，算法加权更高）：
        {matched_sound_1} | {video_count} videos using
        {matched_sound_2} | {video_count} videos using
        → 在 TikTok 发布界面 → Add sound → 搜索上述声音

      选项 C — 不加 BGM
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      ```
   d. 等待用户选择 A / B / C
   e. 如果选 A：执行 `node scripts/short-video/mix-bgm.mjs --video <path> --pipeline-id <id>`
   f. 如果选 B：将推荐声音加入发布后手动操作清单
   g. 如果选 C：跳过 BGM

8. **等待用户确认** — 用户说「视频 OK，发布」或类似确认语后才可执行发布

> **视频/脚本修改时的自动更新规则**：如果用户在 HITL 阶段要求修改视频或 scene-data（如"改一下 Hook"、"更新一下文案"、"加个数据"），Agent 修改完成并重新渲染视频后，**必须自动重新运行 `generate-caption.mjs`** 以更新 Caption 和 Pinned Comment，然后重新输出发步包（步骤 6），确保用户拿到的始终是最新的 Caption 和 Pinned Comment。不需要用户额外要求"帮我更新 caption"。
>
> ```bash
> # 修改 scene-data 后自动执行
> node scripts/short-video/generate-caption.mjs --content <dir>
> # 然后重新读取 output/tiktok-caption.txt 和 output/tiktok-pinned-comment.txt
> ```

> ⚠️ Agent 不得在用户未确认前自动执行 TikTok 发布。MRL-3 的自动合规检查是必要条件但非充分条件 — 机器无法判断内容质量、叙事流畅度、TTS 自然度等主观维度。用户在看视频时同时审阅文章和脚本，如有问题可在此反馈，Agent 会回溯修改并重新制作。
>
> **质量门控**：如果视频质量不达标（TTS 不自然、字幕错位、视觉问题等），Agent 应建议用户不发布而非强行发布。不要为了发而发——发布低质量内容会损害账号健康（见 `docs/tiktok/tiktok-best-practices.md` 账号健康管理章节）。Agent 应明确告知用户质量问题并建议修复后重新渲染。

### 发布（HITL 确认后执行）

用户确认后，Agent 执行以下发布步骤（文章已在 Stage 2 发布）：

#### 5a. TikTok 发布 + 自动保存 URL

```bash
node scripts/short-video/publish-tiktok.mjs --slug <slug>   # 通过 Publora API 发布，发布后自动保存 TikTok URL 到文章
```

> 发布后脚本自动轮询 Publora 获取 TikTok video ID，构造 URL 并保存到 `posts.tiktok_url`。文章页自动渲染 TikTok embed。如果 2.5 分钟内 TikTok 未完成处理，打印警告提醒手动设置 URL。

#### 发布后验证

访问 `/posts/{slug}` 确认：
- 文章显示正常，widget 渲染正确
- 源素材附件列表完整
- TikTok embed 正常显示在「Watch」区域

### ⏸️ 用户手工操作检查点

发布后需要用户在 TikTok App 中手动完成：AIGC 标签、趋势音频、地理标签、pinned comment、回复评论。
完整清单见 `docs/manual-ops.md` 的「每次发布视频时」部分。

发布成功后，脚本自动写入 `output/pending-analysis.json` 记录待分析状态。

---

## Stage 6: Analytics 闭环

> Analytics 是独立工作流，与 Content Pipeline 的单次制作周期不同步。
> 完整流程见 `docs/analytics-workflow.md`。

TikTok 数据通常需要 24-48h 才能在 dashboard 中看到。

### 流程

1. 检查 `output/pending-analysis.json`（Agent 在新 session 时被动检查）
2. 超过 48h → 提醒用户导出 CSV
3. 用户登录 `analytics.tiktok.com` → Content → 选时间范围 → Export
4. 运行分析脚本：`node scripts/short-video/fetch-tiktok-analytics.mjs --csv <csv-path>`
5. 录入 A/B 测试：`node scripts/short-video/ab-test-tracker.mjs --result output/analytics-export.json`
6. Agent 将 `pending-analysis.json` 的 status 改为 "done"

详见 `docs/analytics-workflow.md` 和 `docs/manual-ops.md` 的「定期检查」部分。

---

## 检查点总结

| 检查点                | 位置                           | 类型     | 谁操作 | 必须？          |
| --------------------- | ------------------------------ | -------- | ------ | --------------- |
| **🔄 MRL-1** 文章自审 | Stage 1（自审，不暂停）        | 机器循环 | Agent  | ✅ 必须         |
| 新 widget 部署        | Stage 2（文章准备时）          | 人工操作 | 用户   | 仅当有新 widget |
| **🔄 MRL-2** 脚本自审 | Stage 3（自审，不暂停）        | 机器循环 | Agent  | ✅ 必须         |
| 📚 RAG reindex（多媒体） | Stage 4b（视频制作后）       | 脚本执行 | Agent  | 仅当有多媒体素材变更 |
| **🔄 MRL-3** 视频自审 | Stage 5 → HITL 前              | 机器循环 | Agent  | ✅ 必须         |
| **HITL** 视频成品审阅 | Stage 5 内部（验证后、发布前） | 人工确认 | 用户   | ✅ 必须         |
| 文章发布 + 附件上传   | Stage 2（HITL 之前）           | 脚本执行 | Agent  | ✅ 必须         |
| TikTok 发布 + URL 保存 | Stage 5 HITL 确认后          | 脚本执行 | Agent  | ✅ 必须         |
| TikTok 手工操作       | Stage 5 之后                   | 人工操作 | 用户   | ✅ 必须         |
| Analytics 导出        | Stage 6                        | 人工操作 | 用户   | ✅ 必须         |

### Agent 行为准则

1. **MRL 仍必须运行** — MRL-1、MRL-2 自审通过后不暂停，直接进入下一 Stage。MRL-3 通过后才进入 HITL
2. **到达 HITL 检查点时必须暂停** — 输出 MRL-3 报告 + 视频成品 + 文章链接 + 场景概览 + 等待用户确认
3. **不得自行假设确认** — 确认必须是用户主动发出（「继续」「OK」「确认」「发布」等）
4. **用户提出修改意见时 — 必须做联动检查** — 用户可能只针对视频提了意见，但 Agent **必须主动检查文章和脚本是否也需要同步修改**。因为视频脚本来源于文章，如果视频需要改（比如数据纠正、叙事调整、措辞修正），文章很可能有同样的问题。Agent 的处理流程：
   - 收到用户反馈后，先判断反馈类型（数据准确性 / 叙事逻辑 / 措辞语气 / 视觉呈现 / TTS 质量）
   - **数据准确性类**（如数字错误、事实错误）→ **必须回溯检查文章**，文章中相同数据大概率也有错
   - **叙事逻辑类**（如场景顺序、信息遗漏）→ **必须回溯检查文章**对应章节，文章的结构可能需要同步调整
   - **措辞语气类**（如某句话的表述）→ **必须回溯检查文章**，文章中相同表述是否需要改
   - **纯视觉/TTS 类**（如字幕错位、渲染问题、语音不自然）→ 通常只需重做视频，不影响文章
   - Agent 在修改时应输出「联动检查报告」，明确列出：修改了哪些层（文章 / 脚本 / 视频）、为什么联动（或不联动）、修改了哪些具体内容
   - 修改后重新运行相关 MRL → 重新进入 HITL
5. **Stage 1-4 全自动** — MRL 是自审门，HITL 是唯一人工门：机器先过滤机械性错误，人工只在最终成品处审阅

---

## Design Decisions & References

| Topic | Reference | Content |
|-------|-----------|---------|
| Script writing methodology | `docs/video-script-writing-guide.md` (L1) | S.T.A.R.T. framework, open loops, hook/CTA formulas, beat-by-beat iteration |
| Script writing research | `docs/research/short-video-script-writing-best-practices.md` | 15+ sources — psychological retention engines, hook formulas |
| Multi-video splitting | `docs/research/multi-video-splitting-best-practices.md` | 15 sources — TikTok algorithm analysis, episode linking, auto-evaluator |
| Media asset management | `docs/media-asset-management.md` (L1) | Asset placement rules, catalog & RAG integration, reindex trigger matrix |
| Video production workflow | `docs/video-workflow.md` (L1) | TTS engines, rendering, publishing strategy, file paths |
| TikTok best practices | `docs/tiktok/tiktok-best-practices.md` (L2) | Signal weights, voice rules, hook formulas, audit checklist |
