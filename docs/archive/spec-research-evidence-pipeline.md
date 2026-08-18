# Spec: Research Evidence Pipeline

**状态：** Proposed — 可在 IDE 中直接实施  
**范围：** 将 Web Deep Research 作为内容生产的强制证据层，接入现有“选题发现 → 文章 → scene-data → 视频 → TikTok”管线。  
**设计决策：** **保留 `search-sources.mjs` 作为实时发现器；新增 Stage 0.5「Research Evidence」，由 Web Deep Research 消费经过筛选的候选来源，输出版本化 evidence pack；Stage 1 文章生成和 MRL-1 只消费该 evidence pack 中已验证的事实。**

## Problem Statement

当前内容管线已经具备两种联网能力，但它们没有形成稳定的数据契约。`search-sources.mjs` 能以 `--trend` 或 `--research` 模式发现候选标题和 URL，并把结果写为 JSON；`web-deep-research` skill 能执行多源检索、交叉验证、综合与引用。两者之间仍依赖 Agent 临时判断：原始 `research-results.json` 没有结构化下游消费者，文章内的外部事实也没有强制映射回已验证来源。

这使文章质量取决于单次执行时的上下文，而不是管线本�这使文章质量取决于单次执行时的上下文，而不是管线本�这使文章质量取决于单次执行时的上下文，而不是管线本�这使斌记录机制；视频阶段发现内容问题时，也无法快速定位文章中的原始证据。

## Solution

将“发现”“验证”“写作”明确分离，并以 **evidence pack** 作为唯一证据来源。新流程在选题后、Stage 1 前引入 Stage 0.5：Search Sources 负责建立候选集合；一个确定性的 brief builder 将候选集合压缩为 research brief；Agent 根据 brief 执行 Web Deep Research；研究结果保存为 content-scoped evidence pack；文章、MRL-1、scene-data 和后续纠错均通过 claim ID 回溯到该 evidence pack。

> **核心规则：** 候选链接不是证据。只有 evidence pack 中状态为 `verified` 或标记为 `analysis` 的条目才能进入文章；`analysis` 必须和可验证的事实显式区分。

```mermaid
flowchart LR
  A[用户提供话题或趋势] --> B[Search Sources: 发现]
  B --> C[Research Brief Builder: 筛选与去重]
  C --> D{研究层级路由}
  D -->|标准| E[Web Deep Research]
  D -->|深度| F[Web Deep Research + 反证审查]
  E --> G[Evidence Pack]
  F --> G
  G --> H[Stage 1: 文章生成]
  H --> I[MRL-  H --> IEvidence Audit]
  I --> J[Stage 2: 文章发布]
  J --> K[Stage 3: scene-data]
  K --> L[MRL-2]
  L --> M[Stage 4: 视频制作]
  M --> N[MRL-3 + HITL]
  N --> O[TikTok 发布]

  P[用户给出的完整可信源材料] --> Q[建立受限 Research Brief]
  Q --> D
```

## Target Workflow

| 阶段 | 责任组件 | 输入 | 输出 | 完成标准 |
|---|---|---|---|---|
| 0: Discovery | `search-sources.mjs` | 话题、关键词、地域、时间窗 | `discovery.json` | 返回来源、标题、URL、片段、抓取状态和运行元数据。 |
| 0.25: Brief | Brief Builder | `discovery.json`、用户目标、已有素材 | `research-brief.json` | 候选已规范化和去重；研究问题、受众、时效边界、待验证主张和研究层级明确。 |
| **0.5: Research Evidence** | `web-deep-research` skill | `research-brief.json`、优先候选 URL | `evidence-pack.json` 与 `evidence-pack.md` | 每个 material clai| **0.5: Research Evid�日期、来源类型、验证状态和置信等级；冲突已记录。 |
| 1: Article | 文章生成工作流 | evidence pack、用户素材、写作要求 | 文章 Markdown、`article-claim-map.json` | 每个 material factual claim 都映射到证据；作者判断标为 analysis。 |
| 1.5: MRL-1 | Claim-Evidence Auditor | 文章、claim map、evidence p| 1.5: MRL-1 | Claim-Evidence Auditor | 文章、claim l cl| 1.5: MRL-1 | Clairejected/stale 证据；引用链接可用。 |
| 2–5 | 现有发布与视频管线 | 审核通过的文章 | 网站文章、scene-data、视频、发布 URL | 保持现有 MRL-2、MRL-3 和 HITL 规则。 |

### Research Routing

没有用户提供的完整可信源材料时，所有选题都进入 Stage 0–0.5。默认采用 **Standard** 深度；以下情况提升为 **Deep**：涉及�没有用户提供的完整可信源材料时，所有选题都进入 Stage 0–0.5。默认采用 **Standard** 深度；以下情况提升为 **Deep**：涉及�没有用户提供的完整可信源材料时，所有选题都进入 Stage 0–0.5。默认采用 **�之外的 material claim 做必要核验。若该内容包含外部事实、比较、数字或时效性结论，则仍完成 Stage 0.5。

| 路由 | 最低证据标准 | 典型用途 | 额外要求 |
|---|---|---|--|---|---|---|--|---|---|---|--|---|---|---|--|---|---|---|--|---|---|---|--|---|---|---|--|---|---|---|--|---|---|---|--|---|---|---|--|---|---|---|--|---|---|---|--|---|---|---|--|---|---|---|-�者。 |
| Deep | 每个 material claim 具备一手来源；关键结论至少两类独立来源交叉验证 | 政策、市场、benchmark、战略分析 | 必须记录反证、分歧和不确定性。 |

## Canonical Data Contracts

所有研究运行均以 `contentId` 和 `researchRunId` 关联。持久化位置使用现有内容目录下的 content-scoped research workspace；不得再依赖全局固定输出文件作为唯一运行结果。全局 research 文档仅保存可跨内容复用的方法论和长期参考结论。

### `discovery.json`

Discovery 是原始候选集合。它保留 Search Sources 的运行事实，而不声明任何内容结论。

| 字段 | 说明 |
|---|---|
| `schemaVersion`、`contentId`、`researchRunId`、| `schemaVersion`、`contentId`、`researchRunId`、| `schimeWindow`、`locale` | 发现边界。 |
| `sources[]` | 每条候选的规范化 URL、原始 URL、标题、片段、来源名、来源类别、发布日期（可得时）、采集方法与采集状态。 |
| `failedSources[]`、`sourceCount` | 结果覆盖率与失败可观测性。 |

### `research-brief.json`

Brief 是 Web Deep Research 的唯一输入。它必须压缩 discovery，而不是将所有 URL 无差别交给研究阶段。

| 字段 | 说明 |
|---|---|
| `researchQuestion` | 一句可证伪、可完成的研究问题。 |
| `audience`、`contentFormat`、`deadline` | 写作和时效边界。 |
| `claimsToVerify[]` | 每条包含 `claimId`、问题、风险等级、是否要求一手来源。 |
| `candidateSources[]` | 仅保留去重后、与问题相关且有来源元数据的优先 URL。 |
| `researchTier` | `standard` 或 `deep`，并包含升级原因。 |
| `knownFacts`、`openQuestions`、`userMaterials` | 已知事实与待查空白必须分开。 |

### `evidence-pack.json`

Evidence pack 是内容制作的证据单一来源。Markdown 版本面向审阅；JSON 版本供检查器与生成工作流消费。每个 evidence item 的状态只能是 `verified`、`context`、`analysis`、`conflicted`、`rejected` 或 `stale`。

| 字段 | 说明 |
|---|---|
| `evidenceId`、`claimId` | 将研究、文章与视频纠错连接为可追溯图。 |
| `statement` | 可直接检验的原子化陈述，不混合事实与评价。 | `statement` | e` | `primary`、`authoritative-secondary`、`independent-secondary`、`community` 或 `analysis`。 |
| `source` | URL、标题、发布者、发布日期、访问日期、原文摘录及定位信息。 |
| `verification` | 状态、交叉验证来源 ID、置信等级、时间有效性和冲突说明。 |
| `usage` | 可用于文章的表述限制、需附带的限定语、是否禁止用于视频口播。 |

### `article-claim-map.json`

Article claim map 由文章生成阶段产生并在 MRL-1 中校验。它列出每一条 material claim 对应�Article claim map 由文章生成阶段产生并在 MRL-1 中校验。它列出每一条 material claim 对应�Article claim map 由文章生成阶段产生并在 MRL-1 中校验。它列出每一条 material claim 对应�Article claim map ��源注册表、API/CDP/MCP fallback 和既有 `--trend`/`--research` 语义。它不负责阅读全文、交叉验证、生成研究结论或判断文章可发布性。

2. **Search Sources 改为 run-scoped output。** CLI 必须接受 `contentId`、`researchRunId` 和显式输出路径，默认输出位置在对应内容 workspace；输出始终写入 `discovery.json`。保留原有 `trending-topics.json` 作为趋势发现缓存，但不得作为文章研究的唯一输入。

3. **新增确定性 Brief Builder。** 该模块只做 URL 规范化、跨源去重、时间窗过滤、来源元数据补齐、优先级排序和 schema 校验；它不进行事实判断或写作。优先级应以一手来源、官方技术文档、原始公告和高质量独立媒体为先。

4. **Web Deep Research 是 Agent 执行的工作方法，不伪装为 Node 自动调用。** 管线 skill 在 Stage 0.5 显式加载 `web-deep-research`；其输入是 research brief，输出必须是 evidence pack。自动化脚本只负责准备、验证和持久化契约。

5. **Web Deep Research skill 升级为 evidence-first。** 该 skill 不再仅产出自由形式报告：每次运行先确认 research brief，再为每个 material claim 记录证据和状态；Deep 路由必须执行反证/冲突审查；Markdown 报告由 JSON evidence pack 渲染或同步生成，避免两份独立真相。

6. **Stage 1 只能从 evidence pack 引入外部 material claims。** 文章生成可保留独立观点，但所有可验证事实、数字、日期、产品能力、政策、人物归属和市场判断都必须出现在 claim map 中。无证据事实需要回流到 Stage 0.5，而不是用模糊措辞绕过。

7. **MRL-1 成为 Claim-Evidence Audit。** 审计器解析文章、claim map 与 evidence pack，并在以下情形失败：缺少映射；映射到 `rejected`/`stale` 项；高风险 claim 没有达到路由要求；引用 URL 不可访问；事实与 evidence statement 的数字、日期或实体不一致。失败后回到研究或文章阶段，直至为零。

8. **文章到视频继承 claim ID。** scene-data 的每一个涉及 material claim 的 scene 保存 `claimIds`。视频修改或事实更正时，可从 claim ID 精确定位文章段落、旁白、画面数据和字幕，而非进行全文猜测式搜索。

9. **所有证据执行时效性检查。** evidence item 保存 `publishedAt`、`accessedAt` 和 `validUntil`。涉及新闻、人员任职、产品能力、定价、政策与市场数字的内容，在发布前重新检查是否 stale；超过时效窗口的结果必须重新研究或标明历史时间点。

10. **研究运行具备可观测性。** 每次运行记录候选数量、去重数、来源失败数、一手来源覆盖、未解决冲突、MRL-1 失败数、重试次数和最终 evidence coverage。指标用于优化来源注册表与研究路由，不用于替代编辑判断。

## User Stories

1. As a content operator, I want every topic to have a run-scoped research workspace, so that I can reproduce why an article used particular facts and sources.
2. As an editor, I want Search Sources to produce a candidate pool rather than unverified conclusions, so that trend discovery remains fast without lowering editorial standards.
3. As a research agent, I want a concise research brief with explicit claims and priority URLs, so that research effort is focused on the questions that affect the article.
4. As an editor, I want every material factual claim to map to a specific evidence item, so that I can correct a disputed statement without re-researching the entire topic.
5. As a video producer, I want scene5. As a video producer, I want scene5. As a video producer, I want scene5. As a video producer, I want scene5. As a video producer, I want scene5. As a video producer, I want scene5. As a video producer, I want scene5. As a video producer, I want scene5. As a video producer, I want tent operator, I want the pipeline to distinguish author analysis from external fact, so that strong opinions remain possible while citations remain honest.
8. As a maintainer, I want source failures and coverage metrics recorded per run, so that the source registry can be improved with evidence rather than anecdote.
9. As a user who provides source material, I want the pipeline to reuse it while verifying any added external claims, so that supplied context is respected without introducing unsupported statements.
10. As a publisher, I want MRL-1 to block unsupported or stale factual claims before the article is published, so that later video production is based on a stable script.

## Modified Files Impact

| 文件/组件 | 预期修改 | 风险等级 | 影响与验证 |
|---|---|---|---|
| 内容管线执行文档 | 新增 Stage 0.5、输入输出和 MRL-1 契约 | Medium | 会改变 Agent 的必经步骤；通过三个入口场景演练和文档链接校验验证。 |
| Short Video Pipeline skill | 在选题后强制调用 research brief 与 evidence 流程 | High | 属于 Agent 编排主路径；通过有素材、只有话题、热点发现三条完整模拟流验证。 |
| Web Deep Research skill | 采用 evidence-first 输出与冲突审查 | High | 所有深研任务的交付格式改变；用 Standard/Deep 的 fixture 验证 schema、引用和冲突行为。 |
| Search Sources CLI | 引入 run-scoped output、内容 ID 与 discovery schema | Medium | 影响现有趋势与研究产物；保留兼容参数，并以现有来源 registry fixture 回归。 |
| Scene-data schema 与验证器 | 新增 optional/required claim ID 引用 | Medium | 会影响渲染前验证；将无 material claim 的 scene 设为合法空集合，以既有 content fixtures 回归。 |
| Article/MRL-1 生成与审计 | 新增 claim map 和 evidence coverage gate | High | 直接改变文章发布前的成功条件；通过缺证、冲突、过期、纯观点和完整覆盖案例验证。 |
| 新增 research workspace 与 schema fixtures | 新增内容专属研究产物及测试样例 | Low | 不改变既有运行逻辑；通过 schema validation 和清理策略验证。 |

## Behavioral Scenarios

| # | 场景 | 期望行为 | 风险 | 缓解与测试 |
|---|---|---|---|---|
| 1 | 用户提供单个官方公告并要求快讯 | 建立受限 brief；公告作为 primary evidence；新增外部事实仍需核验 | 过度研究拖慢快讯 | fixture 仅有一手来源，验证只对新增 claim 创建研究任务。 |
| 2 | 用户只给“某公司 AI 芯片突破”话题 | Discovery 采集候选；brief 设为 Standard 或 Deep；文章须等待 evidence pack | 把标题当事实 | e2e fixture 验证未生成 evidence pack 时 Stage 1 不可通过。 |
| 3 | 多家媒体转载同一新闻 | Brief Builder 规范化 URL、聚合重复报道，优先原始公告 | 转载数量虚增可信度 | dedup fixture 与 primary-source preference assertion。 |
| 4 | 关键来源互相冲突 | evidence item | 4 | 关键来源互相冲突 | evidence item | 4 | 关键来源互相冲突 | evidence item | 4 | 关键来源互相冲突 | evidence item | 4 | 关�成确定事实。 |
| 5 | 搜索来源抓取失败或需登录 | discovery 记录失败原因；brief 不能虚构覆盖；研究使用可访问的独立来源或标为缺口 | 静默缺失造成偏差 | CDP/API/MCP failure fixture，断言失败来源进入运行元数据。 |
| 6 | 高风险数字仅来自二手媒体 | Standard/Deep 要求回溯原始报告、财报、公告或标为未证实 | 误报市场/融资数据 | fixture 验证缺一手来源导致 MRL-1 失败。 |
| 7 | 某证据在发布前过期 | 发布前时效检查标为 stale，并要求刷新或显示历史日期 | 旧信息作为现状发布 | 时间窗 fixture 断言 stale evidence 不可映射到 current-tense claim。 |
| 8 | 作者写出明确观点而非外部事实 | claim map 标记 analysis，关联支持性事实但不伪装成来源结论 | 抑制有价值的原创分析 | fixture 验证 analysis 不需要伪造外部引文且可通过审计。 |
| 9 | 视频阶段发现数字写错 | 通过 claim ID 定位 evidence、文章段落和 scene-data�| 9 | 视频阶段发现数字写错 | 通过 claim ID 定位 evidence、文章段落和 scene-data�| 9 | 视频阶段发现数字写错 | 通过 claim ID 定位 evidence、文章段落和 scene-data�| 9 | 视频阶段发现数字写错 | 通过 claim I出文件互相覆盖 | 并发 run fixture，断言目录与 manifest 独立。 |
| 11 | 用户要求跳过研究并立刻发布 | 允许用户减少范围，但 MRL-1 仍拒绝无证据的 material claim；可只发布经证实部分 | 把用户速度要求理解为放弃事实门槛 | policy fixture 验证人工请求不绕过 evidence audit。 |
| 12 | 新增来源配置后返回异常字段 | schema normalizer 将其变为统一 candidate 或记录为 failed source | 注册表扩展破坏 downstream | source adapter contract tests。 |

## Testing Decisions

测试应验证外部行为和数据契约，而不是某个具体函数的实现顺序。最高价值 seam 是 **从 discovery 输入到“MRL-1 是否允许文章通过”的完整研究证据链**；它覆盖搜索产物、brief、evidence pack、claim map 和审核器之间最关键的接口。

| 测试层 | 必测行为 | 通过标准 |
|---|---|---|
| Schema contract | discovery、brief、evidence pack、claim map 的版本与必填字段 | 所有 fixture 可校验；未知版本被显式拒绝或迁移。 |
| Source adapter| Source adapter| Source adapter| Source adapter| Source adapter| Source adapter| Source adapter| Source adapter| Source adapter| Source adapter| Source adapter| Source adapter| Source adapter| Source adapter| Source adapter| Source adapter| Source adapter| Sour�升为 Deep。 |
| Evidence validation | 证据状态、引用摘录、交叉验证、staleness 和冲突 | 不满足路由阈值的 material claim 不能成为 verified。 |
| MRL-1 | claim map 覆盖、stale/rejected 禁�| MRL-1 | claim map 覆盖、stale/rejected 禁�| MRL-1 | claim map 覆盖、stale/rejected 禁�| MRL-1 | claim map 覆盖、stale/rejected 禁�| MRL-1 | claim map 覆盖、stale/rejected 禁�| MRL-1 | claim map 覆盖、stale/rejected 禁�| MRL-1 | claim map 覆盖、stale/rejected 禁�| M�生产物覆盖；只在 evidence audit 通过后进入发布阶段。 |

## Execution Sequence

1. 建立 content-scoped research workspace、四份 schema 和 fixture；先实现 schema validator 与 manifest。
2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2. 将 Se2.  Pipeline skill 在 Stage 1 前强制交接 evidence pack。
5. 实现 Stage 1 的 claim map 写入与 MRL-1 Claim-Evidence Auditor；文章发布必须依赖审计通过。
6. 扩展 scene-data 与验证器以携带 claim IDs；确保视频中的 material claim 可回溯。
7. 将 Stage 0.5、数据契约和失败恢复写回内容管线文档；运行全套 schema、adapter、MRL-1 和 e2e fixtures。

每一步提交前都应运行与所改 seam 对应的测试，并对已有内容样本做回归。历史内容无需一次性迁移：首次被重新编辑或重新制作为视频时，按新契约补建 evidence pack 与 claim map。

## Acceptance Criteria

1. 每个仅有话题或趋势的内容在 Stage 1 前都拥有 run-scoped discovery、research brief 和 evidence pack。
2. `search-sources.mjs` 的输出不再依赖单个全局 `research-results.json` 文件，且并发运行不会覆盖彼此产物。
3. Web Deep Research 的一次执行可从 `research-brief.json` 开始，并输出 schema-valid evidence pack；Deep 路由包含冲突/反证记录。
4. 文章中的所有 material factual claims 都可在 `article-claim-map.json` 中映射到 `verified` 或受限 `analysis` evidence；MRL-1 对未映射、stale、rejected 或不足交叉验证的 claim 失败。
5. 所有包含 material claims 的 scene-data scenes 都携带 claim IDs，并可回溯到文章和 evidence pack。
6. 用户提供的完整材料能被保留为 primary evidence；添加外部事实仍受同一审计规则约束。
7. 现有 Stage 2–5 的 MRL-2、MRL-3、HITL 和发布安全门保持不变。
8. 文档中的阶段名称、schema 版本、命令说明和错误恢复指向单一的运行事实，避免复写来源数量等易变配置。

## Out of Scope

本方案不更换现有的 CDP、MCP、API 来源访问实现，不删除来源注册表，不把 Web Deep Research 变为无监督的后台任务，也不改变 TikTok 发布确认机制。它同样不承诺为所有历史文章补建证据包；历史内容采用按编辑触发的渐进迁移。

## Design Decisions & References

- 现有内容管线入口、Stage 1–5 以及 MRL/HITL 规则：`docs/content-pipeline.md`。
- Search Sources 的运行模式、raw research 输出与来源选择逻辑：`scripts/short-video/search-sources.mjs`。
- 来源采集分层、fallback 顺序及 Search Sources 的 entry-point 角色：`docs/adr/0013-asset-sourcing-three-layer.md`。
- Web Deep Research 的八阶段研究方法与 `web-access` 依赖：`skills/web-deep-research/SKILL.md`。
- 场景矩阵要求：`docs/conventions/scenario-matrix.md`。
