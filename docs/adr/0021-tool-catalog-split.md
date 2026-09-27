# ADR-0021: Split tools-catalog into a shared general layer and a project layer

- **Status**: Proposed (approved plan, execution pending)
- **Date**: 2026-09-28

## Context

`docs/tools-catalog.md` grew to 1072 lines and mixes two layers:

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
one source of truth — the failure mode writing-for-agens calls duplication.

All user code lives under `~/Documents/code/` as sibling project repos
(aave-*, inside-china-ai, chubbyskills, agent-harness, …). A tool catalogue
that is itself a code project belongs there, not in a hidden home directory.

## Decision

1. **Split, not move.** Extract the general layer to a new sibling repo
   `~/Documents/code/tool-catalog/` (relative to inside-china-ai:
   `../tool-catalog/`). Keep the project integration layer in
   `docs/tools-catalog.md`.
2. **General repo structure**:
   ```
   ~/Documents/code/tool-catalog/
     README.md       # header + quick-reference table (general rows) + scenario→tool table (general part)
     integrated.md   # integrated tools, detailed entries
     candidates.md   # candidate GitHub skills + video skill reserve
     process.md      # evaluation process + security-audit tools + entry template
   ```
3. **Project layer keeps**: header + quick-reference (project rows only) +
   one pointer line to `../tool-catalog/` + the 14 project-specific entries
   + task→tool decision table + Pipeline API A-class + Design Decisions.
4. **AGENTS.md is unchanged.** It already points at `docs/tools-catalog.md`;
   that file gains a top pointer to the general repo, so the pointer chain
   is AGENTS.md → docs/tools-catalog.md → ../tool-catalog/.
5. **Provenance preserved.** General-layer entries keep their `why` / issue
   references as a `本项目用例` sub-field, so attribution (#290/#295/#300
   etc.) is not lost when the entry leaves the project repo.
6. **Remote.** `tool-catalog` is a private GitHub repo for multi-machine
   sync; the local checkout at `~/Documents/code/tool-catalog/` is the
   working copy.
7. **Video skill commit `5d83f574`** (2026-09-28) is the relocate source.
   Its content (the video skill reserve section) moves to
   `candidates.md`; the commit stays in history as the first-record
   action, and a follow-up relocate commit in the split PR removes it from
   `docs/tools-catalog.md`.

## Consequences

- `docs/tools-catalog.md` shrinks to ~14 entries + pointer (~300 lines).
- The general catalogue becomes a single source shared across projects;
  new tool discoveries land once.
- Agents working in inside-china-ai read `docs/tools-catalog.md` first
  (project decisions), reach `../tool-catalog/` only when the pointer
  fires — progressive disclosure, not always-loaded.
- The pointer uses a relative path (`../tool-catalog/`), so it is
  portable across machines that mirror the `~/Documents/code/` layout.
- Execution is multi-session (5 steps: repo scaffold → extract general →
  slim project → relocate video section → verify pointer chain). Each
  step is an atomic commit and can be resumed.

## Open questions

None — both trade-offs resolved on 2026-09-28: keep project annotations as
a sub-field; push to a private GitHub remote.