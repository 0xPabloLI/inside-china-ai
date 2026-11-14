# ADR-0021: Split tools-catalog into a shared general layer and a project layer

- **Status**: Accepted (revised 2026-11-14; supersedes the 2026-09-28 "new sibling repo" plan)
- **Date**: 2026-09-28 · **Revised**: 2026-11-14

## Context

`docs/tools-catalog.md` mixes two layers:

- **General tool reserve (~73%, 38 entries)** — cross-project reusable tools
  and skills: web-access, Jina, SearXNG, Tavily, Context7, pdf-parse,
  last30days, the awesome-claude-video-skills index, the evaluation process,
  security-audit tooling, and the entry template. Any project/agent could
  consume these; they are not specific to "China AI News".
- **Project integration layer (~27%, 14 entries)** — `search-sources.mjs`,
  AutoVio, Horizon, MediaCrawler, the 小红书/公众号 channel skills,
  `nuwa-skill`, the task→tool decision table, Pipeline API A-class
  candidates (wired into `source-registry.mjs`/`asset-sourcer.mjs`), and
  the Design Decisions section. These belong to inside-china-ai.

The general layer grows with every tool discovery (the 2026-09-28 video
skill reserve alone added 128 lines). Keeping it in the business repo is
sprawl, and every project re-derives the same catalogue instead of sharing
one source of truth.

The original version of this ADR decided to extract the general layer into a
new sibling repo `~/Documents/code/tool-catalog/` referenced as
`../tool-catalog/`. That plan was **approved but never executed**, and by
2026-11-12 three facts had invalidated its premises:

1. **The target repo has never existed.** As of 2026-11-14 no `tool-catalog`
   directory exists anywhere on the author's machine (Spotlight name index,
   `find ~` to depth 6, Desktop/Downloads/Documents, `~/.Trash` all return
   nothing relevant), and no such GitHub repo exists among the 46 owned
   repositories.
2. **`../tool-catalog/` resolves to the wrong place.** This repo's worktrees
   live at `inside-china-ai/inside-china-ai-wt/<branch>/`, so from there
   `../tool-catalog/` is `inside-china-ai-wt/tool-catalog/` — not
   `Documents/code/tool-catalog/`. On GitHub web, in CI, and in a clean
   clone the relative path is a 404 either way.
3. **The second consumer count is still zero.** Paying repo-creation and
   sync governance costs now buys a hypothetical benefit.

The catalogue itself was never missing: the earlier skills catalogue document
was created on 2026-08-12 (`827e020d`) and renamed to `docs/tools-catalog.md`
on 2026-08-17 (`2cac4594`, an 82%-similarity rename). It has always lived in
this repo as a single document.

## Decision

1. **Do not create a sibling repo.** Both layers stay in
   `docs/tools-catalog.md`, separated by an explicit **layering contract**
   and by section order: project layer first, general layer second.
2. **The project layer is the single authority.** Execution constraints —
   notably the Tavily fallback chain — are stated only there. The general
   layer is a reference reserve and does not bind any workflow, with one
   documented exception: the project layer's 条目准入 section adopts the
   general layer's evaluation and security-audit process as a mandatory gate,
   so the process text may live there while the binding force comes from the
   project-layer sentence that cites it.
3. **General-layer entries must not reference project-internal paths**
   (`scripts/…`, `docs/…`, `AGENTS.md`, `src/…`). A general entry has to
   read correctly outside this repo. Project-side attribution survives as a
   `**本项目用例**` sub-field (the 2026-09-28 provenance requirement, kept),
   written as prose: no file paths, no research-document links.
4. **Cross-layer references go one way and by section name**: the project
   layer may point at a general entry by its heading; the general layer
   never points at project files.
5. **`AGENTS.md` is unchanged.** It keeps delegating to
   `docs/tools-catalog.md`; there is no pointer chain to maintain, because
   there is no second file.
6. **Extraction stays available, not planned.** If a second consumer
   appears, the general layer moves into the existing cross-project carrier
   `skills/shared` (submodule → `github.com/0xPabloLI/shared-skills`,
   referenced by absolute URL) rather than a newly created sibling repo.
   That move gets its own ADR revision when the first real consumer exists.

## Consequences

- `docs/tools-catalog.md` keeps its size (~1,270 lines) but gains an
  unambiguous read order: the authoritative project decisions are found
  before the reserve.
- No new repo, no submodule, no relative-path portability problem, and no
  cross-machine sync step.
- An agent reading only the project layer still gets every execution rule;
  the general layer is progressive disclosure, not always-loaded context.
- Cost accepted: the file remains large, and the two layers share one
  file's git history. Splitting later is a mechanical move of whole
  sections, because the layering contract already fixes their boundaries.

## Open questions

None.
