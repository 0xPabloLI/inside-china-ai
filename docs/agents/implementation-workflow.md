# Implementation Workflow

> 代码、脚本、迁移、测试基础设施或 Agent 行为规则的实施入口。核心原则：**Planning Scale 决定是否创建 Spec/Tickets，Risk 决定验证强度。**

## 1. 授权与自动推进

1. 用户明确要求实施、修改、修复或开始后，才可改文件。
2. 用户只要求分析、review、调研或方案时，停在实施前。
3. 获得实施授权后，Agent 自动完成后续阶段，不要求用户逐条输入 Matt Pocock slash command。
4. 仅在以下情况暂停：
   - 关键产品决策仍有多个合理答案；
   - prototype 需要用户选择；
   - 内容管线到达规定的 HITL；
   - 即将执行不可逆操作或 consequential external action；
   - 环境、凭据或缺失信息导致无法继续。

## 2. Matt Pocock Skill 调用契约

本项目使用 Matt Pocock `skills` v1.2.3 的调用分类。

### Model-invoked

`grilling`、`domain-modeling`、`prototype`、`diagnosing-bugs`、`research`、`tdd`、`codebase-design`、`code-review` 可由 Agent 通过 Skill tool 调用。

### User-invoked

`ask-matt`、`grill-with-docs`、`wayfinder`、`to-spec`、`to-tickets`、`implement` 带有 `disable-model-invocation: true`。当本文件要求 Agent 自动执行其中一个阶段时，采用 **execute-by-reference**：

1. 读取 `.agents/skills/<name>/SKILL.md`；不存在时检查 `.claude/skills/<name>/SKILL.md`。
2. 以该文件为方法来源，执行适用步骤和完成标准。
3. 应用本文件明确列出的项目覆写。
4. 如实描述为“按 `<name>` 执行”，不得声称 Skill tool 已调用它。

不要修改安装目录中的 Matt skill 文件。`npx skills update` 会更新这些副本；长期项目适配只写在本文件。

## 3. 第一次分流：Planning Scale

选择能可靠完成任务的最低等级。代码量和目录不是判定标准。

| 等级 | 判定 | 路线 |
|------|------|------|
| **S0 Read-only** | 未获实施授权，或任务仅为解释、review、调查 | 检查并汇报，不改文件 |
| **S1 Single-session** | 决策和实施可在一个 context window 内完成 | 必要时 Grill，随后直接 Implement；可跳过独立 Spec/Tickets |
| **S2 Multi-session, clear route** | 路线已清楚，但实施需多个 context windows | Grill（按需）→ Spec → Tickets → 每 ticket 独立 Implement |
| **S3 Multi-session, foggy route** | 目的地可命名，但规划本身跨 session 且存在大量未决路径 | Wayfinder → 路线清晰后进入 S2 |

### S1 完成标准

- 当前上下文写明 scope、acceptance criteria、test seams 和适用的风险场景。
- 实施、验证、review 和修复循环能在本 session 内完成。
- 即使 Risk 为 R3，也不因形式要求强制创建 Spec/Tickets。

### S2 完成标准

- Spec 是跨 session 的 durable contract，记录已决定行为、seams、风险、out of scope 和完成标准。
- Tickets 是 tracer-bullet vertical slices，每个可独立演示或验证，并适合一个 fresh context。
- 每个 ticket 声明 blocking edges、demo path，以及在基线状态下会失败的 acceptance criteria。

### S3 完成标准

- 先确定有边界的 Destination。
- Map 只保存索引；decision ticket 保存答案；Fog 只保存尚无法准确提问的区域；Frontier 只含未阻塞、未领取的 ticket。
- Wayfinder ticket 解决决策，不实施产品代码。
- `research` ticket 可 AFK；`grilling` 和 `prototype` ticket 是 HITL。
- Map 清晰后必须合成 Spec，再拆 implementation tickets；不得把 decision tickets 直接交给 Implement。

若规划能在一个 session 内想清楚，使用 S1，不使用 Wayfinder。若路线清楚但实施跨 session，使用 S2，不使用 Wayfinder。

## 4. 第二次分流：Risk

Planning Scale 与 Risk 独立判定。

| 等级 | 判定 | Assurance Gate |
|------|------|----------------|
| **R0 Read-only** | 无文件修改 | 无实施 gate |
| **R1 Low** | 不改变运行时行为、契约、数据流、授权或发布路径 | 定向检查 + diff 自审 |
| **R2 Standard** | 有界的普通行为变化 | acceptance scenarios + 可测试行为 TDD + affected tests + review |
| **R3 High** | 下列任一高风险触发 | impact/scenario analysis + observed, testable failure baseline + relevant full verification + runtime/real-data evidence |

### R3 触发

- 认证、管理员 gating、Supabase RLS、角色或 secret 边界；
- migration、数据删除、不可逆状态变化；
- 公共接口、持久化 schema、跨组件或跨 step 契约；
- 发布、外部写入、用户可见生产路径；
- `scripts/short-video/` 核心管线、时间线、音频同步或 Remotion 渲染；
- 多消费者共享模块，失败会静默产生错误内容或错误权限。

高风险路径速查：

- Admin editor：`src/routes/_authenticated/admin.tsx`
- Auth gating：`src/routes/_authenticated/route.tsx` 与 `admin.tsx`
- Post rendering：`src/routes/posts.$slug.tsx` 与 `src/components/markdown-content.tsx`
- Database：`supabase/migrations/`
- Video pipeline：`scripts/short-video/lib/`、`scripts/short-video/main.mjs`、`scripts/short-video/render-only.mjs`、`scripts/short-video/remotion/src/`

R3 实现前必须记录实际失败基线，例如失败的自动化测试、可重复的 runtime/real-data 复现，或对旧状态 fail 的静态/运行时 gate；仅声明“可以变 red”不算证据。若直接复现会破坏真实数据或触发不可逆操作，使用隔离 fixture、dry-run 或既有失败 artifact，不在生产环境制造失败。

## 5. 决策阶段

### Grill

仅当需求、边界、seam 或产品行为仍未决定时，按 `grill-with-docs` execute-by-reference：

1. 调用 `grilling` 与 `domain-modeling`。
2. 事实由 Agent 查询，决策交给用户。
3. 使用 round-based frontier，一轮只问当前可回答的问题并附推荐答案。
4. R2/R3 按 `docs/conventions/scenario-enumeration-checklist.md` 检查适用场景。
5. 用户确认 shared understanding 后结束。

路线已经由 issue、明确 acceptance criteria 或刚完成的讨论充分决定时，不重复 Grill。

### Prototype Detour

只有谈话无法回答状态模型或视觉选择时调用 `prototype`。原型必须放在隔离 worktree 的 `prototype/<name>` 分支，遵守 `docs/agents/git-workflow.md`，不得在当前工作目录切分支。

### Spec

只在 S2/S3 执行 `to-spec` by reference。项目覆写：

- 默认创建本地 active spec；只有用户明确授权 tracker 写入时才发布 GitHub Issue。
- Spec 必须吸收已决定内容，不得重新开启访谈或发明新要求。
- R3 必须包含 Modified Files Impact 和 Behavioral Scenarios。
- Spec 创建后立即进入 Tickets，不要求额外人工确认，除非出现新决策。

### Tickets

只在 S2/S3 执行 `to-tickets` by reference。项目覆写：

- Agent 先自审 granularity、blocking edges、demo path 和 acceptance criteria。
- 仅当拆分会改变产品范围，或存在多个 materially different 拆法时询问用户。
- 默认使用项目现有 active ticket 文档；发布 GitHub Issues 需要用户明确授权。
- 一个 ticket 一个 fresh context；wide refactor 使用 expand–migrate–contract。

## 6. Implement 与 TDD

按 `implement` execute-by-reference，一次只实施一个 S2/S3 ticket；S1 实施当前已确认 scope。

1. 读取 contract，复述本次 scope，记录 pre-work Git baseline。
2. 选择最高、最稳定的 public seam；若 seam 本身是设计问题，调用 `codebase-design`。
3. 对可确定且可自动验证的行为调用 `tdd`：
   - 一个 slice 一次 red → green；
   - red 必须命中本次行为，而不是附近错误；
   - 只写足以变 green 的实现；
   - review 发现设计问题后再 refactor，并保持测试 green。
4. 每个 scenario 都是 verification obligation，但不等于必须各写一个自动化测试；按 `docs/conventions/scenario-matrix.md` 指定可追溯 evidence。
5. 运行定向验证，完成 ticket checklist，然后按 `docs/agents/git-workflow.md` 创建 atomic commit。

难复现 bug 先调用 `diagnosing-bugs` 建立 tight red-capable loop，再进入本节。

## 7. Verification Gate

所有代码改动至少运行 affected tests。按影响触发以下检查：

| 改动 | 必需验证 |
|------|---------|
| 仅 Agent 文档 | `npm run lint:docs`、指针检查、`git diff --check` |
| `src/`、Supabase、应用配置 | affected tests、`npm test`、`npm run lint`、`npm run build`、`npx tsc --noEmit` |
| UI 交互、布局或样式 | 上述相关检查 + dev server 浏览器核心路径；对齐测量同时记录 `width`、`left`、`right` |
| 视频管线逻辑 | affected/full relevant tests + 至少一个已有 content 目录的 Real Data Smoke Test |
| Remotion 视觉或时间线 | relevant tests + 实际 composition/still/render 检查 |

找不到真实数据时，明确报告“无真实数据可用”和原因，不得把 mock 全绿表述为真实数据通过。

## 8. Review 与修复循环

`code-review` 只看 fixed point 到 `HEAD` 的 committed diff，因此顺序固定为：

1. 记录整个工作开始前的 baseline commit。
2. 每个已验证 ticket 创建 atomic commit。
3. 对 baseline 到当前 `HEAD` 调用 `code-review`，分别输出 Standards 与 Spec。
4. 每个 accepted finding 回到 Implement/TDD，修复并重新验证。
5. 未 push 时，同一原子任务的修复按 Git workflow 选择 amend；已经发布的历史只追加 commit。
6. 修复后重新审查受影响部分，直到没有阻塞 finding。

Review 报告不能只生成后忽略。

## 9. 收尾顺序

1. 所有 ticket acceptance criteria 与 checklist 和实际验证结果一致。
2. 运行最终 Verification Gate。
3. 更新相关执行文档；S2/S3 完成后归档已结束工作的 spec、tickets 和 review，并更新 `docs/DOCS-INDEX.md` 与 `docs/archive/README.md`。
4. 为归档和文档同步创建 final documentation commit。
5. 只有用户已授权这次 push 时才 push。
6. 只有存在对应 GitHub Issue 且用户已授权 tracker 写入时才更新或关闭 issue。
7. 最终汇报 completed gates、evidence、remaining blockers 和真正 N/A 的条件分支。

## 10. Gate 语义

- **Hard gate**：未满足必须停止，例如实施授权、失败测试、内容发布 HITL、不可逆操作确认。
- **Conditional gate**：触发条件不成立时标为 N/A，不称为“跳过”，例如 S1 的 Spec/Tickets、非 UI 的浏览器验证。
- **Exception**：本应执行但用户明确批准豁免。记录被豁免项、原因和残余风险。

不得把整条流程描述为无条件强制，又允许 Agent 自行省略其中步骤。只允许 Conditional N/A 或用户批准的 Exception。

## 11. Context Recovery

- S1 默认保持同一 context。
- S2/S3 每个 implementation ticket 使用 fresh context，只加载 ticket、spec、相关 ADR/CONTEXT、Git baseline 和必要代码。
- Spec/ticket、Git 状态/提交和验证输出共同构成 durable source；conversation summary 或 checklist 不能单独证明完成。
- `/compact` 或 handoff 后，先读取 durable sources 并与 `git status`、`git log`、测试结果核对，再继续。
