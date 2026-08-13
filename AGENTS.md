<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

# Repository Guidelines

## Project Snapshot

- **App**: China AI News — a content/blog platform (articles + subscribers) with an admin editor and short video production pipeline.
- **Stack**: React 19 + TypeScript + TanStack Start (file-based routing, server functions) + TanStack Query + Supabase (auth + database) + TailwindCSS v4 + shadcn/ui components.
- **Core directories**: `src/routes/` (TanStack file routes), `src/components/` (UI + shared), `src/lib/` (server functions & utils), `src/integrations/supabase/` (client), `supabase/migrations/` (DB schema).
- **Auth model**: Supabase Auth + RPC `has_role(_user_id, _role)` for admin gating. The `_authenticated` layout route guards all admin pages.
- **Publishable stack conventions**: `docs/tanstack-lovable-conventions.md` — rules for routing, server functions, env/secrets, RLS, storage, email, SEO, and deployment.

## Core Commands

- `npm run dev` — local development server
- `npm run lint` — ESLint
- `npm run build` — production build
- `npm run format` — Prettier write
- `npx tsc --noEmit` — type check (no emit)

## Session Workflow

1. **Decision: which workflow?**
   - **Lightweight**（检查、解释、常规工作）：直接进行，不需要加载额外 skill。
   - **UI/UX 设计任务**: 用 `impeccable` skill。
   - **做视频内容**（写 scene-data、跑管线、发布）：走 `docs/content-pipeline.md`，不走 Spec/Tickets/TDD。改视频管线代码（`lib/`、`remotion/src/`）则走 Substantial。
   - **Substantial implementation**（改 repo 基础代码：`src/`、`supabase/`、`scripts/short-video/lib/`、`remotion/src/`）：按以下 Mandatory Implementation Workflow 执行。
2. **Git safety**: never run `stash` related commands without explicit user confirmation in current chat. `checkout`/`switch` 分支切换见 Cross-Branch Workflow（绝对禁止）。
3. **No code changes without explicit go-ahead**: 在用户确认开始或给出明确实施指令前，不修改任何代码文件。讨论、调研、Grill 阶段只做分析和方案设计。
4. **Mandatory implementation workflow**: 每次改代码之前必须走完以下工作流，不得跳步：

   > **Context Hygiene**：Step 1-3 必须保持在同一个 unbroken context window 中——在 `/to-tickets` 完成前不要 `/clear` 或 `/compact`。Grilling 的推理过程是 spec 和 tickets 的 primary source，压缩会丢失「为什么」。如果 session 接近 smart zone（~150k tokens），在最近的 phase boundary 做 `/compact`（见下方 Phase Boundaries）。

   1. **Grill with Docs** — 用 `grill-with-docs` skill 审视方案（v1.2：grilling 采用 round-based design tree，每轮批量提问 + 推荐答案，等用户回答后进入下一轮）。**必须主动做场景风险分析**：按 `docs/conventions/scenario-enumeration-checklist.md` 逐类**穷举**边界场景（含跨 step 接口契约验证），验证跨消费者一致性。涉及修改已有文件时，**必须包含修改影响评估**（Modified Files Impact），格式见 `docs/conventions/scenario-matrix.md`。

   1b. **Prototype Detour（可选）** — 当 grilling 中某个问题需要 runnable answer（状态模型是否合理、UI 长什么样）时，detour：`/handoff` 出去 → fresh session 中 `/prototype` → `/handoff` 回来。Prototype 生成单个自包含 HTML 文件（logic）或单一路由多变体（UI），保存在 `prototype/<name>` 分支作为 primary source。回到主线后引用 prototype 结论。
   2. **To Spec** — 用 `to-spec` skill 合成 spec。**必须包含 Scenario & Risk Verification 章节**（场景矩阵），含两个必填 section：Modified Files Impact + Behavioral Scenarios，矩阵行直接成为测试用例。**无矩阵 = spec 不完整**。格式见 `docs/conventions/scenario-matrix.md`。
   3. **To Tickets** — 用 `to-tickets` skill 将 spec 拆分为带依赖边的 tracer-bullet tickets
   4. **TDD Implement** — 逐 ticket 先思考最佳实践的改法是什么，再用 `implement` skill 实施；`implement` 必须强制调用 `tdd`（red → green → refactor），关键逻辑必须先写测试。**测试用例必须覆盖场景矩阵的所有行**。
   5. **Code Review** — 实施完成后用 `code-review` skill 做双轴审查（Standards + Spec）

   > **Phase Boundaries**：Step 5 完成后是一个 phase boundary。如果 context 仍有价值且 smart zone 充裕 → Continue（首选）。如果 context 已无关 → `/clear`。如需换 harness/目录/同事 → `/handoff`。任务可 AFK → Subagent。否则 → `/compact`（默认兜底）。详见下方 Phase Boundaries。

   6. **Runtime Verify** — `npm run lint && npm run build && npx tsc --noEmit` 全部通过。涉及 UI 交互/布局/样式的改动，还需在 dev server 中验证（`npm run dev` + 浏览器核心交互检查）。使用 Playwright 验证对齐时，**必须同时测量 `width` + `left` + `right`**（`getBoundingClientRect()`），不能只测 width。
   7. **Commit & Push** — 通过验证后 commit + push（遵循 Commit Cadence 规则）。
   8. **更新相关文档及 Issue** — 同步更新 docs、Linear issue 状态。**Spec/Ticket 归档**：将本次工作使用的 `spec-*.md` 和 `tickets-*.md` 移到 `docs/archive/`，更新 `docs/archive/README.md` 归档清单。Specs 和 tickets 是 ephemeral 文档——实施期间存在，完成后归档。详见 `docs/DOCS-INDEX.md` 的 Spec/Ticket Lifecycle 章节。
   9. **Session 结束验证** — 在 session 结束前，逐条确认 Step 1-8 全部完成。**未完成的步骤必须当场补做或显式标注为"跳过 + 原因"**。确认清单：
      - [ ] Step 1 Grill 完成（有 spec 或对话记录佐证）
      - [ ] Step 1b Prototype Detour（如执行，有 prototype 分支或结论引用；如跳过，标注"无需"）
      - [ ] Step 2 Spec 完成（有 spec 文件，含 Scenario Matrix）
      - [ ] Step 3 Tickets 完成（有 ticket 拆分）
      - [ ] Step 4 TDD 完成（测试 red → green → refactor）
      - [ ] Step 5 Code Review 完成（有审查报告）
      - [ ] Step 6 Runtime Verify 完成（有运行时验证证据：截图 / DOM 检查 / lint+build 结果）
      - [ ] Step 7 Commit & Push 完成（有 commit hash + push 成功）
      - [ ] Step 8 文档及 Issue 更新完成（Linear 状态已更新；spec/tickets 已归档到 `docs/archive/`）
      - 如有任何步骤跳过，必须在向用户汇报时**显式列出**跳过的步骤和原因，不得遗漏

### Phase Boundaries & Context Management

两个 phase 之间的边界点有 5 个选项，按优先级排序：

1. **Continue** — 留在当前 session（首选，成本为零）。当下一个 phase 需要当前 phase 的推理作为 primary source 时选此。
2. **`/clear`** — 清空 context。当当前 context 与后续无关时选此。
3. **`/handoff`** — 写可移植 markdown 文件。仅在换 harness（Claude → Codex）、换目录/repo、发给同事、或 mid-phase fork side task 时使用。
4. **Subagent** — 派子 agent 处理 tightly-scoped 任务，当前 session 不受影响。标准场景：automated review。
5. **`/compact`** — 压缩 context 并用 summary 开新 session。**默认兜底，但不是首选**。位于决策树底部。

**Smart Zone**：~150k tokens（v1.2 更新）。模型在此窗口内推理最锐利。如果 session 在 `/to-tickets` 前接近 smart zone，在最近的 phase boundary 做 `/compact`。

**规则**：mid-phase 不做 context 切换决策——Continue 或把剩余工作 split 成 subagents。只在 phase boundary 做决策。

## Commit Cadence (并行 agent 安全)

**TL;DR**: 每完成一个原子任务立即 commit;同任务的后续修复 amend 原 commit;`stage` 时显式列路径(绝不 `git add -A` / `.`);不还原他人未提交改动;push 改写用 `--force-with-lease`（注意：Lovable 连接分支禁止改写已 push 历史，见顶部规则块）。

### 六条规则

1. **每完成一个原子任务立即 commit** — "原子任务" = 一个 bug fix、一个独立 feature slice、一个组件抽取。验证全绿立刻 commit，不要攒 batch。
2. **同任务后续修复优先 amend 原 commit** — 未 push: `git commit --amend --no-edit`；已 push 但在自己分支顶端: amend 后 `git push --force-with-lease`（仅限非 Lovable 连接分支）；跨任务: `git commit --fixup=<sha>` + `git rebase -i --autosquash`。
3. **push 后改写历史用 `--force-with-lease`，绝不用 `--force`** — 仅适用于改写历史（amend/rebase/squash）。新增 commit 一律用普通 `git push`。
4. **新增 commit 用普通 `git push`** — 不要对新增 commit 用 `--force-with-lease`，那会掩盖应该先 `git pull --rebase` 的正确流程。
5. **stage 时显式列出自己改的文件，绝不 `git add -A` / `git add .`** — 先 `git status --short` 确认，只 add 自己改的路径。
6. **Session Boundary** — 只 commit 本 session 改动（详见下方 Session Boundary 章节）。

### 工作流速查

```bash
npm run lint && npx tsc --noEmit && npm run build
git add <具体路径>  # 绝不 git add -A / .
git commit -m "type(scope): message"
git push

# amend（仅限未 push 或非 Lovable 连接分支）
git commit --amend --no-edit
git push --force-with-lease
```

## PR / Merge Guardrails

- 不要 "cosmetically resolve" review thread,要么真修要么留待 maintainer 拍板。
- For PRs, summarize only commits relative to `origin/main`; use English for PR titles and bodies.
- If a PR includes a Testing section, include only items that are already verified (so all items are checked); otherwise omit Testing.
- After opening/pushing a PR, do not amend/rebase that history; use new commits for follow-ups.

## Proposal Self-Review

**给出任何修改方案前，必须自审以下 3 条，不通过则不输出方案：**

1. **因果依据**：每个「A 导致 B」的推断必须有可追溯的证据（代码行、Analytics 数据、文档 spec、测试结果）。禁止从单一数据点直接跳跃到代码层面的因果结论。
2. **设计决策不是免死金牌**：当有效果数据（如 Analytics）显示当前表现不佳时，不能以「这是设计决策」为由拒绝优化。设计决策在没有数据时做出的，有了数据就该 revisited。但反过来，优化也必须有合理的因果推理，不能盲目改。
3. **影响面核查**：提出改动前，必须 grep/搜索所有受影响的文件（测试、文档、其他调用方），完整列出影响面。不允许「改了代码但漏了测试/文档」的情况。

## Coding Conventions

Stack 级约定（路由、server functions、env/secrets、RLS、storage、email、SEO）见 `docs/tanstack-lovable-conventions.md`。以下为项目特定补充：

- TypeScript + functional React components/hooks；2-space indentation；`PascalCase` for components/types, `camelCase` for vars/functions。
- React Query `useQuery` 的 `useState` 初始化陷阱：当组件依赖 query 数据初始化 state 时，必须确保数据就绪后再挂载组件（或在 `useEffect` 中同步），避免 `useState` 初始值只在首次挂载生效导致数据丢失。
- **Agent 消费文档写作**：编辑 `docs/` 下 agent 消费的文档时（含 AGENTS.md 自身），先加载 `writing-for-agents` skill 并遵循其原则（single source of truth、progressive disclosure、no duplication）。执行文档只写"做什么、用什么参数"；研究依据和方法论放 `docs/research/` 或 `docs/tiktok/`，底部用 "Design Decisions & References" 索引指向它们。
- **文档审查三查**：压缩或审查 agent 文档时必须做三类检查：(1) **跨章节矛盾**——同一规则在不同章节的限定词是否一致（如"需要确认" vs "永远不要"）；(2) **指针目标完整性**——被压缩内容的每个信息点在指针目标处是否有对应（不是"目标存在就行"，而是"逐字段覆盖"）；(3) **文件存在性**——引用的文件是否真实存在（用 `ls` 验证）。

## Git Safety

- 禁止未经确认执行 `git stash pop/apply/drop/clear`；暂存用 `stash push -m "msg"`，恢复前先 `stash list` 供审查。
- **如果 push 需要先 stash 预存改动，那就只 commit 不 push** — 不要为了 push 而 stash 非本 session 的改动，commit 留在本地即可，等用户手动处理后再 push。

## Cross-Branch Workflow（禁止本地切分支）

永远不要在当前工作目录执行 `git checkout`/`git switch`。跨分支操作通过 worktree（`git worktree add`）、cherry-pick（`git cherry-pick <sha>`）、或只读查看（`git show branch:path`）完成。向 main 提交走 PR：worktree → 新分支 → commit → push → `gh pr create`。

## Session Boundary

**只 commit 本 session 的改动，非本 session 的不碰。** 不修非本 session 引入的问题；`git diff` 确认来源，已有问题告知用户决定。同一文件混合改动时用 `git add -p` 只选本 session 的 hunk。

## High-Risk Areas (Coordinate Carefully)

- **Admin editor**: `src/routes/_authenticated/admin.tsx` — PostEditor 组件的 state 初始化与 query 数据时序（参考 useState 初始化陷阱）。
- **Auth gating**: `src/routes/_authenticated/route.tsx` + `admin.tsx` 的 `isAdmin` 检查 — 两层 gating 必须一致。
- **Post rendering**: `src/routes/posts.$slug.tsx` + `src/components/markdown-content.tsx` — Markdown 渲染 + SEO meta。
- **Supabase migrations**: `supabase/migrations/` — schema 变更需谨慎，不可逆操作需确认。

## Audio File Handling (M4A → WAV)

M4A 不被 Python 音频库支持（`soundfile`/`torchaudio`/`librosa` 基于 libsndfile）。必须先 `ffmpeg` 转 WAV。转换命令见 `docs/video-workflow.md` TTS Engine Configuration 章节。报错 `LibsndfileError: Format not recognised` = 传了 M4A。

## Learned Preferences

- Prefer Chinese for collaboration text and direct execution once confirmed.
- Prefer evidence-based debugging (logs/API/runtime artifacts) over speculation.
- If user requests "先给方案", provide plan first before coding.
- Keep implementation scoped; avoid unrelated refactors.

## Content Pipeline

统一内容管线（入口 → 文章 → 网站发布 → scene-data → 视频 → TikTok → Analytics），设 1 个 **HITL 人工确认检查点**（视频成品审阅）。管线文档：`docs/content-pipeline.md`。手工操作清单：`docs/manual-ops.md`。文章发布脚本：`scripts/article/publish-article.mjs`。

> **HITL 强制规则**：Agent 到达检查点时必须暂停，输出审阅内容，等待用户明确确认后才可继续。不得自行假设确认。详见 `docs/content-pipeline.md` 的 HITL 章节。

做视频时（**默认 TikTok**），`short-video-pipeline` skill 自动加载。`brand-system` skill 同时加载，控制视觉一致性。视频技术参考（TTS 引擎、发布策略、文件路径）：`docs/video-workflow.md`。

改视频模板/组件的视觉设计时（间距、排版、层次、动画），加载 `impeccable` skill — 用 `critique` 审查问题，`layout` 修间距，`typeset` 修字体，`polish` 做最终打磨。新建场景模板时加载 `frontend-design` skill 选择美学方向。

> **Skill 遵循强制规则**：启动视频管线前，Agent 必须运行 `node scripts/short-video/verify-video.mjs --pre --content <dir>` 验证 scene-data 是否满足 `short-video-pipeline` SKILL.md 的硬性规则。Pre-render 检查未通过时，管线拒绝运行。Agent 不得跳过此步骤（除非用户明确要求 `--skip-preflight`）。

## Session Start Checklist

**每次新 session 启动时，Agent 被动检查**（Agent 不是常驻进程，只在用户打开 session 时检查）：

1. 读 `scripts/short-video/output/pending-analysis.json`（如存在）→ 检查 `publishedAt` 是否 >48h → 如是，提醒用户导出 Analytics CSV
2. 检查是否有未完成的管线（如上一 session 的 HITL 检查点待确认、视频待发布）
3. 如用户未指定任务，简要提示可用入口：「写文章（给素材）」或「做视频（给话题/跑 trends）」

## Web Scraping & Content Fetching

默认用 `web-access` skill（连接本地 Chrome，有 session/cookie，反爬检测率低）。已知 URL 静态提取用 `web_fetch` 工具。`web_fetch`/`curl` 失败或被墙时，立即 fallback 到 `web-access` skill，不要反复尝试。Deep Research（多源交叉验证 + 引用）用 `web-deep-research` skill，触发词："deep research"、"调研"、"comprehensive analysis"、"research report"。用 `web-access` 替代 Playwright headless（后者无 session/cookie，反爬检测率高）。

**Skills/Tools 目录**：所有可用工具和候选 skill 的完整清单在 `docs/skills-catalog.md`（不在 RAG 索引范围内，Agent 直接读取）。包含：已集成工具说明、候选 skill 评估、安全审计结果、任务→工具决策表、Skill 评估流程（4 步强制流程）、安全审计工具参考。需要找工具或评估新 skill 时先查此文档。

> **Skill 入库强制规则**：往 `docs/skills-catalog.md` 加入任何新候选 skill 时，必须同步走完 4 步评估流程（安全审计 → 功能评估 → 试用验证 → 记录）。不能"先加进去以后再评估"。试用验证可跳过（如需账号/硬件），但必须标注跳过原因。流程详见 `docs/skills-catalog.md` 的「Skill 评估流程」章节。

## Agent skills

### Issue tracker

Issues tracked in **GitHub Issues** using `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles with default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (one CONTEXT.md + docs/adr/ at root). See `docs/agents/domain.md`.
