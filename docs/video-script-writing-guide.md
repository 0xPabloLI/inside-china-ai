# Video Script Writing Guide — 短视频脚本写作指南

> **创建于**: 2026-08-13. 2026-08-27 大改：S.T.A.R.T. 定为主框架，AI Outline 降为 HITL 工具输入，新增叙事字段 `narrativeRole`/`retentionMechanism` + W7/W8/W9 自动验证。
> **被引用**: `docs/content-pipeline.md` Stage 3 Step 2-5
> **研究依据**: `docs/research/short-video-script-writing-best-practices.md`（15 源）

---

## 何时用这个文档

Agent 在 Content Pipeline 的 Stage 3 中写或改 scene-data 时按此文档操作。不适用于渲染引擎/模板/管线代码修改——那些走 Substantial Implementation Workflow。

**触发词**：用户说"写脚本"、"改脚本"、"优化 scene-data"、"重写 voiceover"、"脚本不好"

---

## Step 1: 确认前置条件

- Stage 0 素材已就绪（用户素材 + 互联网全文）
- `scene-rules.mjs` 和 `scene-templates.mjs` 的硬性规则已理解（hook 必须有 bigNumber 或 hookText，CTA 必须有 action 等）

---

## Step 2: 确定叙事类型

根据素材内容选择叙事结构：

| 内容类型 | 叙事结构 | 适用场景 |
|---------|---------|---------|
| **深度分析** | 钩子 → 共情 → 获得感 → 升华 | 技术解读、行业趋势、战略分析 |
| **突发新闻** | 事实冲击 → 背景 → 影响 → 下一步 | 融资、发布、人事变动 |
| **数据对比** | 数字冲击 → 对比 → 解读 → 结论 | 定价、性能、市场份额 |
| **争议事件** | 钩子 → 各方观点 → 核心矛盾 → 可能走向 | 基准测试争议、安全辩论 |

---

## Step 3: 用 S.T.A.R.T. 框架搭建骨架

### 三层叠加模型

**S.T.A.R.T. 5 段为主框架**（15 源验证的创作者社区共识）。留存引擎为微观机制，在特定 scene 强制插入。AI Outline 为 HITL 工具输入，用户从手机端拿到后按消费映射表（见下方）消费。

**AI Outline 是工具输入，不是结构参照**。Agent 按 S.T.A.R.T. 5 段设计 scene，用户可选地从 AI Outline 输出中提取内容建议填充到对应段。

### S.T.A.R.T. 5 段概览

| 段 | 名称 | 时间 | 职责 |
|----|------|------|------|
| S | Stop | 0-3s | Hook：shocking number / contradiction / curiosity gap / question |
| T | Tease | 3-8s | Open loop：开始一个想法，不结束它 |
| A | Authority | 8-20s | 引用源、数据，建立权威 |
| R | Relay | 20-50s | 揭示答案、高潮、pattern interrupt |
| T-Tell | Tell | 50-60s | CTA：具体、回扣 Hook |

### AI Outline 消费映射表

用户在手机端跑完 AI Outline 后，将输出抄回给 Agent。Agent 按下表消费：

| AI Outline 段 | S.T.A.R.T. 对应 | 消费规则 |
|---|---|---|
| Intro suggestions | S — Stop | Hook 候选：对比 Agent 自己写的 hook，取更优者 |
| Core talking points | A — Authority | 筛选最相关 2-3 个点，指导 S3-S4 内容 |
| Highlight moment | R — Relay (前半) | 确认 Peak scene 位置 |
| Climatic build | R — Relay (高潮) | 参考 S6-S7 情绪递进设计 |
| Engagement-driven outro | T-Tell | 参考其 CTA 角度，指导最终 scene voiceover |

Title 和 Hashtags 直接取用（经过品牌一致性检查后）。用户跳过 AI Outline 时，Agent 自行按 S.T.A.R.T. 设计（降级逻辑不变）。

### Scene 模板（10-12 个 scene）

以 S.T.A.R.T. 5 段为骨架。每个 scene 填写 `narrativeRole`（声明 S.T.A.R.T. 角色）和 `retentionMechanism`（声明留存机制）。留存机制只在特定 scene 叠加。

**字段说明**：
- `narrativeRole`: 枚举 `"S"` | `"T"` | `"A"` | `"R"` | `"T-Tell"`。声明此 scene 在 S.T.A.R.T. 中的角色。
- `retentionMechanism`: 枚举 `null` | `"open-loop"` | `"pattern-interrupt"` | `"loop-closure"` | `"curiosity-gap"` | `"approaching-closure"`。声明此 scene 的留存机制。

两个字段都是**可选的**——旧 scene-data 不填不影响渲染。新写的 scene-data 应该填。`verify-video.mjs --pre` 的 W7/W8/W9 检查这三项。

#### Scene 1: Stop（S — Stop）

- **narrativeRole**: `"S"`
- **留存机制**：埋下 open loop 的种子（暗示有更深层的东西）
- **素材要求**：冲击力强的背景图/视频（公司 logo、产品画面、标志性场景）。素材需求写入 scene 的 `assetNeed` 字段（如 `assetNeed: "company logo or product screenshot"`），asset-sourcer 按此做 per-scene claim 搜索
- **voiceover**：≤10 词。从 4 种 hook 公式中轮换选择（见 Step 5）
- **visualType**: `"hook"`
- **时间**：0-3s

#### Scene 2: Tease（T — Tease）

- **narrativeRole**: `"T"`
- **retentionMechanism**: `"open-loop"`（强制）
- **留存机制**：**open loop（强制）** — 开始一个想法，不结束它。闭环在 Scene 8-9 才关闭
- **素材要求**：与 Scene 1 形成对比的背景图（时间线、事件截图、对比画面）
- **voiceover**：≤15 词。必须包含一个未解悬念
- **visualType**: `"narrative"`
- **时间**：3-8s

#### Scene 3-4: Authority（A — Authority）

- **narrativeRole**: `"A"`
- **留存机制**：curiosity gap — 暗示但不揭露全部
- **素材要求**：数据可视化素材（图表、数字截图、官方文件截图）。引用源 logo。素材需求写入 scene 的 `assetNeed` 字段（如 `assetNeed: "data chart or source screenshot"`）
- **voiceover**：≤25 词/scene。每句承载一个想法
- **visualType**: `"narrative"`
- **时间**：8-20s

#### Scene 5: Pattern Interrupt（留存引擎独立机制）

- **narrativeRole**: `"R"`（属于 Relay 段，但功能是中断）
- **retentionMechanism**: `"pattern-interrupt"`（强制）
- **留存机制**：**pattern interrupt（强制）** — 突然的问题、语调转换、视觉矛盾
- **素材要求**：与前几个 scene 视觉风格反差的素材（从数据切到人物、从严肃切到轻松）
- **voiceover**：3-5 词 punch line
- **visualType**: `"narrative"`（badge 标注 `"PATTERN INTERRUPT"`）
- **时间**：20-30s

#### Scene 6-7: Relay — 揭示答案（R — Relay 前半）

- **narrativeRole**: `"R"`
- **留存机制**：approaching closure — 观众感到答案要来了
- **素材要求**：产品演示截图/视频、功能画面、实际操作 GIF。**必须有视觉证据**。素材需求写入 scene 的 `assetNeed` 字段（如 `assetNeed: "product demo screenshot or GIF"`）
- **voiceover**：≤25 词/scene
- **visualType**: `"narrative"`
- **时间**：30-42s

#### Scene 8: Peak（R — Relay 高潮）

- **narrativeRole**: `"R"`
- **留存机制**：接近闭环——观众知道答案即将揭晓
- **素材要求**：最具冲击力的数字/画面/对比。这是全片情绪最高点
- **voiceover**：最短句、最重击的措辞。≤15 词
- **visualType**: `"narrative"`（badge 标注 `"PEAK"`）
- **时间**：42-50s

#### Scene 9: Loop Closure（留存引擎收尾）

- **narrativeRole**: `"R"`
- **retentionMechanism**: `"loop-closure"`（强制）
- **留存机制**：**loop closure（强制）** — 引用 Hook 中的关键词/数字，但赋予新含义
- **素材要求**：与 Hook 场景呼应的素材（同一主体的不同角度、时间线收束）
- **voiceover**：≤20 词。必须引用 Hook 中的关键词或数字
- **visualType**: `"narrative"`（badge 标注 `"LOOP CLOSURE"`）
- **时间**：50-55s

#### Scene 10: Tell（T-Tell）

- **narrativeRole**: `"T-Tell"`
- **留存机制**：如可能，用 loop-closure 式 CTA（制造重看冲动）
- **素材要求**：品牌 bar（自动渲染，无需手动指定）
- **voiceover**：≤15 词。从 3 种 CTA 公式中选择（见 Step 6）
- **visualType**: `"cta"`
- **时间**：55-60s

### Grounding 规则

每个概念必须先被 grounded（在之前的 scene 中建立），后面的 scene 才能引用它。维护一个 grounded concepts 列表：

```
Grounded after Scene 1: [Doubao, 382M users]
Grounded after Scene 2: [+ open loop: "why merge Feishu"]
Grounded after Scene 3: [+ Doubao Work capabilities]
...
```

如果某个 scene 引用了未 grounded 的概念，要么在前一个 scene 加 grounding，要么把它移到后面。

---

## Step 4: 应用写作风格规则

| 规则 | 怎么做 |
|------|--------|
| **Write for the ear** | 缩写（don't, can't, it's）、句子片段、口语化 |
| **短句** | Hook ≤10 词；body ≤25 词（一口气） |
| **Vary line length** | 在 15 词的 context 行之间插入 3-5 词 punch line |
| **No hedging** | 删除 maybe, sort of, kinda, perhaps |
| **No written openers** | 不以 "In this video," "Today we'll" 开头 |
| **One idea per line** | 每个 VO 行只承载一个想法 |
| **No em-dashes** | 不用 em/en/double dashes |
| **No AI vocabulary** | 不用 leverage, delve, utilize 等 |

> scene-rules.mjs 已强制部分规则。此处补足 scene-rules 未覆盖的写作风格。

---

## Step 5: 优化 Hook

从 4 种 hook 公式中**轮换使用**（不要只用 shocking number）：

| 公式 | 模式 | 我们的领域示例 | 适用内容类型 |
|------|------|---------------|-------------|
| **Shocking Number** | "[大数字] + [意外语境]" | "$10B for AI. Not e-commerce. Not logistics. Just AI." | 数据驱动 |
| **Contradiction** | "[X] 发生了，但 [X 的反面] 也是真的" | "382M users. Daily revenue under $140K." | 反转/争议 |
| **Curiosity Gap** | "别急着 [常见行为]，先看 [这个]" | "Don't dismiss Chinese enterprise AI until you see what ByteDance just did." | 产品/分析 |
| **Question** | "如果 [假设] 是错的呢？" | "What if China's biggest AI bet isn't a model at all?" | 哲学/分析 |

---

## Step 6: 优化 CTA

CTA 公式：`[Action Verb] + [What They Get]`

| 类型 | 示例 | 效果 |
|------|------|------|
| ❌ 通用 CTA | "Follow for more China AI." | Dead closer，无具体收益 |
| ✅ 具体 CTA | "Follow for Part 2: what happens when 382M users get an AI agent." | 告诉观众关注后能得到什么 |
| ✅ Loop-closure CTA | "ByteDance put an AI agent inside every Feishu. Will your boss notice?" | 制造重看冲动 |
| ✅ Specific ask | "Comment which Chinese AI company I should cover next." | 驱动评论互动 |

**规则**：CTA 回扣 Hook 的关键词或主题。系列视频 CTA 预告下一集。

---

## Step 7: 运行 MRL-2 自审

写完全部 scene 后，运行 `content-pipeline.md` Stage 3 的 MRL-2 检查循环（10 Blockers + 11 Warnings）。W7 检查 open loop、W8 检查 pattern interrupt、W9 检查 loop closure。三项都是 Warning 级别——缺失不阻塞渲染，但提示 Agent 补充。0 Blockers 后进入 Stage 4。

---

## 诊断清单：脚本不好时检查什么

按优先级排序（最高优先级在前）：

| # | 检查项 | 怎么诊断 | 怎么修 |
|---|--------|---------|--------|
| 1 | **没有 open loop** | Scene 2 是否制造了未解悬念？ | Scene 2 加 tease |
| 2 | **没有 pattern interrupt** | Scene 4-5 是否都是同质的数据陈述？ | 加一个 tonal shift |
| 3 | **没有 loop closure** | 最后内容 scene 是否回扣 Hook？ | 让收尾引用 Hook 中的关键词/数字 |
| 4 | **Teleprompter rhythm** | 统计每个 scene 的 VO 词数，标准差是否 <15%？ | 在 15 词行之间插入 3-5 词 punch line |
| 5 | **Show 段没有视觉证据** | Show scene 是否只有文字描述？ | 找产品截图/演示视频 |
| 6 | **Peak 不突出** | Peak scene 视觉上和其他 narrative 一样？ | 用不同的 layout 或 badge |
| 7 | **通用 CTA** | 最后一个 scene 的 CTA 是否是 "Follow for more"？ | 换成具体 ask 或 loop-closure |
| 8 | **Hook 只用一种公式** | 最近几个视频的 hook 是否都是 shocking number？ | 轮换到 contradiction / curiosity gap / question |

---

## 与现有规则的关系

| 规则来源 | 管什么 | 和本指南的关系 |
|---------|--------|--------------|
| `scene-rules.mjs` | 硬性结构检查 | **不替代**——本指南在 scene-rules 之上提供叙事方法论 |
| `scene-templates.mjs` | 视觉模板实现 | **不替代**——本指南指导写什么文字，模板决定怎么渲染 |
| `tiktok-rules.mjs` | TikTok 平台规则 | **不替代**——本指南关注叙事质量，tiktok-rules 关注平台合规 |
| `content-pipeline.md` Stage 3 | 操作流程 | **被引用**——本指南是 Stage 3 Step 2-5 的方法论 |
| `docs/research/short-video-script-writing-best-practices.md` | 研究依据 | **引用**——本指南是研究结论的操作化 |

---

## Design Decisions & References

- **为什么不创建独立 skill**：按 `writing-for-agents` 原则，新 skill 如果 model-invoked 会永久占 context load。此文档作为 disclosed reference 被 `content-pipeline.md` 引用，agent 只在 Stage 3 时加载。
- **S.T.A.R.T. 为主框架的原因**：15 源验证的创作者社区共识最高框架。AI Outline 来自 TikTok 官方 Creator Search Insights（2026-08-27 实测验证），是平台数据的工具化输出，作为 HITL 工具输入消费——Agent 拿到用户抄回的 AI Outline 后按消费映射表提取内容建议，而非用其结构替代 S.T.A.R.T.。
- **为什么每个 scene 有素材要求**：之前 scene 的 media 字段是事后填充的——先写 voiceover 再找图。现在每个 scene 在设计时就定义素材需求，让脚本驱动素材收集，而不是素材适配脚本。

**assetNeed 约定（Stage 3 必填实践）**：scene 的素材需求写入结构化字段 `assetNeed: "一句英文视觉描述"`（不是 voiceover 里的文字标注——TTS 会把内嵌 `[ASSET NEEDED` 标注读出来，scene-rules B13 会 FAIL）。asset-sourcer 消费 `assetNeed` 做 per-scene claim 搜索并绑定到该 scene；VLM 对照 voiceover 主张做相关性审查，低于阈值的素材宁缺毋滥（scene 保持纯 CSS 是合法结果）。公司实体关键词仅作为无 `assetNeed` scene 的 fallback。
- **研究报告 vs 操作指南**：研究报告是 "为什么"，本指南是 "怎么做"。两者互补。
