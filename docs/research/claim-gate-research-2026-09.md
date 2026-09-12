# Claim 前强制读评论 Gate — 业界调研与方案裁决（2026-09-12）

> 对应 Issue #258。结论先行：**方案 A（claim 脚本）为主 + 方案 B（`issues.assigned` CI 兜底）为辅**，A 先行落地，B 暂不安装（保留设计，见 §4）。业界没有现成的 "claim-time context completeness" 标准件——最接近的是 hooks 确定性守卫与 label 条件驱动的 IssueOps 自动化。

## 1. 业界做法调研（Phase 0）

### 1.1 AI agent 框架：没有 claim-time 上下文完整性 gate

- Claude Code / Cursor / Aider / SWE-agent / Devin 均无"领任务前必须读过全部评论"的机制。最接近的三个模式：
  - **确定性 hooks 守卫**（Ran the Builder, "Agentic Coding Hooks: Deterministic AI Guardrails"）：在 agent 生命周期事件上挂确定性脚本做阻断——与本票方案 A 的"脚本封装 claim 流程"同构，验证了"流程 gate 写进工具链"是可行且被认可的模式。
  - **Devin 式显式任务追踪结构**（arXiv 2604.14228, "The Design Space of Today's and Future AI Agent Systems"）：agent 维护显式 planning/task-tracking 结构以减少 off-track——降低的是"做偏"，不是"漏读上下文"。
  - **Context rot 缓解**（Reddit/MindStudio/The New Stack 多源）：checkpoint、rewind/replay、定期刷新——全部是**事后/进行中**补救，恰恰佐证本票的判断：事前（claim-time）防护在业界也是空白，大家都在事后打补丁。
- 多 agent 团队机制（Claude Code agent teams）：lead 派任务时自带上下文摘要，但仍是"派发者自觉"，无机器阻断。

### 1.2 GitHub Actions：`issues.assigned` 事件可靠，label 条件驱动是成熟模式

- `issues.assigned` 是官方支持的工作流触发事件（GitHub Docs, "Events that trigger workflows"），payload 含 issue labels，可可靠驱动条件逻辑。
- label 条件驱动的 IssueOps 是 GitHub 官方推广的模式（GitHub Blog, "IssueOps: Automate CI/CD with GitHub Issues and Actions"）；label 存在性检查 + `gh api` unassign 的组合在 Marketplace 有大量先例（auto-assign issue、unassign-after-inactivity、close-after-no-reply）。
- **结论：方案 B 技术上完全可行**，且"连续 reassign N 次锁票"可以用一个计数 label（如 `claim-retry:2`）或 issue comment 计数实现，无需外部状态。

### 1.3 Linear / Jira / Asana：assignment preconditions 均非原生能力

三家 tracker 都不支持"指派前置条件"（assignment preconditions）；社区方案一律是 webhook/bot 轮询后反向操作（unassign + comment）——与本票方案 B 同构。没有更优的第三方模式可抄。

## 2. 方案裁决

**采纳评审建议：A 为主、B 为辅，A 先落地。**

| 维度 | A（claim 脚本） | B（`issues.assigned` CI） |
| --- | --- | --- |
| 阻断性质 | 流程 gate（软，理论上可绕过） | 机器 gate（准硬，GitHub 侧 unassign） |
| 延迟 | 零（评论直接进上下文） | 分钟级 CI 往返 |
| 上下文收益 | **评论内容直接进 agent 上下文**（B 做不到——它只知道"有未读"） | 仅提示，需二次拉取 |
| 失效模式 | agent 绕过脚本直接 assign | unassign/reassign 循环；CI 排队延迟 |

A 的独有价值是 B 无法替代的：**A 把评论内容灌进 claim 时的上下文**，B 只能事后踢。B 的价值是堵 A 的绕过口。叠加使用时 A 是主路径、B 是兜底。

## 3. 方案 A 落地（本票实施）

- `scripts/claim-issue.sh <N>`：REST API（避开 gh GraphQL 超时）依次——打印正文 + 全部评论 → 查 `comments-unread` → 存在则打印并要求显式确认（`--yes` 跳过交互供已读复核）→ `--add-assignee @me` → 清 `comments-unread`。
- `docs/agents/issue-tracker.md` 认领规则指向该脚本：claim 一律走脚本，不直接 `gh issue edit --add-assignee`。

## 4. 方案 B 设计（暂不安装，触发条件明确）

- Workflow：`issues: [types: [assigned]]` → 若 issue labels 含 `comments-unread` → `gh api -X DELETE .../assignees`（REST）+ 留言引导走 claim 脚本。
- 循环防护：unassign 时若 issue 已带 `claim-retry:N` label 则 N+1；N ≥ 3 → 加 `claim-locked` 并停止自动 unassign（交人工）。
- **暂不安装的理由**：A 落地后绕过是低概率事件；B 引入 CI 往返延迟与新的 label 生命周期，先让 A 跑一个观察期。**触发安装的条件**：再次出现"绕过 claim 脚本直接 assign 且漏读评论造成返工"的事故（下一个 #221 式教训）。

## 5. 与现有机制的交互

- `comments-unread` 生命周期不变：CI 新评论自动打标（`d6adc60`），claim 脚本在确认已读后清除——脚本是该 label 的唯一合法清除点之一（另一个是 session 内确实读完后的手工清理）。
- guard (a)/(b)/(c) 全部保留：脚本实现了 guard (b) 的"一查即得"与 guard (c) 的信号消费，body notice 照旧。
- 模型裁决史对齐（issue-tracker.md Conventions 最后一条）不在脚本范围内：那是开工前的 grep 义务，不是 claim 时的评论阅读义务；脚本打印的评论可作为裁决史线索的输入。

## 来源

- [GitHub Docs — Events that trigger workflows](https://docs.github.com/actions/using-workflows/events-that-trigger-workflows)
- [GitHub Blog — IssueOps: Automate CI/CD with GitHub Issues and Actions](https://github.blog/engineering/issueops-automate-ci-cd-and-more-with-github-issues-and-actions/)
- [arXiv — The Design Space of Today's and Future AI Agent Systems](https://arxiv.org/html/2604.14228v1)
- [Ran the Builder — Agentic Coding Hooks: Deterministic AI Guardrails](https://ranthebuilder.cloud/blog/agentic-coding-hooks-deterministic-ai-guardrails/)
- [The New Stack — Beating context rot in Claude Code with GSD](https://thenewstack.io/beating-the-rot-and-getting-stuff-done/)
- [MindStudio — Context Rot in AI Coding Agents](https://www.mindstudio.ai/blog/context-rot-ai-coding-agents-how-to-prevent)
- [GitHub Marketplace — Auto-assign Issue](https://github.com/marketplace/actions/auto-assign-issue)
- [GitHub Marketplace — Unassign contributor after days of inactivity](https://github.com/marketplace/actions/unassign-contributor-after-days-of-inactivity)
- [Andrew Lock — Auto-assigning issues using a GitHub Action](https://andrewlock.net/auto-assigning-issues-using-a-github-action/)
