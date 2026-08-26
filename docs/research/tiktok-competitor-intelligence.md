# TikTok 竞品情报库 — China AI 赛道

> **调研日期**: 2026-08-25
> **调研方法**: Brave Search + Jina Reader（TikTok 页面 JS 渲染限制，部分数据来自搜索摘要）
> **更新频率**: 每月补充一次，或重大 China AI 事件后补充
> **用途**: 为 `caption-utils.mjs` 的 description/hashtag 推导提供 ground truth 参考集

---

## 1. 竞品爆款视频（按播放量排序）

### 1.1 主流媒体账号（高播放量，品牌背书强）

| # | 账号 | Likes | Description (完整) | Hashtags | 特征 |
|---|------|-------|-------------------|----------|------|
| 1 | @rtenews | 10.7K | "Why is China's DeepSeek app causing such a stir?" | #DeepSeek #ChatGPT #AI #DonaldTrump #artificialintelligence #rtenews #China | 疑问式 hook，7 个标签（超出推荐 3-5），品牌标签 #rtenews |
| 2 | @cnbc | 24.2K | "A little-known AI lab out of #China has ignited panic throughout Silicon Valley after releasing #AI models that can outperform America's best despite being built more cheaply and with less-powerful chips. #DeepSeek, as the lab is called, unveiled a free, open-source large-language model in late December that it says took only two months and less than $6 million to build, using reduced-capability chips from #Nvidia called H800s. Watch the full video at the #linkinbio or tap the link on screen. #CNBC" | #China #AI #DeepSeek #Nvidia #CNBC | 长描述（叙事型）， hashtag 内嵌在句中（自然融入），CTA 引导 linkinbio |
| 3 | @bloombergopinion | 2.4K | "#DeepSeek is the latest #Chinese #AI to catch the U.S. off guard #BigTech" | #DeepSeek #Chinese #AI #BigTech | 极短描述，hashtag 主导，无 CTA |
| 4 | @pbsnews | 731 | "Chinese AI startup DeepSeek shakes up industry and disrupts financial markets. A China-based artificial intelligence startup is shaking up the industry. It's called DeepSeek and its biggest advantage, analysts say, is that it can operate at a lower cost than American AI models like ChatGPT. It's disrupting markets and raising national security questions about China's progress to develop advanced AI. Geoff Bennett discussed more with Gerrit De Vynck of The Washington Post." | #chineseai #china #ai #artificialintelligence #deepseek #financialmarkets #chatgpt #chinaai #pbsnews #newshour #pbsnewshour #aimodels | 12 个标签（远超推荐），新闻引用增强可信度，无 CTA |
| 5 | @abcnews | 1.7K | "DeepSeek, the explosive new artificial intelligence tool that took the world by storm, has code hidden in its programming which has the built-in capability to send user data directly to the Chinese government, experts told ABC News. DeepSeek caught Wall Street off guard last week when it announced it had developed its AI model for far less money than its American competitors, like OpenAI, which have invested billions. But the potential risk DeepSeek poses to national security may be more acute than previously feared because of a potential open door between DeepSeek and the Chinese government, according to cybersecurity experts." | #news #deepseek | 安全焦虑角度，仅 2 个标签，长描述纯叙事 |
| 6 | @wallstreetjournal | 488 | "Take a team of young Chinese engineers, hired by a boss with disdain for experience. Add some clever programming shortcuts, and a loophole in American rules that allowed them to get advanced chips. That is the formula China's DeepSeek used to shock the world with its artificial-intelligence programs." | #deepseek #ai #tech #wsj | 叙事式 hook（公式结构），4 个标签，无 CTA |
| 7 | @c4news | 3.1K | "A Chinese AI app called DeepSeek is number one on the App Store in the UK and US. The popularity of ChatGPT's rival app has sent shockwaves throughout Silicon Valley - here's why." | #DeepSeek #ChatGPT #China #AI #SiliconValley #USA #Tech #C4News #Channel4News | 9 个标签，新闻品牌标签 #C4News + #Channel4News |
| 8 | @the.australian | 137 | "DeepSeek, the groundbreaking Chinese AI company based in Hangzhou, has become a global powerhouse... Founded by Liang Wenfeng, the company has rapidly risen to prominence with its game-changing R1 model, which shook the global stock market and disrupted the AI landscape." | 无显式 hashtag（文字内提及） | 极长描述（200+ 词），无 hashtag，叙事型 |

### 1.2 个人创作者 / 科技 KOL

| # | 账号 | Likes | Description (完整) | Hashtags | 特征 |
|---|------|-------|-------------------|----------|------|
| 9 | @kanekallaway | 763 | "This Chinese startup (Deepseek) just shocked the AI world" | #ai #artificialintelligence #tech #techtok #deepseek #openai #chatgpt #openai #technology | 9 个标签（#openai 重复），#techtok 使用（我们排除的标签） |
| 10 | @iamkylebalmer | 1.8K | "China is taking AI very (very) seriously - not just the techies but the general public. I just came out of one of Beijing's bookshops and it's all DeepSeek, chatgpt and artificial intelligence related. Super exciting" | #ai #chatgpt #deepseek #china | 4 个标签（符合推荐范围），第一人称观察，无 CTA |
| 11 | @sharongai | 77 | (无文字描述) | #ai #china #deepseek #qwen #doubao #kimi #baidu #chatgpt | 8 个标签，纯标签无描述，列出所有中国 AI 公司 |

### 1.3 多语言创作者（西班牙语，高互动）

| # | 账号 | Likes | Description (摘要) | Hashtags | 特征 |
|---|------|-------|-------------------|----------|------|
| 12 | @jaspeante | 6.6K | "La buena noticia es que puedes usar las tres IAs chinas más potentes del momento de forma gratuita..." (解释 Kimi/DeepSeek/Qwen 免费使用) | #deepseek #qwen #kimi | 3 个标签（符合推荐），教育型内容，西语市场 |
| 13 | @mr.aifo | 6.1K | "3 IAs Chinas Que Debes Conocer 🚨🇨🇳 Qwen -> Chatgpt pero Gratis MiniMax -> Crear Audios y clonar tu voz Kimi -> Modelo para programar y crear reportes Todas las puedes probar gratis!! Sigueme y aprende a utilizar la IA 🧠🔝" | #inteligenciaartificial #ai #ia | 3 个标签，清单式 hook，强 CTA "Sigueme" |

### 1.4 Trending 发现页（非特定账号，高曝光）

| # | 来源 | Description / Caption | Hashtags | 特征 |
|---|------|----------------------|----------|------|
| 14 | TikTok Discover "Deep Seek Ai" | "DeepSeek Makes 75% Price Cut PERMANENT. 88 Cents Per Million Tokens" | #news #technology #china #ai #deepseek | 5 个标签，数据 hook，新闻型 |
| 15 | TikTok Discover "Chinese Ai Tool" | "China is calling this their 'second DeepSeek moment' 👀 📲 Watch the full breakdown above and follow for the latest AI news that's reshaping creative industries worldwide." | #AIVideo #ByteDance #Seedance #ArtificialIntelligence #DeepSeek | 5 个标签，CTA "follow for more"，emoji 使用 |
| 16 | TikTok Discover (Kimi K3) | "the '#Kimi moment.' #Moonshot AI has just released its #KimiK3 model. At a massive 2.8 trillion parameters, it's the world's largest open-weight AI model." | #AI #deepseek #kimik3 #claude #chatgpt | 5 个标签，对比标签（#claude #chatgpt），新闻型 |

---

## 2. 数据分析

### 2.1 Hashtag 频率统计

| Hashtag | 出现次数 | 来源类型 | 我们的标签池中有? |
|---------|---------|---------|-----------------|
| #ai | 9 | 媒体 + KOL | ❌ 在 AUXILIARY 中但未自动选 |
| #deepseek | 12 | 全部 | ✅ |
| #china | 7 | 媒体为主 | ❌ 我们用 #chinaai 替代 |
| #chatgpt | 6 | 媒体 + KOL | ✅ |
| #artificialintelligence | 4 | 媒体 | ❌ 未收录 |
| #tech | 3 | 媒体 | ❌ 未收录（区别于 #technews） |
| #technology | 3 | KOL | ❌ 我们排除了（太杂） |
| #techtok | 2 | KOL | ❌ 我们排除了（太杂） |
| #news | 3 | 媒体 | ❌ 未收录 |
| #openai | 2 | KOL | ✅ |
| #kimi | 3 | 多语言创作者 | ✅ |
| #qwen | 3 | 多语言创作者 | ❌ 未收录（应加入） |
| #cnbc / #pbsnews 等 | 各 1 | 媒体品牌标签 | N/A（我们的品牌标签是 #chinaai） |

### 2.2 Description 结构模式

| 模式 | 频次 | 典型 | 我们的 deriveDescription 对应? |
|------|------|------|------------------------------|
| **叙事长文（100+ 词）** | 5 | CNBC, PBS, ABC, WSJ, The Australian | ❌ 我们只拼 voiceover 第一句 |
| **一句话 hook + CTA** | 4 | Kallaway, Kyle Balmer, Discover 页 | ⚠️ 接近但缺 CTA 变化 |
| **纯 hashtag（无描述）** | 1 | Sharon Gai | ❌ |
| **清单式 + emoji + CTA** | 2 | Mr. AiFO, Discover | ❌ |
| **疑问式 hook** | 2 | RTÉ, C4 News | ❌ |
| **数据先行** | 2 | Discover 页 | ✅ 我们有 P1 模式但 description 未用 |

### 2.3 关键发现

1. **#ai 被广泛使用但我们没有自动收录**。竞品中 #ai 出现 9 次，是我们标签池中最缺失的高频标签。虽然我们把它放在 AUXILIARY_TRAFFIC_HASHTAGS 中，但 `deriveHashtags()` 从不选它。

2. **#artificialintelligence 和 #news 被多次使用**。这两个标签在我们的标签池中完全没有。

3. **#qwen 未收录但竞品在用**。阿里 Qwen 是高频被提及的中国 AI 模型，但我们的 ENTITY_HASHTAG_MAP 用的是 `#alibaba`（匹配关键词含 qwen），没有独立的 `#qwen` 标签。

4. **Description 以叙事长文为主**。竞品的主流 description 是 100-200 词的完整叙事，不是我们当前的"拼 voiceover 第一句"方式。

5. **CTA 模式多样化**。"Watch the full video at the #linkinbio"、"follow for more"、"Sigueme"、无 CTA——我们的固定 "Follow for more China AI news." 太单一。

6. **Hashtag 数量超出 3-5 推荐的占 50%**。媒体账号平均 7-12 个标签，个人创作者平均 3-5 个。我们当前策略（3-5）与个人创作者一致，但媒体账号成功不一定靠标签数量。

7. **品牌标签模式不同**。媒体账号用自己的品牌标签（#CNBC, #pbsnews），我们用 #chinaai 作为品牌标签。这需要继续——但可以考虑增加 #chinaainews 作为更具体的品牌标签。

8. **疑问式 hook 在高 likes 视频中有效**。RTÉ（10.7K likes）用 "Why is China's DeepSeek app causing such a stir?" 开头，C4 News（3.1K likes）用 "number one on the App Store" 数据 hook。

### 2.4 对 caption-utils.mjs 的改进建议

| 改进项 | 优先级 | 说明 |
|--------|--------|------|
| 将 #ai 从 AUXILIARY 提升为可选自动收录 | P0 | 竞品高频使用，应在 entity 标签不足时补位 |
| 新增 #qwen 到 ENTITY_HASHTAG_MAP | P0 | 高频被提及但未收录 |
| 新增 #artificialintelligence 到 AUXILIARY | P1 | 4 次出现，可替代 #ai |
| 新增 #news 到 CORE_TRAFFIC | P1 | 3 次出现，新闻通用标签 |
| description 模式多样化 | P2 | 目前只有拼句模式，可加叙事/清单/疑问模式 |
| CTA 模板池化 | P2 | 目前固定一句，可从竞品学习多种 CTA |

---

## 3. 我们自己的已发布视频

> 数据来源：CDP 抓取 TikTok Studio（2026-08-25），通过 web-access skill 直连浏览器获取。
> 账号概况（2026-08-25）：粉丝 1，总获赞 12，已关注 47，已发布视频 4 条。

### 3.1 已发布视频完整列表

| # | 发布时间 | 时长 | 标题 / Description | Hashtags | 播放 | 赞 | 评论 | 流量来源 |
|---|---------|---------|-------------------|----------|------|-----|------|---------|
| 4 | 8月20日 | 01:07 | BREAKING: A robot stock opened up 629 percent \| China AI. A robot stock opened up 629 percent today. Caixin reported Unitree listed on Shanghai's STAR Market. Securities Times said 978 million investors tried to buy. Founder Wang Xingxing started Unitree in 2016. Two days before listing, Unitree unveiled Superman. DeepSeek backed the IPO. Investing But AgiBot shipped more humanoids in H1. China holds 97 percent of global humanoid shipments. First robot stock popped 629 percent. | #ainews #chinaai #deepseek #tencent #unitree | 98 | 0 | 0 | FYP 86%, 搜索 12.1% |
| 3 | 8月8日 | 01:10 | #creatorsearchinsights #seedance25 #chinaai | #creatorsearchinsights #seedance25 #chinaai | 104 | 5 | 0 | — |
| 2 | 7月31日 | 02:37 | #creatorsearchinsights #deepseek #chinaai #ai deepseek leaked transcript of investor meeting halted 1.4B funding | #creatorsearchinsights #deepseek #chinaai #ai | 119 | 3 | 0 | FYP 77.2%, 搜索 20.3% |
| 1 | 7月31日 | 02:27 | A secret DeepSeek investor meeting leaked… then disappeared. 3 days later, a $1.4B funding round was reportedly paused. What happened inside that meeting? 👀 | #deepseek #ai #chinaai #technews #artificialintelligence | 247 | 4 | 0 | FYP 72.4%, 搜索 21.4% |

**总播放量（过去 7 天）**：109（+95, 678.6%）
**搜索词 Top（过去 7 天）**：robot seeks china (46.2%), tencent salary increase impact (7.7%), china stock market (7.7%), wang xing xing (7.7%), unitree aktie (7.7%)

### 3.2 Tag → 效果关联分析

**数据现状**：4 条视频，数据粒度有限但已可做初步推断。

| Hashtag | 使用次数 | 关联视频平均播放 | 关联搜索词 | 初步结论 |
|---------|---------|----------------|-----------|---------|
| #chinaai | 4/4 | 142 | — | 品牌标签，每条必带，无法单独归因 |
| #deepseek | 3/4 | 155 | "deepseek" 搜索词占 22% | 有效——搜索流量驱动 |
| #ainews | 1/4 | 98 | — | 仅 Unitree 视频使用，搜索词变为 "robot seeks china"（非 #ainews 相关） |
| #technews | 1/4 | 247 | — | 仅 DeepSeek v1 使用，该视频播放最高但无法单独归因 tag |
| #artificialintelligence | 1/4 | 247 | — | 同上 |
| #creatorsearchinsights | 2/4 | 112 | "creator insights part 3 4 5" | **待重新验证的历史信号**——2 条视频样本不足以单标签归因。搜索词表明该标签可能误导受众，但 Buffer 和 TikTok 官方均推荐使用。2026-08-26 从 `BLACKLISTED_HASHTAGS` 移除 |
| #tencent | 1/4 | 98 | "tencent salary increase impact" 7.7% | 可能有效——搜索词匹配 |
| #unitree | 1/4 | 98 | "unitree aktie" 7.7% | 可能有效——德语搜索词表明触达了非英语受众 |

**关键发现**：
1. **#creatorsearchinsights 待重新验证**：使用它的两条视频（#2 和 #3）平均播放 112，搜索词 "creator insights part 3 4 5" 表明标签可能误导受众。但仅 2 条样本不足以单独归因 hashtag 效果。2026-08-26 决策：从 `BLACKLISTED_HASHTAGS` 移除，不再自动禁用。Agent 在使用 Creator Search Insights 发现内容 gap 时可手动通过 `metadata.hashtags` 加入。详见 `docs/tiktok/tiktok-best-practices.md` → Hashtag 策略。
2. **#deepseek + #technews + #artificialintelligence 组合效果最好**：视频 #1 播放 247（最高），但无法确定是 tag 还是标题/描述内容驱动的。
3. **搜索词已变化**：7 天快照中搜索词从 "deepseek" 相关变为 "unitree/robot/china stock" 相关——说明搜索流量跟着最新视频走，而不是累积。
4. **FYP 流量从 5.7%（8月8日）升到 86%（8月25日）**——但总播放量仍很低（98），说明 FYP 推荐了但完播率低导致没继续放大。

### 3.3 Analytics 粒度限制

**TikTok Analytics 不提供**：
- 按单个 hashtag 分拆的流量来源
- 按 hashtag 分拆的搜索词
- 单条视频的 hashtag → 完播率关联

**TikTok Analytics 提供**：
- 总搜索词列表（不区分来自哪个视频）
- 总流量来源分布（FYP/搜索/个人资料）
- 单条视频播放/赞/评论

**结论**：只能通过 **A/B 测试** 来精确归因 tag 效果。方法：在两条内容相似的视频中只用一个不同的 tag，对比搜索流量差异。但需要更多样本（>10 条）。

### 3.4 Hashtag 效果追踪落实方案

**落实到 `docs/analytics-workflow.md`**，作为 Analytics 定期复盘的标准步骤：

1. 每次 CDP 抓取 Analytics 数据后，将 hashtag → 播放量/搜索词记录追加到 `output/hashtag-effect-tracker.jsonl`
2. 积累 >10 条视频后，Agent 做 hashtag 效果统计报告
3. 低效 tag（关联视频平均播放低于全局均值）建议替换

`hashtag-effect-tracker.jsonl` 格式：
```json
{"videoId":"","publishedAt":"","hashtags":[],"views":0,"likes":0,"comments":0,"searchQueries":[],"fypPercent":0,"recordedAt":""}
```

---

## 4. 待补充数据

- [x] 抓取 @chinaainews 自己的 TikTok Studio，获取所有已发布视频的完整列表（2026-08-25 CDP 抓取，4 条视频）
- [ ] 补充 10 条以上 China AI niche 的中等粉丝量创作者（非大媒体）的爆款视频
- [ ] 每月更新 TikTok Creative Center trending 标签快照
- [ ] 持续记录每条发布视频的 hashtag → 48h 后 analytics 数据到 `hashtag-effect-tracker.jsonl`

---

## Design Decisions & References

- 调研方法: Brave Search（TikTok 页面搜索）+ Jina Reader（TikTok 页面 JS 渲染限制，部分数据来自搜索摘要而非完整页面抓取）
- 竞品选择标准: China AI 话题 + DeepSeek/中国 AI 模型相关 + 有明确 likes 数据 + description 可获取
- 数据局限: TikTok 页面需要 JS 渲染，web_fetch 无法抓取。Brave Search 的 extra_snippets 提供了足够的 description + hashtag 数据
- 相关文档: `docs/tiktok/tiktok-best-practices.md` → Hashtag 策略章节（2026-08-08 调研）
- 相关代码: `scripts/short-video/lib/caption-utils.mjs` → ENTITY_HASHTAG_MAP + deriveHashtags()
