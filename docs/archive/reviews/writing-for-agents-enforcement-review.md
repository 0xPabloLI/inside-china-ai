# Code Review: writing-for-agents 规则执行率改善

> **审查范围**：AGENTS.md + docs/DOCS-INDEX.md 改动
> **审查日期**：2026-08-25
> **审查依据**：spec `docs/research/writing-for-agents-enforcement-proposal.md` + 审核报告 `docs/reviews/writing-for-agents-enforcement-proposal-review-2026-08-25.md`

## Standards 审查（是否符合仓库文档标准）

### ✅ SSoT — 单一权威来源

- AGENTS.md Coding Conventions 中的 `writing-for-agents 强制加载` 条目明确声明"规则定义以本条为准"
- DOCS-INDEX.md 第 20 行改为指针引用 AGENTS.md，不再重复规则定义
- 工作流门槛只引用规则名，不重复规则内容
- **无跨文件矛盾**

### ✅ Progressive Disclosure — 渐进披露

- 工作流门槛是 always-loaded 的一行指针，不包含规则细节
- 规则细节在 Coding Conventions（always-loaded 但在需要时才读）
- Layer Placement 操作检查在 DOCS-INDEX.md（on-demand loaded）
- writing-for-agents skill 完整原则在 skill 文件中（disclosed reference）

### ✅ No Duplication — 无重复

- 检查了 AGENTS.md 中 3 处改动之间无规则重复
- DOCS-INDEX.md 不再包含"任何修改前加载"的规则表述
- 文档审查三查：
  - (1) 跨章节矛盾：AGENTS.md 和 DOCS-INDEX.md 中的触发条件一致（信息结构变更 → 加载；值修正 → 豁免；不确定 → 加载）
  - (2) 指针目标完整性：门槛 → Coding Conventions 条目 → DOCS-INDEX Layer Placement Rules，链路完整
  - (3) 文件存在性：`docs/DOCS-INDEX.md` 存在 ✅

### ✅ writing-for-agents skill 原则遵守

- 本次编辑本身按规则加载了 writing-for-agents skill
- 改动涉及修改 AGENTS.md（规则、上下文指针）→ 属于强制加载场景

## Spec 审查（是否符合 spec 要求）

### ✅ 改动 1：Coding Conventions 条目

- 旧文本被新文本替换 ✅
- 强制触发条件 6 类 ✅（创建/删除/移动/重命名、修改 AGENTS.md、章节增删合并拆分、改变规则/步骤/前置条件/例外/完成标准/目录分层/Agent 上下文指针）
- 豁免条件封闭列表 ✅（拼写、格式、事实值、非 Agent 指针链接修复、无流程含义的状态标记）
- "无法确定时必须加载" ✅
- 豁免保持性约束 ✅（不得改变信息层级、唯一权威来源、指针关系）
- "docs/research/ 下的执行文档"已删除 ✅
- SSoT 声明 ✅

### ✅ 改动 2：工作流文档改动门槛

- 插入位置：Context Hygiene 之后、Step 1 之前 ✅
- 覆盖范围：Step 1-4 + Step 8 ✅
- 前置触发措辞 ✅（"创建或改动 docs/ 内容前"）
- 只引用规则名，不重复定义 ✅

### ✅ 改动 3：DOCS-INDEX.md

- 旧文本被新文本替换 ✅
- 不再包含规则定义 ✅
- Layer Placement Rules 1-5 内容不变 ✅
- 与 AGENTS.md 无矛盾 ✅

## 场景矩阵验证

| # | 场景 | 预期行为 | 规则覆盖验证 |
|---|------|---------|-------------|
| 1 | Step 2 创建新 spec | 强制加载 | 门槛覆盖 Step 1-4 + "创建...文档"在强制列表 ✅ |
| 2 | Step 3 创建新 ticket | 强制加载 | 同上 ✅ |
| 3 | Step 4 顺手创建 docs/research/ 文档 | 强制加载 | 门槛 + "创建...文档" ✅ |
| 4 | Step 4 修正错别字 | 豁免 | "拼写"在豁免列表 ✅ |
| 5 | 修复普通外链 | 豁免 | "非 Agent 指针链接修复"在豁免列表 ✅ |
| 6 | AGENTS.md 指针换到新文档 | 强制加载 | "改变 Agent 上下文指针"在强制列表 ✅ |
| 7 | Step 8 归档并更新 DOCS-INDEX | 强制加载 | 门槛覆盖 Step 8 + "目录分层"在强制列表 ✅ |
| 8 | 修改事实数据值 | 豁免 | "事实值"在豁免列表，但如果改变执行行为则不豁免 ✅ |
| 9 | 无法判定状态更新是否影响流程 | 强制加载 | "无法确定时必须加载" ✅ |
| 10 | 修改 DOCS-INDEX 目录分层 | 强制加载 | "目录分层"在强制列表 ✅ |

**结果**：10/10 场景通过验证。

## 审查结论

**通过**。所有改动符合 spec 要求和仓库文档标准。可以进入 Runtime Verify。
