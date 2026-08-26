# Installed Skills Overview

> Maintenance doc: what skills are installed, where they come from, and how
> they're tracked. Update when adding/removing skills.

## Sources

| Source | Install method | Git tracked? | Count |
|--------|---------------|-------------|-------|
| **Repo skills** (`skills/`) | Self-written, symlinked to `.cursor/skills/` + `.agents/skills/` | ✅ Yes (repo) | 4 |
| **Matt Pocock skills** | `npx skills add mattpocock/skills` | ❌ No (local `.agents/`) | 34 |
| **last30days** (3rd party) | Symlink to `~/last30days-skill/` | ❌ No | 1 |
| **Other 3rd party** (Vercel/Anthropic/community) | Various (`npx skills add` from other repos) | ❌ No | ~134 |
| **Total** | | | ~173 |

## Repo Skills (Git Tracked)

These live in `skills/` at the repo root. Symlinks in `.cursor/skills/` and
`.agents/skills/` point back to the repo source.

| Skill | Purpose | Used by |
|-------|---------|---------|
| `web-deep-research` | 8-phase deep research pipeline + web-access fetching + code verification | AGENTS.md "Web Scraping & Content Fetching" → "深度研究" |
| `web-access` | Chrome CDP proxy for web content retrieval (search, page loading, anti-bot) | web-deep-research Phase 3 dependency |
| `brand-system` | Brand consistency enforcement for generated visual content | `short-video-pipeline` skill |
| `short-video-pipeline` | Video production pipeline orchestration | AGENTS.md "Content Pipeline" |

## Matt Pocock Skills

Installed via `npx skills add mattpocock/skills`. Tracked in
`.cursor/skills/skills-lock.json`. Source: `github.com/mattpocock/skills`.

### User-invoked (`disable-model-invocation: true`)

Agent does NOT auto-trigger these; user must invoke by name.

| Skill | Purpose | AGENTS.md reference |
|-------|---------|---------------------|
| `ask-matt` | Router over user-invoked skills | — |
| `grill-with-docs` | Grilling + ADR/glossary creation | Step 1 (Mandatory) |
| `to-spec` | Conversation → spec | Step 2 |
| `to-tickets` | Spec → tracer-bullet tickets | Step 3 |
| `implement` | Build from spec/tickets with TDD | Step 4 |
| `code-review` | Two-axis review (Standards + Spec) | Step 5 |
| `triage` | Issue triage state machine | — |
| `improve-codebase-architecture` | Deepening opportunities survey | — |
| `setup-matt-pocock-skills` | Repo config (issue tracker, labels, domain docs) | — |
| `wayfinder` | Large work planning as decision tickets | — |
| `handoff` | Compact conversation for another agent | Phase Boundaries |
| `grill-me` | Non-code grilling | — |
| `teach` | Multi-session teaching | — |
| `to-questionnaire` | Generate questionnaire for human | — |
| `wait-what` | Re-pitch unclear message | — |
| `loop-me` | Grill about specs for workflows | — |

### Model-invoked (no `disable-model-invocation`)

Agent auto-triggers based on description match.

| Skill | Purpose | AGENTS.md reference |
|-------|---------|---------------------|
| `grilling` | Reusable interview primitive | Behind grill-with-docs |
| `writing-for-agents` | Writing docs for agents (skills, AGENTS.md) | Coding Conventions |
| `tdd` | Red-green-refactor loop | Step 4 |
| `diagnosing-bugs` | 6-phase debugging discipline | — |
| `research` | Background agent lightweight research | — |
| `prototype` | Throwaway prototype for design questions | Step 1b |
| `domain-modeling` | Build/sharpen domain model | — |
| `codebase-design` | Deep module design vocabulary | — |
| `code-review` | (also model-invoked for sub-agent use) | Step 5 |
| `resolving-merge-conflicts` | Hunk-by-hunk merge conflict resolution | — |
| `wizard` | Interactive bash wizard for human steps | — |

### In-progress (experimental)

| Skill | Notes |
|-------|-------|
| `setup-ts-deep-modules` | TS deep modules setup |
| `writing-beats` | Writing discipline |
| `writing-fragments` | Writing discipline |
| `writing-shape` | Writing discipline |

### Misc

| Skill | Notes |
|-------|-------|
| `git-guardrails-claude-code` | Block dangerous git commands |
| `migrate-to-shoehorn` | `as` → `@total-typescript/shoehorn` |
| `scaffold-exercises` | Exercise scaffolding |
| `setup-pre-commit` | Pre-commit hook setup |

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
| `linear` | Linear issue tracking |
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
