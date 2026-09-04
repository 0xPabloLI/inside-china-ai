# 独立复核材料：Session-Id 关联标识落地（2026-09-03 session 交付，v5 修订版）

> 用途：交给未参与本工作的第三方 Agent 做独立 review。本文自包含——reviewer 不需要读对话历史。
> 交付方 Session-Id：`20260903-pilot1-384b29`｜仓库：`inside-china-ai`｜分支：`main`
> **v2（2026-09-04）**：按第一轮第三方复核意见修订。v1 的过度表述已更正，复核指出的三处规范
> 冲突、worktree 登记盲区、runbook 安全问题、安装链缺口均已修复（落实状态见 §8）。
> **v3（2026-09-04 下午）**：新增 §10（复核修订被并行会话 reset 出历史——第 3 起并发事故及
> pathspec 重提）与 §11（参考 repo pacifio/atlas 调研 + 并发防护候选方案，请 reviewer 裁决）。
> **v4（2026-09-04 晚）**：按第二轮复核意见修订——§10 补单 id 错误归因证据（d9ce6b1 折入他方
> 3 个 VLM 文件）；§11 方案 B 改为 reference-transaction 门控（第二轮复核指出的关键事实：
> git 有 pre-reset 等价物，硬拦做得到）、atlas 两处表述修正、Q11 改 per-session 文件；
> 新增 §12 记录第二轮裁决 Q9–Q12 的落实回执。落实后的复测：验收 35/35。
> **v5（2026-09-04 深夜）**：方案 A 落地——`scripts/session-launcher.sh`（worktree + per-session
> 状态文件 + 登记）与 `.githooks/prepare-commit-msg`（trailer 自动填写）；ref-gate 状态文件改
> per-worktree（`--absolute-git-dir`），worktree 内 hooks 需绝对 hooksPath（实测相对路径在
> linked worktree 中静默失效）。验收 45/45。§12 回执同步更新。
> 日期：2026-09-04。

---

## 0. 复核范围与措辞约定

**措辞**：本机制是 commit 与产生它的会话标识之间的**关联标识**（association），不是溯源——
它不证明 commit 由谁真实编写、不恢复会话对话、id 可被任何人填写。全文统一此口径。

**在范围内**（交付 session 的 8 个 commit，全部带 `Session-Id: 20260903-pilot1-384b29`）：

| # | SHA | 主题 | 改动 |
|---|-----|------|------|
| 1 | `d3ab661` | 拆出并发恢复 runbook + 落提案 v4 | `git-concurrent-recovery.md` 新建；`git-workflow.md` §9 压缩；提案 404 行 |
| 2 | `847f398` | 试点表工具中立化 | 提案 §7.6 路径调整 |
| 3 | `e8d6cd3` | git-workflow §8 试点路由指针 | 1 行 |
| 4 | `20ed1ab` | `.gitignore` 治理工具状态垃圾 | +10 行（24,011 → 18 个 untracked） |
| 5 | `0281c7c` | commit-msg hook 上线 + §8 正式规则 | `.githooks/commit-msg` 新建等（+70/−2） |
| 6 | `24194ed` | 提案标记结项 | 状态行 |
| 7 | `d8108d5` | hook 扩展：校验登记 | hook +21；git-workflow 1 行 |
| 8 | `1cd0e99` | 同文件串行编辑规则 | `implementation-workflow.md` §6（+2/−1） |

v2 修订（本文件同批 commit）：hook 重写（strict 开关 + common-dir 登记表）、安装链修复
（`scripts/install-git-hooks.sh` + `package.json` + `README.md`）、提案 v5、runbook 加固、
验收脚本入库 `scripts/test-commit-msg-hook.sh`（27 scenarios）、全局 gitignore 回退。

**不在范围内**：其他并行会话的改动；v1–v3 提案评审史。

## 1. 要解决的问题与不解决的问题

- **解决**：commit ↔ 会话标识的关联；合规会话的精确查询；对「读了规则的会话」的格式兜底。
- **不解决**（v1 曾表述过强，v2 更正）：真实身份证明；对话恢复；**review 区间断链**——
  现行 review 流程仍要求 `baseline...taskHead` 区间连续（`git-workflow.md` §6.4），不连续时
  仍停止并报告，Session-Id 只是给人工归因提供输入，不改变该流程。

## 2. 方案（现行版 = 提案 v5，操作规则在 `git-workflow.md` §8）

1. **id**：`<yyyymmdd>-<task>-<6hex>`（6hex 为 v5 裁定，见 §3 冲突说明）。
2. **写入**：`git commit --trailer "Session-Id: <id>"`；amend 不得叠加第二个 id。
3. **登记**：`$(git rev-parse --git-common-dir)/session-pilot/pilot-log.md`——放 git common
   dir 是因为 **linked worktree 不复制 gitignored 文件**，放工作区根会让每个 worktree 看到
   不同的登记表（复核实测：未登记 id 在新 worktree 直接通过）。旧位置 `.session-pilot/`
   作为过渡兜底仍被 hook 接受。
4. **强制（两层，均有边界）**：
   - hook 层（**仅对已安装的 checkout 生效**，新 clone 必须跑 `npm run setup:hooks`，见 §7）：
     trailer 存在 / 唯一 / 格式合规。strict（`session.provenance=strict`，由安装脚本设置）
     另校验已登记，且 **fail-closed**——登记表不存在同样拦截，防删表静默关门。
   - 约定层（hook 管不到，靠规则）：见 §4 bypass 矩阵。
5. **查询**（注意 `separator=%x2C`：双 id 时拼接值使两侧精确查询都不可见，而不是误命中）：

```bash
git log --all --format='%h%x09%(trailers:key=Session-Id,valueonly,separator=%x2C)%x09%s' \
  | awk -F '\t' -v id="<id>" '$2 == id'
```

## 3. 试点数据（公平窗口 `e8d6cd3` 19:46 起算，9 个 eligible commit）

原始审计表（登记表留档，此处嵌入保证自包含）：

| commit | 时间 | trailer | 登记 | 判定 |
|---|---|---|---|---|
| `20ed1ab` | 21:05 | ✅ | ✅ #1 | 合规（pilot1，本 session） |
| `0cec232` | 21:08 | ✅ | ✅ #2 | ~~合规（hallo3）~~ → 见下方重分类 |
| `bc733bd` | 21:51 | ❌ | ❌ | 漏写（#66 群） |
| `55e9537` | 21:53 | ❌ | ❌ | 漏写（#66 群） |
| `ff29ebc` | 21:55 | ❌ | ❌ | 漏写（#66 群） |
| `786e97a` | 21:57 | ❌ | ❌ | 漏写（#66 群） |
| `eab2b54` | 22:06 | ❌ | ❌ | 漏写（kimi-ipo） |
| `9ef6026` | 22:10 | ✅ | ❌ | 半合规：id 缺 6hex 后缀、未登记 |
| `ec6b0fb` | 22:12 | ❌ | ❌ | 漏写（无法归因） |

**分类规则（v5 口径）**：合规 = trailer 恰好一条 + 格式匹配 `^[0-9]{8}-[a-z0-9][a-z0-9-]*-[0-9a-f]{6}$` + 已登记；任一不满足但 trailer 存在 = 半合规；无 trailer = 漏写。

**重分类说明**：v1 把 hallo3 计为"完全合规"，但其 id 为 8hex（`...-caf56c17`），按最终 6hex
规范会被 hook 拒绝。根因是规范自身冲突：提案 v4 规定 8hex、实现用 6hex，两个"合规"样本
各自满足不同版本的规范。**按最终口径重分类：合规 1/9、半合规 2/9、漏写 6/9（67%）**。
漏写率结论不变，hook 决策不变。

**样本局限**：会话开工时间不入 git，无法排除「部分会话开工早于指针、规则未送达」；样本量
9，无统计显著性；「合规」样本是规则作者本会话，存在自我实现偏差。

## 4. 实测 bypass 矩阵（git 2.50.1，可由入库脚本复现）

| 路径 | commit-msg 是否触发 | 结果与规则 |
|---|---|---|
| 普通 commit / amend | ✅ | 校验；amend 叠加第二个 id 会被拦 |
| `merge --no-ff` | ✅（**v1 误报为不触发**） | **按裁决豁免**（MERGE_HEAD 检查）：merge 不含原创工作，拦截会挡住例行 pull-merge；代价是 merge commit 无 id，属设计行为。**此裁决基于"不触发"的错误前提做出，是否改强制留给下轮复裁** |
| `revert` | ❌ 不触发 | 规则：`revert --no-commit` 后正常提交（S18b 验证该路径被门控） |
| `cherry-pick` | ❌ 不触发 | **沿用原提交 id → 归因错配**（比漏写更隐蔽）；规则：`--no-commit` 后正常提交 |
| `commit-tree` | ❌ | runbook 配方要求手写 trailer + 事后精确查询复核 |
| `git commit --no-verify` | ❌ | 紧急通道，保留 |
| hooksPath 未设置的 checkout | ❌ | 即未安装，见 §7 |

## 5. 复核用命令

```bash
# 本 session 全部 commit（精确匹配）
git log --all --format='%h%x09%(trailers:key=Session-Id,valueonly,separator=%x2C)%x09%s' \
  | awk -F '\t' -v id="20260903-pilot1-384b29" '$2 == id'

# hook 实现 + 验收（27 scenarios，覆盖 trailer 校验 / strict 登记 / worktree / 安装器 / bypass / 双 id 查询 / update-ref 竞态）
cat .githooks/commit-msg
bash scripts/test-commit-msg-hook.sh

# 文档 lint
npm run lint:docs
```

## 6. 证据分级

**可复现（reviewer 可直接运行）**：
- `bash scripts/test-commit-msg-hook.sh` → **35/35**（含 bypass 矩阵、worktree 共享登记表、
  installer 行为、双 id 查询两侧均不可达、update-ref 带期望旧值拒绝对过期旧值写入、
  登记 token 精确匹配、legacy 弃用警告、reference-transaction 门控组 S29–S31）；
- `npm run lint:docs` → 通过（exit 0）但带 1 条**已接受的 WARN**：提案保留的命令示例达
  L2 阈值（6≥5），已在提案 §6.1 写明接受稳态——完整命令已迁 `git-workflow.md` §8；
- §5 的查询命令与 trailer 一致性。

**Session 报告（历史自报，非第三方可重复）**：
- 首轮 TDD red→green 过程与当时的 7→10 场景演进（脚本当时在 /tmp，未入库——v1 缺陷，已修）；
- 8 个 commit 的 HEAD 守卫验证、d8108d5 被 hook 实弹拦截记录；
- 试点期间并行竞态的三次实录（staged blob 被清、同文件覆盖、merge 豁免裁定）。

## 7. 安装链（复核列为 blocker，已修复）

**修复前**：README 只跑 `scripts/install-git-hooks.sh`，该脚本仅复制 pre-commit 到
`.git/hooks/`；新 clone `core.hooksPath` 为空 → 只有密钥扫描，**Session-Id gate 完全不存在**，
"仓库级强制"表述不成立。

**修复后**：`scripts/install-git-hooks.sh`（即 `npm run setup:hooks`）一次性完成：设
`core.hooksPath .githooks` + 全 hook 可执行 + `session.provenance=strict` + 创建/迁移
common-dir 登记表（S12–S15 场景覆盖）。**表述更正：这是"已安装的 checkout 上的本地
guardrail"，不是仓库级强制**；未安装的 clone 只有约定层约束。

## 8. 复核裁决与落实状态

| # | 复核裁决 | 状态 |
|---|---|---|
| Q1 | 值得上 hook，但只称本地 guardrail，先修安装和覆盖面 | ✅ 已修安装链（§7）；措辞已更正 |
| Q2 | 显式启用 + fail-closed | ✅ `session.provenance=strict` 由安装脚本设置；strict 下无登记表也拦截（S6） |
| Q3 | merge 豁免；revert 用 `--no-commit`；必须补 cherry-pick | ✅ merge 豁免保留（但实测 hook 会触发 merge，是否改强制留复裁）；revert/cherry-pick `--no-commit` 规则入 §8 与 hook 注释，S18b 验证 |
| Q4 | 不做"近期 commit"启发式警告，从结构上落实 worktree | ✅ 未加启发式；登记表迁 common-dir 使 worktree 可用（S10/S11）；worktree 默认规则在 §9 |
| Q5 | 全局 ignore 过宽 | ✅ `~/.config/git/ignore` 回退至原 3 行；工具目录改入本仓库 `.gitignore` |
| Q6 | 测试必须入库 | ✅ `scripts/test-commit-msg-hook.sh` 27 scenarios |
| Q7 | 拆分有冲突和过期指针 | ✅ 提案 v5（6hex、登记强制、新路径）；git-workflow §8 重写（查询命令、bypass 面、安装前提） |
| Q8 | trailer 值得；登记仅在能映射稳定 session reference 时才强制 | ⚠️ 部分落实：strict 已 fail-closed，但登记表仍是自由文本，无稳定 session reference 关联（见 §9.3） |

规范冲突三处的落实：6hex/8hex → 统一 6hex（提案 §3.1 v5 修订 + 全部示例改 6hex）；
登记不强制/强制 → §3.4 重写为 strict 强制 fail-closed；hallo3 重分类见 §3。

runbook 加固：`update-ref` 带期望旧值（过期旧值被 git 拒绝，S25）；禁止无检查整表重置共享
index（先 `git diff --cached --quiet` 检查）；`commit-tree` 手写 trailer + 事后查询复核。

## 9. 已知未解决事项

1. **merge 豁免待复裁**：实测 hook 会触发 merge commit-msg，v1 的豁免是基于错误前提的裁决；
   维持豁免但留待下轮（改强制的代价：拦截例行 pull-merge）。
2. bypass 面剩余：`--no-verify`、`commit-tree`、未安装 checkout——均为有意保留或结构性限制，
   无 hook 层解法。
3. 登记表无稳定 session reference 映射（自由文本 tool 字段），Q8 的完整裁决未达成。
4. 样本局限（§3）：试点统计不可作严格证据，仅作方向判断。
5. hook 无法校验登记表内容质量——id 字符串出现即通过（token 精确匹配已收紧假阳性，
   内容质量仍无法校验；per-session 文件方案可进一步收敛，见 §12 Q11）。
6. **strict 的强度上限**：fail-closed 距离关闭只有一条命令——`git config --unset
   session.provenance`（hook 拒绝信息里如实印出）。作为本地 guardrail 这是诚实上限；
   服务端强制不在本方案范围内。
7. 测试缺口：真实 clone 端到端（S12–15 为模拟安装）、pathspec commit 场景、登记表内容质量。

---

## 10. v3 增补：复核修订本身被并发 reset 丢弃（2026-09-04 16:40–17:30，第 3 起 reset 级事故）

第一轮复核修订落库为 `5cc94a4`（10:46）。同日 16:40 一个并行会话将其 **amend** 为 `d9ce6b1`，
16:43 又 **reset 到另一个提交**，把该修订整体移出了分支历史——直到 17:30 交付方才发现（本次
待办"push `5cc94a4`"时 reflog 核查暴露）。这是三天内第 3 起并行会话破坏他方工作的事故
（前两起：文档同文件旧内容覆盖；staged blob 被 reset 清掉），且 **amend+reset 组合发生在
交付方 commit 上，说明并行会话读到了该 commit 却仍将其丢弃**。

**恢复过程与 technique**：

1. 内容完好性核查：重落的 10 个文件内容全部完好——工作区文件与孤儿 commit `d9ce6b1` 对应
   路径逐一相等（第二轮复核复验属实；reset --mixed 把改动落回工作区，test 脚本与 brief 变回
   untracked）；DOCS-INDEX 的条目已被并行会话后续 commit 顺带带上 HEAD。
2. 重提用 **pathspec commit**：`git commit <文件...>` 只取指定文件的工作区内容建 commit，
   无视 staging 区其余内容——当时 index 里存有另一会话的 3 处 staged 改动（含一个删除），
   裸 `git commit` 会把它们一锅端进本提交。pathspec 路径下他方 staged 内容原样保留
   （已写入 runbook 配方 4）。
3. 落库为 `1980a63`（10 files, +614/−76），新 hook 实弹通过（trailer+登记双检），HEAD 守卫
   通过，验收通过，已 push。

**本轮复核补充的关键证据——一起实际发生的单 id 错误归因**：`5cc94a4`→`d9ce6b1` 的 amend
不只是挪了 SHA：它把并行会话自己的 3 个 VLM 文件（`vlm-cache.test.mjs`、`asset-sourcer.mjs`、
`vlm-cache.mjs`，+45/−13）折进了带 pilot1 trailer 的复核修订 commit。格式、登记、唯一性
**全部"合规"**，但归因是错的——比双 id 更隐蔽，任何 trailer 查询都会把那 3 个 VLM 文件算到
pilot1 头上。这直接证明提案 §3.5「fresh context 不得 amend 属于其他 Session-Id 的 commit」
的必要性，也是 §12 Q12 的第 4 个证据点。它同时解释了对方会话为何毫无察觉：reset 之后它自己的
文件也安然落回了工作区，两侧都没有报错。

**事故面的规律**（供 reviewer 校准威胁模型）：三起事故全部是**共享工作目录 = 共享 staging 区
+ 共享 ref** 的结构性后果；`git-workflow.md` §9 的 worktree 规则落地后**没有任何一个会话实际
开过 worktree**（纯文档约束的采用率为 0）。归因层（Session-Id hook）有效，冲突防护层无效。

## 11. v3 增补：参考 repo 调研与并发防护候选方案（请 reviewer 裁决）

**参考 repo pacifio/atlas（本提案的原始参考，评估后未引入其客户端）调研结论**（2026-09-04
README 核对）：

| 能力 | atlas 的做法 | 与本仓库现状对比 |
|---|---|---|
| commit→session 归因 | 外置登记：SQLite 存于 gitignored `.atlas/`（"checkpoint record … is SQLite … because it is queried, not read"），客户端自动捕获 prompts/tool calls/reasoning | 与我们的登记表（gitignored、commit→id 映射）同构；差异在 atlas 由宿主客户端**自动**捕获，我们靠读文档自觉 + hook 兜底 |
| 并发隔离 | **无**——多 agent "against the same codebase"，无 worktree、无锁、无写队列 | 我们的 §9 worktree 规则至少在纸面上更进一步 |
| 冲突防护 | 无（依赖单一宿主进程经由同一 send path 调度，事实上的串行化） | — |

结论：**参考 repo 没有现成的并发冲突解决方案**；它只解决归因（且更丰富）。这反向说明我们的
归因路线（trailer + 外置登记表）与业界方向一致，而**并发防护需要自己设计**。（第二轮复核
修正两点：① 其 README 的 "same send path" 指**上下文注入管线**（所有 agent 走同一套 prompt
组装），不能解读为 git 写入的串行化——"atlas 无并发写防护"结论成立但归因不同；② atlas 用
**patch-id 对账**让 checkpoint 链接在 amend/rebase 后重新挂回——方案 B 的孤儿定位可直接
借鉴，比纯 reflog 扫描更稳。）候选方案：

| 方案 | 内容 | 性质 | 成本 |
|---|---|---|---|
| A. session launcher（采用成本削减） | `npm run session:start <task>` 一条命令：自动 `git worktree add` + 设 hooksPath + 生成并登记 Session-Id（写 per-worktree 状态文件）+ 开 strict；`prepare-commit-msg` 从状态文件自动填 trailer。§9 从"文档说"变"命令做"，复制 install-git-hooks.sh 的成功路径 | 结构化入口 | 一个脚本 + 一个 hook（配方已在 runbook） |
| B. reference-transaction 孤儿门控（结构兜底） | **githooks(5) 的 reference-transaction hook 在 prepared 阶段非零退出可中止任何 ref 更新事务**（第二轮复核指出，实测 `git reset --hard` 被拦退出 128、HEAD 不动；post-checkout 对 reset 调用次数为 0）——硬拦做得到。门控仅对 refs/heads/* 非快进更新检查被丢弃 commit（`git rev-list <new>..<old>`）的 Session-Id：带外会话 id 时，有本会话状态文件则 block，否则 warn。**已实现**（`.githooks/reference-transaction`，S29–S31 场景锁定） | 拦截型（0% launcher 采用率下也生效的兜底） | 一个 hook + 测试（已完成） |
| C. pathspec commit 入 runbook | 混合 index 场景的标准动作（§10 实战验证） | 文档 | 3–5 行（已完成，runbook 配方 4） |

**请 reviewer 对以下问题给出裁决意见**（第二轮复核已裁决，回执见 §12）：

- **Q9**：方案 A 的 launcher 是否值得立项？注意其成立前提是"所有会话都被引导走同一条开工
  命令"——这仍是软约束（用户/会话可以不开），与 §9 的差别只在成本从"读文档+手做 4 步"降到
  "敲 1 条命令"。这样的降幅是否足以改变采用率？
- **Q10**：方案 B 的孤儿检测，告警阈值如何定才不噪声化（例如只对"丢弃他 session id 的
  non-merge commit"报警是否足够）？post-checkout 时机能否覆盖 reset 的主要路径（reset
  本身不触发任何 hook，checkout 触发是否足够）？
- **Q11**：是否值得吸收 atlas 的方向，把登记表从自由文本 markdown 升级为结构化存储
  （JSON/SQLite）以支撑 Q8 的"稳定 session reference"？还是维持现状、等待宿主工具
  （Claude Code 等）原生暴露 session id？
- **Q12**：三起事故是否已构成"结构性手段"的充分条件？还是应先给 §9 + 方案 C 一个观察期？

## 12. 第二轮复核裁决回执（2026-09-04 晚，逐项落实状态）

第二轮复核确认 v3 质量（8 项裁决吸收属实且多被测试锁定），指出 1 个改变方案形态的事实错误、
2 处文档自相矛盾、1 个被遗漏的关键证据与若干次要项。裁决与落实：

| 项 | 第二轮裁决 | 落实状态 |
|---|---|---|
| **B 的钩子前提** | git 有 pre-reset 等价物：reference-transaction prepared 阶段非零退出中止整个事务（复核实测 reset --hard exit 128）；post-checkout 对 reset 调用 0 次。结论是**换钩子**，不是放弃硬拦 | ✅ 已实测复核（临时仓库重现）并**实现** `.githooks/reference-transaction`：refs/heads/* 非快进更新 → 检查被丢弃 commit 的 Session-Id；有本会话状态文件（**per-worktree** `$(git rev-parse --absolute-git-dir)/session-pilot/current-session`，launcher 写入——两会话在两个 worktree 各用各的 id 各自拦截）且含外会话 id 则 block，否则 warn。场景 S29–S31 入库 |
| **Q9 launcher** | 值得做，定性从"治本"改"采用成本削减"；闭环设计 = launcher 写 per-worktree 状态文件（含 id 与过期时间），`prepare-commit-msg` 自动填 trailer，commit-msg 只校验 | ✅ **已实现（v5）**：`scripts/session-launcher.sh`（`npm run session:start <task>`：worktree + 绝对 hooksPath + id 生成/查重 + 登记 + per-session 状态文件；`session:stop` 清状态）+ `.githooks/prepare-commit-msg`（自动填，amend/显式 trailer 不叠加）。实测发现并修复：相对 hooksPath 在 linked worktree 内静默失效（hooks 全不跑），launcher 用 `extensions.worktreeConfig` + 绝对路径修复。场景 S32–S36 入库，验收 45/45 |
| **Q10 孤儿检测** | 按修正版 reference-transaction 门控；阈值 = refs/heads/* + 非快进 + 被丢弃 commit 带外会话 id（正常 pull/rebase 不报警）；放弃 post-checkout 路线 | ✅ 完全按此实现并放弃 post-checkout |
| **Q11 登记结构化** | 不上 SQLite；改 per-session 文件（`sessions/<id>.md`），登记校验退化为文件存在性检查，子串假阳性与并发写同文件隐患一起消失。atlas 自己的 commit 带 `Claude-Session:` trailer——trailer 路线的同业实证 | ⚠️ 部分落实：token 精确匹配已先行（S27）；launcher 阶段仍写共享 registry markdown（并发写隐患存在但 launcher 是唯一写入方时窗口小）；per-session 文件仍待做 |
| **Q12 充分条件** | 已满足：3 起 reset 级事故 + worktree 0% 自发采用 + d9ce6b1 单 id 错误归因，4 个证据点。顺序：C 立即 → 修正版 B 紧随 → A 跟进；**不需要**纯文档观察期 | ✅ 全部落地：C 入 runbook（配方 4）、B 已实现（S29–S31）、A 已实现（v5，S32–S36） |
| 提案 cherry-pick 事实错误（:109、:318、§3.5） | brief 改对了但提案没改干净，两处自相矛盾 | ✅ 提案 v5 三处已改为实测结论（不触发、沿用原 id、--no-commit 规则） |
| 登记校验子串匹配 | `grep -qF` 短 id 前缀可命中更长串；改 token 精确匹配 | ✅ hook 改 token 边界匹配（S27：嵌入长 token 中的 id 不再算已登记） |
| 双登记表并存 | 两份可写真源会漂移；给退出条件或降级警告 | ✅ hook 对 legacy 路径命中时打印弃用警告（S28）；退出条件写入提案 §7.6（legacy 仅过渡，launcher/新会话一律 common-dir） |
| lint 表述 | §6 写"PASS"不准；提案 §6.1 承诺的命令迁移未做 | ✅ §6 已改为"通过 + 1 条已接受 WARN"；提案 §6.1 写明接受稳态 |
| strict 强度上限 | hook 拒绝信息印着 `git config --unset session.provenance`，应明示 fail-closed 只差一条命令 | ✅ 记入 §9 未解决事项 6 |
| DOCS-INDEX 滞后 | review 行还写 v2 | ✅ 本批更新为 v4 |
| 测试缺口 | 真实 clone 端到端（S12–15 为模拟）、pathspec commit 场景、登记表内容质量 | ⚠️ 已记录为后续补测项（不阻塞本轮） |
