# Spec: writing-for-agents 规则执行率改善

> **状态**：Spec v2（已整合审核意见）
> **日期**：2026-08-25
> **审核报告**：`docs/reviews/writing-for-agents-enforcement-proposal-review-2026-08-25.md`

## 问题

AGENTS.md Coding Conventions 中的 `writing-for-agents 强制加载` 规则在实际执行中频繁被跳过。Agent 在实施代码改动时顺手修改 `docs/` 下文档，但不遵循 `writing-for-agents` 原则（single source of truth、progressive disclosure、no duplication）。

## 根因

1. **规则触发点不在 Agent 的行动路径上**——Coding Conventions 是常驻规则，Agent 在"写代码"的 mindset 下不会回头检查
2. **规则触发条件过宽**——"任何编辑"范围太广，小改也要加载整个 skill，成本与收益不成比例，导致整体跳过
3. **Skill 加载是软约束**——没有硬性拦截机制

## 方案：分层触发 + 前置门槛

### 核心思路

1. **缩小 skill 强制加载范围**——按语义风险（是否改变信息结构/权威来源/执行行为/上下文指针）判定，不按行数或表面类型
2. **前置门槛替代单点指针**——覆盖 Step 1-4 + Step 8 所有文档操作路径，而非只在 Step 4 加提醒
3. **保持 SSoT**——规则定义只在 AGENTS.md Coding Conventions 一处，DOCS-INDEX.md 改为指针引用
4. **不确定时默认加载**——无法明确证明豁免条件时，按强制加载处理

### 改动 1：修订 AGENTS.md Coding Conventions 条目

**当前**：

```
- **writing-for-agents 强制加载**：任何对 `docs/` 下 Agent 消费文档的编辑操作（含 AGENTS.md 自身、specs、tickets、docs/research/ 下的执行文档），**必须在编辑前执行** `writing-for-agents` skill 加载。这是硬性前置条件，不是可选步骤。Agent 消费文档 = 任何会被 Agent 在执行任务时读取的文档。加载后遵循其原则：single source of truth、progressive disclosure、no duplication。执行文档只写"做什么、用什么参数"；研究依据和方法论放 `docs/research/` 或 `docs/tiktok/`，底部用 "Design Decisions & References" 索引指向它们。层次判定规则见 `docs/DOCS-INDEX.md` → Layer Placement Rules。
```

**改为**：

```
- **writing-for-agents 强制加载**：在创建或改变 Agent 消费文档的信息结构前，必须加载 `writing-for-agents` skill。此类改变包括：创建、删除、移动或重命名文档；修改 `AGENTS.md`；新增、删除、合并或拆分章节；改变规则、步骤、前置条件、例外、完成标准、目录分层或 Agent 上下文指针。仅当变更不改变上述任一事项，且仅为拼写、格式、事实值、非 Agent 指针链接修复或无流程含义的状态标记更新时，才可豁免。无法确定时必须加载。豁免变更不得改变文档的信息层级、规则的唯一权威来源、或现有指针关系；如变更会新增、迁移或重复规则，转入强制加载路径。Agent 消费文档 = `docs/` 下会被 Agent 执行流程读取或由上下文指针到达的文档。规则定义以本条为准；Layer Placement 的操作检查见 `docs/DOCS-INDEX.md` → Layer Placement Rules。
```

### 改动 2：在 Mandatory Implementation Workflow 中加入文档改动门槛

在 Step 1 之前（紧邻 Step 1-4 和 Step 8 的共同入口处）加一段：

```
> **文档改动门槛**：在 Step 1–4 或 Step 8 创建或改动 `docs/` 内容前，按 Coding Conventions → `writing-for-agents 强制加载` 判定并执行。步骤内不重复判定规则。
```

### 改动 3：修订 DOCS-INDEX.md Layer Placement Rules

**当前**（第 20 行）：

```
Before writing or modifying any document under `docs/`, load the `writing-for-agents` skill (AGENTS.md → Coding Conventions → `writing-for-agents 强制加载`), then apply these rules:
```

**改为**：

```
修改文档时，先按 `AGENTS.md` → Coding Conventions → `writing-for-agents 强制加载` 判定是否加载 skill；随后应用本节的 Layer Placement 检查：
```

### 改动 4：删除"docs/research/ 下的执行文档"表述

当前条目中有"docs/research/ 下的执行文档"——但 DOCS-INDEX.md 定义 `docs/research/` 为 L2（Deep research），L2 不放执行指令。这是分类冲突。新条目已替换为"`docs/` 下会被 Agent 执行流程读取或由上下文指针到达的文档"。

## Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `AGENTS.md` | 修订 Coding Conventions 的 writing-for-agents 条目（规则语义从"任何编辑加载"改为"信息结构变更才加载"）；在工作流 Step 1 前加文档改动门槛 | **High** | AGENTS.md 是每个 session 的必读文件，规则改动影响所有 Agent 的文档编辑行为。缓解：新规则是收紧而非放宽（不确定时默认加载）；审核已通过 |
| `docs/DOCS-INDEX.md` | 修订 Layer Placement Rules 第 20 行（从重复规则改为指针引用 AGENTS.md） | **Medium** | DOCS-INDEX 是文档索引的 single source of truth。修改后不再包含规则定义，只保留操作检查。下游消费者：所有读 DOCS-INDEX 做 Layer Placement 判定的 Agent。缓解：改为指针后语义不变，只是权威来源归一到 AGENTS.md |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Agent 在 Step 2 创建新 spec 文档 | 强制加载 writing-for-agents skill | Agent 跳过门槛（Step 2 未提及） | 门槛覆盖 Step 1-4 全范围，前置在 Step 1 之前 |
| 2 | Agent 在 Step 3 创建新 ticket 文档 | 强制加载 writing-for-agents skill | 同上 | 同上 |
| 3 | Agent 在 Step 4 实施代码时顺手创建 docs/research/ 文档 | 强制加载 writing-for-agents skill | Agent 在"写代码"mindset 下忽略文档规则 | 门槛前置触发词："创建或改动 docs/ 内容前" |
| 4 | Agent 在 Step 4 修正一个 docs 文件中的错别字 | 豁免 skill 加载 | 无 | 豁免条件明确：仅拼写修正，不改变信息结构 |
| 5 | Agent 修复 docs 文件中一个普通外链（非 Agent 指针） | 豁免 skill 加载 | 误把 Agent 指针链接当普通链接豁免 | 豁免条件限定"非 Agent 指针链接" |
| 6 | Agent 将 AGENTS.md 中的指针换到新文档 | 强制加载 writing-for-agents skill | 误判为"链接修复"而豁免 | 新规则明确列出"改变 Agent 上下文指针"为强制触发 |
| 7 | Agent 在 Step 8 归档 spec/ticket 并更新 DOCS-INDEX 目录 | 强制加载 writing-for-agents skill | Step 8 归档涉及索引变更，Agent 不认为这是"文档编辑" | 门槛覆盖 Step 8 |
| 8 | Agent 修改一个 docs 文件中的事实数据值（如参数表中的数字） | 豁免 skill 加载 | 事实值变更可能影响 Agent 执行行为 | 豁免条件限定"事实值"但不允许改变"规则、步骤、前置条件"——参数表如果是执行指令的一部分，则不豁免 |
| 9 | Agent 无法判定某次状态标记更新是否影响流程含义 | 强制加载 writing-for-agents skill | Agent 自行降级为豁免 | 规则明确："无法确定时必须加载" |
| 10 | Agent 修改 docs/DOCS-INDEX.md 的目录分层或指针语义 | 强制加载 writing-for-agents skill | 误判为普通编辑 | 新规则明确列出"目录分层或 Agent 上下文指针"为强制触发 |

### 验证计划

- 在实施后的下一个 Agent session 中，观察 8 个上述场景的执行行为
- 验收标准：所有强制场景均加载 skill；所有豁免场景均保持信息结构不变；不确定场景均升级为加载
- 若连续两轮出现漏加载，回滚豁免范围，优先收紧"链接/索引/状态"类别
- 回滚方式：将豁免条件收窄为仅"拼写和格式修正"，其余一律强制加载

## 不做什么

- **不内联 writing-for-agents 的全部原则到 Coding Conventions**——完整原则（信息层级、steps and completion criteria、leading words 等）需要 skill 才能正确应用
- **不在工作流步骤内重复规则全文**——违反 SSoT。只放前置门槛指针，规则定义在 Coding Conventions 一处
- **本轮不引入自动拦截机制**——其可行性、集成点与成本未在本方案中验证，另作为后续备选
- **不修改 writing-for-agents skill 本身**——通用 skill，不项目本地化
