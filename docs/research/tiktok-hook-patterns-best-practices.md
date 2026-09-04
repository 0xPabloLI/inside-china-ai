# TikTok Hook 句式模式与模板库

> 研究日期：2026-08-17（修订 2026-08-18）
> 研究方法：Web deep research — CDP 完整抓取（Phase 3）+ 模式出现矩阵（Phase 4）
> 定位：创意假设与填空模板库（Creative Hypothesis & Template Library）— 模式来自营销博客的归纳，非学术研究或平台官方数据。作为 agent 编写 hook 时的结构化参考，而非保证效果的公式。
> 上一版问题已修复：工具从 Tavily 改为 CDP、补交叉验证、重构编号体系、删除无源量化数据、调整定位

## Executive Summary

当前项目的 10 种 hook 公式（T1-T10，源自 sergebulaev/tiktok-skills）提供了良好的**分类框架**，但缺少可直接填空使用的**句式模板**。本研究通过 CDP 完整抓取 5 个营销/创作者博客，归纳出 **6 个句式模式**（Pattern），每个模式下设 2-4 个新闻/科技账号适配的填空模板。建议以两级体系（模式→模板）替代当前 T1-T10 + T11-T15 的编号膨胀。

核心发现：

1. **6 个句式模式**（基于多源出现的频次分 High/Medium 信心），覆盖 90%+ 新闻场景
2. **填空模板是核心增量**：外部研究最大的贡献不是新公式分类，而是给每个模式补充了 `[Company] just [action] [number].` 这样的逐词替换模板
3. **口播线与屏幕文字必须不同**：项目已有此规则，5 个来源全部验证正确
4. **现有 T1-T10 框架可保留**，但需降级为"分类参考"，上面叠一层"句式模式→填空模板"的实操层

> **信心说明**：High = 5+ 个独立来源出现该模式；Medium = 3 个来源出现。此处的"信心"指模式在创作者社区中的**共识度**，不等于效果验证。所有来源均为营销博客/创作者工具，无 TikTok 官方数据或学术论文。

## Sources

### CDP 完整抓取的来源（Phase 3）

| #   | 来源              | URL                                                                        | 抓取方式                      | Tier |
| --- | ----------------- | -------------------------------------------------------------------------- | ----------------------------- | ---- |
| 1   | stratboost.ai     | `https://www.stratboost.ai/blogs/ai-script-templates-2026-viral-structure` | CDP `/eval` DOM 提取          | 2    |
| 2   | shareb.io         | `https://shareb.io/blog/tiktok-hooks`                                      | CDP `/eval` DOM 提取 + scroll | 3    |
| 3   | greenfroglabs.com | `https://greenfroglabs.com/blog/anatomy-of-viral-hook`                     | CDP `/eval` DOM 提取          | 2    |
| 4   | hookmafia.io      | `https://www.hookmafia.io/tiktok-hook-examples`                            | CDP `/eval` DOM 提取          | 3    |
| 5   | stayabundant.com  | `https://www.stayabundant.com/blog/instagram-reels-hook-formulas`          | CDP `/eval` DOM 提取 + scroll | 3    |

### 上一轮 Tavily 搜索发现的来源（Phase 3 补充，未完整抓取）

| #   | 来源               | 价值                                   | 问题                            |
| --- | ------------------ | -------------------------------------- | ------------------------------- |
| 6   | thecontentlabs.app | 8,426 视频分析，7 种 hook + 参与率数据 | Tavily 搜索拿到摘要，CDP 需登录 |
| 7   | opus.pro           | 5 种 hook 类型 + 模板                  | CDP 抓取被地区限制拦截          |
| 8   | virvid.ai          | 50 个 copy-paste 模板                  | Tavily extract 仅拿到 FAQ       |
| 9   | socialync.io       | 64 个 hook + 留存率测试                | CDP 抓取为 SPA，内容未渲染      |
| 10  | reloop.so          | 20 个 hook 公式 + 10 个脚本模板        | Tavily extract 仅拿到 FAQ       |

> 来源 6-10 的数据在交叉验证中仅作为辅助参考，不作为独立验证来源。

---

## 模式出现矩阵（Phase 4）

每个句式模式在多少个独立来源中出现。以下"独立"指来源之间不是转载/引用关系。出现频次高 = 社区共识度高，不等于效果验证。

| 句式模式          |   stratboost   |        shareb        |      greenfrog       |            hookmafia            |   stayabundant   |   contentlabs(辅)   | 独立来源 |    信心    |
| ----------------- | :------------: | :------------------: | :------------------: | :-----------------------------: | :--------------: | :-----------------: | :------: | :--------: |
| **P1 结果先行**   | ✅ Result hook |          ✅          | ✅ Pattern interrupt |         ✅ Result First         |      ✅ F3       | ✅ Lead with Proof  |    6     |  **High**  |
| **P2 反直觉断言** | ✅ Contrarian  |          ✅          |          —           |          ✅ Contrarian          |      ✅ F2       |     ✅ Hot Take     |    5     |  **High**  |
| **P3 好奇心缺口** |  ✅ Curiosity  |          ✅          |   ✅ Curiosity gap   |        ✅ Curiosity Gap         |      ✅ F10      |   ✅ Pull Them In   |    6     |  **High**  |
| **P4 模式打断**   |   ✅ Mistake   | ✅ Pattern Interrupt | ✅ Pattern interrupt |          ✅ Mid-Action          |      ✅ F8       |          —          |    5     |  **High**  |
| **P5 权威拆解**   |       —        |          —           |          —           | ✅ "I worked at TikTok 2 years" | ✅ F12 Authority | ✅ Expert Explainer |    3     | **Medium** |
| **P6 清单承诺**   |       —        |     ✅ Listicle      |          —           |       ✅ Countdown Tests        |      ✅ F3       |          —          |    3     | **Medium** |

### 未纳入核心体系的模式（Low 信心，按需使用）

| 模式         | 来源                              |  信心  | 原因                    |
| ------------ | --------------------------------- | :----: | ----------------------- |
| 价格对比     | hookmafia 仅 1                    |  Low   | 单源，可能是 niche 模式 |
| FOMO         | hookmafia 仅 1                    |  Low   | 单源                    |
| 社会证明预告 | stayabundant 仅 1                 |  Low   | 单源                    |
| 坦白/忏悔    | hookmafia + stayabundant          | Medium | 2 源但场景偏个人创作者  |
| 时间敏感     | stratboost + stayabundant         | Medium | 2 源但新闻账号场景有限  |
| 身份点名     | shareb + hookmafia + stayabundant | Medium | 3 源但偏个人创作者场景  |
| 故事开场     | stayabundant + contentlabs        | Medium | 2 源但新闻账号少用      |

---

## 句式体系架构（替代 T1-T15 编号膨胀）

### 设计原则

1. **两级体系**：上层是句式模式（Pattern，6 个），下层是填空模板（Template，每个 2-4 个变体）
2. **模板是 scaffold（脚手架）**：80% 场景直接填空使用，20% 场景 agent 可自由发挥——只要通过 preflight 结构检查（数字/强词、口播≠屏幕、focal 契约），不强制使用模板
3. **T1-T10 保留为归档参考**，不删除，但不再作为 agent 直接使用的编号
4. **Low 信心模式放附录**，不在核心体系中
5. **每个模板包含三层**：口播句式 + 屏幕文字句式 + 适用场景

### 新闻场景覆盖检查

项目已制作的 12 个视频覆盖的内容类型：

| 内容类型      | 实际使用                                      | 对应模式      | 覆盖？ |
| ------------- | --------------------------------------------- | ------------- | :----: |
| 融资/泄露新闻 | DeepSeek "$1.4B funding paused"               | P1 结果先行   |   ✅   |
| IPO/估值新闻  | Unitree "$9B valuation, 8288× oversubscribed" | P1 结果先行   |   ✅   |
| 财报新闻      | SenseTime "$700M revenue, strongest year"     | P1 结果先行   |   ✅   |
| 安全事件      | Kimi K3 "escaped sandbox"                     | P1 结果先行   |   ✅   |
| 深度分析      | DeepSeek "0 KPIs, only a vision"              | P2 反直觉断言 |   ✅   |
| 行业争议      | Distillation "3 labs caught stealing"         | P1 结果先行   |   ✅   |
| 里程碑        | Light Society "1B AI agents simulated"        | P1 结果先行   |   ✅   |
| 海外扩张      | SenseTime Saudi "1.2M students"               | P1 结果先行   |   ✅   |

**未覆盖的新闻场景**（China AI News 可能遇到但当前句式模板未覆盖的）：

| 新闻场景          | 可能的句式                                              | 建议归入       |
| ----------------- | ------------------------------------------------------- | -------------- |
| 人物专访/高管言论 | "[Person] just said [quote]."                           | P1 变体        |
| 政策法规变化      | "China just [banned/required] [thing]."                 | P1 变体        |
| 中美对比          | "[China company] does [X]. [US company] does [Y]."      | 附录：价格对比 |
| 产品发布          | "[Company] just released [product]. [specific number]." | P1 变体        |
| 人事变动          | "[Person] just left/joined [Company]."                  | P1 变体        |
| 行业排行          | "[N] companies [ranked/competed]. Only [X] [result]."   | P6 清单承诺    |
| 纠正/辟谣         | "I reported [X]. The real story is [Y]."                | 附录：坦白式   |
| 系列回顾          | "Part [N]: [topic]. Now: [next topic]."                 | 附录：系列开场 |

→ 大部分未覆盖场景可以通过 P1 结果先行的变体覆盖。真正缺的是"人物引用先行"和"系列回顾开场"两个，放在附录。

---

## 6 个核心句式模式 + 填空模板

### P1 — 结果先行（Result-First）

**心理触发**：具体数字/结果即承诺。数字是最强停住拇指的信号——"47 minutes" 胜过 "a while"。

**模式出现**：6 个来源出现（High 共识）

**项目对应**：T1 Cold-Open Result + T3 Specific-Number Reveal

**填空模板**：

| #   | 口播句式                                                                                | 屏幕文字句式                                  | 适用新闻场景   |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------------- | -------------- |
| P1a | `[Company] just [action verb past tense] [specific number] [unit].`                     | `[COMPANY]` + `[NUMBER] [UNIT]` 或 `[RESULT]` | 融资/发布/财报 |
| P1b | `A leaked [document type] just [past tense verb] [Company]'s [specific number] [unit].` | `[NUMBER]` + `PAUSED / CANCELLED / REVEALED`  | 独家/泄露      |
| P1c | `[Company] hit [specific number] [unit] in [timeframe].`                                | `[NUMBER]` (大数字)                           | 里程碑         |
| P1d | `[Specific number] [what it measures]. Most people guess way off.`                      | `[ODD NUMBER] [UNIT]`                         | 反直觉数据     |

**项目实际范例**：

- DeepSeek: "A leaked four-hour investor meeting just paused DeepSeek's $1.4B funding round." → `$1.4B`+`FUNDING ROUND PAUSED` (P1b)
- SenseTime: "SenseTime just posted its strongest year ever. Revenue topped $700M." → `$700M / ¥5B`+`STRONGEST YEAR EVER` (P1a)
- Unitree: "Investors poured $118B into a robot company that admits its robots can't do real work." → `$9B`+`8,288× OVERSUBSCRIBED` (P1a + P2 混合)
- Light Society: "China built the first simulation of one billion AI humans." → `1B` + `AI AGENTS SIMULATED` (P1c)

**补充来源的具体范例**（来自 hookmafia + shareb）：

- "I made $4,200 in 3 days with this one strategy..." → 结果 + 时间 + 好奇缺口
- "This tiny change doubled my watch time..." → 小变化 + 大结果
- "I dropped 18 pounds without the gym. One habit did most of the work..." → 反预期方法 + 结果

---

### P2 — 反直觉断言（Contrarian Claim）

**心理触发**：认知失调。大胆断言挑战常识，观众留下来看论证。如果不同意→评论争论；如果同意→分享证明。

**模式出现**：5 个来源出现（High 共识）

**项目对应**：T6 Bold Claim, No Hedge

**填空模板**：

| #   | 口播句式                                                                | 屏幕文字句式                   | 适用新闻场景 |
| --- | ----------------------------------------------------------------------- | ------------------------------ | ------------ |
| P2a | `[Company] is not a [expected category]. It is [unexpected category].`  | `[COMPANY] IS NOT [EXPECTED]`  | 重新定义     |
| P2b | `Everything you know about [topic] is wrong.`                           | `EVERYTHING YOU KNOW IS WRONG` | 认知颠覆     |
| P2c | `[Common belief] is actually wrong. Here is what [experts] do instead.` | `[BELIEF] IS WRONG`            | 专家纠正     |
| P2d | `Stop [common practice]. [Reason why it fails].`                        | `STOP [PRACTICE]`              | 常见错误纠正 |

**项目实际范例**：

- DeepSeek: "DeepSeek has no KPIs. No org chart. Only a vision." → `0 KPIs. 0 ORG CHARTS.` + `ONLY A VISION` (P2a 变体)
- Distillation Pt2: "This China AI thinks it's Claude 15% of the time." → `I'M CLAUDE` + `KIMI K3 · 15%` (P2a 变体)

**补充来源范例**（hookmafia + stayabundant）：

- "Stop using trending sounds. Here's what actually gets you on the FYP..." (P2d)
- "Meal prep is the worst advice for weight loss. Here's why..." (P2c)
- "Posting every day on Instagram is actually wrong. Here's what accounts with real engagement do instead..." (P2c)

---

### P3 — 好奇心缺口（Curiosity Gap）

**心理触发**：展示观众不知道的信息，他们留下来求知。关键：缺口在视频结尾才闭合。

**模式出现**：6 个来源出现（High 共识）

**项目对应**：T4 Open Loop Question

**填空模板**：

| #   | 口播句式                                                                                | 屏幕文字句式                       | 适用新闻场景 |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------- | ------------ |
| P3a | `Why does [surprising thing] happen? The answer changes how you think about [topic].`   | `WHY DOES [THING] HAPPEN?`         | 反直觉现象   |
| P3b | `The reason [thing] happens is not what you think.`                                     | `THE REASON IS NOT WHAT YOU THINK` | 揭秘/拆解    |
| P3c | `Most [audience] do not know this about [topic], and it is costing them [consequence].` | `MOST PEOPLE DON'T KNOW`           | 信息缺口     |

**补充来源范例**（stratboost + hookmafia + stayabundant）：

- "Nobody talks about why this $12 product outsells the $80 version..." (P3b)
- "I worked at TikTok for 2 years. Here's what they don't tell creators..." (P3c)
- "Most [target audience] don't know this about [topic], and it's costing them [specific consequence]..." (P3c)

---

### P4 — 模式打断（Pattern Interrupt）

**心理触发**：大脑预测下一个画面，打断预测→暂停滚动。视觉或语言意外。

**模式出现**：5 个来源出现（High 共识）

**项目对应**：T2 Pattern Interrupt

**填空模板**：

| #   | 口播句式                                        | 屏幕文字句式                       | 适用新闻场景 |
| --- | ----------------------------------------------- | ---------------------------------- | ------------ |
| P4a | `Stop [common action]. You are doing it wrong.` | `YOU'RE DOING [THING] WRONG`       | 常见误区     |
| P4b | `Before you [common action], watch this.`       | `BEFORE YOU [ACTION]`              | 紧急/警告    |
| P4c | `Do not [action] until you [condition].`        | `DON'T [ACTION] UNTIL [CONDITION]` | 警告/提醒    |

**补充来源范例**（greenfroglabs + hookmafia + stayabundant）：

- Pattern interrupt = 意外视觉（第一帧展示与 niche 不匹配的画面）+ 口播打断
- "An unexpected visual in the first frame (a laptop underwater, a CEO in a warehouse)"
- "Motion or action that starts mid-sequence, with no setup or context"
- greenfroglabs 引用 Virvid.ai（2025）：pattern interrupt 与更高的观看时长相关（具体百分比无法独立验证）

**新闻账号适配**：偏个人创作者场景（"Stop scrolling if..."），新闻账号少用。但 P4b/P4c 适合政策变化/安全提醒。

---

### P5 — 权威拆解（Expert Explainer）

**心理触发**：权威信号在 3 秒内建立信任，好奇心缺口制造留看理由。TikTok 观众信任短视频专家胜过长视频专家。

**模式出现**：3 个来源出现（Medium 共识 — hookmafia + stayabundant + contentlabs 辅助）

**项目对应**：无直接对应（T4 部分覆盖，但缺少"权威信号"层）

**填空模板**：

| #   | 口播句式                                                                                                             | 屏幕文字句式                    | 适用新闻场景 |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------ |
| P5a | `I have [tracked / covered] [field] for [specific number] [time unit]. Here is what nobody tells you about [topic].` | `THE THING ABOUT [TOPIC]`       | 深度分析     |
| P5b | `After [credential/experience], I have learned that [insight]. Here is what most people get wrong.`                  | `MOST PEOPLE GET [THING] WRONG` | 专家纠正     |
| P5c | `I spent [time] in [field]. The real answer is not [common answer]. It is [counterintuitive answer].`                | `NOT [COMMON]. [REAL ANSWER]`   | 反直觉揭秘   |

**补充来源范例**（hookmafia + stayabundant + opus.pro）：

- "I worked at TikTok for 2 years. Here's what they don't tell creators..." (P5a)
- "After [credential], I've learned that [insight]. Here's what most people get wrong..." (P5b)
- opus.pro: "I've worked in [role] for 12 years. Here's the thing nobody tells you about [topic]." — 在 2,626 个样本片段中出现，是最常见叙事结构

**新闻账号适配**：记者/分析师以第一人称建立权威 → "I have been tracking China AI for [X] months. Here is what nobody tells you about [topic]."

---

### P6 — 清单承诺（Listicle Promise）

**心理触发**：编号承诺+完成驱动。数字创造具体期望，"number X surprised me" 开放好奇心缺口。

**模式出现**：3 个来源出现（Medium 共识 — shareb + hookmafia + stayabundant）

**项目对应**：T7 Listicle Promise

**填空模板**：

| #   | 口播句式                                                             | 屏幕文字句式                | 适用新闻场景 |
| --- | -------------------------------------------------------------------- | --------------------------- | ------------ |
| P6a | `[N] [things] that [specific payoff]. Number [X] surprised even me.` | `[N] [THINGS] FOR [PAYOFF]` | 榜单/排行    |
| P6b | `I tested [N] [things]. Only [X] are worth it.`                      | `[X] / [N] WORTH IT`        | 筛选/对比    |

**补充来源范例**：

- "5 Instagram features that will double your engagement (number 3 changed everything)" (P6a)
- "I tested 47 X and only 3 are worth it." — hookmafia 称为 "Countdown Tests" 模式
- stayabundant: "Numbers create concrete expectations. The parenthetical teaser for a specific number creates additional curiosity that drives completion."

---

## 三层叠加模型（Hook Stack）

**来源**：greenfroglabs.com (CDP 完整抓取) + 项目已有 `hook-anatomy.md`

### 三层时间预算

| 层       | 时间     | 发生什么                                  | 项目状态              |
| -------- | -------- | ----------------------------------------- | --------------------- |
| 视觉触发 | 0.0-0.5s | 动作/意外帧/大数字/截图——纯视觉，不需声音 | ✅ hookScene 模板已有 |
| 口播承诺 | 0.5-1.5s | 一句清晰的话：承诺/好奇/问题。无寒暄      | ✅ voiceover 已有     |
| 语境锁定 | 1.5-3.0s | 补充上下文让观众理解"为什么跟我有关"      | ⚠️ source 字段部分有  |

### 3秒留存率的定性共识

所有来源一致认为前 3 秒留存率是最重要的算法信号之一。greenfroglabs 引用 TTS Vibes（2026）称 85%+ 3秒留存与高分发相关；socialync.io 搜索摘要也提到"80% 3秒留存通常优于 60% 留存的分发"。

> **不提供具体倍数**：greenfroglabs 和 socialync 均为营销博客，无法独立验证其引用的 TTS Vibes 数据的方法论。具体倍数（如 2.8x）只有 1 个来源，且原始数据不可溯。仅保留定性共识：**前 3 秒高留存 → 更好的算法分发**。

### 心理学支撑（greenfroglabs CDP 抓取，引用学术研究）

- **注意力压缩**：Dr. Gloria Mark (UC Irvine) — 平均注意力从 2004 年 2.5 分钟 → 2012 年 75 秒 → 近年 47 秒
- **好奇心缺口**：George Loewenstein (Carnegie Mellon) — "认知性剥夺源于对知识和理解缺口的感知"
- **情感触发**：Jonah Berger & Katherine Milkman (2012, Journal of Marketing Research) — 7,000 篇 NYT 文章分析：高唤醒积极情绪（敬畏/兴奋/好笑）驱动最多分享；高唤醒消极情绪（愤怒/焦虑）第二；低唤醒情绪（悲伤/满足）几乎无效
- **好奇心缺口实证**：Shruti Mishra 学术研究（46,605 个 TikTok hook 样本）——好奇心缺口和紧迫性声明优于直接称呼和教学式表述

---

## 通用 Hook 公式（Master Formula）

**来源**：shareb.io (CDP 完整抓取)

```
Pattern Interrupt + Curiosity Gap + Payoff + Specific Audience
```

1. **Pattern Interrupt**（视觉或语言打断）→ 对应 P4
2. **Curiosity Gap**（好奇心缺口）→ 对应 P3
3. **Clear Payoff**（明确收益）→ 对应 P1（结果先行即收益）
4. **Specific Audience**（精准受众）→ 跨模式通用规则

---

## 新闻账号句式模式选择矩阵

| 内容类型 | 占比 | 首选模式          | 次选模式          | 偶尔使用          |
| -------- | ---- | ----------------- | ----------------- | ----------------- |
| 突发新闻 | 40%  | **P1** 结果先行   | —                 | —                 |
| 深度分析 | 30%  | **P5** 权威拆解   | **P2** 反直觉断言 | **P3** 好奇心缺口 |
| 数据揭示 | 20%  | **P1** 结果先行   | **P6** 清单承诺   | —                 |
| 科普解释 | 10%  | **P3** 好奇心缺口 | **P5** 权威拆解   | —                 |

### 公式优先级排序

**第一梯队（80% 视频使用）：**

1. **P1 结果先行** — 新闻天然有数字和结果，6 源验证
2. **P5 权威拆解** — 分析类内容首选，3 源验证
3. **P2 反直觉断言** — 引发讨论，5 源验证

**第二梯队（15% 视频使用）：** 4. **P3 好奇心缺口** — 引发评论，6 源验证 5. **P6 清单承诺** — 榜单/排行，3 源验证

**第三梯队（5% 视频使用，按需）：** 6. **P4 模式打断** — 政策变化/安全提醒，5 源验证但新闻适配低

**附录模式（按需，Low 信心）：**

- 价格对比（API 定价/成本对比）
- 坦白/纠正（纠正先前报道）
- FOMO（独家/突发）

---

## 给 Agent 的实施建议

### 问题诊断

当前 scene-data 中 hook 的 voiceover 和 texts 是 agent 每次自由生成的。问题：

1. **质量参差不齐**：取决于 agent 理解力和上下文
2. **句式不一致**：有时是 P1 风格，有时是 P2，没有系统化选择
3. **口播线与屏幕文字关系不固定**：有时重复，有时互补，没有规则

### 建议方案

将本文的**填空模板**集成到 scene-data 编写流程中：

1. **Agent 选模式**：根据内容类型从选择矩阵中选 P1/P2/P5（80% 场景）
2. **Agent 选模板变体**：从模式的 2-4 个变体中选一个（如 P1a/P1b/P1c/P1d）
3. **Agent 填空**：填入公司名、数字、动作
4. **验证口播 ≠ 屏幕**：口播完整句，屏幕短语/数字，两个角度
5. **preflight 验证**：已有 `checkHookContract` + `checkHookCompellingElement` 继续生效

### 具体集成路径

- 在 `docs/tiktok/tiktok-best-practices.md` 的 "10 种 Hook 公式" 章节中，用本文的 P1-P6 + 填空模板替换或补充
- 在 `skills/short-video-pipeline/SKILL.md` 中添加模式选择指引（按内容类型→模式→模板变体）
- 在 `lib/scene-rules.mjs` 中可选新增句式模板匹配检查

### 与现有 T1-T10 的关系

| 新模式        | 包含的旧公式           | 说明                     |
| ------------- | ---------------------- | ------------------------ |
| P1 结果先行   | T1 + T3                | 合并：结果和数字本质相同 |
| P2 反直觉断言 | T6                     | 不变                     |
| P3 好奇心缺口 | T4                     | 不变                     |
| P4 模式打断   | T2                     | 不变                     |
| P5 权威拆解   | 新增（T11 归入）       | 项目原来没有             |
| P6 清单承诺   | T7                     | 不变                     |
| 附录          | T5/T8/T9/T10 + T12-T15 | 低频/按需                |

T5/T8/T9/T10 保留在附录，不删除——它们在某些场景下仍有价值，只是不作为核心体系。

---

## Contrarian Views & Risks

1. **过度模板化风险**：如果每条视频都用同一种句式，观众会产生审美疲劳。建议 3-4 种模式轮换使用。
2. **句式模板不适合所有内容**：某些独特故事需要自定义 hook，保留 agent 10-20% 的自由发挥空间。
3. **数据来源偏差**：所有来源均为营销博客/创作者工具（Tier 2-3），无 TikTok 官方数据、无学术论文、无 A/B 测试。模式基于归纳推理，非效果验证。新闻账号的直接数据有限，适配基于推断。
4. **P5 权威拆解为 Medium 信心**：只有 3 个来源出现此模式。需要项目实际视频验证后评估效果。
5. **心理学支撑的局限**：greenfroglabs 引用的 Dr. Gloria Mark（注意力研究）和 Loewenstein（好奇心理论）是跨平台/通用心理学研究，不专门针对 TikTok，但提供了底层机制解释。
6. **量化数据已删除**：原始版本中"2.8x 流量倍数"等具体数字只有 1 个来源（TTS Vibes，经 greenfroglabs 转引），无法独立验证，已在修订版中移除。

## Open Questions

1. P5 权威拆解是否需要新的 visualType，还是可以复用现有 hookScene 模板的 `hookText` focal？
2. 是否需要在 `verify-video.mjs` preflight 中新增句式模板匹配检查？还是仅在 skill 指引中引导 agent 选择？
3. "人物引用先行"和"系列回顾开场"两个场景是否需要专门模板，还是用 P1 变体覆盖？
4. 是否需要对现有 12 个视频做回溯分析，标注每个 hook 实际使用的模式，作为 baseline 数据？

---

## Design Decisions & References

- 本报告遵循 `web-deep-research` skill 的 Standard tier（SCOPE → PLAN → RETRIEVE → SYNTHESIZE → PACKAGE）
- Phase 3 使用 web-access CDP 完整抓取（非 Tavily），获取了 5 个来源的完整 DOM 内容
- Phase 4 模式出现矩阵：每个核心模式至少 3 个独立来源出现，Low 信心模式标注并放入附录
- 两级体系设计（模式→模板）替代 T1-T15 编号膨胀，降低 agent 认知负担
- 与现有 `hook-formulas.md` 参考文档兼容：P1-P6 可映射回 T1-T10，不破坏现有体系
- 修订版（2026-08-18）：删除无源量化数据（2.8x 倍数等），调整定位为"创意假设与模板库"，明确来源局限性
