# Spec: AGENTS.md 结构重构 — 路由三档分级 + 单一 PSR 章节 + 分层瘦身

> 来源：`docs/proposals/proposal-agents-md-restructure.md`（v3，经两轮第三方 review 批准进入 Grill/Spec）。
> Grill 裁定记录：Q1-Q7 全部按推荐答案通过（2026-09-01）。

## Problem Statement

作为与 Agent 协作的开发者，我遇到三个问题：给出修改方案时 Agent 不执行 Proposal Self-Review（已观察到一次）；小改动被要求走全套 9 步流程导致规则被系统性跳过（实操中绕过，比规则太严更糟）；AGENTS.md 每次调用全量注入 214 行，分支任务材料稀释了高频规则的注意力。三者共同后果：规则文本存在，但行为不可靠。

## Solution

AGENTS.md 重构为：路由三档（Trivial/Small/Substantial，影响面定档，与 workflow 强制范围完全同步）；单一 `## PSR` 章节（Preflight + 发布 Gate + 五条检查，全局生效，覆盖研究/建议场景）；分支材料外移到权威文档（T0 前置修复保证外移目标可靠），AGENTS.md 只留指针和硬规则，遵循单一权威原则。

## User Stories

1. As a 开发者, I want 小改动（typo/注释/格式）有合规的直达路径, so that 我不必在「走全套流程」和「违规绕过」之间二选一
2. As a 开发者, I want 档位由影响面决定而非文件数/行数, so that 实现文件+测试文件的双文件改动不被误升级为完整流程
3. As a 开发者, I want 修改 AGENTS.md 等 Agent 治理文件的请求一律走完整 workflow, so that 规则源头不被轻率修改
4. As a 开发者, I want Small 执行中途触及门槛时有安全的升级协议, so that 未完成/未验证的工作不会被 stash、丢弃或提交
5. As a 开发者, I want Trivial/Small session 不执行 Step 1-8 结束清单, so that workflow 文本与路由规则无冲突
6. As a 开发者, I want Agent 输出修改方案或含事实/参数断言的建议前先做 PSR Preflight、发布前附完整清单, so that 模型选型等研究/建议场景也被自审覆盖
7. As a 开发者, I want 日常无断言的问答不触发 PSR 清单, so that 日常协作不被五项清单淹没
8. As a 开发者, I want PSR 的 Preflight、发布 Gate、五条检查集中在单一章节, so that 规则只有一处权威来源
9. As a 开发者, I want Tavily fallback 硬规则唯一活在 AGENTS.md, so that 其他文档不会出现可绕过它的规范性表述
10. As a 开发者, I want 媒体文件存放规则外移到权威文档并在 AGENTS.md 留消歧指针, so that 我不必分辨两个 `assets/` 的含义歧义
11. As a 开发者, I want skill 加载触发规则保留在 AGENTS.md, so that 「该加载什么」不藏在 497 行的长文档里
12. As a 开发者, I want AGENTS.md 的 context load 从 1,778 words 降到 ≤1,330, so that 高频规则获得更集中的注意力
13. As a 开发者, I want 实施后有 rollout tracker 和回滚阈值, so that 行为劣化可被观察并可逆
14. As a 开发者, I want 观察期完成后 proposal 才归档, so that 归档时机与验收证据一致
15. As a Agent, I want 档位判定条件全部可检查, so that 我不必在模糊边界上掷硬币
16. As a Agent, I want PSR Preflight 轻量（只列证据需求）, so that Grill/研究中补齐证据的流程不被阻塞
17. As a reviewer, I want 每个行为场景行有对应的 dry-run 走查, so that 文档改动可验证而非仅凭感觉

## Implementation Decisions

**路由（Grill Q7 采纳去重）**

- Step 1 重写为三档判定：Trivial（全条件同时满足：无行为变化 typo/注释/格式、单文件、不新增依赖）、Small（全条件：无跨模块契约/API/schema/RLS 变化、不碰持久化/权限/安全面、不新增依赖/不改 CI/部署、不碰 High-Risk Areas、不改管线核心）、Substantial（触及任一门槛或依赖/CI 变更）。文件数与行数只是提示，不作定档依据。
- 升级协议：Small 中途触及门槛 → 停止编辑，不 stash、不丢弃、不提交未完成工作，补齐 Grill/Spec/Tickets 后继续；仅已独立完成并验证的原子改动可保留 commit。
- High-Risk Areas 新增「Agent 治理文件」条目（AGENTS.md、workflow/skill 路由文档、上下文指针）；Small 判定只引用「不碰 High-Risk Areas」，不重复枚举（单一权威）。
- 同步修改：L41「每次改代码必须走完」限定为 Substantial session；Step 9 结束清单限定「仅 Substantial session 适用」，Trivial/Small 结束验证 = 档位对应检查。
- 拿不准向上升档。

**PSR（Grill Q4 原位、Q5 范围）**

- 单一 `## PSR` 章节原位替换现 Proposal Self-Review（PR/Merge Guardrails 之后），含三部分：触发范围（仓库修改方案 + 含事实或参数断言的模型/工具/配置建议；日常问答/纯解释不触发）、Preflight（先列证据需求，轻量）、发布 Gate（完整五条清单附证据，清单未附 = 方案未发布）。
- 第 4 条规则本体 ~2 行留 AGENTS.md，操作程序（pip show/inspect smoke test 链、which+官方文档、定价查询、新工具维护状态检查）外移到新建 `docs/conventions/fact-verification.md`。
- 第 5 条本体留 AGENTS.md。
- Workflow 内仅在 Grill 入口和 Spec 前留短指针，不展开内容。
- Leading word `PSR` 仅在 AGENTS.md 内复用（`.agents/skills` 不受 git 跟踪，模板改动不在范围）。

**分层瘦身（Grill Q6 采纳）**

- 删除 Core Commands 章节（package.json 是 source of truth；verify 命令已在 Runtime Verify）。
- Snapshot 压缩至 4 行：保留 App 一句话 + Auth model + conventions 指针；删 Stack 明细与 Core directories。
- Commit Cadence 删 TL;DR 段（与六条规则重复）。
- Media Asset Placement + Audio File Handling 压成 2 行指针（含两个 `assets/` 消歧 + `LibsndfileError` 触发词）。
- Content Pipeline：**不复制概述**到 content-pipeline.md（其 L6 管线概览、L61 HITL 检查点已存在）；验证覆盖后仅改指针；skill 触发规则保留 in-file 3 行；HITL 强制规则 + preflight 硬规则留 in-file。
- Web Scraping：Tavily fallback 硬规则唯一保留 in-file；工具表外移 tools-catalog；压成 ~4 行。
- 不动：Lovable 头部、Session Workflow 骨架、PR/Merge Guardrails、Coding Conventions、Git Safety、Cross-Branch、Session Boundary、Learned Preferences、Model Selection、Session Start Checklist、Agent skills 指针、Context Hygiene/恢复协议 blockquote。

**单一权威原则**：规范性规则唯一活在 AGENTS.md；外移文档只留操作细节并回指，不得出现可绕过 AGENTS.md 硬规则的规范性表述。

**前置修复（T0）**：tools-catalog 三处 Tavily 规范性表述（L100/L101/L112）改为回指；video-workflow L105/L350-351 过期 `assets/` TTS 路径按 media-asset-management.md 修正。

**实施形态（Grill Q1/Q2 采纳）**：worktree → 新分支 → PR（遵循 Cross-Branch Workflow；Lovable 分支只普通 push 新 commit）；rollout tracker 用 GitHub Issue。

## Testing Decisions

- 测试 seam：对 AGENTS.md 及外移文档的**文本 dry-run 走查**——场景矩阵 18 行逐行构造假设任务，核对路由结果与行为预期。这是纯文档改动可用的最高 seam（无代码接口可测）。
- 测试先行（Grill Q3 采纳）：每个 ticket 先把其对应的矩阵行写成走查清单，对改动前文本执行确认 red，改后 green。不写伪单测。
- 文档审查三查（AGENTS.md → Coding Conventions → 文档审查三查）作为 T3-T6 的附加断言：跨章节矛盾、指针目标完整性（逐字段）、文件存在性（ls）。
- 度量：`wc -w` / `wc -c` 为主判据（words ≤1,330，基线 1,778）；行数 ≤200 仅粗护栏。
- **Reviewer-approved deviation（2026-09-01 第二轮 review 裁定）**：实测 **1,506 words / 21,091 bytes / 178 行**，words 目标 ≤1,330 **未达成**（-15.3%）。reviewer **接受偏差、不授权继续压缩**；本条保留为未达标记录，不得标记为达成。原因：review 轮裁定回填的 in-file 硬规则/触发规则 + `wc -w` 对 CJK 文本低计。
- `npm run lint:docs` 须通过，但已知其不扫 `docs/proposals/`（已验证 lint-doc-hierarchy.mjs 扫描范围），不作为 proposal/spec 自身完整性的证据。
- 注意：commit AGENTS.md 会触发 `.githooks` 的 doc-hierarchy lint（staged 检查），属预期行为。

## Scenario & Risk Verification

### Modified Files Impact

| 文件                                    | 修改内容                                                    | 风险等级 | 评估                                                      |
| --------------------------------------- | ----------------------------------------------------------- | -------- | --------------------------------------------------------- |
| `AGENTS.md`                             | L41/Step 9 限定、Step 1 重写、PSR 章节改写、6 章节外移/压缩 | High     | 规则源头；缓解：矩阵逐行走查 + 三查 + 第三方已两轮 review |
| `docs/tools-catalog.md`                 | T0a 三处 Tavily 表述改回指 + 接收工具表                     | Medium   | 实施时 grep 全文 Tavily 确认无遗漏                        |
| `docs/video-workflow.md`                | T0b 修过期路径 + 接收 skill 矩阵/分工注/M4A 细节            | Medium   | 以 media-asset-management.md 为准                         |
| `docs/content-pipeline.md`              | 仅验证覆盖 + 补缺口（如有）                                 | Low      | 已确认 L6/L61 存在                                        |
| `docs/conventions/fact-verification.md` | 新建                                                        | Low      |                                                           |
| `docs/media-asset-management.md`        | 不改内容                                                    | Low      |                                                           |
| `docs/DOCS-INDEX.md`                    | pointer 关系登记                                            | Low      |                                                           |
| rollout tracker（GitHub Issue）         | 新建，观察期数据 + 回滚阈值                                 | Low      |                                                           |

**统一影响评估**（按 `scenario-matrix.md` 三问）：

1. **现有功能**：本改动只重排规则文本与指针，不改任何代码路径；AGENTS.md 作为 always-injected context，行为影响 = Agent 对路由/PSR 的解读变化。验证 = 18 行矩阵逐行走查（Testing Decisions）+ 第三方 review（已三轮）。
2. **下游消费者**：所有读 AGENTS.md 的 agent session（路由/PSR 行为变化）；`tools-catalog` / `video-workflow` / `fact-verification` 的读者（pointer 回指）；DOCS-INDEX（新增登记）。无代码消费者。
3. **最坏后果**：Agent 误读新路由或漏执行 PSR 发布 Gate → 流程降级但不破坏产出物；观察期 tracker（#167）设回滚阈值（Gate 未执行 ≥2 或路由误判 ≥3 → revert），后果可控且可回滚。

### Behavioral Scenarios

| #   | Scenario                                            | Expected Behavior                                               | 风险维度   | Mitigation                                      |
| --- | --------------------------------------------------- | --------------------------------------------------------------- | ---------- | ----------------------------------------------- |
| 1   | `src/` 单文件 typo                                  | Trivial：直接改+最窄检查+commit                                 | 路由       |                                                 |
| 2   | `src/` ≤10 行行为修改                               | Small，不是 Trivial                                             | 路由       | 行数不作定档依据                                |
| 3   | 实现+测试双文件，无契约变化                         | Small 正常                                                      | 路由       | 影响面定档                                      |
| 4   | `admin.tsx` state 改动                              | Substantial                                                     | 路由       | High-Risk                                       |
| 5   | `scripts/article/` 改动触及发布、持久化或跨阶段契约 | Substantial                                                     | 路由       | risk-based 全覆盖；定档按影响面，「大」不作依据 |
| 6   | 纯 AGENTS.md 修改                                   | 一律 Substantial                                                | 治理       |                                                 |
| 7   | Trivial/Small session 结束                          | 不执行 Step 1-8 清单                                            | 流程一致性 | L41/Step 9 限定                                 |
| 8   | Substantial session 结束                            | 现行清单照常                                                    | 流程一致性 |                                                 |
| 9   | 方案/建议未附 PSR 清单                              | 未发布；含断言的建议被覆盖；无断言对话不触发                    | PSR        | 触发范围收窄                                    |
| 10  | Grill 中证据未齐                                    | Preflight 已列需求，发布 Gate 在 Grill 后                       | PSR        | 两段式                                          |
| 11  | Small 中途触及 schema                               | 停止编辑；不 stash/丢弃/提交未完成工作；补齐流程后继续          | 升级安全   | 升级协议                                        |
| 12  | 混合任务                                            | 取最高档或拆分                                                  | 路由       |                                                 |
| 13  | Small 中 Verify 失败                                | 修复重验或走升级协议                                            | 升级       |                                                 |
| 14  | 依赖/CI/部署变更                                    | Substantial                                                     | 路由       |                                                 |
| 15  | PSR 某条不适用                                      | 标注不适用+原因                                                 | PSR        |                                                 |
| 16  | 做视频任务                                          | content-pipeline；skill 触发规则 in-file                        | 路由       |                                                 |
| 17  | 抓网页倾向 Tavily                                   | 硬规则：fallback 链未走完不用；tools-catalog 无规范性表述可绕过 | 单权威     | 回指                                            |
| 18  | 创建媒体文件                                        | pointer → 权威文档 → 正确位置                                   | 指针       | T0c 消歧                                        |

### Rollout & Rollback

- 观察期 2-3 个真实 session，tracker 记录：PSR 发布 Gate 出现率、路由档位命中率。
- 回滚阈值：PSR 发布 Gate 未执行 ≥2 次，或路由误判 ≥3 次 → 回滚 AGENTS.md 至实施前 commit 并复审。
- 观察达标 → proposal 归档 `docs/archive/` + README 清单 + 关闭 tracker issue。

## Out of Scope

- `.agents/skills/` 下任何第三方 skill 的修改（git 未跟踪，改动会被 update 覆盖；to-spec/review 模板的 PSR 化不在范围）。
- `grill-with-docs` fork。
- Context Hygiene / 压缩恢复协议 blockquote 的压缩。
- 代码层面的任何改动（本 spec 纯文档/治理）。
- 场景枚举清单第 1-7 类、C1-C3 专项（无代码数据流，不适用）。

## Further Notes

- 实施分支：worktree → 新分支 → PR；Lovable 连接分支只普通 push 新 commit，禁止改写历史。
- 每 ticket 完成即 commit（显式列路径），AGENTS.md 的 commit 会触发 pre-commit doc-hierarchy lint。
- `npm run lint:docs` 不扫 `docs/specs/`、`docs/proposals/`、`docs/tickets/`，本 spec/tickets 的完整性靠三查人工执行。
- 偏差说明：to-spec skill 默认发布到 issue tracker，本 spec 按 repo 惯例落 `docs/specs/`（与 docs/archive/ 既有 spec-*.md 一致）。
