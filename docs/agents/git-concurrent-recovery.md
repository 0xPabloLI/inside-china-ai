# Git Concurrent Recovery

> git-workflow §9 的应急配方。仅在竞态已发生、且无法用 worktree 时加载：对方 session 把你的提交挤出分支历史、或必须在不动共享工作区/index 的前提下完成提交。
> 可预判的并行任务一律走 git-workflow §9 的 worktree 规则，不进入本文件路径。

## 配方 1：临时 index 隔离提交

共享目录被并行 session 占用时，不触碰当前 index 与工作区，直接组装提交：

```bash
GIT_INDEX_FILE=<tmp> git read-tree <base>          # base = 分支当前 HEAD
GIT_INDEX_FILE=<tmp> git add <本任务路径>            # 显式列路径；同文件交叠时不可用（会装入混合内容），见 git-workflow §9
GIT_INDEX_FILE=<tmp> git write-tree                 # 产出树对象；核对只含本任务文件：git ls-tree -r <tree>
git commit-tree <tree> -p <base> -m "<message>"     # 产出 commit sha
git update-ref refs/heads/<branch> <commit-sha>     # 推进分支引用
```

已知代价（git-workflow §9 应急路径条款）：

- `commit-tree` 绕过 commit hooks 与 §4 常规校验（含 Session-Id trailer，若试点已启用）。
- 提交后本目录真实 index 仍停留在 base 树：共享目录空闲后执行 `git read-tree HEAD` 对齐，否则后续 `git status` 出现反向 diff。

## 配方 2：找回被挤出的孤儿提交

自己的提交被并行 amend/rebase 挤出分支历史时内容并未丢失（reflog 可达）。等对方停止后：

1. `git reflog` / `git fsck --lost-found` 定位孤儿 commit sha，确认内容（`git show --stat <sha>`）。
2. 按配方 1 在新 HEAD 上重做提交（message 可保留原样）。

## 配方 3：从孤儿提交恢复单个文件

不经过工作区，直接把 blob 装进临时 index：

```bash
git rev-parse <orphan-sha>:<path>                   # 取 blob sha
GIT_INDEX_FILE=<tmp> git update-index --cacheinfo 100644,<blob-sha>,<path>
```

随后按配方 1 的 `write-tree` 起继续。

## 复评触发（不要遗忘项）

本文件是应急路径。**试点收尾裁决时一并复评**：若 git-workflow §9 worktree 纪律已稳定执行、竞态应急未再触发，评估将本文件降级为 `docs/archive/` 或直接删除（恢复需求可由 reflog + worktree 覆盖）。裁决记录写回试点表与 git-workflow。
