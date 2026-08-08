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

1. **Decision: Lightweight or Substantial?**
   - **Lightweight**（检查、解释、常规工作）：直接进行，不需要加载额外 skill。
   - **UI/UX 设计任务**: 用 `impeccable` skill（`shape` 规划、`craft` 构建、`critique` 审查、`polish` 精修）。不要自动加载 `brainstorming`——`impeccable` 已覆盖其全部功能且更专业。
   - **Substantial implementation**: 按以下 Mandatory Implementation Workflow 执行。
2. **Git safety**: never run `stash`/`checkout` related commands without explicit user confirmation in current chat.
3. **Hook policy**: do not bypass `pre-commit`/`pre-push`; if a gate fails, fix root cause.
4. **No code changes without explicit go-ahead**: 在用户确认开始或给出明确实施指令前，不修改任何代码文件。讨论、调研、Grill 阶段只做分析和方案设计。
5. **Mandatory implementation workflow**: 每次改代码之前必须走完以下工作流，不得跳步：

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

### 辅助 Skills（v1.2 新增）

| Skill | 触发场景 | 说明 |
| --- | --- | --- |
| `/wait-what` | Agent 和用户理解不一致时 | 重新解释上一条消息，补充缺失的 context，用 `CONTEXT.md` 词汇 |
| `/to-questionnaire` | 需要从**别人**获取信息时 | 采访用户关于「发给谁、需要什么」，生成问卷给对方填 |
| `/wizard` | 只有**人类**能做的操作 | 生成交互式 bash 脚本引导人工操作（provisioning、credentials、CI secrets）。`docs/manual-ops.md` 中的操作可考虑用此 skill 自动化 |
| `/writing-for-agents` | 编写 agent 可读文档时 | 替代已废弃的 `/docs` skill。覆盖 skills、AGENTS.md、specs、tickets、runtime prompts |

## Commit Cadence (并行 agent 安全)

**TL;DR**: 每完成一个原子任务立即 commit;同任务的后续修复 amend 原 commit;`stage` 时显式列路径(绝不 `git add -A` / `.`);不还原他人未提交改动;push 改写用 `--force-with-lease`（注意：Lovable 连接分支禁止改写已 push 历史，见顶部规则块）。

### 五条规则

1. **每完成一个原子任务立即 commit** — "原子任务" = 一个 bug fix、一个独立 feature slice、一个组件抽取。验证全绿立刻 commit，不要攒 batch。
2. **同任务后续修复优先 amend 原 commit** — 未 push: `git commit --amend --no-edit`；已 push 但在自己分支顶端: amend 后 `git push --force-with-lease`（仅限非 Lovable 连接分支）；跨任务: `git commit --fixup=<sha>` + `git rebase -i --autosquash`。
3. **push 后改写历史用 `--force-with-lease`，绝不用 `--force`** — 仅适用于改写历史（amend/rebase/squash）。新增 commit 一律用普通 `git push`。
4. **新增 commit 用普通 `git push`** — 不要对新增 commit 用 `--force-with-lease`，那会掩盖应该先 `git pull --rebase` 的正确流程。
5. **stage 时显式列出自己改的文件，绝不 `git add -A` / `git add .`** — 先 `git status --short` 确认，只 add 自己改的路径。
6. **同一文件混合本 session 与其他 session 改动时，用 `git add -p` 分块 stage 只选本 session 的 hunk** — 绝不把其他 session 的未提交改动一起 commit；不还原他人改动，不替他人 commit。

### 工作流速查

```bash
# 一次 commit 的标准流程
npm run lint && npx tsc --noEmit && npm run build
git add <自己改的具体路径>
git commit -m "type(scope): message"
git push

# 同任务发现问题,amend（仅限未 push 或非 Lovable 连接分支）
git add <修改路径>
git commit --amend --no-edit
git push --force-with-lease   # 仅限改写历史场景
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

- TypeScript + functional React components/hooks.
- 2-space indentation; `PascalCase` for components/types, `camelCase` for vars/functions.
- TanStack Start server functions (`createServerFn`) 用于后端逻辑，通过 `useServerFn` 在客户端调用。
- Supabase 查询通过 `context.supabase`（server fn middleware 注入）或 `@/integrations/supabase/client`（客户端）。
- 复用现有 UI patterns/tokens（shadcn/ui 组件 + TailwindCSS）再引入新的。
- React Query `useQuery` 的 `useState` 初始化陷阱：当组件依赖 query 数据初始化 state 时，必须确保数据就绪后再挂载组件（或在 `useEffect` 中同步），避免 `useState` 初始值只在首次挂载生效导致数据丢失。
- **Agent 消费文档写作**：编辑 `docs/` 下 agent 消费的文档（video-workflow.md、content-pipeline.md、brand-system.md 等）时，先加载 `writing-for-agents` skill — 其 information hierarchy（in-file step → in-file reference → disclosed reference）和 no-op test（"does it change behaviour versus the default?"）决定什么留在文件内、什么推到独立文件用指针引用。执行文档只写"做什么、用什么参数"；研究依据和方法论放 `docs/research/` 或 `docs/tiktok/`，执行文档底部用 "Design Decisions & References" 索引指向它们。

## Git Safety

- 禁止未经确认执行 `git stash pop/apply/drop/clear`；暂存用 `stash push -m "msg"`，恢复前先 `stash list` 供审查。
- **如果 push 需要先 stash 预存改动，那就只 commit 不 push** — 不要为了 push 而 stash 非本 session 的改动，commit 留在本地即可，等用户手动处理后再 push。
- 禁止未经确认执行 `git checkout`/`git switch` 切换分支（见 Cross-Branch Workflow）。

## Cross-Branch Workflow（禁止本地切分支）

**核心规则**：永远不要在当前工作目录执行 `git checkout`/`git switch` 切换分支。所有跨分支操作通过 worktree 或 GitHub API 完成。

### 场景 1：需要向 main 提交改动（main 有分支保护，必须走 PR）

```bash
git worktree add /tmp/inside-china-ai-main main
cd /tmp/inside-china-ai-main
git checkout -b fix/xxx
# 编辑文件、commit
git push -u origin fix/xxx
gh pr create --title "fix: xxx" --body "..." --base main --head fix/xxx
gh pr merge <PR_NUMBER> --squash --auto   # CI 通过后自动合并
cd <original-repo>
git worktree remove /tmp/inside-china-ai-main
```

### 场景 2：需要从其他分支 cherry-pick 到当前分支

```bash
git cherry-pick <commit-sha>   # 不需要切分支，直接在当前分支操作
```

### 场景 3：需要查看其他分支的文件

```bash
git show main:path/to/file     # 不切分支，直接读取
git diff main..lovable -- path/to/file
```

## Session Boundary

**只 commit 本 session 的改动，非本 session 的不碰。** 不修非本 session 引入的问题；`git diff` 确认来源，已有问题告知用户决定。同一文件混合改动时用 `git add -p` 只选本 session 的 hunk。

## High-Risk Areas (Coordinate Carefully)

- **Admin editor**: `src/routes/_authenticated/admin.tsx` — PostEditor 组件的 state 初始化与 query 数据时序（参考 useState 初始化陷阱）。
- **Auth gating**: `src/routes/_authenticated/route.tsx` + `admin.tsx` 的 `isAdmin` 检查 — 两层 gating 必须一致。
- **Post rendering**: `src/routes/posts.$slug.tsx` + `src/components/markdown-content.tsx` — Markdown 渲染 + SEO meta。
- **Supabase migrations**: `supabase/migrations/` — schema 变更需谨慎，不可逆操作需确认。

## Audio File Handling (M4A → WAV)

Apple 设备默认录制 M4A (AAC) 格式。Python 音频库（`soundfile`/`torchaudio`/`librosa`）基于 libsndfile，**不支持 M4A**。处理前必须先转 WAV：

```bash
# M4A → 24kHz mono WAV（F5-TTS-MLX 要求 24kHz）
ffmpeg -y -i input.m4a -af "volume=-7dB" -ar 24000 -ac 1 output.wav

# M4A → 44.1kHz mono WAV（通用）
ffmpeg -y -i input.m4a -ar 44100 -ac 1 output.wav
```

注意：`soundfile.LibsndfileError: Format not recognised` = 传了 M4A 给 Python。先转 WAV。

## Learned Preferences

- Prefer Chinese for collaboration text and direct execution once confirmed.
- Prefer evidence-based debugging (logs/API/runtime artifacts) over speculation.
- If user requests "先给方案", provide plan first before coding.
- Keep implementation scoped; avoid unrelated refactors.

## Content Pipeline

统一内容管线（入口 → 文章 → 网站发布 → scene-data → 视频 → TikTok → Analytics），设 3 个 **HITL 人工确认检查点**（文章审阅 / 脚本审阅 / 视频审阅）。管线文档：`docs/content-pipeline.md`。手工操作清单：`docs/manual-ops.md`。文章发布脚本：`scripts/article/publish-article.mjs`。

> **HITL 强制规则**：Agent 到达检查点时必须暂停，输出审阅内容，等待用户明确确认后才可继续。不得自行假设确认。详见 `docs/content-pipeline.md` 的 HITL 章节。

做视频时（**默认 TikTok**），`short-video-pipeline` skill 自动加载。`brand-system` skill 同时加载，控制视觉一致性。视频技术参考（TTS 引擎、发布策略、文件路径）：`docs/video-workflow.md`。

> **Skill 遵循强制规则**：启动视频管线前，Agent 必须运行 `node scripts/short-video/verify-video.mjs --pre --content <dir>` 验证 scene-data 是否满足 `short-video-pipeline` SKILL.md 的硬性规则。Pre-render 检查未通过时，管线拒绝运行。Agent 不得跳过此步骤（除非用户明确要求 `--skip-preflight`）。

## Session Start Checklist

**每次新 session 启动时，Agent 被动检查**（Agent 不是常驻进程，只在用户打开 session 时检查）：

1. 读 `scripts/short-video/output/pending-analysis.json`（如存在）→ 检查 `publishedAt` 是否 >48h → 如是，提醒用户导出 Analytics CSV
2. 检查是否有未完成的管线（如上一 session 的 HITL 检查点待确认、视频待发布）
3. 如用户未指定任务，简要提示可用入口：「写文章（给素材）」或「做视频（给话题/跑 trends）」

## Web Scraping & Content Fetching

**默认方案：`web-access` skill**。当用户要求爬取网页内容、搜索信息、抓取文章、获取需要登录的页面时，优先使用 `web-access` skill。

### Deep Research

进行深度调研（多源交叉验证、带引用的结构化报告）时，使用 `web-deep-research` skill。它组合了 deep-research 的 8 阶段方法论（SCOPE → PLAN → RETRIEVE → TRIANGULATE → SYNTHESIZE → CRITIQUE → REFINE → PACKAGE）与 web-access 的 CDP 抓取能力。触发词："deep research"、"调研"、"comprehensive analysis"、"research report"。

### 工具选择优先级

| 场景                     | 工具             | 说明                                                 |
| ------------------------ | ---------------- | ---------------------------------------------------- |
| 搜索/抓取网页/需要登录态 | **web-access**   | 连接用户本地 Chrome，有 session/cookie，反爬检测率低 |
| 已知 URL 的静态内容提取  | `web_fetch` 工具 | 简单快速，但无法处理 JS 渲染或反爬站点               |
| Playwright headless      | ⚠️ **不推荐**    | 无 session/cookie，反爬检测率高                      |

### 使用 web-access skill

```bash
# 1. 检查 proxy 是否可用
node ~/.cursor/skills/web-access/scripts/check-deps.mjs

# 2. 通过 proxy 创建后台 tab（不影响用户操作）
curl -s "http://localhost:3456/new?url=https://example.com"

# 3. 用 eval 提取页面内容
curl -s -X POST "http://localhost:3456/eval?target=TAB_ID" -d 'document.body.innerText'

# 4. 查看所有打开的 tab
curl -s "http://localhost:3456/targets"
```

**用户须知**：所有操作在后台 tab 中进行，不影响用户操作电脑。用户需先在 Chrome 中启用 Remote Debugging（`chrome://inspect/#remote-debugging`）。
