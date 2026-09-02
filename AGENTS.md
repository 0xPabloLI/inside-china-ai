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

## Project

- **App**: China AI News, an article and subscriber platform with an admin editor and short-video production pipeline.
- **Stack**: React 19, TypeScript, TanStack Start/Query, Supabase, TailwindCSS v4, shadcn/ui and Remotion.
- **Domain language**: read `CONTEXT.md`; domain-document layout and ADR rules are in `docs/agents/domain.md`.
- **Design system**: follow `DESIGN.md` for UI and visual work.

## Workflow Router

1. **Read-only work**: reviews, explanations, diagnosis and research do not modify files unless the user also requests implementation.
2. **Implementation authorization**: do not change files until the user explicitly asks to implement, modify, fix or begin. Once authorized, proceed automatically except at a hard gate.
3. **Implementation**: before changing code, scripts, migrations, test infrastructure or Agent behavior rules, and before high-risk, multi-session or Wayfinder work, read and follow `docs/agents/implementation-workflow.md`.
4. **UI/UX design**: load `impeccable`; use `frontend-design` for a new visual direction. UI implementation still follows the implementation workflow.
5. **Content production**: article, Scene Data, video rendering and publishing follow `docs/content-pipeline.md`; video execution details are in `docs/video-workflow.md`. Content production does not use the code Spec/Tickets/TDD route unless pipeline or application code changes.
6. **Agent documents**: before creating, moving, deleting, renaming or structurally changing `AGENTS.md`, `docs/`, a skill or any Agent-reached document, load `writing-for-agents` and apply `docs/DOCS-INDEX.md` placement rules.
7. **Proposals and external facts**: before recommending a code change, architecture, tool, service or model, follow `docs/agents/proposal-review.md`.
8. **Git actions**: before staging, committing, pushing, opening a PR, working across branches or changing context with unfinished work, follow `docs/agents/git-workflow.md`.

## Hard Safety Gates

- Treat existing tracked and untracked changes as user work. Never overwrite, restore, move, delete, clean or include unrelated work.
- Never switch branches in the current working directory. Use a worktree for cross-branch work.
- Never run stash commands without explicit confirmation in the current chat.
- Keep secrets out of code, logs and responses. Public frontend variables and server secrets follow `docs/tanstack-lovable-conventions.md`.
- Authentication, admin gating and RLS are coordinated security boundaries. Preserve both authenticated-layout and `isAdmin` checks unless an approved design changes them together.
- Supabase schema changes live in `supabase/migrations/`; confirm before destructive or irreversible database operations.
- Consequential external actions, including publishing, messaging, deployment and remote Issue changes, require user authorization for that action.
- The content-pipeline HITL in `docs/content-pipeline.md` is mandatory. Do not publish the article or TikTok package before explicit approval.

## Engineering References

- **Application architecture, routing, server functions, env/secrets, RLS, storage, email, SEO and deployment**: `docs/tanstack-lovable-conventions.md`
- **Risk and boundary scenario enumeration**: `docs/conventions/scenario-enumeration-checklist.md`
- **Scenario and evidence format**: `docs/conventions/scenario-matrix.md`
- **Media placement and lifecycle**: `docs/media-asset-management.md`
- **Video/TTS/Remotion execution, including M4A conversion and real-data commands**: `docs/video-workflow.md`
- **Installed skills and task-to-skill routing**: `docs/installed-skills.md`
- **Issue operations and roadmap**: `docs/agents/issue-tracker.md` and `docs/issue-tracker.md`
- **Available tools and tool-admission process**: `docs/tools-catalog.md`
- **Model discovery, license and Apple Silicon admission**: `docs/research/model-sources-reference.md`

## Content and Video

- Default short-video platform is TikTok.
- Before Scene Data, pipeline or publishing work, load the project `short-video-pipeline` and `brand-system` skills.
- Remotion code changes use `remotion-markup` via `remotion-best-practices`; visual template changes also use `impeccable`.
- Run the preflight required by `docs/video-workflow.md` before starting the video pipeline. Only an explicit user exception may bypass it.
- Store new media according to `docs/media-asset-management.md`; do not use a generic root `assets/` dumping ground.

## Web and Research

- Technical library documentation uses Context7 when available.
- Known URLs, logged-in pages, deep research, trend discovery and paid fallbacks follow the routing and cost controls in `docs/tools-catalog.md`.
- New APIs, scraping tools, model providers or services must pass the proposal and tool-admission checks before recommendation or integration.

## Session Start

1. If `scripts/short-video/output/pending-analysis.json` exists and `publishedAt` is more than 48 hours old, remind the user to export Analytics CSV.
2. Check for an unfinished content pipeline or a pending HITL checkpoint before starting conflicting pipeline work.
3. If the user supplied no task, offer the content entry points: “写文章（给素材）” or “做视频（给话题/跑 trends）”.

## Collaboration Preferences

- Prefer Chinese for collaboration text.
- Prefer evidence from logs, APIs, tests and runtime artifacts over speculation.
- If the user requests a plan first, stop after the plan until approval.
- Keep implementation scoped and avoid unrelated refactors.

## Agent Skills

### Issue tracker

Issues are tracked in **GitHub Issues**. See `docs/agents/issue-tracker.md`.

### Triage labels

See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses one root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
