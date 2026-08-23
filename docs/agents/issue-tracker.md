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

## Recommended execution order (2026-08-23 full triage)

34 open issues. Grouped into phases by shared context. Issues in the same phase modify the same files or share the same design context, and should be done in one continuous session (split at phase boundaries only).

### Phase 1: Search source infrastructure — NEXT

Shared context: source-registry.mjs + search-sources.mjs fallback chain + asset-sourcer.mjs media search.

| # | Issue | Role |
|---|-------|------|
| #91 | DuckDuckGo search source | CDP source, NOT Pool member |
| #92 | SearXNG metasearch source | API source, becomes Pool member later |
| #64 | Free API sources (Guardian, NYT, etc.) | Multiple API sources, enlarges Pool |
| #65 | Search API Pool | Round-robin scheduler, depends on #92+#64 |
| #110 | Progressive (Tiered) Media Search | Image/video fallback tiers in asset-sourcer, reuses #92 SearXNG |

Internal order: #91 -> #92 -> #64 -> #65. #110 independent (does not depend on #65, uses #92 SearXNG already deployed).

### Phase 2: Source registry schema + audit

Shared context: source-registry.mjs capabilities schema + audit of all 59 sources.

| # | Issue | Role |
|---|-------|------|
| #88 | Rename CDP script fields | Do first, schema on final field names |
| #67 | Complete capabilities.articles schema | Soft dep for #66, #76, #77 |
| #66 | extractScript auto-fallback | Needs #67 schema |
| #76 | SSOT violations audit | Needs #67 explicit schema |
| #77 | Source type labeling audit | Needs #67 schema |

Internal order: #88 -> #67 -> (#66 parallel #76 parallel #77)

### Phase 3: CDP extraction + anti-bot

Shared context: CDP scraping reliability.

| # | Issue | Role |
|---|-------|------|
| #89 | Anti-bot scraping (parent) | Rate limiting infrastructure |
| #63 | SVE: Single-Visit Extraction | One CDP visit for articles+images+videos |
| #90 | MCP->API migration (Bigsong) | Replace MCP transport |
| #85 | Bloomberg paywall alternatives | Republisher sites |

Internal order: #89 first, then #63/#90/#85 parallelize. Depends on Phase 1.

### Phase 4: Video pipeline automation

Shared context: Video rendering P5-P8. Sequential chain.

| # | Issue | Role |
|---|-------|------|
| #98 | P5: Local ASR worker (WhisperX) | Windowed timestamps |
| #99 | P6: Media timeline fusion | Needs P5 |
| #100 | P7: Content-addressed cache | Cache + scheduler |
| #101 | P8b: Temporal focus | Needs P6 |
| #35 | F5-TTS prosody enhancement | Independent |
| #32 | yt-dlp full video + AI segment | Independent, needs-info |

Internal order: #98 -> #99 -> #100 -> #101. #35, #32 independent.

### Phase 5: Content + evidence pipeline

Shared context: Evidence layer + audit.

| # | Issue | Role |
|---|-------|------|
| #94 | Scene-level visual intent + evidence audit | Per-scene verification |
| #60 | On-demand content audit | Agent-triggered verification |
| #61 | Non-blocking evidence audit | Background audit |
| #97 | WeChat RSS tracking closure | Research + docs |
| #75 | Alternative download XHS/Weibo/Douyin | Video download |

Internal order: #94 -> (#60 parallel #61). #97, #75 independent.

### Phase 6: Docs + research

No code dependencies. Any order.

| # | Issue | Role |
|---|-------|------|
| #103 | Offload/split Layer 1 video docs | Doc restructuring |
| #108 | Free cloud inference endpoints research | Research |
| #68 | Signal Density audit (ADR-0016) | Audit |
| #29 | Analytics workflow — retention analysis | Research |
| #21 | Multimodal RAG — image/video retrieval | RAG extension |

### Phase 7: Audit + maintenance (post Phase 1-3)

Best done after source infrastructure is stable.

| # | Issue | Role |
|---|-------|------|
| #87 | 88 manual maintenance items audit | Benefits from #66 auto-fallback |
| #109 | Unified search pool for web-access skill | Reuses #65 pool, different consumer |

Depends on: Phase 1 (#65) for #109.

### Dormant

| # | Issue | Trigger |
|---|-------|---------|
| #107 | Algorithm and Model Review | After project v1 complete |

### Cross-phase soft dependencies

- Phase 1 -> Phase 2 (sources exist before schema audit)
- Phase 1 -> Phase 3 (new sources before extraction optimization)
- Phase 2 #66 -> Phase 7 #87 (auto-fallback reduces manual items)
- Phase 1 #65 -> Phase 7 #109 (pool reused by web-access skill)
- Phase 1 #110 <-> #65 (shared BRAVE_SEARCH_API_KEY + quota tracking; #110 does not block on #65, but quota module should be extracted to shared when #65 is done)

No hard blocking edges. All phases can start independently.
