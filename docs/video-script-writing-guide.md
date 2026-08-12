# Video Script Writing Guide — 短视频脚本写作指南

> **创建于**: 2026-08-13
> **被引用**: `docs/content-pipeline.md` Stage 3 步骤 3-6
> **研究依据**: `docs/research/short-video-script-writing-best-practices.md`（15 源，S.T.A.R.T. 框架 + 心理留存引擎 + hook 公式）
> **方法论来源**: `writing-beats` skill（beat-by-beat 迭代 + grounding 概念）+ `copywriting` skill（CTA 公式 + hook 公式）

---

## 何时用这个文档

Agent 在 **Content Creation Workflow** 的 Stage 3（文章 → scene-data）中写或改脚本时，按此文档操作。不适用于渲染引擎/模板/管线代码的修改——那些走 Substantial Implementation Workflow。

**触发词**：用户说"写脚本"、"改脚本"、"优化 scene-data"、"重写 voiceover"、"脚本不好"

---

## 操作顺序

### Step 1: 确认前置条件

- 文章已发布（Stage 1-2 完成），或用户提供了原始素材
- 研究报告已读：`docs/research/short-video-script-writing-best-practices.md`（至少读 Key Findings 部分）
- `scene-rules.mjs` 和 `scene-templates.mjs` 的硬性规则已理解（hook 必须有 bigNumber 或 hookText，CTA 必须有 action 等）

### Step 2: 确定叙事类型

根据文章内容，从下表选择叙事结构：

| 内容类型 | 叙事结构 | 适用场景 |
|---------|---------|---------|
| **深度分析** | 钩子 → 共情 → 获得感 → 升华 | 技术解读、行业趋势、战略分析 |
| **突发新闻** | 事实冲击 → 背景 → 影响 → 下一步 | 融资、发布、人事变动 |
| **数据对比** | 数字冲击 → 对比 → 解读 → 结论 | 定价、性能、市场份额 |
| **争议事件** | 钩子 → 各方观点 → 核心矛盾 → 可能走向 | 基准测试争议、安全辩论 |

> 来源：自媒体实战方法论四层公式。注意：不强制统一——突发新闻的核心是事实冲击，不需要共情。

### Step 3: 用 S.T.A.R.T. 框架搭建骨架

将 S.T.A.R.T. 映射到 6-10 个 scene：

| 字母 | 名称 | 职责 | 对应 scene | 时间 |
|------|------|------|-----------|------|
| **S** | Stop | 停止滑动。Pattern interrupt、bold claim、shocking number | Scene 1 (hook) | 0-3s |
| **T** | Tease | Tease 收益点。**制造 open loop**，不揭露答案 | Scene 2 (early body) | 3-8s |
| **A** | Authority | 快速建立权威。引用源、展示数据 | Body scenes w/ data | 8-20s |
| **R** | Relay | 交付价值。揭示答案，讲故事 | Core body scenes | 20-50s |
| **T** | Tell | 强力、具体的 CTA | Last scene (CTA) | 50-60s |

**关键缺口**：当前脚本最大的问题是 **Tease 步骤几乎完全缺失**。从 Hook 直接跳到 Context/数据，没有制造悬念拉着观众往前看。**每个脚本必须在 Scene 2 设置 open loop。**

### Step 4: 逐 Scene 打磨（Beat-by-Beat 迭代）

采用 `writing-beats` 的迭代方式：**一次只写一个 scene，写完给用户选下一步方向**。

**Grounding 规则**（来自 `writing-beats`）：每个概念必须先被 grounded（在之前的 scene 中建立），后面的 scene 才能引用它。维护一个 "grounded concepts" 列表：

```
Grounded after Scene 1: [Light Society, 1B agents, 4M beliefs]
Grounded after Scene 2: [+ open loop: "what it actually did"]
...
```

如果某个 scene 引用了未 grounded 的概念，要么在前一个 scene 加 grounding，要么把它移到后面。

### Step 5: 应用心理留存引擎

在每个 scene 的 voiceover 中检查是否使用了以下技巧：

#### Open Loop（开环）

开始一个想法，不结束它。大脑渴望闭环——会继续看来找到答案。

- **在哪用**：Scene 2 的 tease
- **怎么写**：暗示有更深层的东西，但不揭露
- **示例**："But the paper never mentions re-education. What it actually did is scarier." — 闭环在 Scene 7-8 才关闭
- **当前问题**：我们的脚本每个 scene 自包含，零 open loop

#### Pattern Interrupt（模式中断）

每 2-3 个 scene 打破一次预期，重新抓住注意力。注意力在 hook 后线性衰减。

- **在哪用**：Scene 4-5 左右（context 交付后、value 交付前）
- **怎么写**：突然的问题、语调转换、视觉矛盾
- **示例**（数据可视化格式）：从数据陈述突然切到 "But here's the scary part." 或 "Then something unexpected happened."

#### Curiosity Gap（好奇缺口）

暗示但不揭露。观众知道的和想知道的之间的差距产生前进动力。

- **在哪用**：贯穿全文，但最有效在 Scene 2 和 Scene 5-6 之间
- **怎么写**："Don't dismiss X until you see Y" 式的结构

#### Loop Closure（闭环收尾）

最后一个内容 scene 回扣 Hook，让重看时第一帧感觉不同。

- **在哪用**：CTA 前的最后一个内容 scene
- **怎么写**：引用 Hook 中的关键词/数字，但赋予新含义
- **示例**：Hook="One billion simulated humans" → 收尾="One billion simulated minds. The question is: are we next?"

### Step 6: 应用写作风格规则

| 规则 | 怎么做 | 当前状态 |
|------|--------|---------|
| **Write for the ear** | 缩写（don't, can't, it's）、句子片段、口语化 | ⚠️ 太正式 |
| **短句** | Hook ≤10 词；body ≤25 词（一口气） | ✅ 已由 scene-rules 强制 |
| **Vary line length** | 在 15 词的 context 行之间插入 3-5 词 punch line | ❌ 太均匀（teleprompter rhythm） |
| **No hedging** | 删除 maybe, sort of, kinda, perhaps | ✅ 基本遵守 |
| **No written openers** | 不以 "In this video," "Today we'll" 开头 | ✅ 已由 scene-rules 强制 |
| **One idea per line** | 每个 VO 行只承载一个想法 | ⚠️ 部分行承载两个 |
| **No em-dashes** | 不用 em/en/double dashes | ✅ 已由 scene-rules 强制 |
| **No AI vocabulary** | 不用 leverage, delve, utilize 等 | ✅ 已由 scene-rules 强制 |

### Step 7: 优化 Hook

从研究报告中选择 hook 公式（**轮换使用，不要只用 shocking number**）：

| 公式 | 模式 | 我们的领域示例 | 适用内容类型 |
|------|------|---------------|-------------|
| **Shocking Number** | "[大数字] + [意外语境]" | "$118B poured into a robot company that admits its robots can't work." | 数据驱动 |
| **Contradiction** | "[X] 发生了，但 [X 的反面] 也是真的" | "China's biggest AI simulation rewrote 4M minds. The paper never mentions re-education." | 反转/争议 |
| **Curiosity Gap** | "别急着 [常见行为]，先看 [这个]" | "Don't dismiss Chinese humanoid robots until you see what their own filing admits." | 产品/分析 |
| **Question** | "如果 [假设] 是错的呢？" | "What if the billion-agent simulation isn't about AI at all?" | 哲学/分析 |

### Step 8: 优化 CTA

**来自 `copywriting` skill 的 CTA 公式**：`[Action Verb] + [What They Get]`

| 类型 | 示例 | 效果 |
|------|------|------|
| ❌ 通用 CTA | "Follow for more China AI." | Dead closer，无具体收益 |
| ✅ 具体 CTA | "Follow for Part 2: what the simulation discovered about human behavior." | 告诉观众关注后能得到什么 |
| ✅ Loop-closure CTA | "One billion simulated minds. The question is: are we next?" | 不显式 CTA，但制造重看冲动 |
| ✅ Specific ask | "Comment which Chinese AI company I should cover next." | 驱动评论互动 |

**规则**：
- 永远不用 "thanks for watching" / "don't forget to subscribe"（scene-rules 已强制）
- CTA 应回扣 Hook 的关键词或主题
- 如果是系列视频，CTA 应预告下一集的内容

### Step 9: 运行 MRL-2 自审

写完全部 scene 后，运行 `content-pipeline.md` Stage 3 的 MRL-2 检查循环（10 Blockers + 6 Warnings）。0 Blockers 后进入 Stage 4。

---

## 诊断清单：脚本不好时检查什么

按优先级排序（最高优先级在前）：

| # | 检查项 | 怎么诊断 | 怎么修 |
|---|--------|---------|--------|
| 1 | **没有 open loop** | Scene 1 陈述事实后，Scene 2 是否制造了未解悬念？ | Scene 2 加 tease："But what it actually did is scarier." |
| 2 | **Teleprompter rhythm** | 统计每个 scene 的 VO 词数，标准差是否 <15%？ | 在 15 词行之间插入 3-5 词 punch line |
| 3 | **矛盾/反转太晚** | 最大反转出现在 Scene 7-8 还是 Scene 5-6？ | 把 tease 前置到 Scene 2 |
| 4 | **通用 CTA** | 最后一个 scene 的 CTA 是否是 "Follow for more"？ | 换成具体 ask 或 loop-closure |
| 5 | **无 pattern interrupt** | Scene 3-6 是否都是同质的数据陈述？ | 在 Scene 4-5 加一个 tonal shift |
| 6 | **Hook 只用一种公式** | 最近几个视频的 hook 是否都是 shocking number？ | 轮换到 contradiction / curiosity gap / question |
| 7 | **Authority 太晚** | 引用源（Bloomberg, arXiv）出现在 Scene 5+？ | 前置到 Scene 2-3 |
| 8 | **无 loop closure** | 最后内容 scene 是否回扣 Hook？ | 让收尾引用 Hook 中的关键词/数字 |

---

## 与现有规则的关系

| 规则来源 | 管什么 | 和本指南的关系 |
|---------|--------|--------------|
| `scene-rules.mjs` | 硬性结构检查（scene count, hook type, CTA type, AI vocab, em-dash 等） | **不替代**——本指南在 scene-rules 之上提供写作方法论 |
| `scene-templates.mjs` | 视觉模板实现（hookScene, ctaScene 等） | **不替代**——本指南指导写什么文字，模板决定怎么渲染 |
| `tiktok-rules.mjs` | TikTok 平台规则（clickbait, watermark, SEO 等） | **不替代**——本指南关注叙事质量，tiktok-rules 关注平台合规 |
| `content-pipeline.md` Stage 3 | 操作流程（分集评估 → 写 scene-data → MRL-2） | **被引用**——本指南是 Stage 3 步骤 3-6 的方法论指导 |
| `docs/research/short-video-script-writing-best-practices.md` | 研究依据（15 源，详细分析） | **引用**——本指南是研究结论的操作化 |
| `writing-beats` skill | Beat-by-beat 迭代方法论 + grounding 概念 | **借鉴**——Step 4 使用其迭代方式，但不正式加载 skill |
| `copywriting` skill | CTA 公式 + hook 公式 + 写作风格 | **借鉴**——Step 7-8 使用其公式，但不正式加载 skill |

---

## Design Decisions & References

- **为什么不创建独立 skill**：按 `writing-for-agents` 原则，新 skill 如果 model-invoked 会永久占 context load；如果 user-invoked 则增加 cognitive load（你已经有 120+ skill）。此文档作为 disclosed reference 被 `content-pipeline.md` 引用，agent 只在 Stage 3 时加载，不占常驻 context。
- **为什么借鉴 `writing-beats` 而非正式加载**：`writing-beats` 设计输出是 markdown 文件，我们的是 JS data 文件。beat-by-beat 迭代方式和 grounding 概念有方法论价值，但格式不适配。用其方法论，不用其输出格式。
- **为什么借鉴 `copywriting` 而非正式加载**：`copywriting` 设计用于营销页面（homepage, landing, pricing）。其 CTA 公式 `[Action Verb] + [What They Get]` 和 hook 公式直接适用于短视频，但其页面结构框架不适用。
- **研究报告 vs 操作指南**：`docs/research/short-video-script-writing-best-practices.md` 是研究依据（含来源引用、详细分析、contrarian views），本指南是操作化版本（含操作步骤、诊断清单、与现有规则的关系）。两者互补：研究是 "为什么"，指南是 "怎么做"。
- **更新策略**：当研究报告更新（新源、新框架），本指南的 Step 3-8 应同步更新。Step 1-2 和诊断清单相对稳定。
