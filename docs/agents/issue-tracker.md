# Issue Tracker: GitHub Issues

Issues are tracked in **GitHub Issues** on this repo using the `gh` CLI.

## Workflow

- **Create issue**: `gh issue create` with title, body, labels
- **List issues**: `gh issue list` (filter by `--label`, `--state`, `--assignee`)
- **Update issue**: `gh issue edit <number>` (add labels, assignees, update body)
- **Close issue**: `gh issue close <number>`
- **View issue**: `gh issue view <number>` (includes comments)
- **PRs as request surface**: off (external PRs are not triaged as issues)

## Conventions

- Use labels for triage (see `triage-labels.md`).
- One issue = one atomic task or bug.
- Link related issues in the body with `#number`.
- Close issues via commit message (`fixes #N` / `closes #N`) or manually after verification.
- Closing a completed issue: keep its `enhancement` or `bug` category label, remove all state labels. Do not use `wontfix` for completed work — `wontfix` is for rejected items only.
- **GraphQL timeout workaround**: `gh` CLI GraphQL calls (used by `gh issue view/edit/close`) intermittently time out through FlClash proxy. Use REST API instead: `gh api repos/0xPabloLI/inside-china-ai/issues/<num>` for reads, `gh api .../issues/<num>/labels -X PUT` for label changes, `gh api .../issues/<num> -X PATCH -f state=closed` for closing. DELETE requests also time out — use PUT to overwrite the full label set instead.

## Querying current state

Run `gh issue list --label <state-label> --state open` to see issues in each state. Do not cache issue lists in this file — they go stale. The tracker is the source of truth.

## Recommended execution order (2026-08-22 triage)

Based on dependency analysis. Most inter-issue relationships are soft (related, not blocking) — order is by impact, not topology.

### T1: Immediate, no dependencies

1. **#83** — Rename `stock_api` → `stock_media` (mechanical, ready-for-agent)
2. **#78** — DOCS-INDEX sync 22 missing docs (mechanical, ready-for-agent)
3. **#51** — BM25 pre-filter for RAG reranker (independent module, ready-for-agent)

### T2: Search source infrastructure

4. **#91** — Add DuckDuckGo search source (independent, ready-for-agent)
5. **#92** — Add SearXNG search source (independent, already deployed, ready-for-agent)
6. **#64** — Add free API sources to registry (enlarges the pool for #65)

### T3: Design-decision intensive (human first)

Start with **#67** (complete capabilities.articles schema) — it is the soft dependency source for #66, #76, #77. After #67, those three become easier.

Soft dependency map (A -> B = "A done makes B easier"):
- #67 -> #66 (auto-fallback needs method + fallback config)
- #67 -> #77 (source labeling audit needs complete schema)
- #67 -> #76 (SSOT audit needs explicit schema)
- #76 <-> #77 (complementary audits)
- #66 -> #87 (auto-fallback reduces manual maintenance)
- #88 -> #67 (CDP field rename intersects schema work)

No hard blocking edges exist — all issues can technically be done independently.
