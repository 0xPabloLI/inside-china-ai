# Spec: VLM Semantic Merge — Remediation (P0 + P1)

> **Spec ID**: spec-vlm-semantic-merge-remediation
> **Created**: 2026-08-18
> **Status**: implemented (2026-08-19)
> **Related**: `docs/archive/spec-vlm-semantic-merge.md` (original P3 spec)
> **Review**: `docs/reviews/vlm-semantic-merge-implementation-review.md`
> **Grill session**: 1 round, 5 decisions settled

## Problem Statement

The VLM Semantic Merge implementation (commit `a3480b1`) passes all unit and integration tests, but the implementation review (`docs/reviews/vlm-semantic-merge-implementation-review.md`) found 5 issues — 1 P0 and 4 P1 — that prevent the generated `media-patch.json` from being safely applied to scene-data, and leave Spec-defined behavior unimplemented.

**P0-1**: `asset-sourcer.mjs` overwrites `asset.path` with an absolute path before VLM analysis. `assignAssetsToScenes` then writes this absolute path into `media-patch.json`. Scene-data requires relative paths (`assets/img.jpg`), so the generated patch is unusable as-is.

**P1-1**: `scoreCandidate` only accepts `aiDescription` (string) — it never receives `subjects` (string[]). The Spec defines subjects exact match as 0-20 pts and description boundary match as 0-10 pts, but the implementation computes all 30 pts from description alone. `recommendScene` ignores `contentKind` entirely.

**P1-2**: The Spec says the pre-filter is a "soft gate" (lowConfidence assets can still be VLM-analyzed to recover), but the code hard-skips them. The Spec text and code behavior contradict each other.

**P1-3**: `asset-analysis.json` and `media-patch.json` are written to a fixed `scripts/short-video/output/` path — consecutive runs with different content overwrite each other.

**P1-4**: `experiments/vlm-focus-test-results.json` contains old `focusRegion`/`focusType` JSON format, not the current Markdown six-field protocol. It cannot serve as validation evidence for the current interface.

## Solution

Fix all 5 issues in dependency order: P0-1 first (unblocks the patch pipeline), then P1-1 (subjects/contentKind), P1-2 (pre-filter semantics), P1-3 (artifact isolation), P1-4 (legacy cleanup).

### Decision Summary (from Grill Round 1)

| ID           | Decision                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1         | Use local `absolutePath` variable for VLM/Focus calls; keep `asset.path` relative. Add defensive `relative()` normalization before writing patch.              |
| P1-1 (score) | Change `scoreCandidate` signature to `(candidate, keyword, { description, subjects })`. Subjects exact match = 0-20, description boundary match = 0-10.        |
| P1-1 (scene) | Add `contentKind → preferred visualType` mapping in `recommendScene`. `product_demo → narrative`, `talking_head → quote`. Unknown types keep current fallback. |
| P1-2         | Keep hard-skip behavior. Change archived Spec text from "soft gate" to "hard gate". Spec, code, log, and tests all say "hard gate".                            |
| P1-3         | Use content slug for isolation: `output/{contentSlug}/asset-analysis.json`. Overwrite on re-run is acceptable (P3 has no caching).                             |
| P1-4         | Mark `vlm-focus-test-results.json` as legacy (add a header comment). Current validation evidence is in `experiments/vlm-p3-validation/`.                       |

## User Stories

1. As a pipeline operator, I want `media-patch.json` to contain relative asset paths (`assets/img.jpg`), so that I can copy-paste them directly into scene-data.mjs without manual path editing.

2. As a developer, I want `scoreCandidate` to accept a `{ description, subjects }` object, so that VLM subjects can drive semantic matching as the Spec intended (0-20 pts for subjects exact match).

3. As a developer, I want `recommendScene` to read `asset.contentKind`, so that `product_demo` assets prefer narrative scenes and `talking_head` assets prefer quote scenes.

4. As a pipeline operator, I want the pre-filter gate to be consistently described as a hard gate across Spec, code, and tests, so that there is no contradiction between documentation and behavior.

5. As a pipeline operator, I want `asset-analysis.json` and `media-patch.json` written to `output/{contentSlug}/`, so that running the pipeline for different content doesn't overwrite previous artifacts.

6. As a developer, I want the old `vlm-focus-test-results.json` marked as legacy, so that no one confuses it with current VLM protocol validation evidence.

7. As a developer, I want a new end-to-end test that verifies: relative asset path → `analyzeAssets` → `assignAssetsToScenes` → patch with relative `media.path`, so that the P0 path conflict can never silently regress.

8. As a developer, I want tests that prove `subjects` exact match increases score when `description` does not contain the keyword, so that subjects-driven scoring is verified independently.

9. As a developer, I want tests for `contentKind → preferred visualType` mapping in `recommendScene`, including unknown-type fallback, so that scene recommendation is verifiable.

## Implementation Decisions

### 1. P0-1: Path isolation — local `absolutePath`, keep `asset.path` relative

In `asset-sourcer.mjs` `main()`:

- Remove the loop that mutates `asset.path` to absolute (lines ~1952-1955).
- In `analyzeAssets()`: use a local `absolutePath` variable computed from `asset.path` (resolved against content dir passed via opts) for VLM/Focus calls. `asset.path` stays relative.
- Before writing `media-patch.json`: add a normalization pass — `relative(contentDir, asset.path)` for any path that is absolute. If the result starts with `..`, throw (path escape detected).
- `analyzeAssets` needs a new `contentDir` option to resolve relative paths.

### 2. P1-1a: `scoreCandidate` signature change

Old: `scoreCandidate(candidate, keyword, aiDescription)`
New: `scoreCandidate(candidate, keyword, semantics)` where `semantics = { description?: string, subjects?: string[] }`

Scoring logic:

- **Subjects match (0-20)**: for each keyword, check if keyword appears in `subjects` array (case-insensitive exact match, not substring). Full keyword match = 20 pts. Per-token match (keyword is multi-word, tokens match subjects) = proportional.
- **Description match (0-10)**: keyword boundary match in description string (existing logic).
- `relevanceScore = min(subjectsScore + descriptionScore, 30)`.
- Backward compat: if `semantics` is a string (old call sites), treat as `{ description: semantics }`.

### 3. P1-1b: `recommendScene` contentKind mapping

Add a mapping table:

```
CONTENT_KIND_PREFERENCE = {
  product_demo: "narrative",
  talking_head: "quote",
  // landscape, chart, text_screenshot, other: no preference (use current logic)
}
```

In `recommendScene`: if `asset.contentKind` has a preferred `visualType`, scan scenes for that type first. If no match found (all scenes of that type are taken), fall through to current logic.

### 4. P1-2: Unify pre-filter as hard gate

- Update the archived Spec (`docs/archive/spec-vlm-semantic-merge.md`) section 3: change "Soft gate" text to "Hard gate — assets with `technicalScore < 30` are skipped from VLM analysis to save inference cost. This may miss assets with poor metadata but visually relevant content; P7 caching layer can add retry logic."
- Update `analyzeAssets` JSDoc: "hard gate" instead of "soft gate".
- No code behavior change (already hard-skips). No test change (already tests hard skip).

### 5. P1-3: Artifact isolation by content slug

In `asset-sourcer.mjs` `main()`:

- Change `outputDir` from `join(__dirname, "..", "output")` to `join(__dirname, "..", "output", contentSlug)`.
- `asset-analysis.json` and `media-patch.json` both go to `output/{contentSlug}/`.
- `review-media-patch.mjs` default analysis path also updates to `output/{contentSlug}/asset-analysis.json` (via CLI `--content` arg or `--analysis` arg).

### 6. P1-4: Legacy experiment file

- Add a header comment to `experiments/vlm-focus-test-results.json` (rename to `vlm-focus-test-results.legacy.json` for clarity).
- Current validation evidence: `experiments/vlm-p3-validation/report.md` and `vlm-p3-node-results.json`.

## Testing Decisions

### Test Seams (3 total)

1. **Pure function seam** (`asset-sourcer.test.mjs`) — test new `scoreCandidate` signature with `{ description, subjects }` object. Test subjects exact match scoring (0-20) and description boundary match (0-10). Test `recommendScene` with `contentKind` mapping + unknown fallback. ~10 new tests.

2. **Integration seam** (`asset-sourcer-visual-integration.test.mjs`) — test `analyzeAssets` with `contentDir` option resolving relative paths. Test that `asset.path` stays relative after analysis. Test `asset-analysis.json` artifact written to `output/{contentSlug}/`. ~5 new tests.

3. **End-to-end path contract** (new test in `asset-sourcer.test.mjs`) — construct relative-path assets → `analyzeAssets` (mocked VLM) → `assignAssetsToScenes` → assert `media.path` is relative. ~3 new tests.

### Scenario & Risk Verification Matrix

#### Section 1: Modified Files Impact

| File                                             | Modification                                                                                                                                                                                                                                 | Risk       | Assessment                                                                                                                                                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asset-sourcer.mjs`                              | Remove path mutation loop; add `contentDir` to `analyzeAssets`; add relative-path normalization before patch write; change `scoreCandidate` signature; add contentKind mapping to `recommendScene`; change output dir to content-slug-scoped | **High**   | Core orchestration changes. `scoreCandidate` signature change affects all callers. Path change affects VLM/Focus calls. Worst case: VLM can't find file → degraded result (same as current). Patch normalization prevents path escape. |
| `review-media-patch.mjs`                         | Default analysis path changes to content-slug-scoped                                                                                                                                                                                         | **Low**    | Presentation-only. Reads fields, formats for human.                                                                                                                                                                                    |
| `asset-sourcer.test.mjs`                         | Update `scoreCandidate` tests for new signature; add subjects/contentKind tests; add end-to-end path contract tests                                                                                                                          | **Medium** | Score values change due to subjects scoring. All expected values recalculated.                                                                                                                                                         |
| `asset-sourcer-visual-integration.test.mjs`      | Update mocks for `contentDir` option; add relative-path preservation tests; add artifact isolation tests                                                                                                                                     | **Medium** | Mock interface changes.                                                                                                                                                                                                                |
| `docs/archive/spec-vlm-semantic-merge.md`        | Change "soft gate" to "hard gate"                                                                                                                                                                                                            | **Low**    | Archived doc, no code impact.                                                                                                                                                                                                          |
| `experiments/vlm-focus-test-results.legacy.json` | Rename from `.json` to `.legacy.json`                                                                                                                                                                                                        | **Low**    | Gitignored, no code impact.                                                                                                                                                                                                            |

#### Section 2: Behavioral Scenarios

| #   | Scenario                                                                                         | Expected Behavior                                                                                            | Risk   | Mitigation                                                 |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------- |
| 1   | Asset with relative path `assets/img.jpg` → `analyzeAssets` with `contentDir`                    | VLM/Focus receives `join(contentDir, 'assets/img.jpg')`; `asset.path` stays `assets/img.jpg`                 | Low    | Local `absolutePath` variable, no mutation of `asset.path` |
| 2   | `media-patch.json` after `assignAssetsToScenes`                                                  | `media.path` is relative (`assets/img.jpg`)                                                                  | Medium | Defensive `relative()` normalization before write          |
| 3   | Asset path is already absolute (edge case)                                                       | `relative(contentDir, path)` normalizes it; if result starts with `..`, throw                                | Medium | Path escape guard                                          |
| 4   | `scoreCandidate` with `{ description: "robot lab", subjects: ["unitree"] }`, keyword `"Unitree"` | subjects exact match (case-insensitive) = 20 pts; description has no "unitree" → 0 pts; total relevance = 20 | Low    | New scoring logic tested in pure function seam             |
| 5   | `scoreCandidate` with `{ description: "Unitree robot", subjects: [] }`, keyword `"Unitree"`      | subjects empty → 0 pts; description boundary match = 10 pts; total = 10                                      | Low    | Per-field independence                                     |
| 6   | `scoreCandidate` called with string (backward compat)                                            | Treats as `{ description: string }`; subjects = 0 pts; works as before                                       | Medium | Type check: `typeof semantics === 'string'` → wrap         |
| 7   | `recommendScene` with `contentKind: "product_demo"`                                              | Prefers `narrative` scene over `info-card`                                                                   | Low    | Mapping table + fallback                                   |
| 8   | `recommendScene` with `contentKind: "talking_head"`                                              | Prefers `quote` scene                                                                                        | Low    | Mapping table                                              |
| 9   | `recommendScene` with `contentKind: null` or unknown                                             | Falls back to current logic (no preference)                                                                  | Low    | Unknown types = no preference                              |
| 10  | `recommendScene` with `contentKind: "product_demo"` but all narrative scenes taken               | Falls through to current logic (next available scene)                                                        | Low    | Graceful degradation                                       |
| 11  | Pre-filter: `lowConfidence = true` asset                                                         | Hard-skipped from VLM analysis (not in `analyzableAssets`)                                                   | Low    | Already current behavior; just Spec text update            |
| 12  | `asset-analysis.json` output path                                                                | Written to `output/{contentSlug}/asset-analysis.json`                                                        | Low    | Content slug in path                                       |
| 13  | `media-patch.json` output path                                                                   | Written to `output/{contentSlug}/media-patch.json`                                                           | Low    | Same content slug                                          |
| 14  | Re-run same content slug                                                                         | Overwrites previous artifacts (acceptable for P3)                                                            | Low    | No caching in P3                                           |
| 15  | Different content slug runs                                                                      | Separate directories, no overwrite                                                                           | Low    | Path isolation                                             |
| 16  | `review-media-patch.mjs --content foo`                                                           | Reads `output/foo/asset-analysis.json`                                                                       | Low    | CLI arg plumbing                                           |
| 17  | `scoreCandidate` with subjects containing keyword as substring (not exact)                       | No match (subjects match is exact, case-insensitive)                                                         | Medium | Exact match, not `includes()`                              |
| 18  | Multi-word keyword `"Alibaba Cloud"` with subjects `["alibaba", "cloud", "infrastructure"]`      | Per-token match: 2/2 tokens match = proportional score                                                       | Low    | Tokenized subjects matching                                |

## Out of Scope

1. P7 content-addressed caching (separate ticket)
2. P4 video temporal windowing (separate ticket)
3. Changing the pre-filter threshold value (30) — only unifying Spec/code text
4. Auto-applying patches to scene-data.mjs (still human-review checkpoint)
5. `vlm-p3-validation` Test 1 and 4 (need real VLM model — manual run)

## Further Notes

### Path isolation design rationale

Using local `absolutePath` instead of mutating `asset.path` is the root fix. The defensive `relative()` normalization is belt-and-suspenders: if some future code path accidentally mutates `asset.path` to absolute again, the patch writer catches it. The `..` escape check prevents a malicious or buggy path from writing outside the content directory.

### scoreCandidate backward compatibility

The old signature `scoreCandidate(candidate, keyword, aiDescription)` is used in ~4 call sites. The new signature `scoreCandidate(candidate, keyword, semantics)` accepts both the new `{ description, subjects }` object and the old string (detected via `typeof`). This means call sites that pass a string still work (subjects = 0 pts), but new call sites can pass the full object. All existing call sites should be updated to pass the new object shape.

### contentKind mapping is minimal

Only 2 mappings (`product_demo → narrative`, `talking_head → quote`) to keep the change small and testable. Other contentKind values (`landscape`, `chart`, `text_screenshot`, `other`) have no scene preference — they use the current greedy assignment logic. More mappings can be added later if needed.
