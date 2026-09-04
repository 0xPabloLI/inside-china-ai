# 提案：Commit Session-Id 关联标识（Git trailer 约定）

> 状态：**已结项（2026-09-03 试点完成；2026-09-04 第三方复核修订至 v5）**——v4 修订版吸收
> 第三轮评审（9/10）意见后软试点；
> 试点结论：纯文档链路漏写率 67%（公平窗口 9 eligible，2 合规 + 1 半合规 + 6 漏写；按 v5 的
> 6hex 口径，原"合规"样本 `20260903-hallo3-ab-caf56c17` 为 8hex，实际不满足现行格式），超出
> 零容忍门槛 → hook 决策为「加」；命令已迁入 `docs/agents/git-workflow.md` §8（本文件转为设计
> 依据，不再是操作手册）；commit-msg gate 已落地并由
> `scripts/test-commit-msg-hook.sh` 覆盖（27 scenarios）。
> v5 相对 v4 的实质修正（第三方复核，2026-09-04）：id 统一为 6hex（与实现及在库 id 一致）；
> §3.4 登记由"不强制"改为 strict 模式强制且 fail-closed；登记表迁至 git common dir（worktree
> 共享）；安装链修复（`scripts/install-git-hooks.sh` 设置 hooksPath + strict，README 同步）；
> 措辞统一为「关联标识」——本机制只做 commit↔会话的关联，不证明真实身份、不恢复对话。
> 审计明细见登记表（git common dir 下，`git rev-parse --git-common-dir` 得到的
> `.git/session-pilot/pilot-log.md`，所有 worktree 共享）。
> 日期：2026-09-03（v4 同日）。v3 吸收第二轮评审（8/10）的 4 项实质意见；v2 吸收首轮评审
> （7/10）；v1 版本名"会话溯源提案"，因"溯源"表述过度承诺已更名。
> v4 相对 v3 的实质修正：事实 12 由"新 clone 失效"改正为"两套互斥安装路径"；唯一性规则的
> 适用范围由"每个 commit"收窄为"每个 eligible commit"；校验口径由原始行匹配改为结构化解析。
> 格式依据 `docs/agents/proposal-review.md` §6。
> 背景：评估 pacifio/atlas（https://github.com/pacifio/atlas）后不引入其客户端，吸收其核心
> 概念——commit↔session 关联——用 git 原生 trailer 实现。

## 0. 问题定义

本仓库采用多 agent 会话并行开发：多个 coding tool（ZCode、Claude Code、Codex、中文工具等）
及人工可能同时工作，commit 交错落在 `main`。`docs/agents/git-workflow.md` 已解决**并发安全**
（§1 只碰本 session 内容、§6 review 用 `baseline...taskHead`、§8 session boundary），但没有
解决**可归因**：commit 落库后，无法回答"这些 commit 是否来自同一工作会话"。

Atlas 用桌面客户端在读取时推断归属（观察 git、patch-id 对账，存私有 SQLite）；本提案改为
**写入时标注**：会话在 commit 时把 Session-Id 写进 commit trailer，历史外部化进 Git 本身。

## 1. 能力边界（先说清它不是什么）

trailer 只回答一件事：**"哪些 commit 自报属于同一个工作会话"**。它不恢复 prompt、推理过程或
transcript（那是 Atlas 检查点的功能），也不能证明归因正确（id 是自报的）。归因可信度依赖
写入纪律，纪律的强制手段见 §4 依赖模型与 §7 试点决策。

## 2. 已验证事实（本地 smoke test，Git 2.50.1 (Apple Git-155)，2026-09-03）

1. `--trailer` 写入结构化 trailers 正常；`%(trailers:key=Session-Id,valueonly)` 结构化提取
   正常。`--trailer` 自 Git 2.32 起可用（git-commit(1)）。
2. v1 写法 `-m "Session: x\nRefs: y"` 确认为 bug：单个 `-m` 内的 `\n` 落库为字面量反斜杠 n，
   只形成一个畸形单元（实测复现）。v1 已废弃该写法。
3. `--format=%(trailers)` 不加引号在 zsh/bash 中触发语法错误（实测："number expected"）；
   所有 format 串必须加引号。
4. log 无 `--trailer` 子命令（评审指正）；结构化查询改用 `--format` + `%(trailers:key=...)`。
5. `commit.template` 只预填编辑器，`-m` 形式的 commit 完全绕过它——**template 不能作为
   强制或降级手段**（git-commit(1) 行为；评审实测确认）。强制手段只有 commit-msg hook。
6. 仓库 `.githooks/` 目录存在且 `core.hooksPath=.githooks` 已配置（现有 post-checkout、
   post-commit、post-merge、pre-commit、pre-push）；**尚无 commit-msg hook**，新增即可挂载。
7. AGENTS.md 为跨工具事实标准：Codex、Cursor、Copilot、OpenCode 等**原生读取**
   （morphllm.com/agents-md-guide）。本仓库的 ZCode 会话实测读取 AGENTS.md。
   第二轮评审指出 Gemini CLI / Aider 等属于"需额外配置后支持"而非"原生读取"——该区分
   **未经本地实测**，v3 已按"原生支持或经配置支持"表述，并由 §7.1 覆盖表逐工具验证。
   **中文/长尾工具的读取情况未验证**——用户指出其使用的中文 coding tool 不在主流名单内，
   覆盖性必须逐工具 smoke test（§7.1），不得假设。

以下为第二轮评审提出、本轮**实测复现**的问题（测试仓库 `/tmp/trailer-test`、
`/tmp/trailer-amend`、`/tmp/hook-test`，同日同 git 版本；事实 12–16 为第三轮评审提出或本轮
复核，测试仓库 `/tmp/clone-test`、`/tmp/hookmatrix`、`/tmp/qedge`）：

8. **grep 前缀匹配误命中**：构造 3 个 commit——会话 A（`...-a1b2c3d4`）、同 slug 不同后缀的
   兄弟会话（`...-9999eeee`）、subject 中恰好出现 `20260903-kimi-ipo-a1b2c3d4` 但**无 trailer**
   的 commit。`grep 20260903-kimi-ipo` 返回 **3 条**（2 条误命中）；按第二列 `awk '$2 == id'`
   精确比较返回 **1 条**（正确）。→ §3.3 已改为精确比较。
9. **amend 产生双 Session-Id 并使 commit 隐身**：对已含 `Session-Id: A` 的 commit 执行
   `--amend --no-edit --trailer "Session-Id: B"`（模拟 fresh context 修复未 push 的同任务
   commit），落库 message 含**两条** Session-Id；`%(trailers:key=Session-Id,valueonly,
   separator=%x2C)` 输出 `A,B`，导致 §3.3 精确查询对 A 与 B **均返回空**——该 commit 对两个
   会话都不可见，且不会报错。→ §3.5 新增唯一性硬规则。
10. **compact 恢复命令并发歧义**：按日期取最新 commit 的恢复命令（`--grep <日期> ... -1`）
    返回的是**最新** commit 的 id，在上述测试仓库中返回了另一会话的 `beeff00d` 而非本会话的
    id。Git 历史本身无法判断哪个会话是"我"。→ 该恢复命令已删除，改见 §3.6。
11. **commit-msg hook 不是不可绕过**：同一内容无 trailer 时，正常 commit 被 hook 拦截、
    `--no-verify` 直接通过（实测，与 githooks(5) 一致）。且 `core.hooksPath` 存于
    `.git/config`：clone 后 `core.hooksPath` 为空，`.githooks/` 虽随仓库
    落盘但**未被激活**，无 trailer 的 commit 在 clone 中畅通。→ §4 硬依赖表述已降级。
12. **存在两套互斥的 hook 安装路径（v4 修正）**：v3 曾断言"按 README 安装的 hook 不会执行"，
    该结论**只在已启用 `core.hooksPath` 的 checkout 成立，不是普遍结论**——第三轮评审指正，
    本轮隔离 clone 实测复核（新建一个源仓库忠实复刻本仓库结构：`.githooks/`、
    `scripts/pre-commit.sh`、安装脚本；再从源仓库 clone 出目标仓库）：

    | 场景 | `core.hooksPath` | 安装脚本目标 `.git/hooks/pre-commit` | 实际生效的 hook |
    |---|---|---|---|
    | 当前 checkout（已配置） | `.githooks` | 写入但**从不执行** | `.githooks/` |
    | 新 clone（未配置） | 空 | 写入且**正是生效路径** | `.git/hooks/` |

    真实问题不是"新 clone 失效"，而是**同一仓库有两套互斥机制**：`.githooks/` 随仓库分发但需
    手动激活，`scripts/install-git-hooks.sh` 自动激活但安装到不随仓库分发的 `.git/hooks/`，
    且两套机制互相遮蔽。→ §6 统一为单一入口。
13. **`.githooks/` 被 `.gitignore` 整体忽略，只分发了 1/5 个 hook（v4 新增，实测）**：
    `.gitignore:135` 为 `.githooks/`；`ls-files` 在该目录仅返回 `.githooks/pre-commit`
    （force-add 遗留），`post-checkout`、`post-commit`、`post-merge`、`pre-push` 四个既未被
    跟踪也已被忽略，**不会到达任何 clone**。即当前 checkout 的 `.githooks/` 有 5 个 hook，
    新 clone 只有 1 个（且未激活）。该缺陷独立于本提案，但决定了 §6 的统一方案必须显式处理
    hook 分发。
14. **commit-msg hook 触发矩阵（v4 新增，实测；决定 §3.5/§7.2 的豁免范围）**：
    在 `core.hooksPath=.githooks` 且 `commit-msg` 校验"恰好一个 Session-Id"的测试仓库中：

    | 操作 | commit-msg 是否触发 | 后果 |
    |---|---|---|
    | 普通 commit（带/不带 trailer） | 触发 | 按规则校验 |
    | `commit --amend` | **触发**（实测 1 次；带 trailer 时通过） | 受约束，双 id 可被拦下 |
    | revert 子命令（`--no-edit`） | **不触发** | 生成的 commit 无 Session-Id（实测确认为空） |
    | revert 子命令（默认，开编辑器） | **不触发** | 同上——revert 从不调用 commit-msg |
    | 本地 `merge --no-ff -m` | **触发** | 无 trailer 时**被拦截，merge 中止并留下 MERGE_HEAD** |
    | cherry-pick（默认提交） | **不触发** | 新 commit **沿用原提交的 id**——归因错配且校验被跳过（v5 实测修正：v4 此处误记为"触发"；S19 已锁定该行为） |
    | `cherry-pick --no-commit` 后普通 commit | 触发 | 正确路径：新 commit 归到本 session，正常校验 |

    结论：revert、cherry-pick（默认提交）与"平台服务端生成的 merge commit"是**绕过点**
    （不经过 hook；cherry-pick 还会把新 commit 错归到源 session）；但**本地
    生成的 merge commit 不豁免**——它经过 hook 且会被拦死。v3 §7.2 把 merge commit 笼统列为
    排除项，在启用 hook 后会直接卡住本地 merge，v4 已在 §7.2 区分。
15. **校验口径：原始行匹配会误判，结构化解析不会（v4 新增，实测）**：对同一段 commit message，
    两种口径结果不同（`interpret-trailers --parse` vs `grep -c '^Session-Id: '`）：

    | 用例 | 结构化解析 | 原始行匹配 | 判定 |
    |---|---|---|---|
    | 合法单值 | 1 条 | 1 | 一致 |
    | 正文伪 trailer（`Session-Id: xxx` 未与末尾空行分隔） | **0 条（正确排除）** | **1（误判为合规）** | 行匹配**假阳性** |
    | 空值 `Session-Id: `（带尾随空格） | 1 条、值为空 | **1（接受空值）** | 行匹配**假阳性** |
    | 空值 `Session-Id:`（无空格） | 1 条、值为空 | 0 | 行匹配漏检（判为缺失而非非法） |
    | 双值 | 2 条 | 2 | 一致 |
    | prose 中出现 `Session-Id: was missing before` | 0 条 | 0 | 一致 |

    两种假阳性都会让"应被拦下"的 commit 通过，直接架空 §7.4 的零容忍门槛。→ §3.5 改为结构化解析。
16. **查询路径对上述边界用例是安全的（v4 新增，实测）**：§3.3 的 `%(trailers:key=Session-Id,
    valueonly)` 属结构化提取，对事实 15 的全部用例均返回空——伪 trailer 与空值 commit 在任何
    精确查询中都不可见，不会污染结果（实测查询伪 id 命中 0 行）。推论：空值/伪 trailer 的
    危害是**静默缺失**（与事实 9 的双 id 同型），要靠 §3.5 的写入端校验拦住，查询端补不回来。

## 3. 方案设计

### 3.1 ID 规范

```
Session-Id: 20260903-kimi-ipo-a1b2c3
```

- 格式：`YYYYMMDD-<slug>-<6hex 随机>`。随机后缀消除相邻会话同日同 slug 的碰撞（评审修正项）。
  v5 复核修订：v4 规定 8hex，与已落地的 hook（6hex）及全部在库 id 冲突；按实现统一为 6hex——
  16^6 ≈ 1677 万组合，对日级会话数碰撞概率可忽略，且现有历史 id 均为 6hex，改 8hex 反而制造
  两代不兼容。slug 禁止包含客户名、事故信息、未公开项目名、密钥等敏感内容（会进 git 历史）。
- 复用规则：
  - 同一连续会话（含 compaction 延续）**复用同一 id**；
  - fresh context / handoff 交接 = **新 id**；
  - 跨会话推进同一任务：用 `Refs: <issue>` 或独立 `Workstream-Id` 关联，不共用 Session-Id。
- 数量约束见 §3.5：**每个 eligible commit 恰好一个**（eligible 的定义与豁免见 §7.2——v4 修正，
  不得表述为"每个 commit"，因 revert 与平台 merge commit 天然豁免）。
- 生命周期：trailer 依附 commit message。squash 会丢掉被合并 commit 的 trailer、平台生成的
  merge commit 无 trailer、手工改写 message 可能破坏 trailer——均可接受：锚定对象是最终
  落库的 commit，改写历史时归属随之改写，与 git 语义一致。

### 3.2 写入（唯一命令形态）

```bash
git commit -m "<type>: <subject>" \
  --trailer "Session-Id: 20260903-kimi-ipo-a1b2c3" \
  --trailer "Refs: #152"
```

无关联 issue 时省略 Refs。人工 commit 同样遵守。
**不得**对已含其他 Session-Id 的 commit 追加第二个 id（§3.5）。

### 3.3 查询（精确匹配，零依赖）

```bash
# 某会话全部 commit：必须按 trailer 列整体比较
id='20260903-kimi-ipo-a1b2c3'
git log --all \
  --format='%h%x09%(trailers:key=Session-Id,valueonly,separator=%x2C)%x09%s' |
  awk -F '\t' -v id="$id" '$2 == id'
```

不得改用 `grep <id>`：会误命中同 slug 不同后缀的兄弟会话，以及 subject 中碰巧出现该 id 但无
trailer 的 commit（事实 8）。

单 commit 归因：对 `<sha>` 用 `--format='%(trailers)'` 输出全部 trailer。

多 id 违规检测——违规 commit 第二列会含逗号，对任何精确查询都不可见（事实 9），需主动扫：

```
| awk -F '\t' '$2 ~ /,/ {print "VIOLATION(multi Session-Id): " $0}'
```

### 3.4 登记规则（v5 复核修订：strict 模式下强制）

v4 曾规定"登记不强制"，与落地后的 commit-msg hook（strict 模式强制登记）冲突，v5 按实现统一：

- **开关**：`session.provenance=strict`（安装脚本 `scripts/install-git-hooks.sh` 设置）。
  strict 开启时 hook 校验 id 已登记，且**fail-closed**——登记文件不存在同样拦截，防止删表静默
  关闭门控。未开启（新 clone 未跑安装脚本）时 hook 仍校验 trailer 格式，但不校验登记。
- **登记位置（canonical）**：`$(git rev-parse --git-common-dir)/session-pilot/pilot-log.md`
  （主 worktree 即 `.git/session-pilot/pilot-log.md`）。放 common dir 是因为 linked worktree
  不复制 gitignored 文件——放工作区根会让每个 worktree 看到不同的登记表，strict 校验在
  worktree 里静默失效（复核实测）。hook 同时接受工作区根 `.session-pilot/pilot-log.md`
  作为过渡兜底，**但命中即打印弃用警告**——legacy 路径退出条件：installer 迁移完成后新会话
  一律写 common dir；legacy 文件不再新增条目，待在库条目全部迁入且连续一个试点周期无 legacy
  命中后由 installer 删除。两个可写真源并存是过渡期已知代价，靠警告抑制漂移。
- **仍禁止**为登记 Session-Id 单独创建或修改仓库内文档——登记只写上述本地文件；已有
  spec/ticket/handoff 的任务可以顺带引用 id，但来源以登记表为准。

### 3.5 唯一性硬规则（v3 新增，v4 收窄适用范围并改校验口径）

**适用范围：每个 eligible commit**（§7.2 定义）。revert commit、cherry-pick 默认提交产生的
commit（不触发 hook，且沿用原提交 id 造成归因错配——必须改用 `cherry-pick --no-commit` 后
正常提交）与平台服务端生成的 merge
commit 明确豁免（事实 14）——v3 表述为"每个 commit 必须且只能有一个"，与 §7.2 的排除项自相
矛盾，v4 已修正。本地生成的 merge commit **待定**，见 §7.2 表格与待决项，不在此处预设归属。

1. 每个 eligible commit **必须且只能有一个** `Session-Id`。
2. **fresh context 不得 amend 属于上一 Session-Id 的 commit**，即使该 commit 尚未 push；
   必须追加新 commit。依据：amend 保留原 trailer，追加当前 trailer 即产生双 id，并使该
   commit 对两个会话的查询同时隐身（事实 9）。
3. 与 `docs/agents/git-workflow.md` §4.2"尚未 push 优先 amend"冲突时，**本规则优先**；
   git-workflow.md 需增加例外条款——amend 只允许落在本会话 id 的 commit 上。

**校验口径（v4 改为结构化解析）**：不得用原始行匹配（如统计 `Session-Id:` 行数）。必须经
`interpret-trailers --parse` 结构化解析后判定，四条全部满足才算合规：

1. 解析结果中 `Session-Id` **恰好一条**（不是"至少一条"）；
2. 值**非空**（`Session-Id: ` 与 `Session-Id:` 都判非法——事实 15 证明原始行匹配会放过前者）；
3. 值匹配 §3.1 的 `YYYYMMDD-<slug>-<6hex>` 格式；
4. 正文中的伪 trailer 不参与判定（事实 15 证明原始行匹配会把它误算为合规）。

未来的 `.githooks/commit-msg` 按同一口径实现，且**必须覆盖以下测试用例**（事实 15 实测）：
正文伪 trailer（应判非法）、空值带/不带尾随空格（均应判非法）、双值（应判非法）、合法单值
（应通过）。查询端无需改动——`%(trailers:...)` 已是结构化提取，对边界用例安全（事实 16）。

### 3.6 compaction 后如何恢复 id（v3 重写，对应评审 P1-3）

**已删除**原"按日期取最新 commit"的恢复命令——并发下会返回其他会话的 id（事实 10）。改为：

1. 优先从**会话摘要**中取回 id（compact 前的会话记录、本会话已写下的 commit SHA）；
2. 用已知 SHA 配合 `--format='%(trailers:key=Session-Id,valueonly)'` 直接取回 id；
3. **无法无歧义恢复时，生成新 id**，继续用 `Refs: <issue>` 或 `Workstream-Id` 关联同一任务；
4. **禁止**从共享 HEAD 或按日期 `--grep` 猜测本会话 id。

推论：一个 commit 归属错误，比一个 commit 缺失 id 更有害——前者是错误数据且静默，后者只是
退化为现状。这也是 §3.5 采用硬规则的理由。

## 4. 依赖模型（回应"无依赖"目标）

| 环节 | 依赖 | 说明 |
|---|---|---|
| 查询端 | **零** | 查询用 log 子命令，与工具无关；历史在 Git 对象里，不依赖任何工具的会话存储存活 |
| 写入端（软） | 工具遵守 AGENTS.md | ZCode 已实测读取；主流工具文献支持（"原生支持或经配置支持"，事实 7）；**中文/长尾工具未验证，逐个 smoke test**。不遵守的工具只是不写 trailer，优雅退化为现状 |
| 写入端（硬，可选升级） | 本机 `.git/config` 的 `core.hooksPath=.githooks` **且**未使用 `--no-verify` **且**该操作会调用 commit-msg | 只为**已配置 hooksPath、未加 `--no-verify`、且经过 commit-msg 的**操作提供**客户端级**校验。三重限制均有实测：`--no-verify` 可绕过（事实 11）；配置不随 clone 继承（事实 11）；revert 子命令根本不调用 commit-msg（事实 14）。它是纪律放大器，**不是安全边界、不是"任何人都绕不开"**。另注：hook 文件本身也只分发了 1/5（事实 13），在 §6.0 修好前连"clone 后手动激活即可"都不成立 |

与 Atlas 的依赖对比：Atlas 依赖 ACP 协议 + 客户端托管运行 + 私有 SQLite；本方案查询端
无任何依赖，写入端默认软依赖（可退化），硬保证只有客户端级强度（§7 决策规则）。

## 5. 被否决的替代方案

1. **引入 Atlas 客户端**：依赖 ACP 托管与私有存储，ZCode 及中文工具不在支持列表。
2. **依赖 coding tool 的 memory/session 文件**：tool-specific，跨工具不可移植（用户已否决）。
3. **语义共享记忆注入**：需常驻客户端；本仓库规模下决策结论写入 CONTEXT.md/tracker 等效更低。
4. **Git notes / 独立 manifest**：notes 不随 commit 复制；manifest 与 commit 分离产生同步问题。
5. **commit.template**（评审否决）：`-m` 完全绕过，无强制力（事实 5）。
6. **compact 后从 HEAD / 按日期 grep 恢复 id**（v3 新增否决）：并发下必然取错会话（事实 10）。

## 6. 影响面

| 文件 | 改动 | 下游影响 |
|---|---|---|
| `docs/agents/git-workflow.md` | §4.2 +1 例外条款（amend 只限本会话 id 的 commit）；新增写入/查询/恢复命令段；§8 +1 句（记录 id） | 所有会话 commit 行为（经 AGENTS.md 读取链，覆盖以 §7.1 实测为准） |
| （仅当启用 hook）`.githooks/commit-msg` | 新增校验脚本，按 §3.5 的结构化口径校验"恰好一个且值合法" | 所有未加 `--no-verify` 且经过 commit-msg 的 commit（不含 revert，事实 14） |
| （仅当启用 hook）`package.json` | 新增 `setup:hooks` 脚本，作为**唯一** hook 安装入口 | 替换现有两套互斥机制（事实 12） |
| （仅当启用 hook）`scripts/install-git-hooks.sh` | 收敛为 `setup:hooks` 的实现体：改为设置 `core.hooksPath=.githooks`（幂等），**不再写入 `.git/hooks/`** | 消除"写入但不生效"的静默失败 |
| （仅当启用 hook）`README.md` | §Install 的 hook 安装段改为统一入口；现行 `bash scripts/install-git-hooks.sh` 指引在**已配置 hooksPath 的 checkout 无效**（事实 12） | 新克隆环境与现有 checkout |
| （仅当启用 hook）`.gitignore:135` | 移除 `.githooks/` 忽略规则（或改为只忽略非跟踪项），使 5 个 hook 全部随仓库分发 | 事实 13：当前只分发 1/5 |
| （仅当启用 hook）hook 安装/校验测试 | 新增：验证 hooksPath 生效、§3.5 四个测试用例的判定、本地 merge 不被误拦 | CI 与本机 |

不改动应用代码与现有 hooks。最坏后果：会话漏写 trailer，退化为现状。

### 6.0 hook 安装路径统一（v4 新增，对应事实 12/13）

现状是两套互斥机制，无论走哪条都有人拿不到 hook：

- **A 路（`.githooks/`）**：随仓库分发，但需手动设 `core.hooksPath`；且因 `.gitignore:135`
  整体忽略该目录，实际只分发了 `pre-commit` 一个（事实 13）。
- **B 路（安装脚本）**：自动激活，但装到不随仓库分发的 `.git/hooks/`；在已启用 A 路的
  checkout 里写入后**永不执行**（事实 12）。

统一方案：

1. 唯一入口是 npm script `setup:hooks`（README 与 CI 都调它），内部幂等地设置
   `core.hooksPath=.githooks` 并做可执行位检查；
2. B 路的 `.git/hooks/` 写入行为**删除**——它是"静默失败"的根源；
3. 移除 `.githooks/` 的 gitignore 规则，让 hook 真正随仓库分发；
4. hook 仍未随 clone 自动激活（Git 不继承 `core.hooksPath`），`setup:hooks` 必须写进
   README 的 clone 后步骤与 CI，不能只靠文档提醒。

该统一属于**既有缺陷修复**，与本提案是否采纳正交；若本提案不落地，仍建议单独立项（见 R7）。

### 6.1 L1/L2 分层与 lint

本文件是 L2 研究文档。按 `docs/DOCS-INDEX.md` 的 L1/L2 边界，**运行命令归 L1**：采纳时把
§3.2/§3.3/§3.5/§3.6 的命令全文迁入 `docs/agents/git-workflow.md`，本文件只保留论证与最小
示例——这也同时消除第二轮评审指出的 `l2-execution-instructions` 告警（L2 文档命令行数 ≥5
即告警）。

v4 仍保持 2 处命令块（§3.2 写入、§3.3 查询）：§3.5 的结构化校验、§6.0 的 `setup:hooks`
均以子命令/参数名描述（写作 `interpret-trailers --parse`、`setup:hooks`），不计入命令行数。
**完整的命令块已在结项时迁入 L1（`git-workflow.md` §8）**；本文件因转为设计依据仍保留少量
命令示例，`npm run lint:docs` 对本文件的 1 条 `l2-execution-instructions` WARN（命令行 6≥5）
为**已接受的稳态**——后续清理命令示例时自然消除，不阻塞任何门禁。

`README.md:131` 的指引在**已启用 `core.hooksPath` 的 checkout 无效、在新 clone 有效**（事实
12）——v3 曾表述为普遍失效，已修正。它仍是与本提案独立的既有缺陷，随 §6.0 一并修或单独立项。

## 7. 试点计划（评审裁决：先试点 3–5 个会话，再决定是否加 hook）

1. **工具覆盖 smoke test**：对用户实际使用的每个 coding tool（含中文工具）验证三件事——
   是否读 AGENTS.md（写 `Session:` 测试注释观察行为）；能否执行 §3.2 写入命令；是否需要
   额外配置才读取 AGENTS.md（区分"原生支持"与"经配置支持"，事实 7）。产出覆盖表。
2. **eligible commit 定义**（v3 新增，v4 按事实 14 重排豁免边界）：试点只统计最终落库、由
   人或 agent 主动创建的普通 commit。

   | 类别 | 是否 eligible | 依据（实测） |
   |---|---|---|
   | 普通 commit（人工或 agent） | ✅ 是 | commit-msg 会触发，可控 |
   | `commit --amend` | ✅ 是 | commit-msg 会触发（事实 14） |
   | cherry-pick 落地的 commit（默认提交） | ❌ 否 | **不触发 commit-msg** 且沿用原提交的 id——归因错配（v5 实测修正）；规则：`cherry-pick --no-commit` 后正常提交 |
   | **revert commit** | ❌ 豁免 | revert 子命令**从不调用 commit-msg**（`--no-edit` 与编辑器模式实测均不触发），生成的 commit 无 Session-Id，无法也无需合规 |
   | **平台服务端生成的 merge commit** | ❌ 豁免 | GitHub UI / PR merge 在服务端创建，不经过本地 hook |
   | **本地 `merge --no-ff`** | ⚠️ **不豁免，需显式决策** | 实测 commit-msg **会触发**；无 trailer 时 merge 被拦死并留下 MERGE_HEAD。v3 把它笼统列为排除项是错的——启用 hook 后本地 merge 会直接卡住 |
   | squash 前的中间 commit | ❌ 排除 | 不最终落库 |

   **本地 merge 决策（2026-09-03 用户已确认，选 (a)）**：hook 白名单放行自动生成的 merge
   message，本地 merge 与平台 merge 同为豁免。理由：merge 命令无法直接附加 trailer（事后
   amend 违背 §3.5 唯一性）；本仓库工作流以 PR/squash 为主，本地 merge 罕见。若试点数据
   显示本地 merge 频繁，再升级为选项 (b)（要求带 id）。试点期仍记录实际发生的本地 merge
   次数（§7 指标 7）。

   **包含人工 commit**——人工与 agent 分列两栏统计，用于区分"工具覆盖率"与"人工合规率"，
   不合并成一个数字。
3. **试点指标**（每会话统计）：eligible commit 总数（人工/agent 分列）、有效 trailer 数、
   **多 id commit 数**（应恒为 0，见 §3.3 违规检测）、**空值/伪 trailer commit 数**（应恒为 0，
   按 §3.5 结构化口径判定）、查询误命中数（按 §3.3 应为 0）、compact 后 id 恢复成功/失败次数。
4. **hook 决策规则**（v3 收紧）：**任何 eligible commit 漏写、或出现多 id，即触发 hook 评估**；
   不再保留 10% 漏写容忍。评估时一并权衡 §8 R4 的摩擦两难与 §4 的客户端级强度上限。
5. **compaction 演练**：试点会话中人为 compact，验证按 §3.6 的三步恢复可执行；重点记录
   "无法无歧义恢复而新建 id" 的次数——该数字是 §3.6 规则的实际成本。
6. **漏写分母的采集方法**（v4 新增，对应评审 P2-2）：

   **问题**：漏写 trailer 的 commit **无法用 Session-Id 反查**——它不在任何查询结果里。
   因此"eligible commit 总数"这个分母不能从 §3.3 的查询推导（查询只会给出分子），否则
   合规率会被系统性高估，甚至算出 100%。

   **方法**：每个试点会话在**本地试点表**中逐条自报，字段如下：

   **试点表路径（v5 修订，工具中立）**：`$(git rev-parse --git-common-dir)/session-pilot/pilot-log.md`
   （主 worktree 即 `.git/session-pilot/pilot-log.md`，随机器本地保存、不提交）。不放任何单一
   工具的私有目录——试点覆盖多个 coding tool，**任何工具都要能在同一张表登记与查询**；放
   common dir 是为了让 linked worktree 共享同一张表。历史位置（仓库根 `.session-pilot/`）
   作为过渡兜底仍被 hook 接受。读仓库规则链的工具开工时按本节路径自行登记；不读规则链的
   工具由用户在开工时口头告知路径与规则，并代其登记。

   | 字段 | 说明 |
   |---|---|
   | `tool` | 本次会话使用的 coding tool（用于 §7.1 覆盖表） |
   | `Session-Id` | 本会话 id（含"恢复失败后新建"的情况） |
   | `baseline` | 会话开始时的 baseline SHA |
   | `commit_sha_list` | **本会话实际创建的全部 commit SHA**（无论是否带 trailer） |
   | `eligible_count` | 上述列表中按 §7.2 判定为 eligible 的数量 |
   | `compact_before` / `compact_after` | compact 前后的 id 状态（用于指标 5） |

   分母 = `eligible_count` 的合计（会话自报），分子 = 按 Session-Id 查询到的 commit 数。
   两者必须对得上：若某 SHA 在 `commit_sha_list` 中却查不到，即为漏写/多 id/空值之一，
   按 §3.5 口径归类。

   **该表同时是 id→会话 的唯一登记处**：id 是会话自报的任意字符串，git 历史本身不知道它
   对应哪次对话。会话开始时生成 id 后，除写入 trailer 外**必须在此表登记一行**（tool +
   Session-Id）。事后查找走两条路：从 commit → 表中查 id 对应哪次会话；从会话 → 从表中
   （或该会话的记忆日志/摘要）拿 id → 按 §3.3 精确查询列出其全部 commit。不读仓库规则的
   工具，由用户在开工时口头/粘贴告知规则，并代为登记。

   该表**放本地**，不改共享 tracker——避免多会话并发编辑同一文件（与 §3.4 同一理由）。

7. **本地 merge 决策**（v4 新增，**已裁决**）：选 (a) hook 白名单放行，见 §7.2；试点期记录
   实际发生的本地 merge 次数。
8. **其余两项待决项**（2026-09-03 用户已确认）：
   - `setup:hooks` 统一改造（README 失效指引、`.gitignore:135` 对 `.githooks/` 的忽略、两套
     互斥安装路径）：**单独立项，试点开始前完成**；最低限度先修 README:131。
   - 命令迁入 `docs/agents/git-workflow.md`：**试点期间不迁**，本文件 §3 作试点期唯一操作
     手册；试点裁决通过后一次性迁入，避免规则双源漂移。

## 8. 未解决风险

- R1：写入端遵从依赖 AGENTS.md 读取链，中文工具覆盖未知（§7.1 实测后关闭或转入 hook 路径）。
- R2（v3 修订）：id 自报无校验，重复/误写靠 §3.3 违规扫描发现；hook 只能提供客户端级
  校验，`--no-verify` 可绕过（事实 11），因此对恶意或图省事的绕过无机械防御。
- R3：本方案只提供**关联标识**，不提供并发写保护（git-workflow §1/§2 负责）、不提供会话
  内容恢复（prompt/transcript 需 Atlas 类工具）。评审明确要求采纳时不得以"溯源"表述。
- R4：若加 hook，对不读 AGENTS.md 的工具存在摩擦两难：拒绝提交会卡死不认识 Session-Id 的
  工具；自动附加则 id 失去会话语义。留待试点数据裁决，不在本提案内预定。
- R5：Claude Code 覆盖需根目录 `CLAUDE.md`（1 行 `@AGENTS.md`），涉及 AGENTS.md 结构，
  须按 `writing-for-agents` 流程单独走；仅在用户确认使用 Claude Code 后执行。
- R6（v3 新增）：启用 hook 的改动面比 v2 估计的大——需同步 README、安装脚本与 hook 测试，
  且这三处在 v2 影响面中均被遗漏（第二轮评审指正）。
- R7（v4 重写）：仓库存在**两套互斥的 hook 安装路径**（事实 12）——v3 曾断言"新 clone 失效"，
  经隔离 clone 实测为**不准确的结论**，v4 已改正：真正的问题是 A 路（`.githooks/`）与 B 路
  （安装脚本写 `.git/hooks/`）互相遮蔽。属既有缺陷，与本提案正交，统一方案见 §6.0。
- R8（v4 新增）：**本地 `merge --no-ff` 经过 commit-msg 且会被无 trailer 的校验拦死**（事实
  14），与"平台 merge commit 豁免"不是同一类。启用 hook 前必须先定 §7.2 的待决项，否则会
  在需要 merge 时突然卡住。
- R9（v4 新增）：`.githooks/` 被 `.gitignore:135` 整体忽略，**5 个 hook 只有 1 个随仓库分发**
  （事实 13）。在 §6.0 第 3 步修好之前，任何"hook 随仓库分发"的假设都不成立——包括 §4 依赖
  模型表中"配置不随 clone 继承"的表述，实际比这更弱：连文件都没到。
- R10（v4 新增）：**合规率的分母依赖会话自报**（§7.6）。若试点会话漏填 `commit_sha_list`，
  分母会偏小、合规率虚高；且本方案无法自动检测漏填。缓解方式是试点会话数少（3–5 个）时
  人工核对，规模扩大后必须上 hook 才能自证。

## 9. 参考出处

1. git-commit(1)（`--trailer`、`commit.template` 行为）、git-log(1)（`%(trailers)`）、
   githooks(5)（`--no-verify` 绕过）、git-interpret-trailers(1)（`--parse` 结构化解析）：
   https://git-scm.com/docs/git-commit 、https://git-scm.com/docs/git-log 、
   https://git-scm.com/docs/githooks 、https://git-scm.com/docs/git-interpret-trailers ；
   本地 Git 2.50.1 smoke test（2026-09-03，事实 1–16）。
2. pacifio/atlas README（检查点、共享记忆、ACP 托管模型）：https://github.com/pacifio/atlas
3. Agent Client Protocol：https://agentclientprotocol.com/get-started/introduction
4. AGENTS.md 跨工具支持：https://www.morphllm.com/agents-md-guide ；
   https://github.com/google-gemini/gemini-cli/discussions/1471
5. 首轮第三方评审（2026-09-03，7/10）：命令修正（--trailer、引号、--grep 误命中）、id
   碰撞加随机后缀、登记不强制、commit.template 无效、能力边界表述——已吸收进 §1/§2/§3/§5。
6. 第二轮评审（2026-09-03，8/10，"再修一轮后再启动试点"）：4 项实质意见（查询非精确匹配、
   跨会话 amend 错误归因、compact 恢复命令拿错 id、hook 非不可绕过）已吸收进 §2 事实 8–12、
   §3.3、§3.5、§3.6、§4、§6、§7.2/7.4、§8 R2/R6/R7；3 项次要建议（eligible commit 定义、
   合规门槛零容忍、工具支持表述）已吸收进 §7.2、§7.4、§2 事实 7。
7. 第三轮评审（2026-09-03，9/10，"可以进入软试点"）：2 项 P1——事实 12 结论不准确（已改正
   为两套互斥安装路径，§2 事实 12、§6.0、§8 R7）、唯一性规则与排除项冲突（已收窄为
   eligible commit，§3.1、§3.5、§7.2）；2 项 P2——hook 改用结构化解析（§3.5，事实 15/16）、
   试点漏写分母需采集方法（§7.6）。另据实测补充事实 13（hook 分发不全）、事实 14（commit-msg
   触发矩阵）与 §8 R8/R9/R10。
7. 仓库内现状：`AGENTS.md`（Workflow Router 第 8 条）、`docs/agents/git-workflow.md`
   （§4.2/§6/§8）、`README.md:131`、`.githooks/`（core.hooksPath 已配置）、
   `scripts/install-git-hooks.sh`、`docs/agents/proposal-review.md` §6。
