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

## Core Commands
- `npm run dev` — local development server
- `npm run lint` — ESLint
- `npm run build` — production build
- `npm run format` — Prettier write
- `npx tsc --noEmit` — type check (no emit)

## Session Workflow
1. **Bootstrap when needed**: For substantial implementation, debugging, or design sessions, load `using-superpowers` via skill tool. Load `brainstorming` only for feature design, behavior changes, or solution exploration — skip for lightweight inspection, explanation, and routine work.
2. **Git safety**: never run `stash`/`checkout` related commands without explicit user confirmation in current chat.
3. **Hook policy**: do not bypass `pre-commit`/`pre-push`; if a gate fails, fix root cause.
4. **No code changes without explicit go-ahead**: 在用户确认开始或给出明确实施指令前，不修改任何代码文件。讨论、调研、Grill 阶段只做分析和方案设计。
5. **Mandatory implementation workflow**: 每次改代码之前必须走完以下工作流，不得跳步：
   1. **Grill with Docs** — 用 `grill-with-docs` skill 审视方案。**必须主动做场景风险分析**：穷举边界场景，验证跨消费者一致性。
   2. **To Spec** — 用 `to-spec` skill 合成 spec。**必须包含 Scenario & Risk Verification 章节**（场景矩阵），矩阵行直接成为测试用例。**无矩阵 = spec 不完整**。
   3. **To Tickets** — 用 `to-tickets` skill 将 spec 拆分为带依赖边的 tracer-bullet tickets
   4. **TDD Implement** — 逐 ticket 先思考最佳实践的改法是什么，再用 `implement` skill 实施；`implement` 必须强制调用 `tdd`（red → green → refactor），关键逻辑必须先写测试。**测试用例必须覆盖场景矩阵的所有行**。
   5. **Code Review** — 实施完成后用 `code-review` skill 做双轴审查（Standards + Spec）
   6. **Dev Server 验证** — 涉及 UI 交互/布局/样式的改动，CI gate 后必须在 dev server 中验证
   7. **Commit** — 通过验证后 commit（遵循 Commit Cadence 规则）
   8. **更新相关文档及 Issue** — 同步更新 docs、Linear issue 状态

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
- Commits: 简洁的 conventional 格式;不在 message 里放 URL。
- 不要 "cosmetically resolve" review thread,要么真修要么留待 maintainer 拍板。
- For PRs, summarize only commits relative to `origin/main`; use English for PR titles and bodies.
- If a PR includes a Testing section, include only items that are already verified (so all items are checked); otherwise omit Testing.
- After opening/pushing a PR, do not amend/rebase that history; use new commits for follow-ups.

## Validation Gate (修改后必跑 — 强制)
每次代码改动后按序跑 3 项,**全部通过**才算完成。任一失败 → 修根因 → 从头重跑。

```bash
npm run lint && npm run build && npx tsc --noEmit
```

**前端浏览器验证**：涉及 UI 交互/布局/样式的改动，CI gate 后需在 dev server 中确认。

## Coding Conventions
- TypeScript + functional React components/hooks.
- 2-space indentation; `PascalCase` for components/types, `camelCase` for vars/functions.
- TanStack Start server functions (`createServerFn`) 用于后端逻辑，通过 `useServerFn` 在客户端调用。
- Supabase 查询通过 `context.supabase`（server fn middleware 注入）或 `@/integrations/supabase/client`（客户端）。
- 复用现有 UI patterns/tokens（shadcn/ui 组件 + TailwindCSS）再引入新的。
- React Query `useQuery` 的 `useState` 初始化陷阱：当组件依赖 query 数据初始化 state 时，必须确保数据就绪后再挂载组件（或在 `useEffect` 中同步），避免 `useState` 初始值只在首次挂载生效导致数据丢失。

## Git Safety
- 禁止未经确认执行 `git stash pop/apply/drop/clear`；暂存用 `stash push -m "msg"`，恢复前先 `stash list` 供审查。
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

## Learned Preferences
- Prefer Chinese for collaboration text and direct execution once confirmed.
- Prefer evidence-based debugging (logs/API/runtime artifacts) over speculation.
- If user requests "先给方案", provide plan first before coding.
- Keep implementation scoped; avoid unrelated refactors.
- Commit messages: 简洁的 conventional 格式;不在 message 里放 URL。

## Video Production
做短视频时（**默认 TikTok**），`short-video-pipeline` skill 会自动加载——它包含完整 7 步工作流（调研 → 写 scene-data → 跑管线 → 缩略图 → 质检 → **verify-video.mjs 验收** → 手动发布清单）。`brand-system` skill 同时加载，控制视觉一致性。项目特定内容（发布策略、最佳实践、文件路径）在 `docs/video-workflow.md`。

**默认平台：TikTok**。除非用户特别指定 YouTube Shorts 或其他平台，否则按 TikTok 规格制作（60-70s，9:16 竖屏）。verify-video.mjs 默认跑 `--tiktok` 模式。

**7 步工作流**（SKILL.md 定义，闭环 loop）：
1. Research（调研素材，验证数据来源）
2. Write scene-data（遵循 Best Practices Checklist — Hook、SEO 关键词、来源标注、Share-worthy 数据、算法安全）
3. Run pipeline（TTS → HTML → Record → Assemble）
4. Generate thumbnail
5. Quality check（人工观看）
6. **verify-video.mjs**（MANDATORY 验收 — 12 项自动检查 + 算法惩罚拦截。FAIL → agent 自动修复 → 重跑 → 重验，循环到 0 失败）
7. Manual publishing checklist（10 项手动项，每项有具体填什么/在哪填/为什么）

**Step 2 ↔ Step 6 闭环**：写 scene-data 时的每项规则在 verify-video.mjs 中有对应检查。不做对就会被 loop 拦住。

**优化视频工作流时**：先读 `docs/video-workflow.md`——它是完整文件清单（所有代码、skill、文档的路径和职责）。所有优化都从那里开始。

## Web Scraping & Content Fetching

**默认方案：`web-access` skill**。当用户要求爬取网页内容、搜索信息、抓取文章、获取需要登录的页面时，优先使用 `web-access` skill。

### 工具选择优先级

| 场景 | 工具 | 说明 |
|------|------|------|
| 搜索/抓取网页/需要登录态 | **web-access** | 连接用户本地 Chrome，有 session/cookie，反爬检测率低 |
| 已知 URL 的静态内容提取 | `web_fetch` 工具 | 简单快速，但无法处理 JS 渲染或反爬站点 |
| Playwright headless | ⚠️ **不推荐** | 无 session/cookie，反爬检测率高 |

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

## Agent Skills

### Domain Docs
Single-context layout: `CONTEXT.md` (domain language) at root + `docs/adr/` (architectural decisions). Update when domain or architecture changes.

### Matt Pocock Skills v1.1 workflow
Main flow: `/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement` (per ticket).

- `/grill-with-docs` — sharpen idea via interview + ADR/glossary (has codebase). No codebase? Use `/grill-me`.
- `/grilling` — the underlying interview primitive; `grill-me` and `grill-with-docs` both delegate to it.
- `/to-spec` — synthesize conversation into spec (was `/to-prd`).
- `/to-tickets` — split spec into tracer-bullet tickets with blocking edges (replaces `/to-issues`).
- `/implement` — build per ticket; internally drives `/tdd` + `/code-review`.
- `/wayfinder` — on-ramp for huge/foggy efforts; charts investigation map, merges onto main flow at `/to-spec`.
- `/research` — delegate reading to a background agent; keeps you working while it reads.
- `/ask-matt` — router: describe your situation, get the right skill path.
