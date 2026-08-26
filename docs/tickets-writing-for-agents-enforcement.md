# Tickets: writing-for-agents 规则执行率改善

> **来源 Spec**：`docs/research/writing-for-agents-enforcement-proposal.md`
> **审核报告**：`docs/reviews/writing-for-agents-enforcement-proposal-review-2026-08-25.md`

## 依赖图

```
Ticket 1 (AGENTS.md Coding Conventions)
    ↓
Ticket 2 (AGENTS.md 工作流门槛)  ← 依赖 Ticket 1（门槛引用 Coding Conventions 条目名）
    ↓
Ticket 3 (DOCS-INDEX.md)  ← 依赖 Ticket 1（DOCS-INDEX 改为指针引用 AGENTS.md）
```

三个 ticket 可在同一个 session 中顺序实施。无代码测试（纯文档改动），验证方式为人工审查 + 后续 session 行为观察。

---

## Ticket 1: 修订 AGENTS.md Coding Conventions 条目

**What to build**: 将 `writing-for-agents 强制加载` 条目从"任何编辑都要加载 skill"改为按语义风险判定：信息结构变更强制加载，纯值修正豁免，不确定默认加载。

**File**: `AGENTS.md` 第 107 行

**Old text**:
```
- **writing-for-agents 强制加载**：任何对 `docs/` 下 Agent 消费文档的编辑操作（含 AGENTS.md 自身、specs、tickets、docs/research/ 下的执行文档），**必须在编辑前执行** `writing-for-agents` skill 加载。这是硬性前置条件，不是可选步骤。Agent 消费文档 = 任何会被 Agent 在执行任务时读取的文档。加载后遵循其原则：single source of truth、progressive disclosure、no duplication。执行文档只写"做什么、用什么参数"；研究依据和方法论放 `docs/research/` 或 `docs/tiktok/`，底部用 "Design Decisions & References" 索引指向它们。层次判定规则见 `docs/DOCS-INDEX.md` → Layer Placement Rules。
```

**New text**:
```
- **writing-for-agents 强制加载**：在创建或改变 Agent 消费文档的信息结构前，必须加载 `writing-for-agents` skill。此类改变包括：创建、删除、移动或重命名文档；修改 `AGENTS.md`；新增、删除、合并或拆分章节；改变规则、步骤、前置条件、例外、完成标准、目录分层或 Agent 上下文指针。仅当变更不改变上述任一事项，且仅为拼写、格式、事实值、非 Agent 指针链接修复或无流程含义的状态标记更新时，才可豁免。无法确定时必须加载。豁免变更不得改变文档的信息层级、规则的唯一权威来源、或现有指针关系；如变更会新增、迁移或重复规则，转入强制加载路径。Agent 消费文档 = `docs/` 下会被 Agent 执行流程读取或由上下文指针到达的文档。规则定义以本条为准；Layer Placement 的操作检查见 `docs/DOCS-INDEX.md` → Layer Placement Rules。
```

**Checklist**:
- [x] 旧文本被新文本替换
- [x] 新文本包含：强制触发条件（6 类）+ 豁免条件（封闭列表）+ "无法确定时必须加载" + 豁免的保持性约束 + SSoT 声明
- [x] "docs/research/ 下的执行文档"表述已删除（替换为"Agent 执行流程读取或由上下文指针到达的文档"）
- [x] 不与 DOCS-INDEX.md 产生跨文件矛盾（DOCS-INDEX 改为指针引用，见 Ticket 3）

---

## Ticket 2: 在 Mandatory Implementation Workflow 加入文档改动门槛

**What to build**: 在 Step 1 之前（紧邻 Step 1-4 和 Step 8 的共同入口处）加一段文档改动门槛，覆盖所有文档操作路径。

**File**: `AGENTS.md` 第 43-44 行之间（在 Context Hygiene 段落之后、Step 1 之前）

**Insert after** (Context Hygiene blockquote):
```
> **文档改动门槛**：在 Step 1–4 或 Step 8 创建或改动 `docs/` 内容前，按 Coding Conventions → `writing-for-agents 强制加载` 判定并执行。步骤内不重复判定规则。
```

**Checklist**:
- [x] 门槛段落插入在 Context Hygiene 之后、Step 1 之前
- [x] 门槛覆盖 Step 1-4 和 Step 8
- [x] 门槛措辞为前置触发（"创建或改动 docs/ 内容前"），不是事后式（"如需修改"）
- [x] 门槛只引用规则名，不重复规则定义

---

## Ticket 3: 修订 DOCS-INDEX.md Layer Placement Rules

**What to build**: 将 Layer Placement Rules 开头的"任何修改前加载 skill"改为指针引用 AGENTS.md，消除双重权威。

**File**: `docs/DOCS-INDEX.md` 第 20 行

**Old text**:
```
Before writing or modifying any document under `docs/`, load the `writing-for-agents` skill (AGENTS.md → Coding Conventions → `writing-for-agents 强制加载`), then apply these rules:
```

**New text**:
```
修改文档时，先按 `AGENTS.md` → Coding Conventions → `writing-for-agents 强制加载` 判定是否加载 skill；随后应用本节的 Layer Placement 检查：
```

**Checklist**:
- [x] 旧文本被新文本替换
- [x] 新文本不再包含规则定义（"任何修改前加载"），只保留指针引用 + Layer Placement 操作检查
- [x] Layer Placement Rules 1-5 内容不变
- [x] 与 AGENTS.md Coding Conventions 条目无矛盾
