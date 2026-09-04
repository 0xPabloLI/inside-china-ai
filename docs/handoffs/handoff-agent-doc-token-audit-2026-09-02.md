# Handoff: Agent-reached 文档 token 审计（2026-09-02）

> **接手 Agent 请先读本段**：你这个 session 的任务是审计全部 Agent-reached 文档的不必要 token 消耗，产出一份带预估节省的提案。审计阶段是只读的（S0/R0）——文件零改动；实施属于另一次用户授权。

## 状态

- 前置工作已完成并 review 清零：Agent 工作流重构落地（commits `1783903` 设计 → `21be192` 计划 → `4a4a89e` 实施 → `05a5cfb`、`3a31838` 门禁与 review 终点固定），`AGENTS.md` 已从 24KB 降到 6.5KB。
- 本审计是重构后的下一步，由上一 session 提出、用户同意立项。

## 目标

审计对象是每个 session 会被加载或频繁经指针到达的文档。产出：一份审计报告，含每份文档的实测字节数、加载层级（常驻注入 / 指针到达）、缩减提案（预估节省字节 + 行为风险）。完成标准：报告覆盖下方基线表全部文档，且审计阶段 `git status` 不含你修改的任何文件。

## 实测基线（2026-09-02，字节）

| 文档                                     | 大小   | 加载层级                 |
| ---------------------------------------- | ------ | ------------------------ |
| `AGENTS.md`                              | 6,536  | 常驻（harness 注入）     |
| `DESIGN.md`                              | 17,411 | 常驻（harness 注入）     |
| `CONTEXT.md`                             | 16,272 | 指针到达                 |
| `docs/DOCS-INDEX.md`                     | 18,679 | 指针到达（文档工作必读） |
| `docs/agents/implementation-workflow.md` | 11,723 | 指针到达（实施必读）     |
| `docs/agents/git-workflow.md`            | 3,583  | 指针到达（git 操作必读） |
| `docs/tanstack-lovable-conventions.md`   | 7,138  | 指针到达（应用代码必读） |
| `docs/installed-skills.md`               | 7,807  | 指针到达                 |
| `docs/content-pipeline.md`               | 34,630 | 指针到达（内容 session） |
| `docs/video-workflow.md`                 | 38,537 | 指针到达（内容 session） |

另一项常驻成本在仓库之外：installed skills 目录（`.agents/skills/` 174 个 + `.claude/skills/` 173 个），每个 skill 的 description 都占据每个 session 的上下文。卸载建议可以写进提案，执行交给用户裁决。

## 审计顺序（按触发频率）

1. `DESIGN.md` —— 最大常驻项（约为 AGENTS.md 的 2.7 倍）。frontmatter 是机器消费的 design tokens（Lovable 同步），按结构保留；prose 部分找 sediment 与可下沉的 reference。
2. `AGENTS.md` —— 刚重构过，重点看指针措辞（front-load 触发词、一分支一触发）与残留 no-ops。
3. `CONTEXT.md` —— 多个 skills 消费的 domain 词汇表；压缩 verbosity，术语完整性优先于字节数。
4. 高频 L1（git-workflow、implementation-workflow）—— 刚重写并通过双轴 review，轻触。
5. 内容管线两份大件 —— 只在内容 session 加载，但体量大，是 progressive disclosure 的候选。
6. skill 目录统计 —— 列出低频卸载候选，交用户裁决。

## 方法

用 `writing-for-agents` 的词汇做评判标准，逐句找四类问题：sediment（随世界变化失效的层）、no-ops（模型默认就会服从的指令）、duplication（一处含义两处维护）、该下沉未下沉的 reference。每个发现记录：文档、行区、类型、预估节省、行为风险。

## 硬约束

- 审计阶段零改动。实施需用户对提案明确批准后另行授权，属 S1/S2 × R2，按 `docs/agents/implementation-workflow.md` 执行。
- 任何文档改动先载入 `writing-for-agents`，位置决策按 `docs/DOCS-INDEX.md`。
- 分支 `main` ahead 18 / behind 21，未 push：不 push、不 rebase。工作树里有其他 session 的未提交文件（截至交接时：`docs/research/digital-human-test-progress.md`、`docs/issue-tracker.md`、`.workbuddy/`、`scripts/short-video/assets/smoke-data-center.jpg` 及若干未跟踪文件），staging 一律用显式路径，并在暂存前用 `git rev-parse HEAD` 核对基线未被并行 session 移动。
- `npm run lint:docs` 会对本地 Markdown 链接、反引号本地路径、规范性限定词改动给 WARN——这是门禁的正常输出，不是失败。

## Suggested skills

- `writing-for-agents` —— 必载，评判标准本身。
- `brainstorming` —— 提案需要设计取舍时（如 DESIGN.md 拆分策略）。
- `writing-plans` —— 实施获批后。

## 验证

- 报告交付前：`npm run lint:docs` PASS、`git diff --check` 干净、`git status` 确认审计零改动。
- 报告放 `docs/research/`（research 产物，不是 review 文件），并在 `docs/DOCS-INDEX.md` research 表登记。
