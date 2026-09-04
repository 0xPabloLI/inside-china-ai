# 独立复核材料：ponytail 规则引入与改造（2026-09-04 session 交付，**v2**）

> 用途：交给未参与本工作的第三方 Agent 或人做独立 review。本文自包含——reviewer 不需要读对话历史。
> 仓库：`inside-china-ai`｜分支：`main`｜上游：[DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)（MIT，210 commits）
> **v2（2026-09-04）按第一轮第三方复核重写**。v1 有三处硬错已更正：① 错述 JetBrains 评测对象（不是 33 行内核，见 §4.1）；② 体积分层不闭合且不可复现（见 §1，现固定 SHA 且合计 100%）；③ hooks 证据引用了错误产品（写成了另一款工具，见 §6.3，现为当前宿主官方文档）。另按 Q1/Q3/Q5/Q7 裁决重写了试点门槛（§6.1）与 shrink 的拒绝理由（§2）。**变更清单见 §10。**
> 上游事实基于固定 commit `2ed6c52c9d7e5e56942508591085fd45dea277d3`（v4.9.0）实测，不是二手转述。
> 相关文件：`docs/research/ponytail-minimal-code-adoption-proposal.md`（提案，规则文本与不采纳项的真相源）、`docs/reviews/ponytail-lite-pilot-2026-09.md`（试点记录与**裁决门槛的真相源**，当前 0/5 任务）。

---

## 0. 一句话摘要

我们把上游 33 行指令内核中的 **3 条规则**（选择顺序 / bug 根因 / review 的 stdlib 重复检查）改编后内联进本仓库的实施 workflow，共 871 字节；**拒绝了它的分发层、度量层、包装层，以及 2 条有安全或证据问题的规则**。

改动是纯文档、可逆、带 hard gate。**本仓库对这三条规则的本地证据为零——试点尚未开始**（§6.1）。

⚠️ **v1 的一处核心论点已被撤回**：v1 称"我们保留的 0.05% 是唯一被独立评测覆盖的那一层"。**这是错的**——JetBrains 评测注入的是 ponytail 钩子生成的 full-mode 规则集，并未隔离验证紧凑的 `AGENTS.md`，更未验证我们的三条改编规则（§4.1）。因此**外部证据无法为我们的改造背书**，只能提供方向性参考。

---

## 1. 上游是什么：分层解剖

按体积实测（固定 commit `2ed6c52c9d7e5e56942508591085fd45dea277d3`，159 个文件，合计 **1,636,232 字节**，含隐藏目录，分类无遗漏、无重叠）：

| 层 | 内容 | 字节 | 占比 | 是否产生效果 |
|---|---|---:|---:|---|
| **指令内核** | `AGENTS.md` 33 行：7 档阶梯 + bug 根因 + 8 条 Rules + 豁免清单 | **2,593** | **0.16%** | ✅ 规则本体 |
| **命令层** | `skills/` 6 个 skill（ponytail / review / audit / debt / gain / help）+ `commands/` | 21,550 | 1.32% | 承载内核的按需调用 + 3 个度量命令 |
| **管道层** | `hooks/` 11 个文件（activate / mode-tracker / subagent / instructions / runtime / statusline） | 30,365 | 1.86% | 保证内核每轮与向子代理注入——只解决"送达" |
| **分发层** | 13 个宿主适配器目录、MCP server、`pi-extension/`、`scripts/`、插件元数据 | 91,303 | 5.58% | 适配，不产生效果 |
| **文档与营销** | `README.md` / `.es.md` / `.ko.md`、`docs/`、`LICENSE`、`after-install.md` | 74,294 | 4.54% | — |
| **度量与证据** | `assets/`（1.07MB 图片）、`benchmarks/`、`tests/`、`examples/` | 1,402,636 | **85.72%** | 证据与展示 |
| **其他** | `__init__.py`、`.github/`、`.gitignore`、`.env.example` | 13,491 | 0.82% | — |
| | **合计** | **1,636,232** | **100.00%** | |

复现脚本见 §8（固定 SHA、遍历含 dotfiles）。

**核心规则的原文**（`AGENTS.md`，逐字引用，这是我们全部改造的输入）：

```
Before writing any code, stop at the first rung that holds:

1. Does this need to be built at all? (YAGNI)
2. Does it already exist in this codebase? Reuse the helper, util, or pattern that's already here, don't re-write it.
3. Does the standard library already do this? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Can this be one line? Make it one line.
7. Only then: write the minimum code that works.

The ladder runs after you understand the problem, not instead of it: read the task and the code it touches, trace the real flow end to end, then climb.

Bug fix = root cause, not symptom: a report names a symptom. Grep every caller of the function you touch and fix the shared function once — one guard there is a smaller diff than one per caller, and patching only the path the ticket names leaves a sibling caller still broken.

Not lazy about: understanding the problem (...), input validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs (...), anything explicitly requested.
```

**一个实测发现（对 §6.3 很关键）**：13 个宿主适配器目录（`.agents` `.claude-plugin` `.clinerules` `.codex-plugin` `.cursor` `.devin-plugin` `.grok-plugin` `.kiro` `.openclaw` `.opencode` `.qoder` `.qoder-plugin` `.windsurf`）的内容**全部是 instruction-tier**（`rules/` `skills/` `steering/` `plugin.json`），**没有一个目录包含 hooks**。仓库里只有 3 份 hooks 配置：`hooks/claude-codex-hooks.json`、`hooks/copilot-hooks.json`、`hooks/qoder-hooks.json`。也就是说上游宣称的 20 个宿主里，走 hooks 注入的是少数，多数与我们一样是纯指令层路线。

---

## 2. 我们吸收了什么（三处落地，共 871 字节）

| # | 规则 | 落点 | 字节 |
|---|---|---|---:|
| A-lite + D | 选择顺序 + bug 根因 | `docs/agents/implementation-workflow.md` §6 步骤 2 | 713 |
| B-lite | review 的 stdlib/native 重复检查 | 同文件 §8 步骤 3 | 158 |
| （临时） | 试点回写路由 | 同文件 §9 步骤 3，裁决后删除 | 260 |

**已落地的实际文本**（逐字引用，reviewer 可直接核对）：

> **§6 步骤 2** — `2. **bug 任务先执行根因搜索**：搜索相关定义与所有调用方；仅当该不变量属于公共 seam 时在 seam 处修复根因，否则在各调用方分别修复。随后按选择顺序决定实现路径——在读完被改动代码的真实调用流程、并满足已确认行为和验证义务的前提下，依次考虑：无需新增代码、契约匹配的现有实现、标准库或平台原生能力、合适的已装依赖、最小自定义实现。若需新增代码，选择最高、最稳定的 public seam；seam 本身是设计问题时调用 `codebase-design`。不得用少行替代正确性、信任边界校验、防数据丢失的错误处理、安全、可访问性或测试。`

> **§8 步骤 3**（追加一句）— `Standards 轴额外检查 diff 是否用自定义代码或依赖重复标准库、平台原生能力；只报告存在行为等价且可验证替代的项。`

**与上游原文的对应关系及改编处**：

| 上游 | 我们的改编 | 改编理由 |
|---|---|---|
| 阶梯横档 ①②③④⑤⑦ | 全取，压缩为一句中文选择顺序 | 无删减 |
| 阶梯横档 ⑥「Can this be one line?」 | **删除** | 上游自己的安全对照：裸 "YAGNI + one-liners" 提示 LOC −33%（不如完整阶梯的 −54%），安全守卫从 100% 掉到 **95%**（漏了路径遍历守卫）。**砍得更少，还更不安全** |
| Bug 根因规则 | 保留，并**新增判据**：仅当该不变量属于公共 seam 时才在 seam 处修，否则在各调用方分别修复 | 上游只说"grep 所有调用方并修共享函数"，缺少"何时不该合并"的判断——强行合并不同约束的调用方会制造新 bug（复核 Q4 裁决：判据成立，措辞改为按不变量归属判断） |
| `ponytail-review` 的 5 个 tag（delete/stdlib/native/yagni/shrink） | **只取 `stdlib:` + `native:` 两个** | 见下方分 tag 说明 |

**B-lite 逐 tag 的取舍理由**（v1 曾说"delete/yagni/shrink 都被 Fowler smell 基线覆盖"——**这条理由不成立，已按复核 Q3 重写**）：

| tag | 处置 | 理由 |
|---|---|---|
| `delete:` | 拒绝 | 与 Fowler 的 Speculative Generality / Dead Code 类 smell 大体重叠 |
| `yagni:` | 拒绝 | 与 Fowler 的 Speculative Generality、Middle Man 大体重叠 |
| `stdlib:` | **采纳** | Fowler 基线里没有——它是唯一真增量 |
| `native:` | **采纳** | 同上 |
| `shrink:` | 拒绝 | **不是**因为被 Fowler 覆盖（`shrink` = 同逻辑更少行，不等于 Duplicated Code、Speculative Generality 或 Middle Man）。拒绝理由是它**激励 code golf**：本仓库优化的是认知复杂度与维护面，不是行数；且这类 finding 主观性强、易产生低价值噪音与争论成本 |

**我们有、上游没有的一处**：B-lite 落地路径是 `code-review` skill 的 Standards 轴——该 skill 声明"仓库里文档化的编码标准优先于内置基线"，而 workflow 是它读取的 standards source。所以我们**一个字都不改 skill 文件**（`npx skills update` 不会冲掉），只往 workflow 加一行。

---

## 3. 我们拒绝了什么，为什么

| 上游组件 | 拒绝理由 | 证据 |
|---|---|---|
| 13 个宿主适配器 + MCP server + `pi-extension` | 分发层，不产生效果；绑定具体宿主，与"规则随仓库走"的取向冲突 | 体积 5.58%，无规则内容 |
| `hooks/` 注入层 | 见 §6.3——不是拒绝，是**暂缓**。规则本身不依赖它 | JetBrains Finding 1：skill 安装而不注入时自激活 0/10 |
| 人格段（"lazy senior dev"） | 效果无法与规则分离验证；换宿主后行为锚点不可控 | 无独立评测 |
| lite/full/ultra 档位 | 强度调节的包装层 | 无独立评测 |
| `ponytail:` 注释标记 + `/ponytail-debt` | **纸面义务，无执行证据** | JetBrains 80 次试跑中该标记仅出现 **1 次** |
| `net: -N` 净减行指标 | 优化目标是认知复杂度与维护面，不是 LOC | 上游安全对照（§2 表） |
| `shrink:` tag | 激励 code golf + 低价值噪音（**不是**因为被 Fowler 覆盖） | 见 §2 tag 表 |
| "一个 assert 自检"测试条款 | 低于本仓库 R2/R3 的验证义务要求 | `implementation-workflow.md` §6/§7 |
| `/ponytail-audit`、`/ponytail-gain` | 度量工具，我们明确不预设收益比例，所以不要 | — |
| "可默认即推进"（上游 C 项） | 与最小代码无关，且本仓库已有 `ready-for-agent` 完全定义门槛 | `docs/agents/triage-labels.md` |

---

## 4. 论证合理性自检

### 4.1 证据分级

**可复现（reviewer 可直接运行，见 §8）**：
- 上游体积与分层（固定 SHA，合计闭合 100%）；
- 本仓库三处落地文本的存在与位置；
- `npm run lint:docs` → PASS。

**外部已发表（有来源，非我们自报）——但请注意它的适用边界**：

**JetBrains 独立评测**（2026-07-28，[原文](https://blog.jetbrains.com/ai/2026/07/ponytail-skill-claude-tested/)），Harbor + SkillsBench，80 paired tasks，Claude Code 2.1.201 headless + claude-sonnet-5，双臂锁定。**关于评测对象，原文逐字如下**：

> "Arm B ponytail v4.8.4: skill installed *and* its ruleset injected, **byte-identical to the ruleset text its own `SessionStart` hook generates**... A close emulation of the shipped plugin's **full mode**, with three documented differences (no first-run statusline nudge, **no subagent re-injection**, ruleset appended after the task rather than before it)"
> "**Provenance.** ponytail pinned at commit `16f2980` (v4.8.4, MIT); agent version pinned in both arms; the injected ruleset generated by ponytail's own hook code, **sha256 recorded**."

**结论：评测注入的是钩子生成的 full-mode 规则集（含 persistence、output、intensity 等内容），不是紧凑的 `AGENTS.md` 33 行内核，更不是我们的三条改编规则。** 原文全文未出现 `AGENTS.md` 或 "33-line"字样。因此：

- ❌ v1 的"我们保留的 0.05% 是唯一被独立评测覆盖的层"**撤回**；
- ❌ 该评测**不能**用于推断我们三条规则的效果量级——它是完整规则集 + 已审计注入的结果，我们的变体是它的子集且注入无保障；
- ✅ 该评测**只能**作为方向性参考：在这类任务上，"少写"导向的规则集没有造成可检出的质量损失，且成本端有正向信号。

评测结果（逐字口径）：

| 终点 | 结果 | 显著性（原文口径） |
|---|---|---|
| 成本 | −10.3%（46 任务更便宜 / 34 更贵） | **p=0.004**，原文称"the strongest positive cost result in this series"；但补一句"the spread around it is wide enough that a **bootstrap interval on the median just touches zero**" |
| 模型输出文本 | −13.8% | p=0.001，原文列为 robust 结果之一 |
| 代码量 | −15.4%（10,205 → 8,756 行） | p=0.088，原文自称"**the softest of our headline numbers**" |
| 时间 | −10.6% | **p=0.040 名义显著**，但原文明确："**would not survive a simple seven-endpoint familywise correction**" |
| 质量 | 6 更好 / 9 更差 / 65 相同 | sign test p=0.61；均值 reward 0.378 → 0.334（落在噪声内）。**null ≠ 等效性证明** |

其余终点（steps p=0.057、fresh tokens p=0.085、history re-reads p=0.138）原文自述"suggestive rather than settled"。原文预设 7 个终点后付费跑，总 tokens 是事后补加的。

**收益分布**：集中在有过度构建空间的任务（基线 300+ 行 −31.2%，20–99 行 −11.9%，已极简任务 ≈0）。
**范围限制（原文声明）**：SkillsBench 以数据/分析/修复类任务为主，缺少前端过度构建陷阱。

**上游自报基准**（`benchmarks/results/2026-06-18-agentic.md`）：FastAPI+React 仓库、12 tickets、n=4、Haiku 4.5，LOC −54% / cost −20% / safe 100%。⚠️ 作者自选任务集、均值口径。

**仅自报（不可第三方重复）**：
- 本仓库"过度构建频率未量化"——我们不知道这个问题在我们这儿有多严重；
- 三处落地文本会被模型正确读取（无注入保障，见 §6.3）；
- 试点数据——**目前为零**。

### 4.2 我们自己最强的反驳（先自我攻击）

1. **"外部证据根本不适用于我们的变体。"** 成立，且这是 v2 最重要的更正。JetBrains 测的是钩子生成的 full-mode 规则集（v4.8.4），我们只有三条改编规则 + 无注入保障。**没有任何已发表证据支持我们的改造会产生效果**——支持它的只有推理。
2. **"上游自报 −54% 与独立评测 −15.4% 差 3.5 倍。"** 但这**不能**用来声称"真实效应的置信区间很宽"：两者是不同的实验（任务集、注入方式、口径、模型都不同），点估计不可直接比较。能说的只有：口径差异极大，外部数字不能直接引用。
3. **"没有注入保障，规则可能根本没到达模型。"** 成立且是当前最大风险。JetBrains 实测：skill 纯安装不自激活 0/10。我们的规则在按需加载的 workflow 里（属"注入"路径，避开了纯安装陷阱），但**是否稳定到达没有本地证据**——这正是试点必须记录"规则是否到达"栏的原因（复核 Q5）。
4. **"A-lite 可能被读成'能砍验证'。"** 缓解措施写在文本里（句首以验证义务为前提，句末列明不可砍清单），但**缓解不等于证实**。hard gate 已扩到六项（§6.1）。
5. **"B-lite 的增量可能为零，且零 finding 无法区分原因。"** 成立。零 finding 有两种解释：代码本已精简，或规则没被读到。试点表的"规则是否到达"栏就是为区分这两者而设。
6. **"'预期收益严格小于上游'这个说法不成立。"** 成立——子集关系推不出效应上界。准确说法是：**没有依据预期达到上游所报告的量级**（我们的规则更少、注入无保障、任务分布不同），仅此而已。

### 4.3 与既有规则的关系（不冲突论证）

- **与 TDD**：TDD 管"怎么写对"（red→green 过程），A-lite 在**进入 TDD 前**决定"用什么到达 green"。时序前后相接，不重叠。workflow §6.3 原有的"只写足以变 green 的实现"已确立最小实现原则，A-lite 的增量只是**明确选择顺序**。
- **与 Matt Pocock 的 skill 集**（`implement` / `tdd` / `code-review` / `codebase-design`）：一个字未改。我们核查了 `implement`（15 行，完全不涉实现路径选择）与 `diagnosing-bugs`（140 行，Phase 5 有 single-caller 意识，但只在"难复现 bug"时被调用，且没有"grep 所有调用方 + 判断不变量归属"这个动作）。**A-lite 和 D 补的是这两个 skill 的真空，不是覆盖它们。**
- **`codebase-design` 的调用条件未变**：原 §6 步骤 2 的"seam 本身是设计问题时调用"保持不变。

---

## 5. 吸收率的三个口径（v1 的"5%"已作废）

v1 用过"5%"这个口语估算。三个可核对的口径：

| 口径 | 计算 | 结果 |
|---|---|---:|
| 吸收量 / 上游全仓库字节 | 871 / 1,636,232 | **0.05%** |
| 被吸收的原文 / 上游规则本体 | 760（`AGENTS.md` 的阶梯 9 行 + 根因 1 行）/ 2,593 | **29%** |
| 增量 / 我们的 workflow | 871 / (14,148 − 871) | **6.6%** |

**同一个改造，从 0.05% 到 29%，相差 580 倍——"百分比"本身是个陷阱。** 正确的问法不是"吸收了多少"，而是"砍掉的是否产生效果"：

- 砍掉的 99.95% 里，绝大多数是 **assets / benchmarks / tests / examples（85.72%）** 与 **文档营销（4.54%）**——从来不参与运行；其余是分发层（5.58%）、hooks（1.86%）、命令层（1.32%）。
- 保留的 0.05% 是规则本体，但**它不是"唯一被独立评测覆盖的层"**（§4.1 已更正）——评测覆盖的是钩子生成的 full-mode 规则集，比 `AGENTS.md` 更大，且从未隔离验证过内核本身。

**诚实的说法**：我们不是"抄了 5% 还想达到 100% 的效果"，而是"只取规则内核，放弃分发与包装"。**我们没有任何依据预期获得上游报告的量级**；我们买的是**流程完备性**——堵住三个此前没人管的决策时刻（动笔前要不要写、review 时是不是重复造轮子、修 bug 时是不是只修了被点名的那条路径）。

---

## 6. 已知弱点与未解决事项

### 6.1 试点数据为零，且 v1 的门槛不足以支撑转正（已按 Q1/Q5/Q6/Q7 重写）

`docs/reviews/ponytail-lite-pilot-2026-09.md` 的记录表**当前为空**（0/5）。因此本材料全部论证基于**外部证据 + 推理**，无一条本地实证。

v1 的门槛有缺陷（复核 Q1 指出）：A-lite 只要求"改变选择"、D 只要求"实际触发"，**都不要求结果更好**；hard gate 只覆盖 A-lite/D 的部分回归。**据此转正会把"规则改变了行为"误当成"规则有价值"。**

v2 门槛（完整版在试点记录文件，此处不复制）：

- **新增五类字段**：交付确认（规则是否到达 + evidence）、spec parity、返工、误报、实际收益（定性）。
- **正转门槛需正向证据**：A-lite 的改变须伴随正向收益（更少代码/文件/返工且 spec parity 无损）；B-lite 须独有 finding 且误报未造成返工；D 的根因判断须事后被验证为正确；三条都需 **≥80% 任务的交付确认**。
- **hard gate 扩到六项**：安全、正确性、**spec parity 缺失**、**测试被省略或弱化**、**可访问性**、错误处理。
- **未获正向证据时**：延长（最多再 5 个任务）或标记"未验证"。
- **5 个任务只够 canary，不够采纳裁决**（Q6）。

### 6.2 外部证据不适用于我们的变体
见 §4.2 反驳 1、2、6。这是本材料最根本的弱点：支持改造的只有推理与流程完备性论证。

### 6.3 送达层（hooks）：暂缓，且需更正 v1 的产品错误

**v1 的错误**：引用了另一款 agent 工具的文档来证明"当前宿主"支持 hooks。当前宿主是 **Factory（Droid）**，v1 的引用不成立。

**当前宿主（Factory / Droid）的官方 hooks 配置**：

- 配置位置：`~/.factory/hooks.json`（用户级）、`.factory/hooks.json`（项目级，可提交共享）；旧路径 `.factory/hooks/hooks.json` 仍会加载；无 `hooks.json` 时也从同级 `settings.json` 的 `hooks` 键读取。
- 事件：`PreToolUse`、`PostToolUse`、`UserPromptSubmit`、`Notification`、`Stop`、`SubagentStop`、`PreCompact`、`SessionStart`、`SessionEnd`。
- **注入方式**：`SessionStart` 与 `UserPromptSubmit` 的 **stdout 会被加进模型上下文**（其余事件的 stdout 只进 transcript 或 debug log；`PreCompact` 只有 debug log）。
- **安全设计**：Droid 启动时对 hooks 做不可变快照；外部修改 settings 会在会话中告警，且须在 `/hooks` 菜单审查后生效。
- 来源：[Factory Docs — Hooks](https://docs.factory.ai/guides/hooks/git-workflows)（配置位置、事件、结构）；Factory hooks 参考（事件与输出路由表）。

**对我们有用的与没用的**：

- ✅ `SessionStart` / `UserPromptSubmit` 可做每轮规则注入；
- ❌ **Factory 没有 `SubagentStart` 事件**（只有 `SubagentStop`）——上游靠 `SubagentStart` 做子代理注入，**这条在当前宿主上做不到**。

**为什么仍然暂缓**：钩子只解决"规则是否到达模型"，不回答"规则在本仓库是否有价值或有害"。二者正交。且 JetBrains 的质量结果是 null（p=0.61），安全性无法靠上游证据背书——这是我们必须自己跑试点的根本理由。

**以及一个支持"规则不依赖钩子"的实测事实**（§1）：上游 13 个宿主适配器目录全部是 instruction-tier，只有 3 份 hooks 配置（Claude/Codex、Copilot、Qoder）。**我们选择的路线（纯文本指令层）与上游大多数宿主一致**，不是妥协。

### 6.4 改动落点的两处顺序修正（已执行，供复核）
1. **A-lite 与"选最高最稳定的 public seam"的顺序**——原 workflow 先讲 seam 选择，与 A-lite 首档"无需新增代码"直接冲突（不需要写代码时不存在 seam 选择）。落地文本把 seam 移到"若需新增代码"之后。
2. **试点回写从 §6 末尾挪到 §9 步骤 3**——B-lite 的 finding 要到 §8 review 才产生，§6 末尾回写时 B 栏必为空，门槛会形同虚设。

---

## 7. 第一轮复核裁决与落实状态

| # | 复核裁决 | 落实 |
|---|---|---|
| **Q1** | 可试点，不可按当前门槛转正 | ✅ 门槛重写为"需正向证据"（§6.1 + 试点记录文件 v2）；hard gate 扩到六项 |
| **Q2** | 同意删除"一行"横档 | ✅ 维持删除，理由不变（§2） |
| **Q3** | 维持 stdlib/native，但重写 `shrink` 的拒绝理由 | ✅ §2 逐 tag 表重写：`shrink` 的理由改为"激励 code golf + 低价值噪音"，不再称被 Fowler 覆盖 |
| **Q4** | 判据是改进，措辞改为"公共 seam 拥有该不变量" | ✅ §6 步骤 2 落地文本改为"仅当该不变量属于公共 seam 时在 seam 处修复根因，否则在各调用方分别修复"；提案 §5 文本源同步 |
| **Q5** | 必须在首个任务前增加 delivery evidence | ✅ 试点表新增"规则是否到达（evidence）"栏 + 字段口径说明；转正门槛要求 ≥80% 任务有正向 evidence |
| **Q6** | 5 个任务只够 canary，不够采纳裁决 | ✅ §6.1 与试点文件范围段明示"不足以支撑采纳裁决"；未获正向证据时延长或标记未验证 |
| **Q7** | 主文本基本足够，hard gate 应覆盖 spec parity、测试和可访问性 | ✅ hard gate 从 3 项扩到 6 项，新增 spec parity 缺失、测试被省略或弱化、可访问性回归 |

**另外三项事实性更正**（非提问，但属阻塞/高优先级）：

| 复核指出 | 落实 |
|---|---|
| 错述 JetBrains 评测对象（不是 33 行内核） | ✅ §4.1 改为逐字引用原文，明确"未隔离验证 AGENTS.md、更未验证我们的三条规则"；§0 与 §5 撤回"唯一被独立评测覆盖"的说法 |
| 体积分层无法复现且不闭合（94,700 字节遗漏；99.95% 归属错误） | ✅ §1 七层重算，固定 SHA，合计 1,636,232 = 100.00%，无遗漏无重叠；§8 提供含 dotfiles 的复现脚本 |
| hooks 证据引用了错误产品 | ✅ §6.3 改为当前宿主（Factory / Droid）官方文档，补上"Factory 无 SubagentStart"这条实际约束；并补入"上游 13 个适配器目录均为 instruction-tier"的实测 |

**统计措辞更正**：

| v1 表述 | v2 表述 |
|---|---|
| 时间 p=0.040"未达常规显著" | 名义显著 p=0.040，但原文明确"would not survive a simple seven-endpoint familywise correction"，属 suggestive |
| "预期收益严格小于"上游 | 子集推不出上界；改为"**没有依据预期达到上游报告的量级**" |
| 用两个实验的点估计声称"置信区间很宽" | 改为"两者是不同实验（任务集、注入、口径、模型均不同），点估计不可直接比较" |
| 成本 −10.3% 只写 p=0.004 | 补上原文的"bootstrap interval on the median just touches zero" |

---

## 8. 复核用命令

```bash
# 上游事实：固定 commit 克隆（v1 未固定 SHA，不可复现）
git clone https://github.com/DietrichGebert/ponytail /tmp/ponytail-size
cd /tmp/ponytail-size && git checkout 2ed6c52c9d7e5e56942508591085fd45dea277d3

# 分层体积（含 dotfiles，合计应等于 1,636,232；v1 的 du /* 漏掉隐藏适配器目录）
python3 - <<'PY'
import os
groups = {
 "规则内核": ["AGENTS.md"],
 "命令层": ["skills","commands"],
 "管道层": ["hooks"],
 "分发层": [".openclaw",".opencode",".agents",".cursor",".kiro",".windsurf",".qoder",
            ".clinerules",".codex-plugin",".claude-plugin",".qoder-plugin",".devin-plugin",
            ".grok-plugin","pi-extension","ponytail-mcp","scripts","package.json",
            "plugin.yaml","plugin.json","gemini-extension.json","opencode.json"],
 "文档营销": ["README.md","README.ko.md","README.es.md","docs","LICENSE","after-install.md"],
 "度量证据": ["assets","benchmarks","tests","examples"],
 "其他": ["__init__.py",".github",".gitignore",".env.example"],
}
tot={}; grand=0
for root,dirs,files in os.walk('.'):
    dirs[:] = [d for d in dirs if d != '.git']
    for f in files:
        p=os.path.join(root,f)[2:]
        grand += os.path.getsize(p)
        tot[p.split(os.sep)[0]] = tot.get(p.split(os.sep)[0],0) + os.path.getsize(p)
seen=set(); s=0
for g,m in groups.items():
    v=sum(tot.get(x,0) for x in m); seen|=set(m); s+=v
    print(f"{g:10s} {v:>10,}  {v/grand*100:5.2f}%")
print(f"{'合计':10s} {s:>10,}  / 全仓 {grand:,}  未归类: {set(tot)-seen or '无'}")
PY

# 规则内核全文 + review 镜头（B-lite 逐 tag 取舍依据）
sed -n '1,33p' AGENTS.md
cat skills/ponytail-review/SKILL.md

# 实测：13 个宿主适配器目录里没有一个含 hooks
ls -A .claude-plugin .cursor .windsurf .kiro .opencode .agents

# 本仓库：三处落地文本
sed -n '142p' docs/agents/implementation-workflow.md    # A-lite + D
sed -n '175p' docs/agents/implementation-workflow.md    # B-lite（§8 步骤 3）
sed -n '186p' docs/agents/implementation-workflow.md    # 试点路由（§9 步骤 3）

# 试点记录与裁决门槛（当前 0/5）
cat docs/reviews/ponytail-lite-pilot-2026-09.md

# 既有基线核对（Q3 的关键）：Fowler smell 清单
sed -n '45,56p' ~/.agents/skills/code-review/SKILL.md

# 文档 lint
npm run lint:docs
```

---

## 9. 第二轮复核结论（复核方填写）

| # | 裁决 | 落实状态 |
|---|---|---|
| R1 | v1 的三处事实性更正是否到位（评测对象 / 体积分层 / hooks 产品） | |
| R2 | 新门槛是否足以支撑"转正"判断（是否仍可能把"改变了行为"当成"有价值"） | |
| R3 | "规则是否到达"栏的 evidence 标准是否可执行（如何判定"到达"，谁填） | |
| R4 | 在外部证据不适用于本变体的前提下，试点是否是唯一合理的验证路径 | |
| R5 | 是否应现在就上 `SessionStart` / `UserPromptSubmit` 钩子（Q5 遗留：送达问题） | |
| R6 | 其他 | |

---

## 10. v1 → v2 变更清单

1. **撤回**"0.05% 是唯一被独立评测覆盖的层"（§0、§5）——评测对象是钩子生成的 full-mode 规则集。
2. §4.1 逐字引用 JetBrains 的 Setup 与 Provenance 段落，标注评测版本 v4.8.4（commit `16f2980`）与仓库实测版本 v4.9.0 不同。
3. §1 分层重算：固定 SHA、含 dotfiles、七层、合计闭合 100.00%；补入"13 个适配器目录均为 instruction-tier、仅 3 份 hooks 配置"的实测。
4. §6.3 hooks 段重写：改为当前宿主 Factory / Droid 的官方配置与事件表，补上"无 SubagentStart"约束。
5. §2 新增逐 tag 表，`shrink` 的拒绝理由改为 code golf 与噪音。
6. §6.1 与试点记录文件：门槛重写为需正向证据，新增五类字段，hard gate 三项扩到六项。
7. §4.2 新增反驳 1（外部证据不适用于本变体）与反驳 6（子集推不出上界）。
8. 统计措辞全面更正（时间 p 值、预期收益、置信区间、成本区间）。
9. §7 填入第一轮 Q1–Q7 裁决与落实状态；§9 改为第二轮待裁问题。
