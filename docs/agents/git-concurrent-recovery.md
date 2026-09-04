# Git Concurrent Recovery

> git-workflow §9 的应急配方。仅在竞态已发生、且无法用 worktree 时加载：对方 session 把你的提交挤出分支历史、或必须在不动共享工作区/index 的前提下完成提交。
> 可预判的并行任务一律走 git-workflow §9 的 worktree 规则，不进入本文件路径。
> 本配方使用 plumbing，**绕过 commit hooks**：Session-Id 必须手工写入并事后复核（见配方 1 第 4 步）。

## 配方 1：临时 index 隔离提交

共享目录被并行 session 占用时，不触碰当前 index 与工作区，直接组装提交：

```bash
BASE=$(git rev-parse <branch>)                        # 记录期望旧值，供 update-ref 比对
GIT_INDEX_FILE=<tmp> git read-tree "$BASE"            # 临时 index，不动共享 index
GIT_INDEX_FILE=<tmp> git add <本任务路径>              # 显式列路径；同文件交叠时不可用（会装入混合内容），见 git-workflow §9
TREE=$(GIT_INDEX_FILE=<tmp> git write-tree)           # 产出树对象
git ls-tree -r "$TREE"                                # 核对只含本任务文件
MSG=$(printf '%s\n\nSession-Id: <your-id>' "<message>")
COMMIT=$(git commit-tree "$TREE" -p "$BASE" -m "$MSG") # 绕过 hook，trailer 必须手写
git update-ref refs/heads/<branch> "$COMMIT" "$BASE"   # 带期望旧值：他方已推进则失败而不是覆盖
```

要点（均为事故教训，不得省略）：

1. **`update-ref` 必须带期望旧值** `<expected-old>`。不带旧值时，他方在你组装期间推进的 ref 会被静默覆盖（竞态正是这么发生的）。失败退出码非 0，此时回到 §9.1 等待并重新取 BASE。
2. **禁止整表重置共享 index**。`GIT_INDEX_FILE=<tmp> git read-tree` 只写临时 index，安全；但对共享 index 执行 `git read-tree HEAD` / `git reset` 会清掉他方已 staged 的内容。确需对齐时先检查：
   ```bash
   git diff --cached --quiet || { echo "STOP: 共享 index 含未提交内容，禁止重置"; exit 1; }
   git read-tree HEAD
   ```
3. **同文件交叠时禁用本配方**：`git add` 会把混合内容装进树。
4. **绕过 hook 的补偿**：`commit-tree` 不触发 commit-msg，因此 trailer 必须在 `$MSG` 里手写、id 必须已登记，提交后立即用精确查询复核该 commit 可被本 session 查到：
   ```bash
   git log --all --format='%h%x09%(trailers:key=Session-Id,valueonly,separator=%x2C)%x09%s' \
     | awk -F '\t' -v id="<your-id>" '$2 == id'
   ```
5. 提交后共享 index 仍停留在旧树：`git status` 会出现反向 diff，按第 2 点的检查流程对齐。

## 配方 2：找回被挤出的孤儿提交

自己的提交被并行 amend/rebase 挤出分支历史时内容并未丢失（reflog 可达）。等对方停止后：

1. `git reflog` / `git fsck --lost-found` 定位孤儿 commit sha，确认内容（`git show --stat <sha>`）。
2. 按配方 1 在新 HEAD 上重做提交（message 可保留原样，trailer 改为本 session id）。

## 配方 3：从孤儿提交恢复单个文件

不经过工作区，直接把 blob 装进临时 index：

```bash
git rev-parse <orphan-sha>:<path>                   # 取 blob sha
GIT_INDEX_FILE=<tmp> git update-index --cacheinfo 100644,<blob-sha>,<path>
```

随后按配方 1 的 `write-tree` 起继续。

## 复评触发（不要遗忘项）

本文件是应急路径，每次实际使用后复评一次：

- 若 git-workflow §9 worktree 纪律已稳定执行、竞态应急未再触发，评估将本文件降级为 `docs/archive/` 或直接删除（恢复需求可由 reflog + worktree 覆盖）。
- 若反复触发，说明 worktree 规则未被遵守，应先修流程（规则写在实施入口文档中，见 implementation-workflow §6），而不是把应急路径常态化。
- 复评结论写回 `.git/session-pilot/pilot-log.md`（`git rev-parse --git-common-dir` 下）的观察字段。
