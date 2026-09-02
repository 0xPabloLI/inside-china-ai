# Installed Skills Overview

> Maintenance doc: what skills are installed, where they come from, and how
> they're tracked. Update when adding/removing skills.

## Sources

| Source | Install method | Git tracked? | Count |
|--------|---------------|-------------|-------|
| **Repo skills** (`skills/`) | Self-written, symlinked to `.cursor/skills/` + `.agents/skills/` | ✅ Yes (repo) | 4 |
| **Matt Pocock skills** | `npx skills add mattpocock/skills` | ❌ No (local `.agents/`) | 22 |
| **last30days** (3rd party) | Symlink to `~/last30days-skill/` | ❌ No | 1 |
| **Other 3rd party** (Vercel/Anthropic/community) | Various (`npx skills add` from other repos) | ❌ No | ~134 |
| **Total** | | | ~161 |

## Repo Skills (Git Tracked)

These live in `skills/` at the repo root. Symlinks in `.cursor/skills/` and
`.agents/skills/` point back to the repo source.

| Skill | Purpose | Used by |
|-------|---------|---------|
| `web-deep-research` | 8-phase deep research pipeline + web-access fetching + code verification | `docs/tools-catalog.md` research routing |
| `web-access` | Chrome CDP proxy for web content retrieval (search, page loading, anti-bot) | web-deep-research Phase 3 dependency |
| `brand-system` | Brand consistency enforcement for generated visual content | `short-video-pipeline` skill |
| `short-video-pipeline` | Video production pipeline orchestration | AGENTS.md "Content and Video" |

## Matt Pocock Skills

Installed via `npx skills add mattpocock/skills`. Tracked in
`.cursor/skills/skills-lock.json`. Source: `github.com/mattpocock/skills`.

The project workflow was audited against upstream **v1.2.3** at commit
`6654f6b60cd9d5be8b54c6fafe44346dabeb3b76` (verified 2026-09-01).
`skills-lock.json` tracks per-skill hashes rather than the upstream release
number, so repeat the audit after `npx skills update`.

### User-invoked (`disable-model-invocation: true`)

These skills are intentionally excluded from implicit model invocation. A human
normally starts them by name. In this repository, an authorized implementation
may instead execute the relevant `SKILL.md` **by reference** under
`docs/agents/implementation-workflow.md`; this preserves the skill's method
without falsely claiming a Skill-tool invocation.

| Skill | Purpose |
|-------|---------|
| `ask-matt` | Router over Matt's flows |
| `grill-with-docs` | Grilling with ADR/glossary updates in a repository |
| `to-spec` | Synthesize settled conversation into a spec |
| `to-tickets` | Split a spec into tracer-bullet tickets with blocking edges |
| `implement` | Build an agreed scope or ticket using TDD where possible |
| `wayfinder` | Multi-session planning through map and decision tickets |
| `handoff` | Carry durable context across a phase or session boundary |
| `grill-me` | Grilling without repository docs |
| `triage` | Issue triage state machine |
| `improve-codebase-architecture` | Deepening-opportunity survey |
| `setup-matt-pocock-skills` | Configure tracker, labels and domain docs |


### Model-invoked (no `disable-model-invocation`)

Agent may invoke these through the Skill tool when their description matches.

| Skill | Purpose |
|-------|---------|
| `grilling` | Reusable round-based interview primitive |
| `domain-modeling` | Build or sharpen the domain model |
| `prototype` | Runnable answer for a design or state question |
| `tdd` | Red-green-refactor loop |
| `code-review` | Fixed-baseline Standards + Spec review |
| `diagnosing-bugs` | Tight diagnosis loop for hard failures |
| `research` | Bounded background research |
| `codebase-design` | Deep-module design vocabulary |
| `writing-for-agents` | Agent-document hierarchy and progressive disclosure |
| `resolving-merge-conflicts` | Hunk-by-hunk conflict resolution |
| `git-guardrails-claude-code` | Dangerous Git command guardrails |

### Project execution adaptation

The canonical S0-S3 routes and stage transitions live only in
`docs/agents/implementation-workflow.md`. This inventory retains two routing
distinctions needed to choose a skill:

- Grill sharpens bounded decisions. Wayfinder is reserved for planning that
  itself spans sessions and still contains real fog; it is not a general Grill
  replacement.
- Multi-session implementation earns Spec/Tickets; single-session work does
  not create them solely for ceremony.

In the core flow, `grill-with-docs` calls model-invoked `grilling` and
`domain-modeling`; `implement` uses model-invoked `tdd` where behavior is
testable; `code-review` reviews the recorded committed baseline.

Do not edit update-managed copies under `.agents/skills/`. Put durable
repository overrides in `docs/agents/implementation-workflow.md`.

### Removed (2026-09-02)

- **`.claude/skills/` mirror deleted** — was 173 symlinks to `.agents/skills/*`,
  duplicated `.agents/skills/` via `.cursor/skills` → `.agents/skills` symlink.
  Claude Code harness reads `.agents/skills/` directly; the mirror was redundant.
- **12 Matt experimental skills uninstalled** — `teach`, `writing-beats`,
  `writing-fragments`, `writing-shape`, `loop-me`, `wait-what`,
  `to-questionnaire`, `setup-ts-deep-modules`, `setup-pre-commit`,
  `migrate-to-shoehorn`, `wizard`, `scaffold-exercises`. Upstream marks them
  Experimental; no project reference. Removed from `.agents/skills/` and
  `skills-lock.json` (34 → 22).
- **System skills not project-installed** — HarmonyOS (`hmos-dev-pipeline`),
  SDD (`creating-sdd-directory` etc.), bug-fix workflow (`issue-analysis` etc.),
  `prd`, `doc-expert` live in `~/.codeartsdoer/cache/` (harness-managed), not
  in `.agents/skills/`. Cannot uninstall from project; noted as not relevant
  (React/TanStack stack, no ArkTS; Matt `diagnosing-bugs`/`to-spec` overlap).

## Third-Party Skills (Non-Matt-Pocock)

### Research / Search

| Skill | Author / Source | Purpose | Install |
|-------|----------------|---------|---------|
| `last30days` | External (`~/last30days-skill/`) | 30-day trend discovery across Reddit/X/YouTube/TikTok/HN/Polymarket/GitHub | Symlink |

### Other 3rd Party (~134 skills)

Installed from various sources via `npx skills add`. Not individually tracked
in skills-lock.json. Includes: Vercel/Next.js skills, Cloudflare skills,
Anthropic frontend-design, community skills (impeccable, p7/p9/p10, etc.).

**To audit**: run `ls .cursor/skills/ | wc -l` and compare against this doc.

## MCP Servers (Alternative to Skills)

These platforms have MCP servers configured — platform-specific deploy skills
were removed (redundant with MCP):

| MCP | Purpose |
|-----|---------|
| `cloudflare` | Workers, Pages, D1, R2, KV, etc. |
| `railway-mcp-server` | Railway deploy/service management |
| `vercel` | Vercel deploy/preview |
| `github` | Issues, PRs, code search |
| `linear` | Available integration for other contexts; this repository tracks work in GitHub Issues |
| `brave-search` | Web search |
| `context7` | Library docs lookup |
| `jina` | Web page reading |
| `tavily` | Web search (limited, fallback only) |
| `mcp-search-bridge` | X (Twitter) search |
| `colab` | Google Colab execution |
| `publora` | Social media publishing |
| `lovable` | Lovable project sync |

## Update Protocol

When adding a new skill:
1. Install it (symlink to `.cursor/skills/` + `.agents/skills/`)
2. Add an entry to the appropriate table above
3. If it's a repo skill, ensure it's in `skills/` and git tracked
4. If it's from Matt Pocock, `skills-lock.json` auto-updates via `npx skills`

When removing a skill:
1. Delete from `.cursor/skills/`, `.agents/skills/`, and all `~/.*/skills/` symlinks
2. Remove from the table above
3. If Matt Pocock: update `skills-lock.json`
4. Check if any other skill or AGENTS.md references it

## Install Commands Reference

```bash
# Install Matt Pocock skills (choose which ones interactively)
npx skills@latest add mattpocock/skills

# Update Matt Pocock skills to latest
npx skills update

# Repo skills are already in the repo (skills/), just ensure symlinks exist:
for dir in .cursor/skills .agents/skills; do
  for s in web-deep-research web-access brand-system short-video-pipeline; do
    [ ! -e "${dir}/${s}" ] && ln -s "$(pwd)/skills/${s}" "${dir}/${s}"
  done
done
```
