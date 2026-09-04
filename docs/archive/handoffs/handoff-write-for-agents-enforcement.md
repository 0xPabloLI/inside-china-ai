# Handoff: write-for-agents 规则执行问题

> **给接手 Agent**：本 session 发现 AGENTS.md 中的 writing-for-agents 强制加载规则在实际执行中被反复违反。需要设计更严格的执行机制。
> **建议 Skills**: `grill-with-docs` → `to-spec` → `to-tickets` → `implement`（Substantial workflow）

## 问题描述

AGENTS.md 中的规则原文：

> **writing-for-agents 强制加载**：任何对 `docs/` 下 Agent 消费文档的编辑操作（含 AGENTS.md 自身、specs、tickets、docs/research/ 下的执行文档），**必须在编辑前执行** `writing-for-agents` skill 加载。这是硬性前置条件，不是可选步骤。

但该规则在实际执行中被反复违反——Agent 在编辑 `docs/research/` 下的文档时多次跳过加载 skill。

## 根因分析

### 1. 规则触发条件模糊

- "任何对 docs/ 下文档的编辑"范围太宽——改一个错别字、加一行数据也要加载 skill？
- 什么算"Agent 消费文档"？`docs/research/` 下的研究文档算不算？边界不清楚
- 没有区分大改（创建新文档、大幅结构改动）和小改（数据修正、链接更新）

### 2. Skill 加载是软约束

- 没有任何硬性机制阻止 Agent 跳过这一步
- 不像 `git push` 有 hook 可以拦截，skill 加载完全靠 Agent 自觉
- Agent 在 context 压力大时倾向于跳过来节省 tokens

### 3. 规则与实际需求不匹配

- writing-for-agents 的核心原则（single source of truth, progressive disclosure, no duplication）在大改时很有价值
- 但在改一行数据、修正一个状态标记时几乎无用
- 强制每次都加载 = 规则太重，导致整体被跳过

## 可能的改进方案

### 方案 A：分层触发

- **大改**（创建新文档、大幅结构改动、AGENTS.md/CLAUDE.md 编辑）：强制加载
- **小改**（数据修正、状态标记更新、链接修复）：豁免
- 需要明确"大改 vs 小改"的判定标准

### 方案 B：内联关键原则

- 把 writing-for-agents 最核心的 3 条原则（SSoT, progressive disclosure, no duplication）直接写入 AGENTS.md 的 Coding Conventions
- 这样 always-loaded 的规则块本身就包含了这些原则
- 不需要额外加载 skill
- 缺点：AGENTS.md 会变长

### 方案 C：Pre-edit 检查脚本

- 写一个脚本，在编辑 `docs/` 文件前自动检查 writing-for-agents 是否已加载
- 类似 pre-commit hook
- 需要和 CatPaw 的 hook 系统集成

### 方案 D：规则放宽

- 承认现状：规则太重无法执行
- 只在创建新文档时强制加载
- 其他编辑靠 Agent 自觉（但要有提醒机制）

## 需要讨论的问题

1. 你更倾向哪个方案？还是组合方案？
2. 是否接受"大改 vs 小改"的二分法？如果接受，判定标准是什么？
3. 内联关键原则到 AGENTS.md 的 Coding Conventions 是否可接受（增加 context load）？
4. 是否有技术手段可以在 CatPaw 中实现 pre-edit hook？

## 参考文件

- `AGENTS.md` — 规则原文（"writing-for-agents 强制加载"段落）
- `.cursor/skills/writing-for-agents/SKILL.md` — skill 本体（82 行，核心原则在信息层级、渐进披露、去重三节）
- `docs/research/asset-source-quick-reference.md` — 本 session 编辑的文档（违反规则的实例）
- `docs/research/media-asset-strategy.md` — 本 session 编辑的文档（违反规则的实例）
