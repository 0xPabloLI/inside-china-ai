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
| `video-script-writing-guide.md` | Short video script writing methodology — S.T.A.R.T. framework, open loops, hook/CTA formulas, beat-by-beat iteration | `content-pipeline.md` Stage 3 |
| `handoffs/video-layout-standard.md` | 视频布局安全区 session 交接（已完成，内容已集成到 `brand-system.md` Layout Safety 章节） | — |
| `archive/spec-cta-end-card-standard.md` | 标准 CTA 结尾页设计（已归档） | video pipeline |
| `archive/spec-video-layout-safe-zones.md` | 视频布局安全区 + 槽位 + 竖向堆叠规范（已归档；现行行为见 brand-system.md） | video pipeline |

### `adr/` — Architecture Decision Records

Numbered sequence. Current: 0001–0006.

### `conventions/` — Engineering conventions

| Document | Purpose |
|----------|---------|
| `scenario-enumeration-checklist.md` | Boundary scenario enumeration checklist |
| `scenario-matrix.md` | Spec scenario matrix format (Modified Files Impact + Behavioral Scenarios) |

### `tiktok/` — TikTok guides

| Document | Purpose |
|----------|---------|
| `tiktok-best-practices.md` | 2025-2026 best practices (signal weights, voice rules, hooks, audit checklist) |
| `tiktok-developer-setup.md` | TikTok API publishing setup guide |
| `tiktok-do-dont.md` | Do/Don't comparison guide |
| `tiktok-profile-setup.md` | Brand profile setup (one-time reference) |
| `ab-testing-methodology.md` | Element iteration method — single-variable A/B testing philosophy |

### `video/` — Video roadmap

| Document | Purpose |
|----------|---------|
| `video-automation-roadmap.md` | Video automation phased roadmap (ISSUE-01~14) |

### `archive/` — Completed work

Historical specs, tickets, and roadmaps. Retained for reference, no longer maintained. See `archive/README.md` for the full list (36 files).

### `refs/` — Reference materials

External reference repos and source materials. Not project documentation.

### `research/` — Research reports

Deep research reports with citations.

| Document | Purpose |
|----------|---------|
| `multi-video-splitting-best-practices.md` | Video splitting strategy, inter-episode linking, auto-evaluator |
| `voice-prosody-hook-optimization.md` | Per-scene pitch/tempo prosody enhancement — 15 sources, parameter rationale |
| `short-video-script-writing-best-practices.md` | Short video script writing best practices — S.T.A.R.T. framework, psychological retention engines, hook formulas, 15 sources |

## Spec/Ticket Lifecycle

Specs and tickets are **ephemeral** — they exist only during implementation, then archive.

1. `/to-spec` creates `spec-<name>.md` (in `docs/` root or a `specs/` subdir if multiple are active)
2. `/to-tickets` creates `tickets-<name>.md` alongside the spec
3. `/implement` builds each ticket via TDD
4. **On completion**: move both files to `archive/`, update this index

No `specs/` or `tickets/` directories persist between work cycles. They are created on demand and cleaned up when the work ships.

## Redirect Rule

If a topic is historical or split-legacy, keep a short pointer in `archive/README.md` and move all normative content to one canonical file only.
