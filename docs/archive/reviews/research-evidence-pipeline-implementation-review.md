# Research Evidence Pipeline — Implementation Review

**审查范围：** `e87d71e`（Research Evidence Pipeline 实现）及 `ec532c9`（Stage 0.5 文档接入）。  
**审查结论：** **Request changes**。基础库、schema 与单元测试已经具备，但“每个内容运行独立、每个事实只由已验证证据支撑、审计实际阻止发布”这三个核心契约尚未落地。

## 结论摘要

先澄清风险术语：本 review 中的“严重级别”是**实现缺陷的合并风险**；`claim.riskLevel` 是**内容主张的事实风险**。两者不可混用。

当前未完成事项不是“两项 High”，而是 **2 项 Blocker、1 项 High、1 项 Medium**。两个 Blocker 都会直接破坏证据管线的核心承诺，必须优先处理。

| ID   | Review 严重级别 | 未完成事项                                                               | 为什么会阻塞或降级                                                                          |
| ---- | --------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| R0-1 | **Blocker**     | 同一 content 的不同 `researchRunId` 共享 artifact 路径                   | 后一次运行会覆盖前一次的 discovery、brief、evidence pack 与 claim map，无法复现或并发执行。 |
| R0-2 | **Blocker**     | Stage 0.5 与 MRL-1 没有接入真实编排和发布路径                            | brief builder、auditor、scene claims 是未被生产流程调用的库；审计失败不会阻止文章发布。     |
| R1-1 | **High**        | fact claim 可映射到 `conflicted`、`context` 或 evidence-level `analysis` | 与“material factual claim 只能使用 verified evidence”的契约冲突，会将未证实事实带入文章。   |
| R2-1 | **Medium**      | manifest 不记录已写入 artifact，读写也不校验 content/run 一致性          | 追溯链不完整；误读、错 run 或覆盖后的 artifact 不会被发现。                                 |

## 必须修复（R0）

### R0-1 — Run ID 必须进入 artifact 路径与读写校验

当前 workspace 函数只使用 content slug 组装 `content/<slug>/research`；`researchRunId` 是参数，但不参与路径解析。不同 run 会写入同名 JSON 文件。测试所谓“Concurrent run isolation”只验证不同 slug，未验证同 slug 的两个 run。

**目标行为。** workspace 根目录保持为 `content/<slug>/research/`，但每次运行的 artifact 放在 `content/<slug>/research/<researchRunId>/`；`research-manifest.json` 保持在 research 根目录。每次 write/read 都验证 artifact 内的 `contentId` 和 `researchRunId` 等于请求值。

**完成条件。** 两个不同 run 对同一 slug 分别写入 discovery 与 evidence pack 后，读取任一 run 都只能返回本 run 的对象。跨 run 读取必须失败；manifest 必须列出每个 run 的 artifact、写入时间、schema 版本和完成状态。

### R0-2 — 将证据链接入真实 Stage 1 / 发布门禁

当前只有 `search-sources.mjs` 使用 workspace。`buildBrief()`、`auditClaims()`、`validateAllSceneClaimIds()` 没有非测试调用；Short Video Pipeline skill 也没有要求执行 evidence handoff。因此 Stage 0.5 文档是声明，尚不是可执行管线。

**目标行为。** 入口 2 必须执行：scoped discovery → brief builder → Web Deep Research → evidence pack → article claim map → `auditClaims()`。任何 audit failure 必须终止 Stage 1 到 Stage 2 的转换，并给出 claim ID、原因和回流阶段。

**完成条件。** 增加一个真实编排 seam 或 CLI，使它在审计失败时返回非零退出码，且不会调用文章发布；在审计通过后才允许进入现有 Stage 2。E2E fixture 至少覆盖“无 evidence”“冲突 evidence”“通过的 evidence”三种路径。

## 合并前应修复（R1）

### R1-1 — Fact claim 只可使用 `verified` evidence

目前 auditor 只拒绝 `rejected` 和 `stale`，因此 `conflicted`、`context` 和 `analysis` evidence 都能支撑 `type: "fact"` 的 claim。这与 Stage 0.5 的明文规则冲突。

**目标行为。** fact claim 的 evidence status 必须为 `verified`。`context` 仅可用于研究背景；`conflicted` 必须阻断事实表述并触发回流研究；`analysis` 只能表示作者判断，不能作为外部事实证据。若要发布仍在争议中的报道，只能写成带来源归属的元事实，例如“某机构声称……”，并为该元事实建立单独的 `verified` evidence item。

**完成条件。** auditor 针对上述三个非 `verified` status 都失败；测试覆盖 status 矩阵。analysis claim 可以存在，但应保存其支持的 fact claim IDs，而不是完全脱离证据。

## 可随后完善（R2）

### R2-1 — 让 manifest 成为可用的运行账本

`writeResearchArtifact()` 仅更新 `lastUpdated`，没有传递 `artifactWritten`，因此 manifest 的 `artifacts` 不会填充；read 也不验证对象归属。

**目标行为。** manifest 记录 artifact 文件名、schema version、写入时间、内容 hash、状态和错误摘要。它只做运行索引，不作为 artifact 内容的第二份真相。

## 内容主张风险（`claim.riskLevel`）判定规范

### 1. 定义

> **高风险主张**是指：如果其不准确、过期或被断章取义，会显著改变读者对公司、产品、市场、政策或个人的判断，并可能造成显著的声誉、财务、合规或安全后果的外部事实陈述。

“高风险”不等同于“话题热门”“措辞强烈”或“文章重要”。它只评估**单一可验证主张**的错误代价与证据不确定性。一个段落必须先拆成原子 claim，再分别分级。

### 2. 硬升级规则

下列任一条件成立，claim 直接标记为 `high`，不再依赖总分：

| 硬触发类别           | 典型 claim                                                   | 原因                                      |
| -------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| 财务与交易           | 融资金额、估值、收入、利润、市场份额、定价、订单、收购、上市 | 数字常被转载且会直接影响商业判断。        |
| 法律、政策与合规     | 禁令、许可、制裁、监管结论、数据/版权/出口管制义务           | 错误表述可能造成合规和声誉风险。          |
| 安全、健康或公共利益 | 模型安全事故、关键基础设施、医疗/自动驾驶等高后果能力        | 错误主张的下游影响显著。                  |
| 性能与比较           | “领先/第一/超过/落后”、benchmark 结果、成本或能耗比较        | 强依赖测试版本、配置、方法和比较基准。    |
| 个人与组织归属       | CEO/关键人员任免、投资者身份、合作伙伴关系、未发布战略       | 容易引发误传、名誉和市场影响。            |
| 当前状态             | “已上线”“仍可用”“最新价格”“现任”“目前允许/禁止”              | 极易随时间变化，必须有明确 `as of` 时点。 |
| 未证实或相互冲突信息 | 匿名消息、单一报道、各来源结论相反                           | 证据不确定性本身已经很高。                |

硬触发是**单向升级**：人工可以把 Low/Medium 升到 High，但不能仅凭“看起来可信”把硬触发降级。若业务确实需要例外，必须记录原因、证据来源和编辑批准。

### 3. 非硬触发的评分规则

没有硬触发时，按四个维度评分，每项 0–2 分。总分 0–2 为 `low`，3–5 为 `medium`，6–8 为 `high`。评分应保存为 `riskFactors`，而不是只保存一个不可解释的字符串。

| 维度             | 0 分                       | 1 分                            | 2 分                                                    |
| ---------------- | -------------------------- | ------------------------------- | ------------------------------------------------------- |
| **错误影响**     | 失误只影响背景描述         | 会改变读者对单一产品/公司的印象 | 会影响商业、声誉、政策或安全判断                        |
| **时效性**       | 历史且稳定                 | 可能按季度或版本变化            | 当前状态、价格、职位、能力或新闻，可能在数日/数周内变化 |
| **精确性**       | 宽泛定性描述               | 明确实体或日期                  | 具体数字、排名、比较、因果或绝对化措辞                  |
| **证据不确定性** | 一手权威记录且内容直接支持 | 多家可靠二手来源一致            | 仅单源、来源匿名/无日期、来源相互矛盾或无法取得原文     |

**推荐数据形状：**

```json
{
  "claimId": "claim-pricing-001",
  "riskLevel": "high",
  "riskReasons": ["current_status", "financial_or_pricing"],
  "riskScore": 6,
  "requiresPrimarySource": true,
  "requiresCorroboration": true,
  "asOf": "2026-08-19"
}
```

`riskScore` 解释普通评分；`riskReasons` 解释硬触发。两者都应保存，便于 MRL-1 报告、编辑复核与后续调优。

### 4. 风险级别对应的证据门槛

| 级别   | 最低证据门槛                                                                                           | 时效与冲突规则                                                                | 发布处理                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Low    | 1 条 `verified`、直接相关的来源                                                                        | 证据过期时刷新；无冲突                                                        | 可作为普通事实写入。                                                       |
| Medium | 1 条一手/权威来源，或 2 条独立可靠二手来源                                                             | 记录 `asOf`；若存在冲突则升级为 High                                          | 可写入，但保留必要限定语。                                                 |
| High   | 一手/权威来源 **加** 独立佐证；对于可由法定/官方记录决定的事实，使用该决定性原始记录并验证其版本与日期 | 必须记录 `asOf`、`validUntil`、交叉验证 ID；任一未解决冲突即不可为 `verified` | MRL-1 必须阻断，直至刷新、拆分为可证实子 claim，或降为带来源归属的元事实。 |

“独立”按**信息来源链**而非 URL 数量判定。十篇转载同一新闻稿只算一条来源；同一通讯社的镜像、同一匿名爆料的改写也不构成独立佐证。

### 5. 自动判定与人工复核

风险判定应在 Brief Builder 阶段生成，并在 evidence pack 完成后复核。机器/Agent 使用硬触发词、实体类型、数字/比较模式、时效表达和来源元数据产出初始等级；编辑或 Agent 只能升级，降级必须带 `overrideReason`，并保留到 claim map。

| 时点               | 决策                                                         | 输出                                        |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------- |
| Brief Builder      | 初始 risk level、硬触发、待验证问题、所需证据门槛            | `research-brief.json` 的 `claimsToVerify[]` |
| Web Deep Research  | 验证来源独立性、时效、冲突和证据状态                         | `evidence-pack.json`                        |
| Article generation | 将 facts 与 analysis 分离，并映射 claim ID                   | `article-claim-map.json`                    |
| MRL-1              | 重新计算证据门槛，拒绝非 `verified`、过期或冲突的 fact claim | 通过/失败报告与回流动作                     |
| 发布前             | 检查 high-risk current-status claim 的 `validUntil`          | 发布阻断或刷新 evidence                     |

### 6. 需要在代码中实现的最小判定接口

不要只在 Agent 文案里描述风险。应建立单一函数，例如 `classifyClaimRisk(claim, context)`，由 Brief Builder 与 MRL-1 共同使用；两处不得维护不同的 if/else 规则。它的输入至少包含 claim text、实体类型、日期/数字/比较信号、来源可得性与内容时间窗；输出使用上面的 `riskLevel`、`riskReasons`、`riskScore`、`requiresPrimarySource`、`requiresCorroboration`、`asOf`。

MRL-1 不应重新猜测风险：它只执行同一分类器的结果，并验证对应门槛是否被满足。这样“为什么是 High”和“为什么被阻断”均可在审计报告中解释。

## 验证状态

| 检查                       | 结果           | 解释                                                                      |
| -------------------------- | -------------- | ------------------------------------------------------------------------- |
| Research Evidence 专用测试 | 124 / 124 通过 | 覆盖了库函数的现有行为，未覆盖同 slug 多 run 或真实发布编排。             |
| Research 模块定向 ESLint   | 通过           | 新增 research 库、Search Sources 与专用测试无 lint error。                |
| 全量 Vitest                | 3 / 1,888 失败 | 失败在 Focus Detector/Smoke timeout，不在本 review 范围的 research 测试。 |
| 文档层级 lint              | 3 项失败       | 现有 research 文档未被 DOCS-INDEX 登记；与本 review 文件无直接关联。      |

## Design Decisions & References

- Research Evidence Pipeline 规格：`docs/archive/spec-research-evidence-pipeline.md`。
- 当前 Stage 0.5 和 MRL-1 文档声明：`docs/content-pipeline.md`。
- Run/workspace 当前行为：`scripts/short-video/lib/research/workspace.mjs`。
- 当前 fact-claim 审计行为：`scripts/short-video/lib/research/claim-auditor.mjs`。
- 现有 review 写作格式：`docs/reviews/vlm-semantic-merge-implementation-review.md`。
