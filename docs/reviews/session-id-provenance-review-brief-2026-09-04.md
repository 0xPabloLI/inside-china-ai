# 独立复核材料：Session-Id 关联标识落地（2026-09-03 session 交付，v2 修订版）

> 用途：交给未参与本工作的第三方 Agent 做独立 review。本文自包含——reviewer 不需要读对话历史。
> 交付方 Session-Id：`20260903-pilot1-384b29`｜仓库：`inside-china-ai`｜分支：`main`
> **v2（2026-09-04）**：按第一轮第三方复核意见修订。v1 的过度表述已更正，复核指出的三处规范
> 冲突、worktree 登记盲区、runbook 安全问题、安装链缺口均已修复（落实状态见 §8）。
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
- `bash scripts/test-commit-msg-hook.sh` → 27/27（含 bypass 矩阵、worktree 共享登记表、
  installer 行为、双 id 查询两侧均不可达、update-ref 带期望旧值拒绝对过期旧值写入）；
- `npm run lint:docs` → PASS；
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
5. hook 无法校验登记表内容质量——id 字符串出现即通过。
