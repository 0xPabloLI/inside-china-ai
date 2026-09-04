# Ponytail 最小实现规则引入提案（v4，已批准试点）

> 状态：**试点进行中（2026-09-03 启动）**。§5 文本已落地：A-lite/D → `implementation-workflow.md` §6 步骤 2，B-lite → §8 步骤 3，试点路由 → §9 步骤 3；试点记录 `docs/reviews/ponytail-lite-pilot-2026-09.md` 已创建。裁决按 §7 执行。
> v3 → v4 变更（吸收批准意见）：§5 增加**试点期临时路由句**（新 session 知道要回写试点记录）；§7 改为 A/B/D **逐条裁决**并给出各自验证门槛，禁止一条有效带动三条转正；§1 与 §3 删除两处无落地对应的表述。
> v2 → v3 变更：A-lite/根因规则前移到 TDD 之前（§6 步骤 1–2 之间）；B-lite 删除"可删除代码"残留；§3 证据表述改为"观察到同方向结果"并声明评测对象差异；§7 增加逐任务持久记录表与撤销门槛。
> 来源：[DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)（MIT，v4.9.0）。仓库事实基于本地克隆逐文件核对（2026-09-03；2026-09-04 复测体积分层）；独立评测已核到原文（§2.7）。
> **第三方复核材料**：`docs/reviews/ponytail-adoption-review-brief-2026-09-04.md`（上游分层体积实测、落地文本逐字引用、拒绝项证据、证据分级与自我反驳、吸收率三口径校准、Q1–Q7 待裁问题）。本提案是裁决依据的唯一真相源，brief 只引用不复制。

## 0. 评审裁决

| 改动 | 裁决 | 落点 |
|------|------|------|
| A 最小实现阶梯 | **精简后试点**（A-lite，在 TDD 之前执行） | `implementation-workflow.md` §6 步骤 2 |
| B 过度设计镜头 | **重写后并入 Standards 轴**（B-lite，不设第三审查轴） | `implementation-workflow.md` §8 步骤 3 |
| Bug 根因规则 | **修订后采纳**（bug 任务在选 seam 前执行） | `implementation-workflow.md` §6 步骤 2 前 |
| C 可默认即推进 | **拒绝，本提案不处理**——与最小代码无关，AFK 任务已有 `ready-for-agent` 完全定义门槛；另案提案须明确哪些默认值安全可逆，并排除安全、权限、发布、内容 HITL | 另案 |
| `ponytail:` 注释 | **不采纳**——JetBrains 80 试跑中该标记仅出现 1 次（§2.7），纸面义务无执行证据 | — |
| 一行横档 / `net: -N` 指标 | **不采纳**——少行不等于简单；上游安全对照显示裸 one-liner 指令漏掉路径遍历守卫（§2.6）；优化目标是认知复杂度和维护面，不是 LOC | — |

## 1. ponytail 靠什么影响 agent（本提案只取指令层）

| 层 | 载体 | 本提案是否采用 |
|----|------|----------------|
| 指令层 | `AGENTS.md` 核心规则集（33 行 / 2.6KB，自足） | 采用：改写为 A-lite / 根因规则，内联进 workflow |
| 命令层 | 6 个 skill，共 17KB，按需加载 | 只借 review 镜头思路，重写为 B-lite，不安装 |
| 管道层（送达层） | 宿主生命周期钩子：每轮重注入 + 子代理注入。事件名与配置方式随宿主而异，上游靠 20 份宿主适配器覆盖 | **规则本身不依赖**：纯文本落在 workflow，经 `AGENTS.md` 路由在实施前加载（§2.8） |

JetBrains Finding 1：skill 安装而不注入时自激活 0/10——效果取决于规则是否到达模型。本提案把规则放进按需加载的实施 workflow，属于"注入"路径，避开纯安装不自激活问题；长 session 与 subagent 传递是否稳定到达模型，仍由 §7 试点验证。

## 2. 已验证事实

1. **阶梯原文**（上游 `AGENTS.md` L5–13）：写码前停在第一个成立的横档——①需要存在吗（YAGNI）→ ②库内复用 → ③标准库 → ④平台原生 → ⑤已装依赖 → ⑥一行 → ⑦最小实现；阶梯在理解问题之后运行。评审裁决：⑥一行横档不引入，选择顺序压缩为 A-lite（§5），且必须在进入 TDD 前执行。
2. **豁免清单原文**（上游 `AGENTS.md` L30）：不可懒的是理解问题、信任边界校验、防数据丢失的错误处理、安全、可访问性、真实硬件校准、显式要求。
3. **bug 修复=根因原文**（上游 `AGENTS.md` L17）：改共享函数前 grep 所有调用方；只修 ticket 点名的路径会留下仍坏着的兄弟调用方。评审修订版见 §5 改动 D。
4. **B 与现有 Standards 轴的重叠（已核对 `~/.agents/skills/code-review/SKILL.md` L45–56）**：Standards 轴的 Fowler smell 基线已含 Duplicated Code、Speculative Generality、Middle Man 等，覆盖 ponytail-review 的 `delete:`/`yagni:` 与"可删除代码"大部；**v3 后 B-lite 只保留唯一真增量：重复标准库 / 平台原生能力（`stdlib:` / `native:`）**。
5. **上游自报基准**：真实 FastAPI+React 仓库、12 tickets、n=4、Haiku 4.5：LOC 均值 -54%、tokens -22%、cost -20%、time -27%、安全守卫 100%。局限：作者自选任务集、均值口径。
6. **上游安全对照**：裸 "YAGNI + one-liners" prompt LOC -33% 但安全守卫掉到 95%——少行激励的直接风险证据，评审据此否决一行规则与净减行指标。
7. **JetBrains 独立评测（2026-07-28，已核原文）**：Harbor + SkillsBench，80 paired tasks，Claude Code 2.1.201 headless + claude-sonnet-5 medium，ponytail v4.8.4 双臂锁定、规则注入经审计。结果：
   - 成本 **−10.3%（p=0.004，本评测中最强的省钱信号）**；模型输出文本 −13.8%（p=0.001）；代码 −15.4% 与时间 −10.6% **观察到同方向结果但未达常规显著**（p=0.088 / p=0.040 名义）。
   - 质量：无可检出差异（6 更好 / 9 更差 / 65 相同，p=0.61；**null ≠ 等效性证明**）。
   - **收益集中在有过度构建空间的任务**：基线 300+ 行的任务 −31.2%，20–99 行 −11.9%，已极简任务 ≈0。
   - `ponytail:` 注释 80 试跑出现 1 次；skill 纯安装自激活 0/10。
   - 范围限制（原文声明）：SkillsBench 以数据/分析/修复类任务为主，缺少前端过度构建陷阱；**该评测对象是完整 ponytail 注入规则集，不构成对上游 −54%（其自选任务集）的反驳**。
8. **宿主钩子能力（2026-09-04 补充，更正 §1 送达层判断）**：agent 宿主普遍提供生命周期钩子（会话开始、提示提交、工具调用前、子代理启动、上下文压缩前等事件；事件名与配置方式随宿主而异），可把规则文本每轮或按需注入模型上下文——上游用 20 份宿主适配器覆盖这一层。**本提案的规则文本不依赖任何宿主钩子**：纯文本落在 workflow，经 `AGENTS.md` 路由在实施前加载，换宿主后规则照旧可用。宿主若提供钩子能力，可选挂接做"每轮/子代理重注入"，属**可选送达增强**，不改变规则内容。试点期不引入钩子：它只解决"规则是否到达模型"，不回答"规则在本仓库是否有价值"（§7 试点任务）。

## 3. 判断与假设（v3 降级表述）

- JetBrains 结果**方向为正**：成本端证据较强（p=0.004），代码端仅观察到同方向、未达显著；**评测对象是完整注入规则集，不是本提案的三句 A/B/D-lite**，不能直接预期本仓库复制 −10~15% 的量级。
- 本仓库的过度构建频率未量化。A/B/D-lite 的实际价值由 §7 试点**定性 canary** 回答，不预设收益比例。

## 4. 冲突分析与采纳边界

- **A-lite 与 TDD 无冲突且先于 TDD**：TDD 管过程顺序（red→green 驱动设计），A-lite 在**选择 seam 时、进入 TDD 前**执行，决定用什么到达 green；§6.3"只写足以变 green 的实现"（`implementation-workflow.md:146`）已确立最小实现原则，A-lite 的增量只是**明确选择顺序**。测试代码属验证义务，不在可砍范围；测试范围由 §6.3、§7 与 scenario matrix 独占管辖。
- **不引入项**：人格段（纯先验包装）、测试条款（"一个 assert 自检"低于本仓库 R2/R3 要求）、lite/full/ultra 档位、全套插件安装（其送达层绑定具体宿主，与"规则随仓库走"的取向冲突，见 §2.8）、一行横档、`ponytail:` 标记、`net: -N` 指标、独立第三审查轴、B-lite 中与 smell 基线/Spec 轴重复的"可删除代码"检查。

## 5. 落地方案（执行时序与文本）

### §6 步骤重排（v3 修正）

现行 §6 步骤 1–3 调整为：

1. 读取 contract，复述 scope，记录 pre-work Git baseline（不变）；
2. **bug 任务先执行根因搜索（改动 D）**；随后选择 seam，**在选择时执行 A-lite 选择顺序（改动 A）**；seam 本身是设计问题时仍调用 `codebase-design`（不变）；
3. 进入 TDD（不变）。

A-lite 与 D 都发生在写实现之前：先想清楚"要不要写、在哪写、用什么写"，再让 TDD 驱动"怎么写对"。

### 改动 A（A-lite）：§6 步骤 2 的选择顺序

> 在读完被改动代码的真实调用流程、并满足已确认行为和验证义务的前提下，依次选择：无需新增代码、契约匹配的现有实现、标准库或平台原生能力、合适的已装依赖、最小自定义实现。若需新增代码，选择最高、最稳定的 public seam；seam 本身是设计问题时调用 `codebase-design`。不得用少行替代正确性、信任边界校验、防数据丢失的错误处理、安全、可访问性或测试。

（2026-09-04 微调，闭合上游对照发现的两处缺口：前半补"先读代码再选横档"——上游"懒于解法、不懒于读代码"；后半补豁免清单缺项——**信任边界校验**与**防数据丢失的错误处理**，即上游"lazy, not negligent"清单中此前未落入文本的两项。）

### 改动 D（根因规则）：§6 步骤 2 前置（仅 bug 任务）

> 修复前搜索定义和所有调用方；仅当调用方共享同一不变量时，在公共 seam 修复根因，否则保持调用方差异。

非 bug 任务本步骤 N/A（Gate 语义的 conditional N/A，不称"跳过"）。

### 改动 B（B-lite）：§8 步骤 3 的 Standards 轴增量覆写（v3 缩范围）

> Standards 轴额外检查 diff 是否用自定义代码或依赖重复标准库、平台原生能力；只报告存在行为等价且可验证替代的项。

（"不影响 Spec 的可删除代码"检查删除：与 Speculative Generality、Middle Man 及 Spec 轴重复。）

### 试点期临时路由句（已落 `implementation-workflow.md` §9 步骤 3，裁决后删除）

> 试点期间（§7：5 个实施任务或 4 周窗口），每个实施任务完成后，将本次 A-lite / B-lite / D 的结果追加到 `docs/reviews/ponytail-lite-pilot-2026-09.md` 的逐任务记录表；试点裁决完成后删除本句。

落点修正（v4 执行时确定）：**§9 收尾顺序步骤 3，不是 §6 步骤末尾**。理由：B-lite 的 finding 在 §8 review 循环才产生，§6 末尾回写时 B 栏必为空；§9 在 §8 之后，A/B/D 三栏齐了才回写。

### 改动 C（拒绝，另案记录）

本提案不处理"可默认即推进"。另案提案须回答：哪些决策类别存在安全可逆默认、如何排除安全/权限/发布/内容 HITL、与 issue tracker `ready-for-agent`（完全定义门槛，`docs/agents/triage-labels.md:18`）的衔接关系。

## 6. 影响面

| 文件 | 改动 | 下游消费者 | 最坏后果与对策 |
|------|------|-----------|----------------|
| `docs/agents/implementation-workflow.md` | §6 步骤 2 插入 D 与 A-lite（先于 TDD，并修正 seam 选择与"无需新增代码"的顺序冲突）、§8 步骤 3 附 B-lite 一行、§9 步骤 3 附试点期路由步（裁决后删除）、文末 §12 增设 L2 指针 | AGENTS.md Workflow Router #3 的读者；所有实施 session；**code-review Standards 轴把本文件读作 standards source** | A-lite 被误读为可替代 TDD → 文本首句即以"已确认行为和验证义务"为前提；B-lite 与 smell 基线重复 → v3 已缩到 stdlib/native 唯一增量 |
| `docs/reviews/ponytail-lite-pilot-2026-09.md` | 试点启动时创建（§7），并登记 DOCS-INDEX | 试点裁决 | 无 |
| `docs/DOCS-INDEX.md` | 上述两行同步 | 文档索引 | 无 |
| `AGENTS.md`、Matt skills（`implement`/`tdd`/`code-review`）、`docs/conventions/*` | **不改** | — | 按 §2 既有规则"长期项目适配只写在本文件" |

## 7. 试点计划（v4：持久记录 + 逐条裁决门槛）

### 范围

后续 5 个实施任务，覆盖 S1 与 S2 各至少 2 个、R2/R3 至少 2 个；不足 5 个按 4 周窗口截断。小样本只用于**定性 canary**（发现明显失败模式），不证明收益比例（JetBrains Finding 6：10 任务 smoke 曾给出完全反向结论）。

### 逐任务持久记录

试点启动时创建 `docs/reviews/ponytail-lite-pilot-2026-09.md`（登记 DOCS-INDEX，试点期 active，裁决后归档），每个实施任务追加一行（回写动作由 §5 试点期临时路由句驱动，任务完成时执行，不依赖 session 记忆）：

| task | S级 | R级 | A-lite 最终选择及放弃的替代 | B-lite 独有 finding（接受/拒绝理由） | 错误 seam 返工 | bug 任务？D 是否实际触发 |
|------|-----|-----|------------------------------|--------------------------------------|----------------|--------------------------|

### 裁决门槛

- **立即撤销（hard gate）**：出现可归因于 A-lite/D 的安全、正确性或错误处理回归（red 测试或 review finding 归因于省略校验/省略处理），不等试点期满。
- **逐条裁决，不捆绑**：A-lite、B-lite、D 各自独立出结论（转正 / 修订后再试 / 撤销）。一条有效不得带动其余两条转正；一条无效也不否定其余两条。
- **各条验证门槛**（未达到即标记"未验证"，不得转正）：
  - **A-lite**：至少一次实际改变实现选择——记录表"最终选择及放弃的替代"栏出现因本规则选择了与初始倾向不同的方案，否则标记未验证。
  - **B-lite**：至少一个独有且被接受的 finding，否则标记未验证。
  - **D**：至少一个 bug 任务实际触发（记录表"D 是否实际触发"为是），否则标记未验证。
- **"未验证"的解读**：D 在窗口内无 bug 任务即按未验证处理；未验证不构成采纳证据，也不构成否定证据。小样本只用于发现明显失败模式（JetBrains Finding 6：10 任务 smoke 曾给出完全反向结论），不证明收益比例。
- **零 finding 解读**：B-lite 无 finding 说明代码本已精简或与 smell 基线重复；增量价值以"独有 finding 是否出现并被处置"衡量，而非 finding 数量。
- **期满裁决**：5 任务记录齐后小结，对 A/B/D 各出一条结论——转正（保留并去掉"试点"标注）/ 修订后再试 / 撤销（回退 §6/§8 对应增补行，不株连其余两条）。裁决完成后更新本提案状态、同步 DOCS-INDEX，并删除 workflow 中的试点期临时路由句。

## 参考

- 上游仓库：<https://github.com/DietrichGebert/ponytail>（MIT）；本地核对克隆 `/tmp/ponytail-review/`：`AGENTS.md`、`skills/ponytail/SKILL.md`、`skills/ponytail-review/SKILL.md`、`README.md`、`hooks/`。
- 上游基准方法：`benchmarks/results/2026-06-18-agentic.md`（README 内链）。
- **独立评测**：JetBrains AI Blog，"Ponytail Skill for Claude Code: Does It Really Cut Agent Code by 54%?"，2026-07-28，<https://blog.jetbrains.com/ai/2026/07/ponytail-skill-claude-tested/>（同系列 Part 1 caveman、Part 2 rtk）。
- 本仓库：`docs/agents/implementation-workflow.md`（§6/§8 为落点）、`~/.agents/skills/code-review/SKILL.md`（Standards 轴 smell 基线，L45–56）、`docs/agents/triage-labels.md`（`ready-for-agent` 门槛）、`docs/agents/proposal-review.md`（本提案格式依据）。
- 方法论：`~/.agents/skills/writing-for-agents/SKILL.md`。
