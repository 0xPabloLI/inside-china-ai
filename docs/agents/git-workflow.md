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
6. commit 后立即用 `git show --stat HEAD` 核对文件清单只含本任务文件；发现混入其他 session 的文件立即向用户报告，共享分支上不用改写历史来修复混入。

## 5. Push 与历史

- 新增 commit 使用普通 `git push`。
- 禁止 `git push --force`。
- 只有非 Lovable 连接分支且用户明确要求改写历史时，才考虑 `--force-with-lease`。
- 顶部 Lovable 规则优先：已 push 到连接分支的 commit 不 amend、rebase、squash 或 force-push。
- push 是外部动作，只有用户已授权当前 push 才执行。

## 6. Review-Compatible Baseline

1. 开工前记录 baseline commit。
2. ticket 定向验证通过后 commit。
3. review 开始前记录 `taskHead = git rev-parse HEAD`；`code-review` 比较 `baseline...taskHead`，不使用会被并行 session 移动的裸 `HEAD`。
4. 若 `baseline..taskHead` 含其他 session 的 commit，改用本任务首个 commit 的直接父提交作 baseline；仍无法形成连续任务区间时，停止并报告，不用路径过滤伪装成完整 review。
5. review 修复后重新验证并创建修复 commit，再记录新的 `taskHead`；已 push 时只追加 commit。

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
- **Session-Id 软试点进行中（至收尾裁决）**：session 开工先读 `docs/research/commit-session-association-id-proposal.md` §3（生成 id、登记 `.session-pilot/pilot-log.md`、写入与恢复规则），commit 时按其 trailer 约定执行；试点结束后本条由正式迁入的规则替换。

## 9. 并发 Session 与恢复

同仓库可能有并行 session 写 git（2026-09-03 事故：两 session 竞态互挤提交，一方 rebase 回滚了另一方的磁盘文件）。

1. 检测到对方操作进行中（reflog 持续推进、存在 rebase 目录）时等待其停滞，期间不写任何 ref。
2. 竞态应急（你的提交被并行挤出、或必须在不动共享工作区与 index 的前提下提交）按 `docs/agents/git-concurrent-recovery.md` 的配方执行；该路径绕过 commit hooks 与 §4 校验，完成后须按配方对齐 index。可预判的并行任务直接按第 3 条用 worktree，不走应急路径。
3. **写入者独占**是并行工作的默认规则：写入型并行 session 各自 `git worktree add` 独立目录操作——共享工作目录即共享 staging 区，是并行冲突的根因；worktree 使 rebase 与 checkout 只影响各自磁盘。纯只读探索可共享目录；互不重叠文件的轻量任务（1–2 个文件）可留在主目录，仍走 §1 选择性 staging。
4. 目标文件已有非本 session 的未提交改动时，本 session 停止并报告，由用户决定落库顺序。应急配方的临时 index 只覆盖互不重叠的文件——同文件交叠时 `git add` 会把混合内容装进树。
