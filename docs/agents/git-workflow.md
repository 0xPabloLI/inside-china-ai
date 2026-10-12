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
   - 尚未 push：优先 amend 原 commit（写 ref 前先按 §9.5 复核身份）；
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
- **合并门禁：PR 存在未 resolve 的 review thread（bot 与人一视同仁）时不合并**——逐条真实修复或回应、thread resolve 后方可 merge；用户明确豁免除外。
- **自主合并常设授权（用户裁决，2026-09-26）**：agent 对自己开出的 PR，在 CI 全绿、无未 resolve review thread、改动未超出已授权 ticket 范围时**直接 merge，不逐次请示**；仅当 review thread 指出实质问题、CI 失败、或改动越出 ticket 授权范围时停下向用户确认。
- 不为清线程做 cosmetic fix；真实修复，否则留给 maintainer 决定。

## 8. Session Boundary

- 只 commit 本 session 的改动。
- 不顺手修复无关或非本 session 引入的问题。
- 无法确认改动来源时停止，向用户报告。
- session 结束时记录 commit hash、未 push 状态、验证证据和剩余 blocker。
- **Issue 交付落档与读票**：per-issue 交付记录按 `docs/agents/issue-tracker.md` 的 Session cognitive offload 表执行——closing comment 落档，不改正文（body 编辑是整体替换，会覆盖其他 session 的内容）。读票同样按该文件的 read-before-claim 规则执行：正文不是票的完整状态，开工前必须读评论，判定方式与唯一读法见该文件。
- **Session-Id 关联标识（安装了 hooks 的 checkout 强制，commit-msg hook 校验 trailer；strict 模式另校验登记）**：
  - 开工先确认已安装：`git config core.hooksPath` 应为 `.githooks`（新 clone 跑 `npm run setup:hooks`；它同时设置 strict 登记门控）。未安装时本规则仍是约定，只是无 hook 兜底。
  - session 开工生成 id（格式 `<yyyymmdd>-<task>-<6hex>`，如 `20260903-refactor-a1b2c3`）并登记 `$(git rev-parse --git-common-dir)/session-pilot/pilot-log.md`（所有 worktree 共享；tool / Session-Id / baseline / commit 清单 / compact 状态）。
  - commit 带 `--trailer "Session-Id: <id>"`；strict 下 hook 校验 id 已登记（fail-closed：无登记表也拦截）；amend 不得叠加第二个 id（双 id 让两侧精确查询都失效）。
  - 用 `npm run session:start` 开工的会话无需手写 trailer：per-session 状态文件存在时 prepare-commit-msg 自动填 `Session-Id`（amend 与显式 `--trailer` 均不会叠加第二个 id）；无状态文件的 checkout 才需手动 `--trailer`。
  - **已实测的绕过面**（hook 管不到，靠约定）：`revert` 与 `cherry-pick` 不触发 commit-msg——cherry-pick 会沿用原提交的 id 造成归因错配，两者都必须用 `--no-commit` 后正常提交；`commit-tree` / `--no-verify` 同样绕过；merge commit 按裁决豁免（无 id 属设计行为）。
  - 按 id 查提交（精确匹配，勿用 grep；`separator=%x2C` 保证双 id 时两侧都查不到而不是误命中）：
  ```bash
  git log --all --format='%h%x09%(trailers:key=Session-Id,valueonly,separator=%x2C)%x09%s' | awk -F '\t' -v id="<id>" '$2 == id'
  ```
  生成、登记、compact 恢复与豁免边界的完整规则见 `docs/research/commit-session-association-id-proposal.md`；验收场景见 `scripts/test-commit-msg-hook.sh`。

## 9. 并发 Session 与恢复

同仓库可能有并行 session 写 git。已留档两次事故：

- **2026-09-03**：两 session 竞态互挤提交，一方 rebase 回滚了另一方的磁盘文件。
- **2026-09-14**：并行 session 在共享工作目录执行 `pull --rebase` + `push`，把我方未推送的提交一并搬上远端（SHA 全变）；我方随后的 `--amend` 落在它刚落下的提交上，替换掉它的提交信息、把它的内容并入我方 commit（它第二次 rebase 才整理干净），并把共享目录切到它自己的分支。无内容丢失，但重复的提交信息已发布、无法不改写历史地修复。

1. 检测到对方操作进行中（reflog 持续推进、存在 rebase 目录）时等待其停滞，期间不写任何 ref。
2. 竞态应急（你的提交被并行挤出、或必须在不动共享工作区与 index 的前提下提交）按 `docs/agents/git-concurrent-recovery.md` 的配方执行；该路径绕过 commit hooks 与 §4 校验，完成后须按配方对齐 index。可预判的并行任务直接按第 3 条用 worktree，不走应急路径。
3. **写入者独占**是并行工作的默认规则：写入型并行 session 用 `npm run session:start <task>` 开工——一条命令建独立 worktree（含 worktree 专属的绝对 hooksPath，hooks 在其中正常生效）、生成并登记 Session-Id、写 per-session 状态文件。此后该 worktree 内 `git commit -m` 自动带 trailer（prepare-commit-msg 填写），ref-gate 对"丢弃外会话 commit"的非快进 ref 操作进入拦截模式——**拦截判据已扩到「存在第二个 worktree」**（并行写入者的证据，本 checkout 无需 state file；2026-09-14 事故的防线）。分支删除（`git branch -d/-D`）始终只警告；实测该操作只以 `aborted` 阶段到达 hook，故删除**不在门控覆盖内**——手工 `-D` 未验证分支仍会静默毁掉工作；`session:stop`/`session:gc` 的 `-D` 只在 `ref_content_merged`（逐文件字节一致）通过后执行。共享工作目录即共享 staging 区，是并行冲突的根因。把 `pull --rebase`、`push`、`switch` 留在你自己的 worktree 内——在共享目录执行它们会搬走他人未推送的提交，或把工作区切到他人分支（2026-09-14 事故）。launcher 不可用时退回手动 `git worktree add` + §8 手动 trailer；收尾 `npm run session:stop <worktree-path>`；PR 合并后再跑 `npm run session:gc` 同步主 checkout 并清理已交付分支（§10）。纯只读探索可共享目录；互不重叠文件的轻量任务（1–2 个文件）可留在主目录，仍走 §1 选择性 staging。
4. 目标文件已有非本 session 的未提交改动时，本 session 停止并报告，由用户决定落库顺序。应急配方的临时 index 只覆盖互不重叠的文件——同文件交叠时 `git add` 会把混合内容装进树。
5. **写 ref 前紧邻复核身份**（2026-09-14 事故的直接防线）：
   - `commit` / `amend` / `reset` / `rebase` 前，在同一批命令里先取 `git rev-parse HEAD` 与 `git diff --cached --name-only`，与预期不符即停止并报告；`git rev-parse --abbrev-ref HEAD` 必须是你自己的 `session/<id>`。
   - 判据取 HEAD 本身：`git status` 只看工作区与索引，HEAD 被他人 rebase 后它照样显示「干净」——上一轮复核（如 amend 目标）之后到写 ref 之间仍是窗口。
   - 共享目录被他人切走分支时，切回由该目录当前所有者执行；你在自己的 worktree 继续。
   - commit 后立即 `git show --stat HEAD`（§4.6）核对文件清单只含本任务文件。

## 10. 交付后收尾（session:gc）

**常设授权**（用户裁决，2026-10-12：交付后主动同步主 checkout 并清理多余分支，不必逐次确认）：PR 合并后不再逐次询问——主动执行 `npm run session:gc` 完成主 checkout 同步与分支清理。该命令是收尾的唯一入口（不手工 `git branch -D`、不手工切 checkout），因为它把纪律编码成 fail-closed 门禁。触发点是 agent 交付流程的收尾步骤（`implementation-workflow.md` §9 步骤 6，其后只剩 tracker 更新与汇报）；远端合并没有本地事件源，故不设守护进程或轮询，`session:stop` 结束时会打印这条提醒。

1. **fetch --prune**：刷新 origin 的整个远端跟踪命名空间（不只 main——已删除远端分支的陈旧 tracking ref 否则会一直滞留）；离线时按现有 ref 继续并明示（非致命）。另清理手工删目录留下的失效 worktree 记录（`worktree prune`），否则其分支会永远显示「已被检出」。
2. **同步主 checkout**：仅当它是**主 worktree（以 git-common-dir 身份判定，不靠列表顺序）、在 main 上、无 tracked 改动、且严格落后**时做 `merge --ff-only`。永不 rebase、永不 switch、永不触碰 dirty checkout；分叉（本地有未推送提交）一律报告后放过。
3. **清理已交付分支**：命名空间 `session/* docs/* fix/* feat/* chore/* test/* refactor/*`（`SESSION_GC_BRANCH_GLOBS` 可覆盖），逐分支执行两条**已交付**判据（`ref_delivered`，前者命中即止）：
   - **内容一致**（`ref_content_merged`）：逐文件字节与 origin/main 相同——squash 合并后 `git branch -d` 永远拒绝（无 ancestry 关系）的解法；分支删除文件时，该文件在 base 上同样不存在才算删除已落地。
   - **PR 已合并**（tip 绑定）：该分支名下有 merged PR，其 `headRefOid` **精确等于**分支 tip、且 `mergeCommit` 是 origin/main 的祖先。这是 main 在合并后继续前进（release bump 等改写同文件）时的唯一判据——字节一致永远无法再验证这类分支。tip 绑定是安全核心：只有 tip 本身被合并过才算，合并后再推的提交会移动 tip 并保留分支。
   - 任一未知（gh 缺失、查询失败、`mergeCommit` 不在 main 上）即保留（fail-closed）。任 worktree 检出的分支绝不触碰。远端同名分支须满足全部条件才 `push --delete`：本地删除已成功、其自身交付另行验证、`gh` 可用且 `pr list --head <branch> --state open` 明确返回 0 个开放 PR（防误关 PR）。同一轮还会**清扫孤儿远端分支**（本地分支已被 `stop` 删除、或上一轮 gc 已删本地的那类），判据相同；本地分支仍在时一律以本地决策为准（保留的本地分支会钉住其远端）。命名空间刻意排除 bot/集成分支（`renovate/*`、`release-please--*`、`lovable-sync` 等），它们由各自工具管理。origin 不可达时远端部分逐条报告 `origin unreachable`，不静默跳过。
4. `--dry-run` **零写入**：不 fetch（不更新任何 ref）、不 prune、不删分支；预览基于当前 ref 并在输出中明示远端 tip 可能更新。远端分支也进入预览：PR 判据不依赖跟踪 ref 新鲜度，可直接给出 `would delete remote ... (PR merged into main)`；内容判据在跟踪 ref 与远端 tip 一致时就地验证，不一致时标注「将先 fetch 再验证」（dry-run 不 fetch，故不虚报）。
5. 成功标准：`gc` 输出每条分支的 deleted/kept 理由与汇总计数；`git branch -vv` 与 `git worktree list` 与之一致。

**仓库设置**（2026-10-12 用户授权启用）：`delete_branch_on_merge: true`——GitHub 在 PR 合并时立即删除其 head 分支，把「PR 已合并」这一判据的窗口压到最短（其余分支交给上面的 gc）。该设置只影响「合并动作由 GitHub 执行」的删除；`gc` 的两条判据与之互补（设置删除 GitHub 眼中的 head 分支，gc 覆盖本地分支、孤儿远端、以及设置启用前遗留的分支）。若需回滚：`gh api -X PATCH repos/0xPabloLI/inside-china-ai -f delete_branch_on_merge=false`。

`session:stop` 已并入同一判据：先 `git branch -d`（ancestry 合并），拒绝后再过 `ref_delivered` 才 `-D`（内容一致 → `squash-merged` 消息；PR 已合并 → `PR-merged` 消息）；两者都不通过则保留并说明。被保留（未交付）的分支是**待办信号**，不是垃圾：要么交付（新 PR），要么由用户显式裁决丢弃——不允许静默 `-D`。典型保留场景：分支内容从未进入 main 且无 merged PR。

纪律边界（不得越过）：跨会话的 dirty worktree、未验证的 `-D`、在主 checkout 执行 `pull --rebase`/提交 `push`/`switch` 仍是禁止项；`gc` 的自动化只覆盖「已交付（内容一致，或 tip 绑定的 merged PR）」这一集合（其 `push --delete` 只删已合并 ref、不发布任何提交，是 `push` 禁令的例外，须与开放 PR 检查同时满足；**残余风险**：开放 PR 检查与删除之间存在 TOCTOU 窗口，新开 PR 会被该删除关闭——fail-closed 检查只把窗口压到最小，不能消除）。`gc` 不探测进行中的并发操作（reflog 推进、rebase 目录）：并行 session 正在写 ref 时不得运行（§9.1）。
