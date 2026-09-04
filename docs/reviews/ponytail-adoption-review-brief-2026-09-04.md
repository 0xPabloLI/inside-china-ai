# 独立复核材料：ponytail 规则引入与改造（2026-09-04 session 交付）

> 用途：交给未参与本工作的第三方 Agent 或人做独立 review。本文自包含——reviewer 不需要读对话历史。
> 仓库：`inside-china-ai`｜分支：`main`｜上游：[DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) v4.9.0（MIT，2026-08-07，210 commits）
> 本材料所有上游事实基于 **2026-09-04 的 `git clone --depth 1` 实测**（`/tmp/ponytail-size`），不是二手转述。
> 相关文件：`docs/research/ponytail-minimal-code-adoption-proposal.md`（提案 v4，裁决依据在此）、`docs/reviews/ponytail-lite-pilot-2026-09.md`（试点记录，当前为空表）。

---

## 0. 一句话摘要

我们把上游 33 行指令内核中的 **3 条规则**（选择顺序 / bug 根因 / review 的 stdlib 重复检查）改编后内联进本仓库的实施 workflow，共 871 字节；**拒绝了它的分发层、度量层、包装层，以及 2 条有安全或证据问题的规则**。

改动是纯文档、可逆、带 hard gate。**本仓库对这三条规则的本地证据为零——试点尚未开始**（§6.1）。这是本材料最需要复核方关注的事实。

---

## 1. 上游是什么：分层解剖

上游 README 的自我定位是"让 agent 像房间里最懒的资深工程师那样思考"。按体积实测（159 个文件，1,636,232 字节，不含 `.git`）：

| 层 | 内容 | 字节 | 占比 | 是否产生效果 |
|---|---|---:|---:|---|
| **指令内核** | `AGENTS.md` 33 行：7 档阶梯 + bug 根因 + 8 条 Rules + 豁免清单 | **2,593** | **0.16%** | ✅ **这是唯一产生效果的层** |
| 命令层 | `skills/` 6 个 skill（ponytail / review / audit / debt / gain / help） | 17,144 | 1.0% | 承载内核的按需调用 + 3 个度量命令 |
| 管道层 | `hooks/` 11 个文件（activate / mode-tracker / subagent / instructions / runtime / statusline） | 30,365 | 1.9% | **保证内核每轮与向子代理注入**——只解决"送达" |
| 分发层 | 13 个宿主适配器目录（`.claude-plugin` `.codex-plugin` `.cursor` `.windsurf` `.kiro` `.qoder-plugin` `.grok-plugin` `.clinerules` `.devin-plugin` `.openclaw` `.opencode` `.agents` 等）、`pi-extension/`、`ponytail-mcp/`、`scripts/`、`commands/` | ~74,172 | 4.5% | 适配，不产生效果 |
| 度量/营销层 | `assets/`（1.07MB 图片与 banner）、`benchmarks/`、`examples/`、`tests/`、`docs/` | 1,417,258 | **86.6%** | 证据与展示 |

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

---

## 2. 我们吸收了什么（三处落地，共 871 字节）

| # | 规则 | 落点 | 字节 |
|---|---|---|---:|
| A-lite + D | 选择顺序 + bug 根因 | `docs/agents/implementation-workflow.md` §6 步骤 2 | 713 |
| B-lite | review 的 stdlib/native 重复检查 | 同文件 §8 步骤 3 | 158 |
| （临时） | 试点回写路由 | 同文件 §9 步骤 3，裁决后删除 | 260 |

**已落地的实际文本**（逐字引用，reviewer 可直接核对）：

> **§6 步骤 2** — `2. **bug 任务先执行根因搜索**：搜索相关定义与所有调用方；仅当调用方共享同一不变量时在公共 seam 修复根因，否则保持调用方差异。随后按选择顺序决定实现路径——在读完被改动代码的真实调用流程、并满足已确认行为和验证义务的前提下，依次考虑：无需新增代码、契约匹配的现有实现、标准库或平台原生能力、合适的已装依赖、最小自定义实现。若需新增代码，选择最高、最稳定的 public seam；seam 本身是设计问题时调用 `codebase-design`。不得用少行替代正确性、信任边界校验、防数据丢失的错误处理、安全、可访问性或测试。`

> **§8 步骤 3**（追加一句）— `Standards 轴额外检查 diff 是否用自定义代码或依赖重复标准库、平台原生能力；只报告存在行为等价且可验证替代的项。`

**与上游原文的对应关系及改编处**：

| 上游 | 我们的改编 | 改编理由 |
|---|---|---|
| 阶梯横档 ①②③④⑤⑦ | 全取，压缩为一句中文选择顺序 | 无删减 |
| 阶梯横档 ⑥「Can this be one line?」 | **删除** | 上游自己的安全对照：裸 "YAGNI + one-liners" 提示 LOC −33%（不如完整阶梯的 −54%），安全守卫从 100% 掉到 **95%**（漏了路径遍历守卫）。**砍得更少，还更不安全** |
| Bug 根因规则 | 保留，并**新增判据**：仅当调用方共享同一不变量时才在公共 seam 修，否则保持差异 | 上游只说"grep 所有调用方并修共享函数"，缺少"何时不该合并"的判断——强行合并不同约束的调用方会制造新 bug |
| `ponytail-review` 的 5 个 tag（delete/stdlib/native/yagni/shrink） | **只取 `stdlib:` + `native:` 两个** | 其余 3 个与已装的 `code-review` skill 的 Fowler smell 基线（Duplicated Code、Speculative Generality、Middle Man）重复。我们逐条比对过基线后只留真空增量 |
| 豁免清单 7 项 | 全取，写入 A-lite 句末 | — |

**我们有、上游没有的一处**：B-lite 落地路径是 `code-review` skill 的 Standards 轴——该 skill 声明"仓库里文档化的编码标准优先于内置基线"，而 workflow 是它读取的 standards source。所以我们**一个字都不改 skill 文件**（`npx skills update` 不会冲掉），只往 workflow 加一行。

---

## 3. 我们拒绝了什么，为什么

| 上游组件 | 拒绝理由 | 证据 |
|---|---|---|
| 13 个宿主适配器 + MCP server + `pi-extension` | 分发层，不产生效果；绑定具体宿主，与"规则随仓库走"的取向冲突 | 体积占比 4.5%，无规则内容 |
| `hooks/` 注入层 | 见 §6.3——不是拒绝，是**暂缓**。规则本身不依赖它 | JetBrains Finding 1：skill 安装而不注入时自激活 0/10 |
| 人格段（"lazy senior dev"） | 效果无法与规则分离验证；换宿主后行为锚点不可控 | 无独立评测 |
| lite/full/ultra 档位 | 强度调节的包装层 | 无独立评测 |
| `ponytail:` 注释标记 + `/ponytail-debt` | **纸面义务，无执行证据** | JetBrains 80 次试跑中该标记仅出现 **1 次** |
| `net: -N` 净减行指标 | 优化目标是认知复杂度与维护面，不是 LOC | 上游安全对照（§2 表） |
| "一个 assert 自检"测试条款 | 低于本仓库 R2/R3 的验证义务要求 | `implementation-workflow.md` §6/§7 |
| `/ponytail-audit`、`/ponytail-gain` | 度量工具，我们明确不预设收益比例，所以不要 | — |
| "可默认即推进"（上游 C 项） | 与最小代码无关，且本仓库已有 `ready-for-agent` 完全定义门槛 | `docs/agents/triage-labels.md` |

---

## 4. 论证合理性自检

### 4.1 证据分级

**可复现（reviewer 可直接运行，见 §8）**：
- 上游体积与文件清单（`git clone --depth 1`）；
- 本仓库三处落地文本的存在与位置；
- `npm run lint:docs` → PASS。

**外部已发表（有来源，非我们自报）**：
- **JetBrains 独立评测**（2026-07-28，[原文](https://blog.jetbrains.com/ai/2026/07/ponytail-skill-claude-tested/)）：Harbor + SkillsBench，80 paired tasks，Claude Code 2.1.201 headless + claude-sonnet-5，ponytail v4.8.4 双臂锁定、注入经审计。
  - 成本 **−10.3%（p=0.004，本评测最强信号）**；模型输出文本 −13.8%（p=0.001）；
  - 代码 −15.4%（p=0.088）、时间 −10.6%（p=0.040 名义）——**同方向但未达常规显著**；
  - 质量无可检出差异（6 好 / 9 差 / 65 同，p=0.61，**null ≠ 等效性证明**）；
  - **收益集中在有过度构建空间的任务**：基线 300+ 行 −31.2%，20–99 行 −11.9%，已极简任务 ≈0；
  - 原文范围声明：SkillsBench 以数据/分析/修复类任务为主，缺少前端过度构建陷阱。
- **上游自报基准**（`benchmarks/results/2026-06-18-agentic.md`）：FastAPI+React 仓库、12 tickets、n=4、Haiku 4.5，LOC −54% / cost −20% / safe 100%。⚠️ 作者自选任务集、均值口径——**独立评测只测出 −15.4%，两者差 3.5 倍**。

**仅自报（不可第三方重复）**：
- 本仓库"过度构建频率未量化"——我们不知道这个问题在我们这儿有多严重；
- 三处落地文本会被模型正确读取（无注入保障，见 §6.3）；
- 试点数据——**目前为零**。

### 4.2 我们自己最强的反驳（先自我攻击）

1. **"评测对象是完整规则集，不是你的三句话。"** 成立。JetBrains 测的是 33 行 + 已审计注入，我们只有三句 + 无注入保障。效应必然更小，**大概率测不出来**。我们不主张任何收益比例——提案 §3 明确把它定义为定性 canary（发现明显失败模式），不是效果测量。
2. **"上游 −54% 和独立评测 −15.4% 差 3.5 倍，说明这个领域的水很深。"** 成立，所以我们在文档里只引用独立评测做方向判断，把上游自报基准标为"作者自选任务集"。
3. **"没有注入保障，规则可能根本没到达模型。"** 成立且是当前最大风险。JetBrains 实测：skill 纯安装不自激活 0/10。我们的规则在按需加载的 workflow 里（属于"注入"路径，避开了纯安装陷阱），但长 session 与子代理传递是否稳定到达，**没有任何本地证据**。
4. **"A-lite 可能被读成'能砍验证'。"** 这是我们设 hard gate 的原因。缓解措施：A-lite 句首以"满足已确认行为和验证义务"为前提，句末列明不可砍清单。但**缓解不等于证实**——要靠试点看。
5. **"B-lite 的增量可能为零。"** 可能。零 finding 有两种解释：代码本已精简，或规则无效。**无法区分**——我们提前承认这一点，并把它写进裁决门槛（零 finding 不构成无效证据，也不构成有效证据）。

### 4.3 与既有规则的关系（不冲突论证）

- **与 TDD**：TDD 管"怎么写对"（red→green 过程），A-lite 在**进入 TDD 前**决定"用什么到达 green"。时序上前后相接，不重叠。workflow §6.3 原有的"只写足以变 green 的实现"已确立最小实现原则，A-lite 的增量只是**明确选择顺序**。
- **与 Matt Pocock 的 skill 集**（`implement` / `tdd` / `code-review` / `codebase-design`）：一个字未改。我们核查了 `implement`（15 行，完全不涉实现路径选择）与 `diagnosing-bugs`（140 行，Phase 5 有 single-caller 意识，但只在"难复现 bug"时被调用，且没有"grep 所有调用方 + 判断是否共享同一不变量"这个动作）。**A-lite 和 D 补的是这两个 skill 的真空，不是覆盖它们。**
- **`codebase-design` 的调用条件未变**：原 §6 步骤 2 的"seam 本身是设计问题时调用"保持不变。

---

## 5. "才吸收了 5%"——重新校准这个数字

我在讨论中用过"5%"这个口语估算。**它不准确，这里给出可核对的三个口径**：

| 口径 | 计算 | 结果 |
|---|---|---:|
| 吸收量 / 上游全仓库字节 | 871 / 1,636,232 | **0.05%** |
| 被吸收的原文 / 上游规则本体 | 760（`AGENTS.md` 的阶梯 9 行 + 根因 1 行）/ 2,593 | **29%** |
| 增量 / 我们的 workflow | 871 / (14,148 − 871) | **6.6%** |

**同一个改造，百分比从 0.05% 到 29%，相差 580 倍——说明"百分比"本身是个陷阱。** 正确的问法不是"吸收了多少"，而是"砍掉的那些是否产生效果"：

- 我们砍掉的 99.95% 是 **assets（1MB 图片）、benchmarks、tests、examples**（86.6%）、**分发层**（4.5%）、**hooks**（1.9%）、**命令层**（1.0%）。其中 assets/benchmarks/tests 从来不参与运行；命令层 6 个 skill 里有 3 个是度量工具（audit/gain/help），我们明确不要；分发层是宿主适配。
- 我们保留的 0.05% 是 **唯一被独立评测覆盖的那一层**。JetBrains 评测的是"ponytail 规则集被注入后"的效果，不是"装了插件"的效果。

**诚实的说法**：我们不是"抄了 5% 还想达到 100% 的效果"，而是"只取规则内核，放弃分发与包装"。**预期收益严格小于上游独立评测的 −10%~−15%，且大概率测不出来**（§4.2 反驳 1）。我们买的是**流程完备性**——堵住三个此前没人管的决策时刻（动笔前要不要写、review 时是不是重复造轮子、修 bug 时是不是只修了被点名的那条路径），不是效率。

---

## 6. 已知弱点与未解决事项

### 6.1 试点数据为零（最大弱点）
`docs/reviews/ponytail-lite-pilot-2026-09.md` 的逐任务记录表 **当前为空**。试点 2026-09-03 启动，窗口为 5 个实施任务或 4 周，尚未有任务完成。因此：
- 本材料全部论证基于**外部证据 + 推理**，无一条本地实证；
- 三条规则各设了独立验证门槛（A-lite 需至少一次改变实现选择；B-lite 需至少一个独有且被接受的 finding；D 需至少一个 bug 任务实际触发），未达标即标记"未验证"，不得转正。

### 6.2 上游自报与独立评测的差距未消解
−54% vs −15.4%。我们不主张上游数字，但这也意味着**真实效应量级的置信区间很宽**。

### 6.3 送达层（hooks）暂缓，不是否决
- 已查证：agent 宿主普遍提供生命周期钩子（会话开始 / 提示提交 / 工具调用前 / 子代理启动 / 上下文压缩前），可把规则每轮或向子代理注入；上游用 20 份宿主适配器覆盖这一层。当前宿主环境亦支持 hooks（来源：`https://www.workbuddy.ai/docs/cli/hooks`，Beta，配置于用户级 settings 的 `hooks` 字段，改动需在面板审查批准后生效）。
- **我们的规则文本不依赖任何宿主钩子**：纯 Markdown 落在仓库 `docs/`，经 `AGENTS.md` 路由在实施前加载，换任何 agent 工具规则照旧可读。宿主提供钩子时可选挂接做重注入，属**可选送达增强**。
- **试点期不引入**：hooks 只解决"规则是否到达模型"，不回答"规则在本仓库是否有价值或有害"。两者正交。且 JetBrains 的质量结果是 null（p=0.61），安全性无法靠上游证据背书——**这是我们必须自己跑试点的根本理由**。

### 6.4 改动落点的一处顺序修正（已执行，供复核）
提案原文建议把 A-lite 放在 §6 步骤 2、把试点回写放在 §6 步骤末尾。执行时修正了两处：
1. **A-lite 与"选最高最稳定的 public seam"的顺序**——原 workflow 先讲 seam 选择，与 A-lite 首档"无需新增代码"直接冲突（不需要写代码时不存在 seam 选择）。落地文本把 seam 移到"若需新增代码"之后。
2. **试点回写从 §6 末尾挪到 §9 步骤 3**——B-lite 的 finding 要到 §8 review 才产生，§6 末尾回写时 B 栏必为空，门槛会形同虚设。

---

## 7. 请复核方裁决的问题

| # | 问题 | 我方立场 |
|---|---|---|
| **Q1** | 在**本地零证据**的情况下，把这三条规则放进 workflow 是否合理？还是应该等试点有数据再落？ | 合理：纯文档、可逆、有 hard gate、成本≈0；但要复核方判断是否应该先跑"对照观察"再落规则 |
| **Q2** | 删除阶梯第 ⑥ 档「一行」是否正确？ | 正确：上游自己的对照显示它砍得更少（−33% vs −54%）且安全守卫掉到 95% |
| **Q3** | B-lite 只保留 `stdlib:`/`native:` 两个 tag 是否过窄？是否应把 `yagni:` / `shrink:` 也加回来？ | 过窄但正确：`delete:`/`yagni:` 已被 Fowler smell 基线覆盖，加回来只会制造 finding 噪音。请复核方核对 `~/.agents/skills/code-review/SKILL.md` L45–56 的基线清单，判断我们的去重结论是否成立 |
| **Q4** | D 新增的"仅当调用方共享同一不变量"判据，是改进还是画蛇添足？ | 改进：上游只有"grep 并修共享函数"，缺少"何时不该合并"的判断 |
| **Q5** | 不上 hooks 是否让整个试点失去意义（规则可能根本没被读到）？ | 不失去意义，但**必须在试点记录中同时观察"规则是否被实际引用"**，否则零 finding 无法区分"没读到"和"没价值"。**这条我们尚未落实为记录字段**——请复核方判断是否需要补 |
| **Q6** | 试点的"定性 canary"定位（不测收益比例）是否足够？5 个任务的样本会不会让裁决变成主观判断？ | 足够但偏弱：小样本本就只能发现明显失败模式。请复核方判断是否应延长窗口或增加对照 |
| **Q7** | A-lite 的措辞是否仍可能被误读为"能砍验证"？句首前提 + 句末不可砍清单的缓解是否够？ | 我们认为够，但这是纯文本规则，无法证实。请复核方从措辞层面挑问题 |

---

## 8. 复核用命令

```bash
# 上游事实：体积与规则内核（本材料 §1 全部数字的来源）
git clone --depth 1 https://github.com/DietrichGebert/ponytail /tmp/ponytail-size
wc -c /tmp/ponytail-size/AGENTS.md                      # 2593
du -sh /tmp/ponytail-size/*/ | sort -hr
sed -n '1,33p' /tmp/ponytail-size/AGENTS.md             # 规则内核全文
cat /tmp/ponytail-size/skills/ponytail-review/SKILL.md  # B-lite 的缩范围依据

# 本仓库：三处落地文本
sed -n '142p' docs/agents/implementation-workflow.md    # A-lite + D
sed -n '175p' docs/agents/implementation-workflow.md    # B-lite（§8 步骤 3）
sed -n '186p' docs/agents/implementation-workflow.md    # 试点路由（§9 步骤 3）

# 试点状态（当前应为空表）
cat docs/reviews/ponytail-lite-pilot-2026-09.md

# 既有基线核对（Q3 的关键）：Fowler smell 清单
sed -n '45,56p' ~/.agents/skills/code-review/SKILL.md

# 文档 lint
npm run lint:docs
```

---

## 9. 复核结论记录（复核方填写）

| # | 裁决 | 落实状态 |
|---|---|---|
| Q1 | | |
| Q2 | | |
| Q3 | | |
| Q4 | | |
| Q5 | | |
| Q6 | | |
| Q7 | | |
