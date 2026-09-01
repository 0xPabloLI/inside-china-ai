# Proposal: AGENTS.md 结构重构 — 路由三档分级 + 全局 PSR Gate + 分层瘦身

| | |
|---|---|
| **状态** | **v3** — 第二轮 review 裁定「有条件通过」（2 项阻塞 + 3 项一致性），本版吸收全部意见；修完后可批准进入正式 Grill/Spec |
| **日期** | 2026-09-01 |
| **涉及文件** | `AGENTS.md`（主）、`docs/tools-catalog.md`、`docs/video-workflow.md`、`docs/conventions/fact-verification.md`（新建）、`docs/DOCS-INDEX.md`、rollout tracker（新建） |
| **依据** | `writing-for-agents` skill（已加载，本 proposal 的方法论来源） |
| **生命周期** | proposal 为 ephemeral 文档；**归档时机 = rollout 观察完成后**（见 §8/§9），不是实施完成即归档 |

## 0. 修订记录

**v1 → v2**（六缺口）：Trivial 逻辑改全条件满足；文件数降为提示；Agent 治理文件一律 Substantial；PSR 拆两段式并全局化；新增 T0 前置修复（tools-catalog Tavily 冲突、video-workflow 过期路径均已实测确认）；范围/证据/行数/矩阵修正；`.agents/skills` 移出范围（git 未跟踪已实测）。

**v2 → v3**（第二轮 review 五项）：

1. **（阻塞）路由与强制流程冲突**：AGENTS.md L41「每次改代码之前必须走完以下工作流，不得跳步」与 L62-72 Step 9 结束清单未限定适用范围，与新路由直接矛盾。→ v3 显式列入修改范围：L41 限定为 Substantial session；Step 9 结束清单标注「仅 Substantial session」，Trivial/Small 的结束验证 = 档位对应检查（新增场景 17）。
2. **（阻塞）Small 中途升级恢复方式不安全**：场景 11 原写「已完成部分按 Cadence commit」会提交未完成/未验证工作。→ 改为：停止编辑；**不 stash、不丢弃、不提交未完成工作**；补齐 Grill/Spec/Tickets 后继续；仅**已独立完成并验证**的原子改动可保留 commit。
3. **PSR 信息分散（co-location 违规）**：合并为单一 `## PSR` 章节（Preflight + 发布 Gate + 五条检查同节），Workflow 内只留短指针；「任何方案」收窄为「**仓库修改方案，以及包含事实或参数断言的模型/工具/配置建议**」。
4. **外移制造重复权威**：content-pipeline.md 已有「管线概览」（L6）与「HITL 检查点」（L61，均已实测确认）→ **不复制概述**，验证覆盖后仅改 AGENTS.md 指针；Tavily 规范性表述在 tools-catalog 有 3 处（L100、L101、L112，已实测）→ T0a 范围扩大到全部；**单权威原则**：fallback 硬规则唯一活在 AGENTS.md，tools-catalog 只留操作细节并回指——v2 验收项「两处逐字一致」本身就是 duplication，删除。
5. **验收指标与归档时机**：行数不是 context load 可靠指标 → 主指标改 **words/bytes**（基线实测 1,778 words / 23,427 bytes，与 review 数字一致），行数仅作粗护栏；T7 拆为 T7a（实施 + 建 rollout tracker 与回滚阈值）/ T7b（**观察 2-3 个真实 session 完成后**才归档）。

**次要建议已采纳**：Trivial 示例移除宽泛的「文案」；「根因分析」改称「**待验证的贡献机制**」（未经实验证实的机制解释）。

## 1. 背景与动机（证据）

1. **PSR 被绕过（已观察到一次）**：本 session 早前的模型选型/配置建议未执行五条自审。是否存在系统性跳过属**待验证的贡献机制**假设——无量化数据；历史 handoff 亦有同类谨慎立场（`docs/archive/handoffs/handoff-vlm-model-sources-2026-08-26.md:74`）。本 proposal 以结构修复为目标，不依赖统计主张。
2. **路由过度（用户提出）**：Step 1 对 Substantial 的定义是 path-based，小改动理论上走全套流程，实操中被跳过——「规则被默认绕过比规则太严更糟」。且现行文本（L41「每次…必须走完」、L62-72）与新路由**直接冲突**，必须同步修改（§3a）。
3. **文档 sprawl**：AGENTS.md 基线 **214 行 / 1,778 words / 23,427 bytes**（`wc` 实测），每次调用全量注入，约 56 行是分支任务材料。

**待验证的贡献机制**（依据 writing-for-agents 原文，非已证实结论）：问题 1 —— PSR 是游离于 workflow 外的 flat reference，从未被任何 step 引用（coin-flip 注意力）；触发范围只写了「给出修改方案前」，覆盖不到研究/建议场景。问题 2 —— 边界措辞不可检查（variance bug）。问题 3 —— 「Sprawl … Attention thins across the excess」。

## 2. 目标与非目标

**目标**

1. 任何改动请求都有明确、可检查的路由档位；影响面决定档位；**路由结果与 workflow 强制范围、结束清单完全一致，无文本冲突**。
2. PSR 合并为单一 `## PSR` 章节（Preflight + 发布 Gate + 五条检查，co-location），全局生效，触发范围收窄到「仓库修改方案 + 含事实/参数断言的建议」。
3. AGENTS.md 收敛到 **words ≤ 1,330（基线 -25%）**，bytes 同步记录；行数 ≤200 仅作粗护栏；外移目标先修复为可靠权威（T0），**单一权威原则**：规范性规则唯一活在 AGENTS.md，外移文档只留操作细节并回指。

**非目标**

- 不改 Session Workflow 的 9 步骨架与编号（仅限定适用范围 + 两处短指针）。
- 不改 Commit Cadence、Git Safety、Session Boundary 等安全规则内容。
- 不动 Lovable 头部（L1-12）。
- 不 fork / 修改 `.agents/skills` 下第三方 skill（git 未跟踪，改动会被 update 覆盖）。
- 不追求行数 stretch 目标；不压缩 Context Hygiene / 恢复协议 blockquote。

## 3. 改动一：路由三档分级

### 3a. 与现行强制流程的同步修改（阻塞项）

| 位置 | 现行 | 改为 |
|------|------|------|
| L41 | 「**每次改代码之前**必须走完以下工作流，不得跳步」 | 「**路由为 Substantial 时**，必须走完以下工作流，不得跳步。Trivial/Small 按各自档位执行对应检查，不进入本 workflow」 |
| L62-72（Step 9） | 结束清单要求逐条确认 Step 1-8 | 标题与正文限定「**仅 Substantial session 适用**」；新增一行：「Trivial/Small session 的结束验证 = 档位对应检查（Trivial：最窄相关检查 + commit；Small：Runtime Verify + commit），逐条确认已完成」 |

### 3b. Step 1 重写（替换 L34-38）

```markdown
1. **Decision: which workflow?**（先定档，再动手；**档位由影响面决定，文件数与行数只是提示，不作定档依据**）
   - **Trivial** — 同时满足：无行为变化（typo/注释/格式）；单文件；不新增/升级依赖 → 直接改 → **最窄相关检查**（自查 diff + 跑受影响的最小验证，如相关断言/`npm run lint`）→ commit（遵循 Commit Cadence）。
   - **Small** — 不满足 Trivial，但**全部满足**：无跨模块契约/API/schema/RLS 变化；不触碰持久化、权限、安全面；不新增/升级依赖、不改 CI/部署配置；不碰 High-Risk Areas；不改 Agent 治理文件（AGENTS.md、workflow 文档、skill 路由、上下文指针）；不改视频管线核心（`scripts/short-video/lib/`、`remotion/src/`）→ 轻量流程：想清楚最佳改法 → 有关键逻辑则 TDD（**实现 + 测试多文件属正常 Small，不因文件数升档**）→ Runtime Verify → commit。跳过 Grill/Spec/Tickets/Code Review。
   - **Substantial** — 触及上述任一门槛；依赖新增/升级或 CI/部署配置变更；或 **Small 执行中途发现触及门槛 → 见升级协议** → 完整 Mandatory Implementation Workflow。
   - **升级协议（Small → Substantial）**：立即停止编辑；**不 stash、不丢弃、不提交未完成工作**；补齐 Grill/Spec/Tickets 后从断点继续；仅**已独立完成并验证**的原子改动可按 Cadence 保留 commit。
   - **Agent 治理文件**：AGENTS.md、workflow/skill 路由文档、上下文指针的修改**一律 Substantial**。
   - **UI/UX 设计任务**：用 `impeccable` skill（改动本身按上述路由；混合任务取最高档或按档位拆分）。
   - **做视频内容**：走 `docs/content-pipeline.md`，不走 Spec/Tickets/TDD；改管线代码走 Substantial。
   - **边界判定**：拿不准向上升档。
```

## 4. 改动二：单一 `## PSR` 章节（co-location）

**一个章节承载全部 PSR 内容**（Preflight + 发布 Gate + 五条检查），取代现 L94-102 与 v2 拟新增的独立 Gate 章节；Session Workflow 内只在两个执行点留**短指针**（「执行 PSR Preflight → 见 `## PSR`」「PSR 发布 Gate → 见 `## PSR`」）。章节草案：

```markdown
## PSR

**触发范围**：仓库修改方案，以及包含事实或参数断言的模型/工具/配置建议。
日常问答、纯解释、无断言的对话不触发。

**PSR Preflight** — 输出方案/建议前，先列**证据需求**：将做出的每类断言（因果、事实、参数）需要什么证据（代码行/文档/数据/实测）。轻量动作，证据允许在后续 Grill/研究中补齐。

**PSR 发布 Gate** — 方案/建议**发布给用户前**，产出完整 PSR 清单：五条逐条附证据，不适用条目标注「不适用 + 原因」。**清单未附 = 方案未发布**。

**五条检查**：
1. **因果依据**：…（本体保留）
2. **设计决策不是免死金牌**：…（本体保留）
3. **影响面核查**：…（本体保留）
4. **事实性陈述双源验证**：规则本体 ~2 行；操作程序见 `docs/conventions/fact-verification.md`
5. **推理参数从官方推荐起步**：…（本体保留）
```

Workflow 内指针（不展开内容，避免 duplication）：Step 1 Grill 入口处 + Step 2 Spec 前。Leading word `PSR` 仅在 AGENTS.md 内复用（`.agents/skills` 模板不在范围）。

## 5. 改动三：分层瘦身

### 5a. T0 前置修复（外移目标先成为可靠权威）

| Ticket | 文件 | 问题（已实测定位） | 修复 |
|--------|------|---------------|------|
| T0a | `docs/tools-catalog.md` | **3 处**规范性表述与拟议硬规则冲突：L112 主条目「容错」（Tavily 当主用）；**L100** Context7「何时不用：通用事实验证（用 Tavily…）」；**L101** Context7「容错：…→ Tavily 搜库名」 | 全部改为回指 AGENTS.md 硬规则（见下）；tools-catalog 只保留操作细节（费用/配置/credits/星评） |
| T0b | `docs/video-workflow.md` L105、L350-351 | 残留根 `assets/voice-sample-*` 路径，与 voice-samples 规则冲突 | 按 `docs/media-asset-management.md` 权威修正 |
| T0c | （并入 T3 指针措辞） | 「不要扔进 `assets/`」与「品牌资产放 `scripts/short-video/assets/`」两个 `assets` 未消歧 | 指针显式区分：仓库根/应用 `assets/` 是反模式倾倒场；`scripts/short-video/assets/` 是视频品牌资产的家 |

**Tavily 单权威原则**（替代 v2 的「逐字一致」验收项）：fallback 硬规则（`web_fetch → web-access CDP → Tavily`，仅当前两者失败才用）**唯一活在 AGENTS.md**；tools-catalog 不得出现规范性 fallback 表述，只写费用/配置等操作细节并**回指** AGENTS.md。

### 5b. 章节处置表

| 章节（现行号） | 行数 | 处置 | 去向 |
|------|------|------|------|
| Lovable 头部 L1-12 | 12 | **保留** | — |
| Project Snapshot L16-22 | 7 | 压缩至 4 行 | — |
| Core Commands L24-30 | 7 | **删除** | — |
| Session Workflow L32-72 | 41 | 骨架保留；L41 限定 + Step 9 限定（§3a）；Step 1 重写（§3b）；两处 PSR 短指针 | — |
| （改写）`## PSR` L94-102 | 9 → ~15 | 单章节合并（§4），净 +6 行 | 第 4 条操作程序 → `docs/conventions/fact-verification.md`（新建） |
| Commit Cadence L74-85 | 12 | 删 TL;DR 段（与六条规则重复），保留一句话导语 | — |
| Coding Conventions L104-111 | 8 | 保留 | — |
| Git Safety / Cross-Branch / Session Boundary L113-124 | 12 | 保留 | — |
| High-Risk Areas L126-131 | 6 | 保留；补「Agent 治理文件」条目 +2 行 | — |
| Media Asset Placement L133-145 | 13 | 压成 2 行 pointer（含 T0c 消歧 + `LibsndfileError` 触发词） | `docs/media-asset-management.md` / `docs/video-workflow.md` |
| Audio File Handling L147-149 | 3 | 并入 media pointer | `docs/video-workflow.md` |
| Learned Preferences L151-156 | 6 | 保留 | — |
| Model Selection L158-160 | 3 | 保留 | — |
| Content Pipeline L162-177 | 16 | **不复制概述**：`docs/content-pipeline.md` 已有「管线概览」（L6）与「HITL 检查点」（L61），验证其覆盖 AGENTS.md 现有信息点（HITL 强制规则、preflight 验证、`--draft` 用法、RAG reindex 触发点）后，**仅改指针**；**skill 触发规则保留 in-file 3 行**（路由决定「加载什么」，不藏进长文档）；HITL 强制规则 + preflight 硬规则留 in-file；压缩后 ~7 行 | 概述缺口（如有）补进 content-pipeline.md |
| Session Start Checklist L179-185 | 7 | 保留 | — |
| Web Scraping L187-200 | 14 | **Tavily fallback 硬规则唯一保留 in-file**（单权威）；工具表 + 工具发现段外移；压成 ~4 行 | `docs/tools-catalog.md`（T0a 完成后） |
| Agent skills L202-214 | 13 | 保留 | — |

**验收指标**：主指标 **words ≤ 1,330（基线 1,778 的 -25%）**，用 `wc -w` / `wc -c` 度量并记录 bytes 实际值；行数 ≤200 仅作粗护栏（长行可能是 token 大户，行数不进验收主判据）。

## 6. Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `AGENTS.md` | L41/Step 9 限定、Step 1 重写、PSR 章节合并改写、6 章节外移/压缩 | **High** | 规则源头；此类修改本身即 Substantial。缓解：行为矩阵逐行验收 + 三查 + 第三方复审 |
| `docs/tools-catalog.md` | T0a：3 处规范性表述改为回指 + 接收工具表 | Medium | 修改「何时不用/容错」语义（L100/L101/L112）；实施时 grep 全文 Tavily 确认无遗漏规范性表述 |
| `docs/video-workflow.md` | T0b 修过期路径 + 接收 skill 矩阵/分工注/M4A 细节 | Medium | 路径修正以 media-asset-management.md 为准 |
| `docs/content-pipeline.md` | **仅验证覆盖 + 补缺口（如有）**，不复制概述 | Low | 已确认 L6 管线概览 + L61 HITL 存在；实施时逐信息点核对覆盖 |
| `docs/conventions/fact-verification.md` | 新建 | Low | 新文件 |
| `docs/media-asset-management.md` | 不改内容 | Low | 仅被指针引用 |
| `docs/DOCS-INDEX.md` | 登记 pointer 关系 + 归档（T7b） | Low | |
| rollout tracker（新建，随 T7a） | 记录观察期数据 + 回滚阈值 | Low | 形态实施时定（GitHub Issue 优先，符合 issue-tracker.md） |
| `.agents/skills/*` | **不改** | — | git 未跟踪；如未来需要，先入库再改 |

**统一影响评估**（按 `scenario-matrix.md` 三问）：

1. **现有功能**：只重排规则文本与指针，不改代码路径；行为影响 = Agent 对路由/PSR 的解读变化，验证靠 18 行矩阵走查 + 第三方 review。
2. **下游消费者**：所有读 AGENTS.md 的 agent session；外移文档读者（pointer 回指）；DOCS-INDEX（新增登记）。无代码消费者。
3. **最坏后果**：Agent 误读新路由或漏执行 PSR 发布 Gate → 流程降级但不破坏产出物；rollout tracker 设回滚阈值，可控可回滚。

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | `src/` 单文件 typo | Trivial：直接改 + 最窄检查 + commit | Low | |
| 2 | `src/` ≤10 行**行为**修改 | **Small**，不是 Trivial | Low | 行数不作定档依据 |
| 3 | 实现+测试双文件，无契约变化 | Small 正常 | Low | 判定看影响面 |
| 4 | `admin.tsx` state 改动（High-Risk） | Substantial | Medium | |
| 5 | `scripts/article/` 改动触及发布、持久化或跨阶段契约 | Substantial（旧行为：无 workflow） | Medium | 定档按影响面；「大」改为可执行条件（第三轮 review 裁定） |
| 6 | 纯 AGENTS.md 规则修改 | **一律 Substantial**（即使一行） | Medium | |
| 7 | Trivial/Small session 结束 | **不执行 Step 1-8 结束清单**；结束验证 = 档位对应检查 | Medium | §3a 同步修改消除冲突 |
| 8 | Substantial session 结束 | 现行 Step 9 清单照常执行 | Low | |
| 9 | 方案/建议未附 PSR 清单即输出 | 未发布：用户打回；**含事实/参数断言的建议**（模型选型等）同样被覆盖；纯解释/无断言对话不触发 | Medium | 发布 Gate + 收窄的触发范围 |
| 10 | 方案进入 Grill，证据未齐 | Preflight 已列证据需求，Grill 补齐，发布 Gate 在 Grill 后 | Low | 两段式消除顺序倒置 |
| 11 | Small 中途触及 schema | **停止编辑；不 stash、不丢弃、不提交未完成工作**；补齐 Grill/Spec/Tickets 后继续；仅已验证的原子改动保留 commit | Medium | 升级协议写进 Step 1 |
| 12 | 混合任务（文案+逻辑） | 取最高档或拆分 | Low | |
| 13 | Small 中 Runtime Verify 失败 | 修复重验；需结构性改动则走升级协议 | Low | |
| 14 | 依赖/CI/部署变更 | Substantial | Medium | |
| 15 | PSR 清单某条不适用 | 标注「不适用 + 原因」，不跳过整张清单 | Low | |
| 16 | 做视频任务 | content-pipeline；skill 触发规则 in-file | Low | |
| 17 | Agent 抓网页倾向 Tavily | in-file 硬规则：fallback 链未走完不用；tools-catalog 无规范性表述可绕过 | **High**（付费） | 单权威：规则唯一活在 AGENTS.md |
| 18 | 创建媒体文件 | pointer → 权威文档 → 正确位置 | Medium | T0c 消歧 + 走查 |

## 7. 风险与缓解

1. **Pointer 失守**（场景 18）：T0c 消歧 + 走查；Tavily 已是 in-file 硬规则。
2. **三档判定裁量**：条件全为影响面硬判据 + tie-breaker；L41/Step 9 已同步，无文本冲突残留。
3. **tools-catalog 语义收紧的下游影响**（T0a）：依赖「CDP 慢时直用 Tavily」的流程会变慢——省钱换速度，方向正确；实施时 grep Tavily 全文核对。
4. **瘦身过度**：三查作为每个外移 ticket 的验收步骤。
5. **观察期风险（新增）**：实施后行为变化未被及时发现。缓解：rollout tracker + 回滚阈值——**观察期内 PSR 发布 Gate 未执行 ≥2 次，或路由误判 ≥3 次 → 回滚 AGENTS.md 至实施前 commit 并复审**。

## 8. 验收标准

- [ ] T0a/T0b 完成（外移目标可靠），先于对应外移 ticket
- [ ] **words ≤ 1,330**（`wc -w`，基线 1,778）；bytes 实际值记录；行数 ≤200（粗护栏）；Lovable 头部逐字未动
- [ ] `grep -n "每次改代码\|Step 1-8" AGENTS.md` 确认 L41/Step 9 已限定为 Substantial，无路由-流程冲突残留
- [ ] 行为场景 18 行逐一 dry-run 走查通过
- [ ] 文档审查三查通过（PSR 单章节 co-location；Tavily 单权威回指；指针逐字段覆盖；`ls` 验证文件存在性）
- [ ] `npm run lint:docs` 通过——**该 lint 不扫 `docs/proposals/`（已验证），不作为本 proposal 完整性证据**
- [ ] DOCS-INDEX.md 同步（不含 proposal 归档）
- [ ] 复审意见全部吸收或显式驳回并记录理由

## 9. 实施拆分建议（tracer-bullet tickets）

0. **T0a**（tools-catalog 3 处 Tavily 表述改回指）/ **T0b**（video-workflow 过期路径）——前置
1. **T1** 路由三档 + L41/Step 9 限定（§3）
2. **T2** 单一 PSR 章节 + fact-verification.md 新建（§4）
3. **T3** media/audio 外移 + T0c 消歧（§5b）
4. **T4** Content Pipeline：**验证 content-pipeline.md 覆盖 → 改指针**（不复制）；skill 触发规则留 in-file
5. **T5** Web Scraping 外移（Tavily 硬规则单权威留 in-file）
6. **T6** Core Commands 删除 + Snapshot/Commit Cadence 压缩
7. **T7a** DOCS-INDEX 同步 + **建 rollout tracker（含回滚阈值）**
8. **T7b** **观察 2-3 个真实 session**（记录 PSR 出现率、路由命中率）→ 达标后 proposal 归档至 `docs/archive/` + README 清单更新；触发回滚阈值则回滚并复审

每 ticket 完成即按 Commit Cadence commit（显式列路径）。

## 附录：PSR 自查记录（v3 更新）

| # | 条目 | 结论 |
|---|------|------|
| 1 | 因果依据 | 保持谨慎口径（观察到一次，待验证的贡献机制，引 handoff:74）；v3 各项修正均源自第二轮 review 可定位意见 |
| 2 | 设计决策不是免死金牌 | 行数指标因 review 指出「行数≠context load」改为 words/bytes 主判据；基线 `wc` 实测 1,778 words / 23,427 bytes 与 review 数字一致；v2 两处估计（~176 行、「逐字一致」验收）被推翻即改 |
| 3 | 影响面核查 | 新增 rollout tracker 进影响表；content-pipeline.md 处置从「接收概述」改为「验证覆盖+改指针」；T0a 范围经 `grep -i tavily tools-catalog.md` 实测扩至 L100/L101/L112 三处 |
| 4 | 事实性陈述双源验证 | 本轮新增实测：`wc -w -c -l AGENTS.md`（基线吻合）；`grep -i tavily docs/tools-catalog.md`（3 处规范性表述确认）；`grep -n "^#" docs/content-pipeline.md`（L6 管线概览、L61 HITL 检查点确认存在）；此前已实测 tools-catalog 主条目、video-workflow L105/L350-351、`git ls-files .agents/skills/`=0、lint 扫描范围 |
| 5 | 推理参数 | 不适用 |
