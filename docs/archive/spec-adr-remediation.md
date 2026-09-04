# Spec: ADR Directory Remediation

> Created: 2026-08-19
> Status: Ready for implementation

## Problem Statement

Agent automatically reads `docs/adr/` when doing any issue (domain-modeling skill convention: CONTEXT.md + docs/adr/ at root). But the current ADR directory has 5 categories of problems that degrade Agent decision quality:

1. **ADR content overflows into L1/L2** — implementation parameters, API surfaces, performance tables, debug logs, and evaluation comparisons fill ADRs that should be 1-3 sentences (per ADR-FORMAT). Agent reads stale parameters from ADR instead of current values from code/L1.
2. **Duplicate ADR numbering** — `0001-widget-inline-embedding.md` and `0001-widget-inline-markers.md` have the same number and near-identical content.
3. **Non-qualifying ADRs** — files that don't meet the three ADR criteria (hard to reverse + surprising + real trade-off): a refactor completion report (0006), a layout CSS value (0002), and a Proposed-status architecture principle with implementation tracking (0016).
4. **DOCS-INDEX not synced** — missing 0016, only lists 0001-0015 while 17 files exist.
5. **Stale content** — ADR-0007 says "full rebuild" but incremental indexing is implemented; ADR-0012 says "Lightning AI 403" but it's actually usable; ADR-0012 says "GPU type cannot be specified" but `machine_shape` works.

## Solution

Remediate all 17 ADR files to comply with ADR-FORMAT (1-3 sentences: context, decision, why + optional Considered Options / Consequences). Strip L1/L2 content to their proper homes. Delete non-qualifying ADRs or move to archive. Sync DOCS-INDEX.

## User Stories

1. As an Agent, I want ADRs to contain only decision + why, so that I don't read stale implementation parameters and use them for current decisions.
2. As an Agent, I want ADRs to be short (1-3 sentences), so that reading them doesn't bloat my context window.
3. As an Agent, I want each ADR number to be unique, so that references like "see ADR-0001" are unambiguous.
4. As an Agent, I want DOCS-INDEX ADR table to match actual files, so that I don't miss or phantom-reference ADRs.
5. As an Agent, I want stale facts in ADRs to be corrected or removed, so that I don't act on outdated information.
6. As a developer, I want implementation parameters in `video-workflow.md` (L1), so that I can find current values in one place.
7. As a developer, I want evaluation comparisons in `docs/research/` (L2), so that I don't duplicate maintenance across ADR and L2.
8. As a developer, I want non-qualifying "ADRs" (refactor reports, CSS values) to be archived or deleted, so that the ADR directory only contains genuine architectural decisions.

## Implementation Decisions

### D1: ADR content constraint — strict ADR-FORMAT compliance

Every surviving ADR must fit: 1-3 sentences (context + decision + why) + optional Considered Options (1-2 sentences per rejected alternative) + optional Consequences (1-2 sentences, with pointers to L1/L2 where detail lives). No "Key technical decisions", no "Key bugs fixed", no parameter tables, no API surfaces, no performance tables, no implementation status tracking.

### D2: Content migration targets

| Content type                                      | Target                                                   | Rationale                                        |
| ------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| TTS parameters (steps, cfg_strength, etc.)        | Already in `video-workflow.md` L96-118                   | Delete duplicate from ADR, no migration needed   |
| TTS post-processing rules                         | Already in `video-workflow.md` L149-158                  | Delete duplicate                                 |
| TTS bug fix / debug logs                          | Already in `voice-cloning-solutions-m2-pro.md` L580-625  | Delete duplicate                                 |
| TTS evaluation comparison                         | Already in `voice-cloning-solutions-m2-pro.md`           | Delete duplicate, add pointer in Consequences    |
| VLM architecture + performance + limitations      | **NEW: `video-workflow.md` VLM section (~15 lines)**     | L1 definition: "what to do, what params to use"  |
| VLM API surface / JSON schema / IPC protocol      | Code is source of truth                                  | Delete, do not migrate                           |
| VLM key technical decisions (chat template, etc.) | Code comments / archive spec                             | Delete                                           |
| Remotion migration scope (T1-T6)                  | Git log / archive tickets                                | Delete                                           |
| Remotion scene component table                    | Code (`remotion/src/scenes/`)                            | Delete                                           |
| Remotion dual-track rendering                     | **NEW: `video-workflow.md` Pipeline Steps (~2 lines)**   | L1: Agent needs to know rendering path selection |
| Unified venv component table                      | Already in `video-workflow.md` L365                      | Delete duplicate                                 |
| Cloud GPU configs                                 | Already in `cloud-gpu-options.md` (L2)                   | Delete duplicate                                 |
| Cloud GPU evaluation                              | Already in `cloud-gpu-options.md` (L2)                   | Delete duplicate                                 |
| Source registry fields                            | Code is source of truth                                  | Delete                                           |
| Source classification table                       | Already in `content-pipeline.md` L118-146                | Delete duplicate                                 |
| Focus detection API surface / output contract     | Code is source of truth                                  | Delete                                           |
| Focus detection key technical decisions           | Already in `docs/archive/spec-visual-focus-detection.md` | Delete                                           |
| Focus detection performance                       | **NEW: `video-workflow.md` VLM section**                 | L1: Agent needs timing for batch decisions       |
| RAG "full rebuild" rationale                      | Stale — incremental implemented                          | Delete                                           |
| RAG trigger points                                | Already in `content-pipeline.md` Stage 2c/3b/4b          | Delete duplicate, fix ADR Consequences           |
| Cascade filtering implementation tracking         | Stale / roadmap                                          | Delete                                           |
| Cascade filtering P4-P8 guidance                  | Roadmap, not ADR                                         | Delete                                           |

### D3: Non-qualifying ADR dispositions

| ADR                                                                 | Disposition                                                                          | Reason                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `0001-widget-inline-embedding.md` + `0001-widget-inline-markers.md` | Merge into `0001-widget-inline-embedding.md`, delete `0001-widget-inline-markers.md` | Duplicate number + near-identical content                         |
| `0002-widget-breakout-layout.md`                                    | Keep, trim to 2-3 sentences                                                          | Surprising (why wider) but easy to reverse — trim, keep rationale |
| `0006-architecture-deepening-completed.md`                          | Move to `docs/archive/`                                                              | Refactor completion report, not irreversible decision             |
| `0016-cascade-filtering-signal-density.md`                          | Rewrite as pure ADR (Rule 1 + Rule 2 only)                                           | Architecture principle qualifies; delete tracking/roadmap         |

### D4: Stale content corrections

| ADR  | Stale content                                                 | Fix                                                                                                                      |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 0007 | "Why full rebuild: ~400 chunks"                               | Delete rebuild rationale. Add Consequence: "Incremental indexing implemented (commit ea20bd3). See `video-workflow.md`." |
| 0007 | "Stage 5a" trigger point                                      | Delete trigger list. Consequence points to `content-pipeline.md`                                                         |
| 0008 | Registry priority `["f5-mlx", "qwen-tts", "edge-tts", "say"]` | Delete (already in video-workflow.md)                                                                                    |
| 0012 | "Lightning AI: 403 error, support contacted"                  | Update: Lightning AI usable (15 credits/month). Pointer to `cloud-gpu-options.md`                                        |
| 0012 | "GPU type cannot be specified"                                | Update: `machine_shape: "NvidiaTeslaT4"` works. Pointer to `cloud-gpu-options.md`                                        |

### D5: DOCS-INDEX sync

- Add 0016 to ADR table
- Remove 0006 row (moved to archive)
- Update 0001 to show single file (merge)

### D6: No renumbering

ADR numbers are permanent identifiers. Deleted numbers leave gaps. New ADRs continue from 0017.

### D7: Video-workflow.md additions

**VLM section** (after TTS Engine Configuration, before Logo Handling):

```
## VLM Asset Analysis

The pipeline uses two independent Python subprocesses managed by `visual-analyzer.mjs`:

1. **Focus detector** (`focus_detector.py`, OpenCV) — fast spatial analysis (~180ms/image, <1s startup, ~200MB peak)
2. **VLM** (`vlm_analyzer.py`, Qwen3-VL-8B-8bit via mlx-vlm) — semantic analysis (~20-30s/image, ~100-120s/video, 12-17s model load)

Two-phase execution: Phase 1 `detectFocus()` batch → `closeFocusDetector()` (releases ~200MB) → Phase 2 `describeImage/Video()` + `analyzeFit()` → `closeVisualAnalyzer()` (releases ~11GB).

Graceful degradation: if Python or model unavailable, returns empty strings. Pipeline continues with keyword-only matching.

Video analysis timeout: 180s (`RESPONSE_TIMEOUT_MS`).

Known limitations: video analysis slow (~2min/asset, 20-asset batch ~40min); 8B model occasionally hallucinates brands; non-functional `objc` warnings from av/cv2 library duplication.

> Decisions: ADR-0009 (VLM), ADR-0015 (Focus detection). Alternatives survey: `docs/research/asset-focus-detection-alternatives.md`
```

**Dual-track rendering** (in Pipeline Steps table, Step 3):

Add note: `--remotion` flag or `meta.renderer === "remotion"` → Remotion path (default). Fallback → Playwright path (legacy).

## Testing Decisions

This is a documentation-only change. No unit tests. Verification is:

1. **writing-for-agents three checks**:
   - Cross-section contradictions: same rule consistent across all ADRs
   - Pointer target completeness: every pointer in ADR Consequences points to a file that exists and contains the referenced content
   - File existence: `ls` verify all referenced files exist

2. **DOCS-INDEX consistency**: ADR table matches actual files in `docs/adr/`

3. **ADR-FORMAT compliance**: each surviving ADR has ≤ 1-3 sentences for decision + optional sections, no L1/L2 overflow

4. **Three-criteria check**: each surviving ADR meets hard-to-reverse + surprising + real-trade-off

5. **`npm run lint`** passes (markdown linting if configured)

## Out of Scope

- ADR-0003 (Widget registry), ADR-0004 (env file strategy), ADR-0005 (Lovable constraints) — already compliant, no changes needed
- Creating new L2 research files — all L2 content already has homes in existing files
- Modifying code — no code changes
- Modifying L2 research files — they already contain the content

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File                                                | Modification                                                                                                                                                         | Risk   | Assessment                                                                                                                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/adr/0001-widget-inline-embedding.md`          | Merge content from markers file, trim to ADR-FORMAT                                                                                                                  | Low    | Merging two near-identical files. Content preserved is a superset. No code dependency on ADR content.                                                                                 |
| `docs/adr/0001-widget-inline-markers.md`            | **Delete**                                                                                                                                                           | Low    | Content preserved in merged 0001-widget-inline-embedding.md. No code references this specific filename.                                                                               |
| `docs/adr/0002-widget-breakout-layout.md`           | Trim Considered Options table to 1 sentence                                                                                                                          | Low    | Decision unchanged, only format trimmed.                                                                                                                                              |
| `docs/adr/0006-architecture-deepening-completed.md` | **Move to `docs/archive/`**                                                                                                                                          | Low    | Historical reference, not actively consumed. Git history preserves original location.                                                                                                 |
| `docs/adr/0007-rag-pipeline-decisions.md`           | Trim 6 decisions to 2-3 sentences each, delete stale rebuild rationale, fix trigger points                                                                           | Medium | Consequences section changes. Agent relying on ADR-0007 for RAG behavior will see different content. But changes are corrections (aligning with current state), not behavior changes. |
| `docs/adr/0008-tts-engine-f5-mlx.md`                | Strip parameter tables, bug fixes, evaluation, trade-offs. Keep decision + 1-sentence trade-off + Consequences with pointers                                         | Medium | Agent relying on ADR-0008 for TTS params will no longer find them here. Must rely on `video-workflow.md`. Verified: all content already in video-workflow.md or L2.                   |
| `docs/adr/0009-vlm-qwen3-vl-mlx.md`                 | Strip API surface, key technical decisions, performance, trade-offs. Keep decision + 1-sentence + Consequences with pointers                                         | Medium | Same as 0008. Content migrating to `video-workflow.md` VLM section.                                                                                                                   |
| `docs/adr/0010-remotion-replaces-playwright.md`     | Strip migration scope, scene table, CSS mapping. Keep decision + 1-sentence alternatives + Consequences with dual-track note                                         | Medium | Agent relying on ADR-0010 for scene component mapping will no longer find it here. Code is source of truth.                                                                           |
| `docs/adr/0011-unified-venv.md`                     | Strip component table, Python version rationale, problems. Keep decision + 1-sentence + Consequences                                                                 | Low    | Decision unchanged. Details already in video-workflow.md.                                                                                                                             |
| `docs/adr/0012-cloud-gpu-kaggle-colab.md`           | Strip configs, evaluation, fix stale Lightning AI/GPU type. Keep decision + 1-sentence + Consequences with pointer                                                   | Medium | Stale content corrected. Agent will see updated state. Pointer to L2 for detail.                                                                                                      |
| `docs/adr/0013-asset-sourcing-three-layer.md`       | Strip architecture diagram, registry fields, source table, issue status. Keep decision + 1-sentence + Consequences                                                   | Medium | Agent relying on ADR-0013 for source count will no longer find it. `content-pipeline.md` has updated count.                                                                           |
| `docs/adr/0015-opencv-focus-detection.md`           | Strip API surface, output contract, key technical decisions, performance, dependencies, relationship section. Keep decision + 1-sentence alternatives + Consequences | Medium | Agent relying on ADR-0015 for output schema will no longer find it. Code is source of truth.                                                                                          |
| `docs/adr/0016-cascade-filtering-signal-density.md` | Strip tracking table, roadmap, paper citation, performance table. Keep Rule 1 + Rule 2                                                                               | Low    | Decision unchanged. Stripped content is stale/tracking, not decision.                                                                                                                 |
| `docs/DOCS-INDEX.md`                                | Update ADR table: remove 0006, add 0016, fix 0001                                                                                                                    | Low    | Index sync. No behavior impact.                                                                                                                                                       |
| `docs/video-workflow.md`                            | Add VLM section (~15 lines) + dual-track rendering note (~2 lines)                                                                                                   | Low    | Pure additions, no existing content modified. New section placed between TTS Config and Logo Handling.                                                                                |

### Section 2: Behavioral Scenarios

| #   | Scenario                                                         | Expected Behavior                                                                            | Risk | Mitigation                                                                                   |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| 1   | Agent reads ADR-0008 for F5 steps parameter                      | ADR says "see `video-workflow.md` TTS section". Agent goes to video-workflow, finds steps=32 | Low  | Pointer in Consequences. Verified video-workflow L96-118 has the value.                      |
| 2   | Agent reads ADR-0009 for VLM API                                 | ADR says "code is source of truth, see `visual-analyzer.mjs` exports"                        | Low  | Code exports are stable. Agent can grep.                                                     |
| 3   | Agent reads ADR-0012 for Lightning AI status                     | ADR says "usable, 15 credits/month. See `cloud-gpu-options.md`"                              | Low  | L2 has updated info. Memory confirms.                                                        |
| 4   | Agent reads ADR-0007 for RAG trigger points                      | ADR says "see `content-pipeline.md` Stage 2c/3b/4b"                                          | Low  | content-pipeline has correct stages.                                                         |
| 5   | Agent references "ADR-0006" in code or doc                       | ADR-0006 moved to archive. Git history preserves reference.                                  | Low  | No code references ADR-0006 by number (grep confirmed). DOCS-INDEX shows "moved to archive". |
| 6   | Agent references "ADR-0001" — which file?                        | Single file `0001-widget-inline-embedding.md`                                                | Low  | Merged file is superset. Deleted file's content preserved.                                   |
| 7   | Agent reads ADR-0016 for cascade filtering implementation status | ADR-0016 contains only Rule 1 + Rule 2 (principle). No implementation tracking.              | Low  | Tracking was stale. Agent checks code for actual implementation.                             |
| 8   | Agent reads video-workflow.md for VLM timing                     | New VLM section has: model load 12-17s, image 20-30s, video 100-120s, focus <1s              | Low  | New content, verified against ADR values (which match memory).                               |
| 9   | Agent reads video-workflow.md for rendering path                 | Pipeline Steps has dual-track note                                                           | Low  | New content.                                                                                 |
| 10  | `ls docs/adr/` after remediation                                 | 15 files (was 17: deleted 1 duplicate, moved 1 to archive)                                   | Low  | Verified: 0001 (merged) + 0002-0005 + 0007-0016 = 15 files.                                  |
| 11  | DOCS-INDEX ADR table matches `ls docs/adr/`                      | Table lists 0001-0005, 0007-0016 (0006 marked "moved to archive")                            | Low  | Manual sync.                                                                                 |
| 12  | Every ADR pointer target exists                                  | `ls` each pointer target file                                                                | Low  | Will verify during implementation.                                                           |
