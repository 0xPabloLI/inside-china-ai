# Brand Voice Profile — China AI News

> **用途**：写 TikTok 脚本 voiceover 或英文文章时，按本档案约束**措辞层**（结构层仍以 [video-script-writing-guide.md](video-script-writing-guide.md) 为准）。产文/产脚本 agent 应在动笔前读一遍，写完对照「自检」一节。
> **来源**：nuwa 四步管线改编（裁心智模型，留四件），语料 = 19 份已发布脚本 scene-data.mjs（≈150 条 voiceover）+ `articles/` 全部 10 篇（14.3k 词）。提炼与验证记录见 Issue #205 关票评论。
> **更新**：新语料发布后可增量重跑提炼；Analytics CSV（#29）到位后补「播放数据验证」章节。

---

## 1. 表达 DNA

语料中反复出现、构成账号可识别声音的句式与节奏：

- **数字锚点开句**：hook 或首段直接用最大数字/最反直觉数字开句，数字独立成句承载冲击。
  - `50 billion dollars. Kimi's parent company is pushing for IPO at that valuation.`（kimi-ipo）
  - `A robot stock opened up 629 percent today. Market cap: 445 billion yuan.`（unitree）
  - `10 billion dollars. Alibaba just raised that for one thing: AI.`（alibaba-ai-megabet）
- **句号节奏（short-punch）**：用句号切分列举代替逗号长句，制造打击感。
  - `Not for shopping. Not for shipping. Just AI.`（alibaba-ai-megabet）
  - `No IPO plan, no exit strategy, no KPIs.`（deepseek）
  - `Same parameters. Only post-training scaled.`（zhipu-glm6-self-training）
- **排比否定 + 一击**：三连否定后给正解。
  - `No money, no chips, no fame. Just one thing: build AGI for humanity.`（restraint pt1）
- **冒号一句话定义**：术语首次出现立刻定义，一句话讲完，不绕。
  - `Distillation: a powerful teacher model generates outputs, and a smaller student learns from them.`（bytedance-distillation）
- **对偶对比**：`on one side / on the other`、`X does A. The other does B.` 收束矛盾局面。
  - `So China's AI unicorn faces US sanctions on one side, and negotiates with US tech giants on the other.`（kimi-ipo）
  - `One company raises prices on strength. The other chooses the harder path.`（bytedance-distillation）
- **回环（callback）**：结尾回收开头的数字或问题，形成闭环。
  - `Remember that 10 billion? It is a bet that owning chips, cloud, models, and apps wins the China AI race.`（alibaba-ai-megabet）
  - `Remember the question? Why merge Feishu into Doubao? Now clear.`（doubao-work）
- **揭示转折固定短语**：`But here's what nobody noticed.` / `Here's the number that stings.` / `The real story is bigger.`
- **具象意象收尾**：抽象结论落在一个具体画面上。
  - `The next China AI story may ride a school bus, not just a chatbot.`（sensetime-saudi-school-bus）
- **动词强、形容词省**：强度靠数字与动词（undercut、erode、cascade、pop、rewrite），不靠形容词堆叠。

## 2. 决策启发式

写作时的操作规则（何时做什么）：

1. **Hook 选数**：最大数字或最反直觉事实独立成句作 hook；不写背景铺垫句。
2. **归因具名到机构**：关键数据必带来源——voiceover 用 `According to BofA/QuestMobile/Caixin/...`，scene `texts.source` 用 `SOURCE: <机构>, <日期>`，文章用 `_(Source: [媒体](链接), 日期)_` 括注。
3. **直接引语保原话**：引语逐字引用，紧贴 speaker 身份：`Zhang said: We can accept being temporarily behind, but do not distill.`
4. **数字给参照物**：抽象数字换算成熟悉锚——`one ninth of Qwen3.7-Plus`、`one-twentieth the price of Claude`、`undercuts a Tesla Model 3 on price`。
5. **实体首现给定位**：公司/人物首次出现一句话交代是谁——`Moonshot AI, the Beijing startup behind the Kimi chatbot`。
6. **意义段只留一段**：事件→行业意义的升华收敛到一个段落/一个 scene（`What This Means for China AI` / `For China AI, ...signals that...`），不铺满全文。
7. **观点住进命名的段**：文章观点放显式命名的 `My Take` 段；不与新闻事实段混排。
8. **CTA 用固定变体**：`Follow for more China AI <analysis|breakdowns|intelligence|news>.`，深度多卷加品牌落款 `This is China AI News.`；可加开放问句（`What's your take on DeepSeek's strategy?`）。
9. **多用序数结构组织复杂信息**：`Three reasons this leak was devastating.` / `Part one: ... Part two: ...`——先报结构再展开。

## 3. 反模式

语料中**零出现或刻意回避**的东西（写完检查，出现即改）：

- **hype 词**：`revolutionary`（0 次）、`game-changing`（0 次）、空洞 `breakthrough`（仅 1 次，且用于转述）。强度靠数字，不靠形容词。
- **无归因断言**：关键主张裸奔不带来源——全语料未见。
- **模糊化核实状态**：不用"据说"糊弄过去；核实结果显式报告（`We verified twenty-three claims against public sources. Three directly contradicted public data. Fourteen could not be independently confirmed.`，distillation pt3）。
- **观点混入事实段**：分析判断（`This is not a coincidence.` / `signals that...`）必须与新闻事实在段落层面分离。
- **立场形容词定性公司行为**：不写"激进/无耻/伟大"——用行为+数字让读者自行判断（`He cut prices by 75 percent. The team cheered.`）。

## 4. 诚实边界

不确定性与争议的语言机制：

- **hedging 词表**：`reportedly`（传闻/未官方证实）、`allegedly`（指控）、`claims/claimed`（单方主张）、`unverified`（未独立核实）。用词要区分"谁在说"与"核实到什么程度"。
- **指控必须配回应**：呈现争议时双方并置——`Frontier Security's CEO said K3 lacks guardrails` 紧跟 `The UK's AI Safety Institute said the claims were inaccurate.`（kimi-sandbox）。
- **不知道的事实直说**：`GLM-6.0 has no release date. No parameter count. But the direction is clear.`——事实空白明说，判断只下在已证实的方向上。
- **判断与事实的时态分离**：事实段用过去时+归因；解读用现在时+显式信号词（`This is unprecedented.` / `may become a pattern`）。
- **预言给时间窗**：预测必须带可检验的时间与条件（`If Seed produces a frontier-level model within the next 12-18 months... Zhang's long-termism will be vindicated.`）。

## 自检清单（写完过一遍）

- [ ] Hook 是数字/反直觉事实独立成句？无背景铺垫？
- [ ] 每个关键数据有具名归因（机构+日期）？
- [ ] 抽象数字给了参照物锚？
- [ ] 无 hype 词、无空洞形容词堆叠？
- [ ] 观点住进 `My Take`/独立段，未混入事实？
- [ ] 不确定的地方用了分级 hedging 词？指控配了回应？
- [ ] 结尾回环或具象意象收束？CTA 是固定变体？
