# Spec: Documentation Hierarchy Optimization

> Created: 2026-08-15
> Based on: Grill session (Round 1) + handoff `docs/handoffs/doc-hierarchy-review.md`
> Status: Ready for implementation

## Problem Statement

项目的文档层次体系（L0-L3）定义在 `docs/DOCS-INDEX.md` 中，但缺少**操作性判定规则**——Agent 写文档时没有明确的"先判断属于哪一层"的强制流程。此外，合规审计发现 1 处 L2 内容混入 L1 文档（`video-workflow.md` 的 Gapless Audio Track 章节），以及多个已完成 spec/tickets 未归档。

## Solution

4 项改动：

1. 在 `DOCS-INDEX.md` 补充层次判定规则 + L1/L2 语义标签（execution / deep research）
2. 从 `video-workflow.md` 抽离 Gapless Audio Track 章节到 `docs/research/audio-drift-fix.md`，L1 保留执行指针
3. 在 `AGENTS.md` Coding Conventions 中添加指向 `DOCS-INDEX.md` 层次判定规则的指针
4. 归档 `docs/` 根级别遗留的 spec/tickets 文件到 `docs/archive/`

## User Stories

1. As an agent writing a new doc, I want a clear placement rule that tells me which layer my document belongs to, so that I don't accidentally put research rationale in an execution doc or vice versa.
2. As an agent modifying an L1 doc, I want a rule that tells me to check for L2 content that may have crept in, so that execution docs stay lean and load only when their workflow fires.
3. As an agent debugging audio sync issues, I want the full drift fix write-up in a research doc I can deep-dive into, so that I understand the root cause without bloating the execution workflow doc.
4. As an agent reading `video-workflow.md`, I want only execution-level information (what params, how to configure, what steps), so that the doc stays focused and loads fast.
5. As a project maintainer, I want completed specs and tickets archived, so that `docs/` root stays clean and the Spec/Ticket Lifecycle rule is followed.
6. As an agent starting a new session, I want `AGENTS.md` to point me to the layer placement rules, so that I check layer compliance before editing any doc.
7. As an agent consuming `DOCS-INDEX.md`, I want L1 and L2 to have semantic labels (execution / deep research), so that the boundary between them is immediately clear without reading the full table.

## Implementation Decisions

### D1: DOCS-INDEX.md — Layer Placement Rules + Semantic Labels

在 Canonical Structure 章节中：

1. **每层表格增加 "What does NOT go here" 列**（L0-L3 全部）
2. **L1 和 L2 的 Purpose 列加上语义标签**：
   - L1 → `**L1: Execution reference**`
   - L2 → `**L2: Deep research**`
3. **新增子章节 `### Layer Placement Rules`**，内容为 4 条规则：
   - L1 文档只写"做什么、用什么参数、怎么配置"。研究依据放入 L2，L1 底部用 "Design Decisions & References" 表格指针指向。
   - L2 文档写"为什么这样选、参数从哪推导、调研了什么"。不写执行指令。
   - 新建文档时，先问"这是执行指令还是研究依据？"
   - 修改 L1 文档时，检查是否有研究依据混入——如有，抽离到 L2 并添加指针。
4. **在 Layer Placement Rules 末尾添加指针**：指向 AGENTS.md 的 `writing-for-agents` 强制加载规则，声明"层次判定前必须先加载 `writing-for-agents` skill"。

### D2: video-workflow.md — Gapless Audio Track 抽离

1. 将 `video-workflow.md` 中 "Gapless Audio Track (Drift Fix v2 — supersedes the AAC priming fix)" 章节的完整内容（约 30 行技术叙述）移到新文件 `docs/research/audio-drift-fix.md`
2. 在 `video-workflow.md` 原位置替换为 2-3 行执行级描述：
   - 场景音频编码为 video-only；voiceover 被填充真实静音到帧对齐长度并拼接为 PCM master
   - Step 6 端到端同步验证
   - 指针：`docs/research/audio-drift-fix.md`
3. 在 `video-workflow.md` 底部 Design Decisions & References 表格中添加一行：`Audio drift fix | docs/research/audio-drift-fix.md | Root cause analysis, fix implementation, sync verification, diagnostics`

### D3: AGENTS.md — 指针补充

在 AGENTS.md Coding Conventions 的 `writing-for-agents 强制加载` 条目末尾添加：

> 层次判定规则见 `docs/DOCS-INDEX.md` → Layer Placement Rules。

### D4: 归档遗留 spec/tickets

将以下 7 个文件从 `docs/` 根级别移动到 `docs/archive/`：

| 文件 | 对应功能 | 实现状态 |
|------|---------|---------|
| `spec-asset-sourcer.md` | asset-sourcer.mjs | ✅ 已实现 |
| `spec-media-fullscreen-mode.md` | media-bg.mjs VALID_MODES | ✅ 已实现 |
| `spec-voice-prosody-optimization.md` | F5 prosody post-processing | ✅ 已实现 |
| `tickets-asset-sourcer.md` | — | ✅ 配套 spec 已完成 |
| `tickets-media-fullscreen-mode.md` | — | ✅ 配套 spec 已完成 |
| `tickets-tickets-remotion-frame-verification.md` | — | ✅ 已完成（文件名修正为 `tickets-remotion-frame-verification.md`） |
| `tickets-voice-prosody-optimization.md` | — | ✅ 配套 spec 已完成 |

移动后更新 `docs/archive/README.md` 归档清单。

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `docs/DOCS-INDEX.md` | 新增 "What does NOT go here" 列 + Layer Placement Rules 子章节 | Low | 纯追加内容，不修改现有表格行，不影响现有指针引用 |
| `docs/video-workflow.md` | 抽离 Gapless Audio Track 章节（~30 行 → 3 行指针） | Medium | 修改现有章节内容。下游消费者：Agent 排查音频问题时读此章节。风险：Agent 可能找不到完整故障排查叙述。缓解：指针明确指向 `docs/research/audio-drift-fix.md`，且底部 Design Decisions & References 表格也添加了入口 |
| `docs/video-workflow.md` | Design Decisions & References 表格新增一行 | Low | 纯追加 |
| `docs/research/audio-drift-fix.md` | 新建文件 | Low | 新文件，无现有消费者受影响 |
| `AGENTS.md` | Coding Conventions 末尾追加 1 行指针 | Low | 纯追加，不修改现有规则 |
| `docs/archive/README.md` | 新增 7 条归档记录 | Low | 纯追加 |
| 7 个 spec/tickets 文件 | 从 `docs/` 移动到 `docs/archive/`（1 个改名） | Low | 文件移动，无内容修改。下游影响：如有其他文档引用这些文件路径，需更新。 |
| `docs/tickets-tickets-remotion-frame-verification.md` | 改名为 `tickets-remotion-frame-verification.md` | Low | 文件名修正（去除重复前缀） |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Agent 写新文档前检查层次 | 先加载 `writing-for-agents` skill，然后按 Layer Placement Rules 判定属于 L1 还是 L2 | Agent 跳过层次判定直接写 | AGENTS.md 已有"硬性前置条件"措辞；DOCS-INDEX.md 的 Layer Placement Rules 显式提醒 |
| 2 | Agent 修改 L1 文档时检查 L2 内容混入 | 按 Layer Placement Rules 第 4 条，检查是否有研究依据混入 | Agent 不做此检查 | 规则明确"如有，抽离到 L2 并添加指针"——checkable + exhaustive |
| 3 | Agent 搜索音频漂移问题 | 通过 `video-workflow.md` 的指针到达 `docs/research/audio-drift-fix.md` | 指针不够显眼 | 指针放在 Gapless Audio Track 标题正下方 + 底部 Design Decisions 表格双入口 |
| 4 | Agent 访问已移动的 spec/tickets | 在 `docs/archive/` 下找到（而非 `docs/` 根） | 其他文档引用了旧路径 | grep 检查是否有文档引用这些文件的旧路径，如有则更新 |
| 5 | Agent 访问改名后的 tickets 文件 | 文件名从 `tickets-tickets-*` 改为 `tickets-*` | 旧文件名被引用 | grep 检查引用，改名后更新所有引用 |
| 6 | Agent 读 DOCS-INDEX.md 的 L1/L2 表格 | 看到语义标签 "Execution reference" / "Deep research" + "What does NOT go here" 列 | 无 | 纯追加信息 |
| 7 | Agent 从 AGENTS.md 跳转到 DOCS-INDEX.md 层次规则 | AGENTS.md Coding Conventions 的指针指向 DOCS-INDEX.md → Layer Placement Rules | 指针不够显眼 | 指针放在已有 `writing-for-agents 强制加载` 条目末尾，条件触发一致 |

## Testing Decisions

这是纯文档改动，不涉及代码。验证方式：

1. **文件存在性验证**：所有新增/修改的指针目标文件存在（`ls` 验证）
2. **内容完整性审查**（writing-for-agents 文档审查三查）：
   - (1) 跨章节矛盾检查：同一规则在 AGENTS.md 和 DOCS-INDEX.md 中的限定词一致
   - (2) 指针目标完整性：被抽离内容的每个信息点在目标文件中有对应
   - (3) 文件存在性验证：所有引用的文件路径真实存在
3. **格式一致性检查**：新增内容与现有格式一致（表格列数、缩进、标题级别）
4. **grep 检查**：搜索是否有其他文档引用被移动/改名的文件路径

## Out of Scope

- 不修改 `content-pipeline.md`（审计结论：基本合规，边界内容可接受）
- 不修改 `docs/tiktok/` 下的文档（审计结论：正确 L2）
- 不修改 `docs/conventions/` 下的文档（审计结论：正确 L1 辅助）
- 不重构 `video-workflow.md` 的 TikTok Best Practices Integration 表格（虽然偏重，但属于执行层内容）
- 不修改 `writing-for-agents` skill 本身（通用 skill，不项目本地化）
- `asset-source-quick-reference.md` 层次判定：它是一个人类参考工具文档，不属于标准 L0-L3 层次体系——不移动不改动

## Further Notes

- `writing-for-agents` skill 提供了 information hierarchy 的三阶梯理论（in-file step → in-file reference → disclosed reference），这对应 L1 内部分层 + L1→L2 的 disclosure。本 spec 的改动是把这个理论**显式化**为本项目的操作性规则。
- 4 层模型保留不变。"execution vs deep research" 是 L1/L2 的语义标签，不是替代性的新结构。
- L0 (AGENTS.md) 的 "What does NOT go here" = "No technical details"（已有，只需显式化为列）
- L3 (Archive) 的 "What does NOT go here" = "No active reference material"（隐含，显式化）
