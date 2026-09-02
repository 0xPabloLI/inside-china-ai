# Git Workflow

> 在 staging、commit、push、PR、跨分支操作或 context 切换前读取。

## 1. Safety Baseline

1. 先运行 `git status --short --branch`，再检查本次相关 diff。
2. 未提交和未跟踪内容一律视为用户工作。只操作本 session 创建或修改的内容。
3. 同一文件混有其他工作时，用 `git add -p` 只选择本 session hunk。
4. stage 时显式列路径，不使用 `git add -A` 或 `git add .`。
5. 不通过 restore、reset、clean、checkout 等方式覆盖或删除用户工作。

## 2. Branch 与 Worktree

- 永远不要在当前工作目录运行 `git checkout` 或 `git switch`。
- 跨分支工作使用 `git worktree add`，只读查看使用 `git show branch:path`。
- 向 `main` 交付使用独立 worktree/branch 和 PR，不在当前目录切换。
- 添加 worktree 前确认目标目录、branch 名和当前 working tree 状态。

## 3. Stash

- 未经当前对话明确确认，不运行任何 stash 命令。
- 如用户授权暂存，使用带说明的 `git stash push -m "<msg>"`。
- 恢复前先展示 `git stash list`，未经确认不运行 `stash pop/apply/drop/clear`。
- 如果 push 前必须 stash 非本 session 改动，只 commit，不 push。

## 4. Commit Cadence

1. 每个已验证的原子任务立即 commit。原子任务是一个 bug fix、独立 feature slice、机械 migration batch 或文档结构变更。
2. 同一任务后续修复：
   - 尚未 push：优先 amend 原 commit；
   - 已 push：追加新 commit；
   - 不改写 Lovable 已同步历史。
3. 跨任务更正默认创建新的 atomic commit，不 amend 另一个任务。只有用户明确要求整理、相关历史尚未发布且不属于 Lovable 连接历史时，才使用 `git commit --fixup=<sha>` 与 autosquash。
4. commit 前检查 staged diff 和 staged file list，确保只有本 session 内容。
5. pre-commit hook 修改文件时，复查后只 amend 一次以纳入修复。

## 5. Push 与历史

- 新增 commit 使用普通 `git push`。
- 禁止 `git push --force`。
- 只有非 Lovable 连接分支且用户明确要求改写历史时，才考虑 `--force-with-lease`。
- 顶部 Lovable 规则优先：已 push 到连接分支的 commit 不 amend、rebase、squash 或 force-push。
- push 是外部动作，只有用户已授权当前 push 才执行。

## 6. Review-Compatible Baseline

1. 开工前记录 baseline commit。
2. ticket 定向验证通过后 commit。
3. `code-review` 比较 baseline 到 `HEAD`，确保 review 能看到 committed diff。
4. review 修复后重新验证；未 push 时可按本文件 amend，已 push 时只追加 commit。

## 7. PR Guardrails

- PR 内容只总结相对 `origin/main` 的变化。
- PR title/body 使用 English。
- Testing section 只列已验证且勾选完成的项目，否则不写。
- PR push/open 后不 amend 或 rebase，后续使用新 commit。
- 不为清线程做 cosmetic fix；真实修复，否则留给 maintainer 决定。

## 8. Session Boundary

- 只 commit 本 session 的改动。
- 不顺手修复无关或非本 session 引入的问题。
- 无法确认改动来源时停止，向用户报告。
- session 结束时记录 commit hash、未 push 状态、验证证据和剩余 blocker。
