# Spec: writing-for-agents Pre-commit Gate

> **状态**：Ready for implementation
> **日期**：2026-08-25
> **背景**：PreToolUse hook 验证失败（CatPaw 不加载 hooks.json），改走已验证的 pre-commit hook 路径

## 问题

AGENTS.md 中的 `writing-for-agents 强制加载` 规则频繁被 Agent 跳过。前一轮改动（语义风险判定 + 工作流门槛）改善了规则合理性，但没有从机制上解决执行率问题。需要一个**被动触发**的机制，不依赖 Agent 自觉。

PreToolUse Hook 方案已验证不可行——CatPaw 的 mt-idekit 插件不加载 `.github/hooks/`、`.claude/settings.json` 或全局 `hooks.json` 中的 PreToolUse 配置。

项目已有 `scripts/pre-commit.sh` + `scripts/lint-doc-hierarchy.mjs` 基础设施（已验证工作正常）。扩展此基础设施，在 commit 时检测 docs/ 文件的结构性变更，输出 WARN 提醒。

## 方案

扩展 `scripts/lint-doc-hierarchy.mjs`，新增第 4 项检查：`checkWritingForAgentsGate`。

当 staged 的 `docs/` 文件或 `AGENTS.md` 的 diff 包含结构性变更时，输出 WARN 提醒 Agent 确认是否已按规则加载 writing-for-agents skill。

**判定规则**（与 AGENTS.md Coding Conventions 的强制触发条件对齐）：

- **新增/删除 markdown 标题行**（`^##` 或 `^###` 开头）→ 结构变更
- **修改/删除包含 `→` 或 `→` 的指针行**（Agent 上下文指针）→ 结构变更
- **修改 AGENTS.md**（任何非纯空白的 diff）→ 结构变更（AGENTS.md 是最高风险文档）
- 纯值修正（事实数据、拼写、格式）→ 不触发

**输出格式**：

```
WARN writing-for-agents-gate: <filename> has structural changes (new/deleted sections, pointer changes, or AGENTS.md modification). Confirm: did you load writing-for-agents skill before making these changes? (AGENTS.md → Coding Conventions → writing-for-agents 强制加载)
```

**行为**：WARN 不 block commit（exit 0），只在 stderr 输出提醒。这是设计选择——不阻塞工作流，但确保 Agent 在 commit 时收到提醒。如果 Agent 确实跳过了 skill，提醒会出现在 commit 输出中，用户可以看到。

## Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `scripts/lint-doc-hierarchy.mjs` | 新增 `checkWritingForAgentsGate()` 纯函数 + main() 调用 | Medium | 修改有下游消费者的工具脚本。下游消费者：`scripts/pre-commit.sh` Method 4。新增检查只追加 WARN，不改现有 FAIL 逻辑。现有 3 项检查行为不变 |
| `scripts/pre-commit.sh` | grep 范围从 `^docs/` 扩展到 `^docs/|^AGENTS\.md$` | Medium | 修改 pre-commit hook 的触发条件。影响所有包含 AGENTS.md 的 commit。AGENTS.md 之前不触发 doc-hierarchy lint，现在会触发 |
| `scripts/__tests__/lint-doc-hierarchy.test.mjs` | 新增测试用例覆盖 `checkWritingForAgentsGate` | Low | 纯追加 |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | staged docs/ 文件 + 新增 `##` 标题 | WARN: structural change detected | 误判（非结构性的 `##` 变更） | `##` 标题是信息结构的可靠信号，误判率低 |
| 2 | staged docs/ 文件 + 仅改错别字 | 无 WARN（纯值修正不触发） | 漏判（错别字掩盖了结构变更） | diff 按行分析，改错别字的行不会同时匹配 `^##` 模式 |
| 3 | staged AGENTS.md + 任何非空白修改 | WARN: AGENTS.md modified | 过度触发（AGENTS.md 小改也触发） | AGENTS.md 是最高风险文档，任何修改都值得提醒。设计选择 |
| 4 | staged docs/ 文件 + 修改了指针行（含 `→`） | WARN: pointer change detected | 误判（`→` 出现在非指针上下文） | `→` 在 markdown 中极少用于非指针，误判率低 |
| 5 | staged docs/ 文件 + 新增规则行（含"必须"/"强制"等关键词） | WARN: rule change detected | 误判（关键词出现在非规则上下文） | 关键词匹配限定为行首或独立句子 |
| 6 | Agent 用 `--no-verify` 跳过 hook | hook 不执行，无提醒 | 无法拦截 | `--no-verify` 是 git 的设计意图，不是方案缺陷 |
| 7 | 非 docs/ 非 AGENTS.md 的文件 commit | 不触发新检查（grep 不匹配） | 无 | grep 范围限定 |
| 8 | docs/ 文件 + 删除了标题行 | WARN: section deleted | 误判 | 删除标题 = 结构变更，正确触发 |

### 验证计划

- TDD：先写测试用例覆盖场景 1-8，再实现 `checkWritingForAgentsGate()`
- 验收标准：所有场景输出符合预期；现有 3 项检查行为不变
- `npm run lint:docs` 输出包含新检查的 WARN（如有结构变更）
- `git commit` 包含 docs/ 文件时 pre-commit hook 输出新检查结果

## 不做什么

- **不 block commit**——WARN 不 exit 1，不阻塞工作流。如果 Agent 确实需要跳过，用 `--no-verify`
- **不检测 AGENTS.md 以外的根目录文档**——AGENTS.md 是唯一在 `docs/` 之外但需要检查的 Agent 消费文档
- **不实现 PreToolUse hook**——已验证 CatPaw 不支持
- **不修改 AGENTS.md 中的 writing-for-agents 规则**——前一轮已改好
