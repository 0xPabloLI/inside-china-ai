# Video Content Documentation Layer Review

> **Review date:** 2026-08-21 (GMT+8)  
> **Scope:** `docs/content-pipeline.md` and `docs/video-workflow.md`, plus their active L1 neighbors.  
> **Decision record:** [GitHub Issue #103](https://github.com/0xPabloLI/inside-china-ai/issues/103).  
> **Dependency:** [Issue #95](https://github.com/0xPabloLI/inside-china-ai/issues/95) defined the dual-track contract; its implementation is in [PR #104](https://github.com/0xPabloLI/inside-china-ai/pull/104).  
> **Review mode:** Documentation architecture review only. No pipeline code, rendering, TTS, RAG, database, or publication API behavior was changed.

## Conclusion

**`content-pipeline.md` and `video-workflow.md` should remain L1 documents, but neither should remain a catch-all reference.** The correct change is not to offload either parent document. It is to make `content-pipeline.md` a thin route map and `video-workflow.md` a thin regular-production runbook, then move information according to its invocation trigger and canonical owner.

The required target sequence is the local dual-track decision:

```text
shared material → parallel article/video tracks → consistency join → one HITL → release
```

No offload may restore the obsolete public-article-before-video ordering.

## Baseline

| Document | Current size | Intended L1 role | Review finding |
|---|---:|---|---|
| `content-pipeline.md` | 1,060 lines / 66,819 bytes | Route the entire content package from shared material to release | Contains routing, article production, release commands, video-script craft, RAG lifecycle, verification, TikTok operations, and explanations of method choices. |
| `video-workflow.md` | 821 lines / 47,904 bytes | Regular video-production runbook | Contains normal render/TTS operations, but also post-publication analytics, series/compilation branches, scaffold templates, strategy explanation, and implementation rationale. |
| `video-script-writing-guide.md` | 186 lines / 11,606 bytes | Script-craft canonical reference | Already owns narrative and hook/CTA methodology; parent workflow must point here rather than restate it. |
| `media-asset-management.md` | 150 lines / 12,714 bytes | Asset placement, catalog, and RAG integration | Already owns asset and reindex decisions; parent workflow should retain only stage triggers. |
| `manual-ops.md` | 158 lines / 7,884 bytes | User-only publishing actions | Already owns TikTok App actions; parent workflow should link rather than repeat the manual checklist. |
| `analytics-workflow.md` | 149 lines / 5,728 bytes | Post-publication review and optimization | Already owns Analytics; it should not be loaded during routine video rendering. |

## Placement Decision

The project rules define L1 as executable instructions and L2 as rationale, comparison, and derivation. The review identifies two independent problems.

> **Vertical offload:** Move rationale, experiment results, platform explanations, and parameter derivations out of L1 into existing L2 research or ADR documents. L1 retains the operating rule and a pointer.
>
> **Horizontal split:** Keep low-frequency instructions in L1, but put them in narrowly invoked runbooks so a normal single-video request does not load them by default.

## Migration Map

### `docs/content-pipeline.md`

| Current responsibility | Target treatment | Canonical destination | Trigger after migration |
|---|---|---|---|
| Stage 0 shared material, track inputs/outputs, MRL/HITL, cross-output consistency, release ordering | **Keep, condensed** | `content-pipeline.md` | Every content-package request |
| Article drafting details, MRL-1 checklist, widget production | **Keep only contract and pointer** | Article-production reference or the existing article-specific command/documentation source | Article track is active |
| Public article release, source attachments, TikTok App actions | **Move / point** | `manual-ops.md` for human actions; article publisher and Stage 5 contract for automation | HITL approved |
| Script narrative templates, hook/CTA explanation, beat-level methodology | **Remove duplicate and point** | `video-script-writing-guide.md` | Writing or revising scene-data |
| Asset placement, catalog fields, reindex mechanics | **Move / point** | `media-asset-management.md` | New/changed media asset or reindex trigger |
| Research justification for series length, platform behavior, or writing methods | **Move to L2 pointer** | Existing `docs/research/` documents | Only when reassessing the chosen rule |
| Analytics process | **Point only** | `analytics-workflow.md` | 24–48 hours after publication |

### `docs/video-workflow.md`

| Current responsibility | Target treatment | Canonical destination | Trigger after migration |
|---|---|---|---|
| Preflight, TTS, rendering, retry, verification, critical paths, output conventions | **Keep, condensed** | `video-workflow.md` | Normal video production |
| Brand voice and narrative content standards | **Point** | `brand-system.md` and `video-script-writing-guide.md` | Branding or scripting work |
| Publishing strategy and manual TikTok actions | **Point** | `manual-ops.md` and `docs/tiktok/` | HITL-approved release |
| Post-publish analytics and optimization | **Move / point** | `analytics-workflow.md` | Analytics review |
| Multi-video series, compilation video, series release sequence | **Extract to narrow L1** | New series/compilation runbook only if the migration map confirms no existing canonical home | Episode evaluator recommends multiple parts or user requests a compilation |
| Creating a new content pipeline from scratch, directory tree, `meta.mjs` / `scene-data.mjs` / `scenes.mjs` templates | **Extract to narrow L1** | New content-scaffold runbook or a single code-template source | Creating a new content slug, not normal rendering |
| VLM/TTS/platform trade-offs, historical experiment results, model limits | **Move to L2 / ADR pointer** | Existing ADRs and `docs/research/` | Reconsidering a technical choice |

## Guardrails for #103

1. **Preserve the dual-track contract.** The route map must never require public article release before scene-data or rendering.
2. **Do not split by line count alone.** A new L1 document is justified only when it has a distinct trigger and a canonical responsibility.
3. **Retain operating contracts in the parent.** Inputs, outputs, commands, MRL/HITL gates, and failure ownership cannot disappear behind a generic link.
4. **One rule, one canonical home.** Parent documents link to specialized references; they do not restate complete procedures.
5. **Verify every move.** Before deleting or replacing content, run the required cross-section contradiction check, pointer-target field coverage check, and referenced-file existence check.

## Minimal Document Load for a Topic-Only Request

For a request such as “make a Unitree IPO video,” the post-#103 default load path should be:

```text
AGENTS.md
  → content-pipeline.md (Stage 0 and current route)
  → video-script-writing-guide.md (only while creating scene-data)
  → video-workflow.md (only while rendering and verifying)
  → media-asset-management.md (only if material assets or catalog change)
  → manual-ops.md (only after HITL approval)
  → analytics-workflow.md (only after publication)
```

Series, scaffold, deep-research, and L2 decision material remain unloaded unless their explicit trigger occurs.

## Issue Handoff

This review is the scope baseline for **#103**. The implementation should begin with a chapter-level migration checklist derived from the two migration tables above, then execute moves in small, independently validated commits. The review does not itself move content or create new runbooks.
