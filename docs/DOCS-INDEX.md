# Documentation Index

> Source of truth for doc ownership. Use it to find any document in one lookup.
>
> _Last inventory: 2026-08-07._

## Canonical Structure

### Root — Active reference (AGENTS.md pointers)

| Document | Purpose | Referenced by |
|----------|---------|---------------|
| `brand-system.md` | Brand visual identity — tokens, templates, rules | `brand-system` skill |
| `content-pipeline.md` | Unified content pipeline (article → publish → video → TikTok → analytics) | AGENTS.md |
| `manual-ops.md` | Manual operations checklist, sorted by frequency | AGENTS.md |
| `tanstack-lovable-conventions.md` | Stack-level conventions for publishable build | AGENTS.md |
| `video-workflow.md` | Video production workflow — TTS, publishing, file paths | AGENTS.md |
| `rag-prework.md` | RAG pipeline pre-work plan (Issue #15) | — |

### `adr/` — Architecture Decision Records

Numbered sequence. Current: 0001–0006.

### `conventions/` — Engineering conventions

| Document | Purpose |
|----------|---------|
| `scenario-enumeration-checklist.md` | Boundary scenario enumeration checklist |
| `scenario-matrix.md` | Spec scenario matrix format (Modified Files Impact + Behavioral Scenarios) |

### `specs/` — Active specs

In-progress or ready-to-implement specifications.

| Spec | Tickets |
|------|---------|
| `spec-design-optimization.md` | `tickets/tickets-design-optimization.md` |
| `spec-mcp-fallback.md` | — |
| `spec-multi-video-splitting.md` | `tickets/tickets-multi-video-splitting.md` |
| `spec-pipeline-isolation.md` | `tickets/tickets-pipeline-isolation.md` |
| `spec-scene-extraction.md` | `tickets/tickets-scene-extraction.md` |
| `spec-subtitle-rendering.md` | `tickets/tickets-subtitle-rendering.md` |
| `spec-subtitle-verification.md` | `tickets/tickets-subtitle-verification.md` |
| `spec-tiktok-rules-sync.md` | `tickets/tickets-tiktok-rules-sync.md` |
| `spec-trend-sources-expansion.md` | `tickets/tickets-trend-sources-expansion.md` |
| `spec-ui-consistency-fix.md` | — |
| `spec-widget-inline-dashboards.md` | `tickets/tickets-widget-inline-dashboards.md` |
| `spec-x-source-and-wechat-update.md` | — |

### `tickets/` — Active tickets

Tracer-bullet breakdowns, each tied to a spec. See `specs/` table above for pairs.

### `tiktok/` — TikTok guides

| Document | Purpose |
|----------|---------|
| `tiktok-best-practices.md` | 2025-2026 best practices (signal weights, voice rules, hooks, audit checklist) |
| `tiktok-developer-setup.md` | TikTok API publishing setup guide |
| `tiktok-do-dont.md` | Do/Don't comparison guide |
| `tiktok-profile-setup.md` | Brand profile setup (one-time reference) |

### `video/` — Video roadmap

| Document | Purpose |
|----------|---------|
| `video-automation-roadmap.md` | Video automation phased roadmap (ISSUE-01~14) |

### `archive/` — Completed work

Historical specs, tickets, and roadmaps. Retained for reference, no longer maintained. See `archive/README.md` for the full list.

### `refs/` — Reference materials

External reference repos and source materials. Not project documentation.

### `research/` — Research reports

Deep research reports with citations.

## Redirect Rule

If a topic is historical or split-legacy, keep a short pointer in `archive/README.md` and move all normative content to one canonical file only.

## Maintenance

When adding a new spec:
1. Create `specs/spec-<name>.md`
2. Create `tickets/tickets-<name>.md` (if ticketing)
3. Add a row to the `specs/` table above
4. When work is complete, move both files to `archive/` and update this index
