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

| 内容类型     | 叙事结构                              | 适用场景                     |
| ------------ | ------------------------------------- | ---------------------------- |
| **深度分析** | 钩子 → 共情 → 获得感 → 升华           | 技术解读、行业趋势、战略分析 |
| **突发新闻** | 事实冲击 → 背景 → 影响 → 下一步       | 融资、发布、人事变动         |
| **数据对比** | 数字冲击 → 对比 → 解读 → 结论         | 定价、性能、市场份额         |
| **争议事件** | 钩子 → 各方观点 → 核心矛盾 → 可能走向 | 基准测试争议、安全辩论       |

---

## Step 3: 用 S.T.A.R.T. 框架搭建骨架

### 三层叠加模型

**S.T.A.R.T. 5 段为主框架**（15 源验证的创作者社区共识）。留存引擎为微观机制，在特定 scene 强制插入。AI Outline 为 **opt-in 工具输入**（默认不启用，仅用户显式点名时使用），用户从手机端拿到后按消费映射表（见下方）消费。

**AI Outline 是工具输入，不是结构参照**。Agent 按 S.T.A.R.T. 5 段设计 scene，opt-in 时可从 AI Outline 输出中提取内容建议填充到对应段。

### S.T.A.R.T. 5 段概览

| 段     | 名称      | 时间   | 职责                                                             |
| ------ | --------- | ------ | ---------------------------------------------------------------- |
| S      | Stop      | 0-3s   | Hook：shocking number / contradiction / curiosity gap / question |
| T      | Tease     | 3-8s   | Open loop：开始一个想法，不结束它                                |
| A      | Authority | 8-20s  | 引用源、数据，建立权威                                           |
| R      | Relay     | 20-50s | 揭示答案、高潮、pattern interrupt                                |
| T-Tell | Tell      | 50-60s | CTA：具体、回扣 Hook                                             |

### AI Outline 消费映射表

> **默认不启用**（2026-09-10 用户裁决）：AI Outline 是 opt-in 工具——仅当用户在对话中显式点名（如"用 TikTok AI Outline"）时才进管线。本表只在 opt-in 后消费；默认路径 Agent 直接按 S.T.A.R.T. 设计，无此表。

用户在手机端跑完 AI Outline 后，将输出抄回给 Agent。Agent 按下表消费：

| AI Outline 段           | S.T.A.R.T. 对应  | 消费规则                                      |
| ----------------------- | ---------------- | --------------------------------------------- |
| Intro suggestions       | S — Stop         | Hook 候选：对比 Agent 自己写的 hook，取更优者 |
| Core talking points     | A — Authority    | 筛选最相关 2-3 个点，指导 S3-S4 内容          |
| Highlight moment        | R — Relay (前半) | 确认 Peak scene 位置                          |
| Climatic build          | R — Relay (高潮) | 参考 S6-S7 情绪递进设计                       |
| Engagement-driven outro | T-Tell           | 参考其 CTA 角度，指导最终 scene voiceover     |

Title 和 Hashtags 直接取用（经过品牌一致性检查后）。默认（未 opt-in）时 Agent 自行按 S.T.A.R.T. 设计。

### Scene 模板（10-12 个 scene）

以 S.T.A.R.T. 5 段为骨架。每个 scene 填写 `narrativeRole`（声明 S.T.A.R.T. 角色）和 `retentionMechanism`（声明留存机制）。留存机制只在特定 scene 叠加。

**字段说明**：

- `narrativeRole`: 枚举 `"S"` | `"T"` | `"A"` | `"R"` | `"T-Tell"`。声明此 scene 在 S.T.A.R.T. 中的角色。
- `retentionMechanism`: 枚举 `null` | `"open-loop"` | `"pattern-interrupt"` | `"loop-closure"` | `"curiosity-gap"` | `"approaching-closure"`。声明此 scene 的留存机制。

两个字段都是**可选的**——旧 scene-data 不填不影响渲染。新写的 scene-data 应该填。`verify-video.mjs --pre` 的 W7/W8/W9 以**编辑建议**口径检查这三项（`🧭 Editorial Suggestions`，不阻断渲染，#763）。

#### Scene 1: Stop（S — Stop）

- **narrativeRole**: `"S"`
- **留存机制**：埋下 open loop 的种子（暗示有更深层的东西）
- **素材要求**：冲击力强的背景图/视频（公司 logo、产品画面、标志性场景）。Hook 媒体逐包人工策展：直接把文件绑定为 `scene.media`（见下文 Hook 媒体策展）；不要用 `assetNeed`——asset-sourcer 结构上跳过 hook
- **voiceover**：≤10 词（冲突未决，见 Step 5 校准表）。从 4 种 hook 公式中轮换选择（见 Step 5）
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

### 画面描述合同（锚点 / 动作 / 结果，#529）

写每个 scene 的 `assetNeed` 或视觉描述时，先回答三问，再写文案：

1. **锚点**：观众第一眼看到的具体对象是什么（实体、文件、界面、人物或一组可读的关系）。
2. **动作**：这个对象发生了什么变化（状态、空间或关系的变化）。
3. **结果**：这一拍结束时，观众得到什么可读的结果。

抽象隐喻可以用，但必须由立即可读的对象、关系、状态或空间变化承载；只有抽象材质、能量线或巨型文字的构图不成立。三问是写稿侧自检，不是新的机械门禁；渲染侧仍由既有 preflight 与媒体门禁负责。

> 来源：#529 R6②（`erduo1998-cell/erduo-broll-loop-engineering` 的「画面理解合同」，MIT，读思路档）。研究依据见 `docs/research/agent-video-skills-180-screening-2026-09.md` §R6.2。与 #733 的镜头配方卡、#735 的量化验收闸门分属写稿、分镜、渲染验收三层；渲染侧现有机械门禁仍是 preflight 与媒体门禁。

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

| 规则                   | 怎么做                                          |
| ---------------------- | ----------------------------------------------- |
| **Write for the ear**  | 缩写（don't, can't, it's）、句子片段、口语化    |
| **短句**               | Hook ≤10 词（冲突未决，见 Step 5 校准表）；body ≤25 词（一口气） |
| **Vary line length**   | 在 15 词的 context 行之间插入 3-5 词 punch line |
| **No hedging**         | 删除 maybe, sort of, kinda, perhaps             |
| **No written openers** | 不以 "In this video," "Today we'll" 开头        |
| **One idea per line**  | 每个 VO 行只承载一个想法                        |
| **No em-dashes**       | 不用 em/en/double dashes                        |
| **No AI vocabulary**   | 不用 leverage, delve, utilize 等                |

> scene-rules.mjs 已强制部分规则。此处补足 scene-rules 未覆盖的写作风格。

---

## Step 5: 优化 Hook

从 4 种 hook 公式中**轮换使用**（不要只用 shocking number）：

| 公式                | 模式                                 | 我们的领域示例                                                               | 适用内容类型 |
| ------------------- | ------------------------------------ | ---------------------------------------------------------------------------- | ------------ |
| **Shocking Number** | "[大数字] + [意外语境]"              | "$10B for AI. Not e-commerce. Not logistics. Just AI."                       | 数据驱动     |
| **Contradiction**   | "[X] 发生了，但 [X 的反面] 也是真的" | "382M users. Daily revenue under $140K."                                     | 反转/争议    |
| **Curiosity Gap**   | "别急着 [常见行为]，先看 [这个]"     | "Don't dismiss Chinese enterprise AI until you see what ByteDance just did." | 产品/分析    |
| **Question**        | "如果 [假设] 是错的呢？"             | "What if China's biggest AI bet isn't a model at all?"                       | 哲学/分析    |

### Hook 正反面校准表（#752）

**口径**：判据来源是**人工裁决**（#244 三轮 A/B 实听 + 陌生观众自足性），播放量只作**入选门槛**，#259 的 0:01 留存落点只作**回收对照**（该口径下我方无正例）。逐条「为何算好」按评审端三轴（`docs/content-pipeline.md` → Hook 合格判据）拆解。

**机检提醒（照抄前必读）**：`checkHookCompellingElement`（`scripts/short-video/lib/scene-rules.mjs`）要求 hook VO 命中 `NUMBER_PATTERN`（阿拉伯数字）或 `STRONG_WORD_PATTERN` 强词表之一；两个常量的唯一来源是 `scripts/short-video/lib/tiktok-rules.mjs`（该模块自述为规则内容 SSOT），**词表与正则不在此重抄**。该检查自 #763 起只进 `🧭 Editorial Suggestions`（advisory，不阻断），且它只判「含数字/强词」——孤立数字如 `9` 也能过，**不能当作 hook 合格的证据**；合格判定走 `docs/content-pipeline.md` → Hook 合格判据（#752 三轴）。本表正例校准的是**句式与三轴质量**，不是机检合规——下表 `机检` 列逐条标注，口径是跑真门禁所得。

#### 正面基准 · 内部已验证（#244，2026-09-13 HITL 实听）

| 样本 | 原始 take 文本 | 三轴拆解 | 机检 |
| --- | --- | --- | --- |
| **303**（胜出，用户裁决「情感充沛很多」） | DeepSeek just dropped a bombshell! V four point one Flash — brand new architecture, native multimodal. This changes everything. | 轴1 首分句 5 词即落 "bombshell"（冲突先于对象）；轴2 **N/A**（无度量数字）；轴3 锚点词 = 模型名，与 hook 屏上 `subject` 同指。非轴补记：「brand new architecture」与上代形成对照（对照质量，非数字锚点，不计轴 2） | ✗ 无阿拉伯数字（"V four point one" 为拼写）、"bombshell" 不在强词表 |
| **405**（疑问句，多内容泛化最佳；整体仍不如 303） | What if one GPU could run a world model for 1.3 billion people? Ant Group just proved it. In real time. | 轴1 首分句 13 词，但前 3 词已抛假设冲突；轴2 "1.3 billion people" 自带体量反差，第二句给主体；轴3 三拍短句，屏上焦点可同步 | ✓ 含 "1.3" |

**落地改写（必读）**：303 原始 take 文本有两处机检风险——含 `—`（`checkNoEmDashes` 对 em/en/double dash 是 fail）且无阿拉伯数字/强词（见上表）。落地版把版本号写回**阿拉伯数字形式**（TTS 朗读形式由管线 Step 0.6 从版本号派生，不需要在 voiceover 里拼写）并按 #278 降级规则用句号切分：

> DeepSeek just dropped a bombshell! V4.1 Flash. Brand new architecture, native multimodal.

（断句切分的听感**未经复核**——要确认节奏按 #278 的方式实听对比。）

**词数口径冲突（未决，全仓唯一权威表述）**：303 = 18 词、405 = 21 词，外部样本中位 14.0 词——都超本 guide 的「Hook ≤10 词」写法（Step 3 Scene 1 与 Step 4 写作风格两处均按此表执行）。冲突待 **#763** 三分类审计裁决；在此之前以**已验证样本**为准，不要为凑 ≤10 词牺牲轴 1 / 轴 2。

#### 正面基准 · 外部（#300，2026-10-17 抓取快照；样本 = 各账号播放量 Top 5）

| 账号（档位） | 原文（ASR 首段） | 句子族 | 三轴拆解 | 机检 |
| --- | --- | --- | --- | --- |
| `maverickgpt`（prompt 教程） | China just dropped an AI model that beats GPT-5 on almost every benchmark, and nobody's talking about it. | `just` + 事件 | 轴1 首分句 13 词，但 "beats GPT-5" 即冲突；轴2 **N/A**（无度量数字）；轴3 首帧真人对镜口播，与口播锚点同指。非轴补记：对手名（GPT-5）即参照系，非数字锚点，不计轴 2 | ✓ 含 "GPT-5" |
| `kanekallaway`（科技新闻、分屏） | Elon is now creating the biggest building in human history, the TerraFab. | 规模 / 最高级锚点 | 轴1 "biggest building in human history" 先于主体名落地；轴2 **N/A**（无度量数字）；轴3 首帧分屏（Elon 舞台 + 口播），画面与口播同指。非轴补记：最高级（biggest…in history）即参照系，非数字锚点 | ✗ 无数字、无强词 |
| `kanekallaway` | This is the most insane tech company in the world, ASML. | 规模 / 最高级锚点 | 轴1 悬念前置（"the most insane"）再给主体；轴2 **N/A**（无度量数字）；轴3 首帧是芯片特写而非人像——**吸收其句式，不要照搬首帧策略**（首帧策略归 #299）。非轴补记：最高级即参照系，非数字锚点 | ✗ 无数字、无强词 |
| `sineadbovell`（科技评论、口播） | What's a professor to do to, like, I don't know, prevent cheating? | 提问式 | 轴1 疑问句开场，冲突藏在「提问者无解」里；轴2 **N/A**（无度量数字）；轴3 首帧真人出镜说话 | ✗ 无数字、无强词 |

**取证边界**：原文 = 各条 ASR 首段，取自 `scripts/short-video/output/competitor-benchmarks/analysis/<账号>/<videoId>.asr.json`（gitignored 不入库）。**该目录是唯一带 ASR 侧车的目录**——`analysis-recompute/` 只有修复后的分析记录、无 ASR 文本；两目录按 `docs/research/competitor-video-benchmarks-research.md` §10 的「勿混用」纪律分工：**数字类结论**出自 `analysis-recompute/`，**ASR 原文**出自 `analysis/`。本表四条（`7580410789442440479` / `7676104609177423134` / `7666090654434413855` / `7276858408584727838`）与已知坏记录 `7599711388939980063` 无关（后者在 `analysis/` 仍是 `error: unparseable-json`，本表未引用）。句子族归类取自 §10.2（该节实例为**节选**，故与 ASR 首段并非逐字相同；族名含「锚点」二字是 §10.2 的用词，与轴 2 的「数字锚点」不是同一概念）。播放量同为抓取快照。账号赛道归属的完整校验归 **#748**（本表 4 条取自 #300 的 AI 六号，不在已落盘 5 条非赛道样本内）。

#### 反面教材（Anti-Patterns）

| 反例 | 文本 | 病在哪 | 按三轴改写 |
| --- | --- | --- | --- |
| **302 原文案**（#244 R2 裁决「只是快了」：同 instruct、同语速下听着仍慢） | DeepSeek just dropped V four point one Flash, with a new architecture and native multimodal. | 轴1 首分句是「发布 + 对象」顺叙，冲突没落地；轴2 **N/A**（无度量数字——「new architecture」无对照物属对照质量问题，不计轴 2） | 同上方 303 落地改写（先落冲突、版本号写阿拉伯数字形式，两处机检风险一并解决） |
| **平静陈述句开场**（#278 明令不满足） | 泛指：`X 公司今天发布了 Y 模型` | 轴1 铺垫先行，1.5s 内无冲突 | 结果先行：把 Y 的反常之处提到第一句 |
| **续集式钩子 / 不自足**（Step 0 hook 预览门禁拦下的那一类，见 Stage 3 Step 0） | 泛指：承接上一条的数字/悬念，陌生观众缺前置 | 陌生观众听不出「发生了什么」 | 本包自足：hook 只由本包素材支撑；跨包引用需用户显式授权（Stage 3 Step 0） |
| **裸报大数字无锚点**（#278 硬性要求 1 的反面） | 泛指：`它训练用了 10T tokens` | 轴2 绝对量无参照系 | 补锚点：10T tokens, twice what GPT-5 used. |

## Hook 媒体策展（#299）

Hook 媒体是**逐包人工策展**，不靠通用搜源（`asset-sourcer` 结构上跳过 hook）。每条视频的 hook 封面必须对应本集主题（公司/产品/事件）：优先官方主视觉、模型海报、真页面截图；其次暗调、高对比、有动势的库存图/视频。

**绑定配方**：把选定文件放进 `scripts/short-video/content/{slug}/assets/`，在 scene 1 写：

```js
media: {
  type: "image",          // 或 "video"
  path: "assets/<file>",  // 相对 content/{slug}/，不是全局 assets/
  source: "<出处>",       // 归因；缺失 preflight 与最终 gate 都会 WARN
  animation: "ken-burns",
  overlay: 0.7,           // 建议 0.5–0.85
  fit: "cover",
}
```

预绑定的 `media` 优先，且不会被自动补位覆盖。

**可读性**：hook 模板自带 bigNumber + numberLabel，媒体要退到背景层。`overlay` 建议 0.5–0.85（显式值超出 0.4–0.9 时 preflight WARN；缺省由渲染器取 0.7）；`fit` 只接受 `cover`（缺省）与 `contain`（`fill`/`none`/拼错值 preflight FAIL）。hook 与正文同构：正文声明了 contain 的 pack，hook 也用 contain；未声明正文 `fit` 的 pack，hook 按自身源宽高比取 contain/cover（#963）。不要设置 `mode: "fullscreen"`：渲染端在该模式下把 overlay 归零，满屏素材会直接压住大字。

**素材库现实**：`scripts/short-video/assets/` 是全局库（约 275 文件 / 297MB，含暗调通用背景），但 `catalog.yml` 目前只有 7 条、RAG 只能搜到这 7 条。完整素材库与索引是 #310，不在本票范围；手工挑图时按文件名浏览、打开确认，不要假设 RAG 能搜到。

**豁免与兜底**：纯文字 hook 写 `media: null` 显式豁免；生成兜底允许 `b-roll` / `asset-then-broll` / `ai-image` / `asset-then-ai-image`。预检与最终 media gate 的判定表只在 `docs/content-pipeline.md` → Hook 媒体策展（#299）维护，本节只给策展标准。

---

## Step 6: 优化 CTA

CTA 公式：`[Action Verb] + [What They Get]`

| 类型                | 示例                                                                    | 效果                     |
| ------------------- | ----------------------------------------------------------------------- | ------------------------ |
| ❌ 通用 CTA         | "Follow for more China AI."                                             | Dead closer，无具体收益  |
| ✅ 具体 CTA         | "Follow for Part 2: what happens when 382M users get an AI agent."      | 告诉观众关注后能得到什么 |
| ✅ Loop-closure CTA | "ByteDance put an AI agent inside every Feishu. Will your boss notice?" | 制造重看冲动             |
| ✅ Specific ask     | "Comment which Chinese AI company I should cover next."                 | 驱动评论互动             |

**规则**：CTA 回扣 Hook 的关键词或主题。系列视频 CTA 预告下一集。

**视觉约定**：CTA scene 的所有文字（brand、tagline、action、topic）必须居中对齐。`CtaScene.tsx` 中每个文字 div 都需要 `textAlign: "center"`——外层容器的对齐不会穿透到内层 block div。漏加会导致 topic 或 action 文字左对齐，破坏 end card 的视觉对称。

---

## 数字人（scene.avatar）使用策略

是否声明 `scene.avatar`（数字人主持人）由脚本 Agent 按本节策略判断，`plan dry-run` 时用户可改。证据基础见 `docs/research/dh-presenter-usage-strategy-research.md`（85 源，2026-09）。

**定位（硬约束）**：数字人是**频道品牌符号/解读框架呈现者**——点题、解读观点、CTA。不做拟真"记者人设"，文案与视觉不得暗示是真人主播。新闻解读是 AI 主持人接受度最低的内容类型（Reuters：虚拟主播舒适度 19%），程式化/数据型时刻是可接受区（国内调查：超四成支持 AI 播快讯类）。

**声明白名单**（符合其一才考虑声明）：

1. **CTA scene**——证据最强（CTA 直视"脸"比压在 b-roll 上转化好 40%，单源实验）；默认首选
2. **关键论点/payoff 时刻**——短暂在屏点题，随后切出
3. **程式化数据时刻**——榜单、数字、快讯型 scene

**声明黑名单**（不要声明）：

1. **hook 段前 3 秒**——人脸效应小且 30s 转负，人声 hook 效应强一个量级（前 3 秒人声 10s 留存 +24.7%）；开场交给素材+TTS
2. **高情感叙事段**——情感性时刻观众不接受 AI 面孔
3. **突发新闻表述/观点冲突段**——接受度最低档且信任风险最高

**频次与节奏**：30-60s 包内出镜段 **2-4 个**；present 区间对齐单段 ≤3-5s 的构图变化节奏，段内"在屏 ⇄ 素材满屏"切换。注意："AI 面孔 3 秒法"的精确数字是单源传言（见调研 Key Finding #1），依据的是定性方向 + pattern interrupt 节奏，不是 3 秒阈值本身。

**优先级警示**：TTS 音色拟真度是第一杠杆（教育学 30 年研究：起作用的是声音不是形象）；数字人是第二杠杆。音色档位没达标时先优化音色，不加数字人。

**合规**：发布侧 AI 标识为硬约束（中国 2025-09-01 强制双标识；TikTok C2PA 自动标注不可移除）——由发布链路处理，脚本侧不做伪装性设计。

---

## Declared b-roll prompt 写作协议（scene→prompt 适配）

生成类 `mediaStrategy`（`b-roll`／`asset-then-broll`／`ai-image`／`asset-then-ai-image`）必须声明 `aiVideo.prompt` 或 `aiImage.prompt`（字段随策略分派）。这个 prompt 是「scene → 画面」的适配层：它看的不是 scene 的信息结构，而是**观众要看到的那段画面**。#289 质量闸（warn 级，preflight 仍 exit 0）会对**只写主体、没有镜头**的薄写和**跨 scene 逐字复用**发声。

### 8 维契约（单一事实来源 = 代码，勿在此重抄常量）

维度定义在 `docs/video-production-runbook.md` → "The 8-dimension prompt"：SUBJECT · VISUAL METAPHOR · BRAND · REFERENCE · CAMERA · MOTION · LIGHTING · NEGATIVE。**归属**（#166 layer 2，`scripts/short-video/lib/b-roll/prompt-injection.mjs`）：

- **SUBJECT / VISUAL METAPHOR / REFERENCE**——100% agent 创作（本协议覆盖）。
- **CAMERA / MOTION / LIGHTING**——agent 写；代码只**导出建议**（`VISUAL_TYPE_DIMENSION_DEFAULTS`，按 `visualType` 给 camera/motion/lighting），**从不注入**。写不出时用 `dimensionDefaultsFor(scene.visualType)` 取建议再改写成贴合本 scene 的词，不要照抄。
- **NEGATIVE / BRAND**——**代码拥有**（按缺失组去重注入 / 条件注入），**不要手写**（重复会被 `coversNegativeGroup` 去重，或让 BRAND 整段被跳过）。

### 按 visualType 写什么

先定 SUBJECT（本 scene 特有的主体，不是 scene 类型的通名），再补一条 **CAMERA 或 MOTION**（质量闸的硬信号），最后按需补 VISUAL METAPHOR / LIGHTING / REFERENCE。

`visualType` 取值很多（>`hook`/`narrative`/`data`/`stat-reveal`/`info-card`/`quote`/`context`/`contrast`/`comparison`/`cta` 等，含各包自定义值），但**镜头建议只按 7 个 canonical 桶**给（`VISUAL_TYPE_DIMENSION_DEFAULTS` 的键）；不在表内的 visualType 回落到 `narrative` 桶。重心如下：

| canonical 桶（`VISUAL_TYPE_DIMENSION_DEFAULTS` 键） | prompt 重心                                                     |
| -------------------------------------------------- | --------------------------------------------------------------- |
| `hook`                                             | 冲击力主导：单一强主体 + 快推近；避免静态平铺                   |
| `narrative`（含所有非表内 visualType 的兜底）      | 叙事动作：一个清晰方向的动作流，镜头随之运动                    |
| `data` / `stat-reveal`                             | 数据元素可视化：数字**不进 prompt**（移入 `texts`），画面表现"变化/增长/对比"本身 |
| `contrast` / `comparison`                          | 两侧对撞：对称构图 + `whip-pan`/分屏，用色温或明暗区分两侧       |
| `cta`                                              | 收束：缓拉远的稳定画面，留给品牌 end card                      |

具体 camera/motion/lighting 词面以 `VISUAL_TYPE_DIMENSION_DEFAULTS` / `dimensionDefaultsFor(scene.visualType)` 为准，改写成本 scene 的词，不要照抄。

### 反模式（质量闸会 warn，评审会打回）

1. **subject-only 薄写**：只有主体 + 风格词，没有任何镜头景别/运动（如 `data visualization dashboard, digital analytics, tech interface`）。至少写一条 CAMERA 或 MOTION。
2. **跨 scene 逐字复用**：多条 scene 用同一句 prompt（复用等于放弃适配层）。每条 prompt 必须围绕**本 scene 自己的主体**重写。
3. **手写 negative / brand**：`no text`、`no watermark`、品牌底色等由代码注入，手写属重复或覆盖。

---

## Step 7: 运行 MRL-2 自审

写完全部 scene 后，运行 `content-pipeline.md` Stage 3 的 MRL-2 检查循环（机检门 + `🧭 Editorial Suggestions` 两层，分层口径见该节）。W7 检查 open loop、W8 检查 pattern interrupt、W9 检查 loop closure；这三项属于编辑建议层——缺失不阻塞渲染，但 Agent 应在 HITL 报告里补充说明。0 Blockers 后进入 Stage 4。

---

## 诊断清单：脚本不好时检查什么

按优先级排序（最高优先级在前）：

| #   | 检查项                     | 怎么诊断                                         | 怎么修                                          |
| --- | -------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| 1   | **没有 open loop**         | Scene 2 是否制造了未解悬念？                     | Scene 2 加 tease                                |
| 2   | **没有 pattern interrupt** | Scene 4-5 是否都是同质的数据陈述？               | 加一个 tonal shift                              |
| 3   | **没有 loop closure**      | 最后内容 scene 是否回扣 Hook？                   | 让收尾引用 Hook 中的关键词/数字                 |
| 4   | **Teleprompter rhythm**    | 统计每个 scene 的 VO 词数，标准差是否 <15%？     | 在 15 词行之间插入 3-5 词 punch line            |
| 5   | **Show 段没有视觉证据**    | Show scene 是否只有文字描述？                    | 找产品截图/演示视频                             |
| 6   | **Peak 不突出**            | Peak scene 视觉上和其他 narrative 一样？         | 用不同的 layout 或 badge                        |
| 7   | **通用 CTA**               | 最后一个 scene 的 CTA 是否是 "Follow for more"？ | 换成具体 ask 或 loop-closure                    |
| 8   | **Hook 只用一种公式**      | 最近几个视频的 hook 是否都是 shocking number？   | 轮换到 contradiction / curiosity gap / question |

---

## 与现有规则的关系

| 规则来源                                                     | 管什么          | 和本指南的关系                                            |
| ------------------------------------------------------------ | --------------- | --------------------------------------------------------- |
| `scene-rules.mjs`                                            | 硬性结构检查    | **不替代**——本指南在 scene-rules 之上提供叙事方法论       |
| `scene-templates.mjs`                                        | 视觉模板实现    | **不替代**——本指南指导写什么文字，模板决定怎么渲染        |
| `tiktok-rules.mjs`                                           | TikTok 平台规则 | **不替代**——本指南关注叙事质量，tiktok-rules 关注平台合规 |
| `content-pipeline.md` Stage 3                                | 操作流程        | **被引用**——本指南是 Stage 3 Step 2-5 的方法论            |
| `docs/research/short-video-script-writing-best-practices.md` | 研究依据        | **引用**——本指南是研究结论的操作化                        |

---

## Design Decisions & References

- **为什么不创建独立 skill**：按 `writing-for-agents` 原则，新 skill 如果 model-invoked 会永久占 context load。此文档作为 disclosed reference 被 `content-pipeline.md` 引用，agent 只在 Stage 3 时加载。
- **S.T.A.R.T. 为主框架的原因**：15 源验证的创作者社区共识最高框架。AI Outline 来自 TikTok 官方 Creator Search Insights（2026-08-27 实测验证），是平台数据的工具化输出，作为 **opt-in 工具输入**消费（默认不启用）——opt-in 时 Agent 拿到用户抄回的 AI Outline 后按消费映射表提取内容建议，而非用其结构替代 S.T.A.R.T.。
- **为什么每个 scene 有素材要求**：之前 scene 的 media 字段是事后填充的——先写 voiceover 再找图。现在每个 scene 在设计时就定义素材需求，让脚本驱动素材收集，而不是素材适配脚本。

**assetNeed / searchHints 约定（Stage 3 默认实践，#354）**：每个 sourcing-eligible scene 默认拥有认领供给——asset-sourcer 对没有绑定 `media.path`、且不是纯生成策略（`b-roll` / `ai-image`）的场景，在缺省 `assetNeed` 时从 voiceover 派生 claim（claim 文本就是该 scene 的 voiceover 本身，不另造英文描述；查询词由确定性分词给出，best-effort）。因此 `assetNeed` 是**覆盖**而不是供给开关：显式写 `assetNeed: "一句英文视觉描述"` 仍然决定 VLM 的相关性判据（比分词器更懂画面），不写也不会再掉进「无认领 → fail-closed」；存量包不需要回填，派生按需发生。

`searchHints?: string[]`：写稿时由你从 voiceover 提炼的英文检索短语（它是**覆盖**，可以不完全取自 voiceover，但必须与 claim 同指），按**具体 → 泛化**排序（如 `["unitree h1 humanoid robot", "humanoid robot factory", "warehouse automation"]`），最多 4 条、每条最多 4 个词。asset-sourcer 用它们替换 claim 分词出来的查询短语（顺序即尝试顺序；VLM 仍按 claim 打分）。只放宽、不过窄；不要写纯风格词（`cinematic` / `dark blue`）或裸泛用词（`robot` / `object`）——preflight 的 `Search hints schema` 会 FAIL 掉不可用的条目（拼写错误、非数组、空列表、超过 4 条、单条超过 4 个词、分词后无法检索的短语），也会 FAIL 掉写在「没有认领路径」的场景上的 `searchHints`（hook / 文本优先版式 / `media: null` / 已绑定媒体且无显式 `assetNeed` / 纯生成策略（`b-roll` / `ai-image`，即使写了 `assetNeed` 也不采购）/ 既无 voiceover 也无 `assetNeed`——声明了也没有任何东西读它），以及字段名拼错（`searchHint` / `search_hints`）。

素材标注不要写进 voiceover（TTS 会读出来，scene-rules B13 会 FAIL）。VLM 判的是**画面主体是不是 claim 要的那类东西**（公司 / 产品 / 人物 / 地点 / 物体），不要求拍出旁白里的抽象事件（融资、战略调整、招聘计划）；外语界面文字不算负面证据，官方中文 UI 截图反而是强证据。40–59 分属 borderline，会再跑一次「画面主体」二度校验，`match` 才准入；分数缺失或解析失败记 UNAVAILABLE，属工具问题、先修 analyzer 而不是换图。宁缺毋滥：scene 保持纯 CSS 是合法结果（见 `docs/content-pipeline.md` → 8b）。

**版式与素材职责（Stage 3 必填实践，#761）**：`narrative/stacked-cards` 与 `contrast/hero-center` 是**文本优先版式**——`scene.media` 只作为全幅暗化背景垫在文字块下面，证据类素材（图表、表格、页面截图、必须看清的官方图）放进去会被卡片或对比栏遮住，等于没给。因此这两个版式**禁止声明 `assetNeed`，也禁止绑定 `media.evidence: true`**；preflight 的 `Text-first layout media routing` 会直接 FAIL，并给出三选一修法。需要证据的拍必须路由到有独立媒体视窗的版式：`narrative` 用 `media-bottom-bar` / `media-split` / `media-overlay`，整屏素材用 `visualType: "fullscreen"` 或 `media.mode: "fullscreen"`（后者绕过版式，文字只剩 source 标注）。只要氛围的拍删掉 `assetNeed`、绑定一张 stock/实拍背景（或保持纯 CSS）即可；确定不要素材就**同时**删掉 `assetNeed` 并写 `media: null`——只写 `media: null` 不解除门禁。判据是「这一拍是否真的要让观众读清一张图」，不是素材文件名听起来像不像图表。

**mediaStrategy 约定（Stage 3 默认实践，#355）**：**不需要逐 scene 选策略**。省略 `mediaStrategy`（或沿用旧值 `"asset"`）就走统一兜底链：采购（stock video 优先）→ 复用/upscale → 生成（默认 T2I + ken-burns；写了 `aiVideo.prompt` 且视频预算允许时 T2V）→ 纯版式。链上生成默认**每次运行 4 个场景 / 1 条 T2V**，且必须先出 plan、由用户确认后才花 GPU（`--approve-auto`）。字段只作覆盖：`"source-only"`（只采购、绝不生成，旧 `"asset"` 的语义）、`"b-roll"` / `"ai-image"`（跳过采购直接生成）、`"asset-then-broll"` / `"asset-then-ai-image"`（先采购、落空再按指定形态生成）。显式生成策略必须配 prompt，字段随策略分派——T2I 两值用 `aiImage.prompt`（6 维），其余用 `aiVideo.prompt`（8 维）；链上自动生成的静图 prompt 依次取自 `aiImage.prompt` / `assetNeed` / voiceover，所以把 `assetNeed` 写具体也等于给生成 rung 一个更好的主体。preflight 的 **B-roll strategy contract** 只校验显式值：未知值 FAIL、显式生成缺 prompt FAIL；省略 `mediaStrategy` 不再 WARN。

**截图证据约定（Stage 3 素材选项，2026-10-14 用户裁决）**：某个 scene 的断言建立在某个具体公开页面上时——官方变更日志、当事人帖子、第三方归档、监管文件——该 scene 的素材就是这个页面的**真实截图**：「谁主张、谁出示」。它是素材菜单里的一项，不是优先规则：非证据 scene（分析、对比、收尾）照旧走 CSS 或 stock，用不用截图由 Agent 按脚本判断。真实截图不重构、不伪造产品页面；示意图只在明确风格化时使用，且不与截图混用。

- **语言规范**：能用英文就用英文——站点有英文 UI 或帖子有英文原文时，截图必须落在英文形态上（帖子要先切回原文再截，见下）。站点只有中文时（无英文路由、无语言开关），中文界面截图直接采用，不需要为截图去改账号设置。这是生产规范，不是偏好。
- **抓取**：**默认走 `capture-evidence-shot.mjs`**（Playwright + 系统 Chrome，用 `EVIDENCE_CAPTURE_CHANNEL` / `EVIDENCE_CAPTURE_EXECUTABLE` 指定浏览器）。它只适用于公开页面；需要登录态、站点经验或页面交互时，才退回 `web-access` CDP（自动化 profile）手动路径——手动路径先读站点经验（`~/.agents/skills/web-access/references/site-patterns/<domain>.md`），没有就按通用模式操作并把验证过的事实写回去。
- **隔离与裁切**：确定性路径由 `selector` 隔离目标元素，工具按元素边界加 `padding` 裁切并记录 `rect` / `clip`；不要手动隐藏兄弟节点，也不要按固定高度裁切。只有手动路径才需要隐藏浏览者界面元素（导航、译文行、悬浮按钮）并回到页面顶部，裁切点落在元素边界上——卡片高度差异很大，按固定高度裁切必然把配图或视频切一半。
- **确定性捕获**：截图配方写进 `content/<slug>/evidence-captures.json`（纯数据文件，不是模块），按 scene id 键控 `url` / `selector` / `padding` / `viewport` / `deviceScaleFactor` / `waitUntil` / `timeoutMs`，不要手写几何。最小形状：`{ "3": { "url": "https://…", "selector": "table" } }`，其余字段取默认值（padding 16 / scale 2 / viewport 1280×900 / waitUntil load / timeout 30000ms）；未知字段直接报错，不会静默忽略。配方里的 url / selector / deviceScaleFactor 会与 scene-data 已声明的 provenance 对账，不一致即拒绝；one-off 捕获后把同一组 url / selector 写进 JSON，否则 `--check` 会报 no capture recipe。`media.evidence: true` 的 scene 没有配方条目就是缺口：pack 模式与 `--check` 都以 exit 1 报「no capture recipe」，历史预合成图用 `composed: true` 声明豁免。新页面先跑 `node scripts/short-video/capture-evidence-shot.mjs --url <http(s)> --selector <sel> --output scripts/short-video/content/<slug>/assets/<name>.png`（`--output` 相对当前工作目录解析，不是相对 pack）取得第一份 provenance block，粘进 scene-data 的 `media.provenance`，并设 `media.evidence: true`。
- **重捕获与校验**：`node scripts/short-video/capture-evidence-shot.mjs --content <slug> [--scene <id>]` 只补缺失文件；`--force` 全量重截；`--check` 不开浏览器，只校验文件字节与已声明几何。漂移检测只在 producer 真正运行时发生（文件缺失，或显式 `--force`）：已存在的文件在 final gate 只与它自己的声明对账（`clip × scale` vs 实际像素），不会重新打开页面——要确认实时页面是否已经变了，必须 `--force`。Stage 1.5a 在 stock sourcing 之前运行，`media.evidence: true` 的 scene 永不回退到 stock；一份坏配方只报错并继续捕获其余 scene，不会拖垮整批。
- **硬失败**：选择器命中 0 个或多个、页面重定向到别的 URL、实测几何与声明漂移超过 0.5px，都直接失败——不写文件，打印可粘贴的新 provenance block，重录后更新 scene-data。缺文件或捕获失败由 final media gate 拦截，不会用 stock 顶替。
- **手工截图的证据边界**：手工路径截出的图无法携带 producer 验证的 provenance，不得标 `media.evidence: true`，也不要为它手写 provenance；它可以作为非证据插图使用，但不能充当「页面实证」。
- **不做预合成**：不要手工拼 880×814 画布，构图交给布局的 `fit` 与安全区（#663/#668）。`composed: true` 只用于历史预合成证据图并跳过像素对账——新捕获不得设置。
- **落档**：截图写入 `content/<slug>/assets/`，在共享的 `scripts/short-video/assets/catalog.yml` 补条目（source 写 URL + 抓取日期，license 写「editorial/evidence use」；目录是 RAG 索引的输入，写错位置截图进不了语义检索），并在 `docs/refs/source-materials/<slug>-sources.md` 记录抓取方式与每个数字的页面口径。

**asset-sourcer 当前限制（2026-09-03 实测）**：

- 中文新闻 CDP 源（如量子位 `qbitai`）`supportsKeyword=false` 且未在 `CDP_MEDIA_CAPABILITIES` 中注册 → asset-sourcer 无法按关键词搜索这些源，只能全量抓取最新文章列表
- `claimToKeywords` 从 `assetNeed`（或 #354 派生的 voiceover）生成英文视觉概念短语，不包含中文产品名/公司名 → 搜不到中文新闻站点的官方图片
- 量子位等站点图片有 Referer 保护，下载链路不发送 Referer header → 403 AccessDenied
- **手动 fallback**：从量子位文章手动下载图片时加 `-H "Referer: https://www.qbitai.com/"` header；下载后放入 `content/<topic>/assets/` 并在 scene-data 的 `media` 字段手动绑定
- **改进方向**（未实现）：给中文新闻 CDP 源添加 `supportsKeyword=true` + 搜索 URL；`claimToKeywords` 融合 scene 的公司实体中文名；下载链路按源域名添加 Referer header

**视频素材搜索限制（2026-09-03 实测）**：

- 抖音、小红书、微博的 yt-dlp 下载被禁用（`YTDLP_VIDEO_CAPABILITIES` 只允许 bilibili 和 youtube）→ 中文社交平台视频无法自动获取
- 中文新闻 CDP 源只有 `imageScript`，没有 `videoScript` → 无法从新闻站点抓取视频
- Pexels/Coverr/YouTube/B站 搜英文关键词返回通用 stock 视频，VLM 相关性审查通常全部拒绝
- **当前状态**：视频素材几乎只能靠手动提供。中文新闻事件视频需用户手动下载后放入 `content/<topic>/assets/` 并在 scene-data `media` 字段绑定
- **改进方向**（未实现）：给中文新闻 CDP 源添加 `videoScript`；按平台政策启用抖音/小红书 MCP 视频下载
- **研究报告 vs 操作指南**：研究报告是 "为什么"，本指南是 "怎么做"。两者互补。
