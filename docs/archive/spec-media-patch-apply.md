# Spec: Media-Patch Apply Workflow

## Problem Statement

`asset-sourcer.mjs` can search, download, VLM-analyze, and auto-assign media assets to scenes, outputting `media-patch.json`. The pipeline stops there: approved recommendations still require manual transcription into `content/<slug>/scene-data.mjs`. This gap makes the asset-sourcing → rendering handoff fragile and labor-intensive.

## Solution

Add a safe, reviewable `apply-media-patch.mjs` command that reads a reviewed `media-patch.json` and writes the approved media assignments into the corresponding `scene-data.mjs`, with backup, validation, atomic write, rollback, and receipt generation.

## User Stories

1. As an agent, I want to apply a media-patch.json to scene-data.mjs in one command, so that the renderer can use approved media assignments without manual transcription.
2. As an agent, I want a `--dry-run` mode that shows every planned assignment, skip, and conflict without touching files, so that I can verify the patch before mutation.
3. As an agent, I want path containment checks that reject absolute paths and `../` traversal, so that a malformed or tampered patch cannot write files outside the content directory.
4. As an agent, I want existing `scene.media` fields preserved by default, so that re-running a patch does not silently overwrite previously chosen media.
5. As an agent, I want a `--force` flag to overwrite existing media when I explicitly opt in, so that I can replace assignments I no longer want.
6. As an agent, I want a backup file created before mutation, so that I can recover scene-data.mjs if anything goes wrong.
7. As an agent, I want `validateMedia()` re-run after application, so that I know the applied media passes pre-render checks.
8. As an agent, I want a `media-receipt.json` recording every applied, skipped, and conflicting entry, so that each change is traceable to its source patch.
9. As an agent, I want re-running the same patch to be safe (idempotent), so that duplicate runs do not duplicate or silently alter media assignments.
10. As an agent, I want patch entries with `status: "unassigned"` to be skipped, so that only assigned entries are applied.
11. As an agent, I want validation to happen before any file mutation, so that an invalid patch does not partially modify scene-data.mjs.
12. As an agent, I want the default patch path to be `output/media-patch.json`, so that I do not need to specify `--patch` when running the standard asset-sourcer flow.

## Implementation Decisions

### Module structure

- New entry point: `scripts/short-video/apply-media-patch.mjs`
- Pure functions are exported from the same file (following the `asset-sourcer.mjs` pattern — no separate lib file)
- Import `validateMedia` from `lib/media-bg.mjs` (no modification to media-bg)
- No new dependencies: Node.js standard library only (`fs`, `path`, `url`)

### CLI interface

```
node apply-media-patch.mjs --content <slug> [--patch <path>] [--dry-run] [--force]
```

- `--content <slug>` (required): content directory slug, resolves to `content/<slug>/`
- `--patch <path>` (optional, default `output/media-patch.json`): path to the patch JSON
- `--dry-run`: no file mutation, print planned changes
- `--force`: overwrite existing media fields (default: preserve, report conflict)

### Patch input schema

The patch is a JSON array (output of `assignAssetsToScenes()` in `asset-sourcer.mjs`). Each entry:

```json
{
  "sceneId": 2,
  "sceneName": "ipo-details",
  "visualType": "narrative",
  "media": {
    "type": "video",
    "path": "assets/unitree-demo.mp4",
    "source": "Unitree Robotics",
    "animation": "fade",
    "overlay": 0.7
  },
  "assetScore": 85,
  "source": "pexels",
  "attribution": { ... },
  "status": "assigned"
}
```

Only entries with `status === "assigned"` and a non-null `media` object are processed. All others are skipped and recorded in the receipt.

### Validation pipeline (all before mutation)

1. **Patch schema**: each processed entry must have `sceneId` (number), `media` (object with `type` and `path`)
2. **Scene existence**: `sceneId` must match a scene in `scene-data.mjs`
3. **Path containment**: `resolve(contentDir, media.path)` must start with `contentDir + path.sep`. Rejects absolute paths, `../`, `~`
4. **Media type**: `media.type` must be `"image"` or `"video"`
5. **Conflict detection**: if scene already has `media` and `--force` is not set → conflict (skip)
6. **Idempotency**: if scene already has `media` with same `type` + `path` → already-applied (skip, no write)

If any validation error occurs, NO files are modified. All validation runs before mutation.

### scene-data.mjs modification strategy

`scene-data.mjs` is an ES module (`export const scenes = [...]`). Modification uses regex-based replacement:

- **Insert** (no existing media): locate the scene object by `id: <sceneId>`, insert `media: { ... },` before the `voiceover:` field
- **Replace** (existing media + `--force`): find the `media: { ... }` block within the scene object and replace it
- Regex pattern: locate `{ id: <sceneId>,` to start scene block; find `media:\s*\{[^}]*\}` for replacement; find `voiceover:` for insertion point

### Atomic write + backup + rollback

1. Read original `scene-data.mjs` → save as `originalContent`
2. Write backup: `scene-data.mjs.bak`
3. Apply all patches in memory → `modifiedContent`
4. If any step errors → do not write, keep backup, exit with error
5. Write `modifiedContent` to `scene-data.mjs.tmp` → `rename` to `scene-data.mjs`
6. Write `media-receipt.json`
7. Run `validateMedia()` on each modified scene
8. If validation errors: restore `originalContent` to `scene-data.mjs`, keep receipt (marked as "rolled back"), exit with error
9. `.bak` file is retained (not auto-deleted)

### Receipt format

```json
{
  "appliedAt": "ISO timestamp",
  "content": "<slug>",
  "patchFile": "<path>",
  "backupPath": "content/<slug>/scene-data.mjs.bak",
  "applied": [
    { "sceneId": 2, "sceneName": "ipo-details", "action": "added|replaced", "media": { ... } }
  ],
  "skipped": [
    { "sceneId": 3, "reason": "unassigned|conflict|already-applied|invalid_type|invalid_path|scene_not_found" }
  ],
  "summary": { "total": 10, "applied": 3, "skipped": 5, "conflicts": 2 }
}
```

### Dry-run output format

```
Scene 2 (ipo-details, narrative):
  + media: { type: "video", path: "assets/unitree-demo.mp4", animation: "fade", overlay: 0.7 }

Scene 4 (company-background, info-card):
  ! CONFLICT: existing media → skipping (use --force to overwrite)

Scene 5 (products, narrative):
  = ALREADY APPLIED: media matches existing, no change

Scene 9 (china-dominance, stat-reveal):
  - SKIP: status "unassigned" in patch

Summary: 1 to add, 0 to replace, 1 conflict, 1 already applied, 1 skipped
```

## Testing Decisions

### Test seam

Pure functions exported from `apply-media-patch.mjs`, tested via direct import. Following the `asset-sourcer.test.mjs` pattern.

### Functions to test

- `validatePatchEntry(entry, scenes)` — schema, scene existence, path containment, media type
- `detectConflict(patchMedia, existingMedia)` — returns "none" | "already-applied" | "conflict"
- `applyPatchesToText(fileContent, patches, options)` — regex-based insert/replace, returns modified text
- `generateReceipt(applied, skipped, meta)` — receipt object construction
- `formatDryRun(applied, skipped)` — dry-run console output

### Prior art

- `scripts/short-video/__tests__/asset-sourcer.test.mjs` — same import-and-test pure functions pattern
- `scripts/short-video/__tests__/media-bg.test.mjs` — `validateMedia` is already tested there

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `scripts/short-video/apply-media-patch.mjs` | New file | N/A | No existing code affected |
| `scripts/short-video/__tests__/apply-media-patch.test.mjs` | New file | N/A | No existing code affected |
| `scripts/short-video/content/*/scene-data.mjs` | Runtime modification by the script | Medium | Protected by backup + atomic write + validateMedia rollback. Worst case: `.bak` file preserves original. No code file is modified. |
| `scripts/short-video/lib/media-bg.mjs` | Not modified | — | Only imports `validateMedia()` |
| `scripts/short-video/lib/asset-sourcer.mjs` | Not modified | — | Patch format is consumed as-is |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Patch with all entries `status: "assigned"`, scenes have no existing media | All media fields inserted into scene-data.mjs | Low | Standard path — most common case |
| 2 | `--dry-run` flag | No files modified; per-scene diff printed to console | Low | Dry-run writes nothing |
| 3 | Scene already has `media` with different `type` or `path`, no `--force` | Entry marked as `conflict`, skipped, no modification | Medium | Default preserve behavior prevents overwrite |
| 4 | Scene already has `media` with same `type` and `path` | Entry marked as `already-applied`, skipped, no modification | Low | Idempotency check prevents duplicate writes |
| 5 | Scene already has `media`, `--force` flag set | Existing `media` block replaced with new one | Medium | Backup file + rollback on validation failure |
| 6 | Patch entry has `status: "unassigned"` | Entry skipped, recorded in receipt as `skipped: "unassigned"` | Low | Non-assignment entries are never applied |
| 7 | Patch entry `media.path` is absolute (`/etc/passwd`) | Validation error, entry skipped, no mutation | High | Path containment check rejects before any write |
| 8 | Patch entry `media.path` contains `../` traversal | Validation error, entry skipped, no mutation | High | Path containment check resolves and compares prefix |
| 9 | Patch entry `media.type` is `"audio"` (invalid) | Validation error, entry skipped | Low | Type check rejects non-image/video |
| 10 | Patch entry `sceneId` not found in scene-data.mjs | Validation error, entry skipped | Low | Scene existence check |
| 11 | Patch file missing or not JSON | Script exits with error, no files touched | Low | File read + JSON.parse in try/catch |
| 12 | scene-data.mjs missing | Script exits with error | Low | File existence check |
| 13 | Multiple patch entries for same scene | Only first processed; subsequent marked as `conflict` or `already-applied` | Medium | In-memory tracking of applied scene IDs |
| 14 | Re-run same patch after successful apply | All entries marked `already-applied`, no writes | Low | Idempotency via type+path comparison |
| 15 | `validateMedia()` returns errors after write | scene-data.mjs restored from backup, receipt marked "rolled back" | High | Rollback + backup preservation |
| 16 | `validateMedia()` returns warnings (not errors) after write | scene-data.mjs kept (warnings are non-blocking), warnings in receipt | Low | Warnings are acceptable (e.g., file not found yet) |
| 17 | Patch entry `media` is null or undefined | Entry skipped as `unassigned` (or `invalid` if status is assigned but media is null) | Low | Null check before field access |
| 18 | Patch is empty array `[]` | No changes, receipt with 0 applied, 0 skipped | Low | Empty array is valid — no-op |
| 19 | Scene has `media` field but `--force` replaces it, new media fails containment | Entire patch rejected (validation before mutation) | Medium | All validation runs before any write |
| 20 | `scene-data.mjs` has non-standard formatting (single-line scene objects) | Regex may fail to locate scene; error reported, no mutation | Medium | Regex strategy documented; non-standard format is out of scope |

## Out of Scope

- `scoreCandidate()` optimization (see `docs/reviews/scorecandidate-review.md` — P1/P2 findings tracked separately)
- Asset discovery, VLM analysis, scene matching logic (already in `asset-sourcer.mjs`)
- Automatic approval or auto-apply immediately after sourcing
- Full Media-First Pipeline orchestration and visual storyboard/editor UI
- Non-standard `scene-data.mjs` formatting (single-line objects, string IDs)
- Concurrent file editing protection (short-running script, same as any build tool)

## Further Notes

- Patch quality depends on upstream `scoreCandidate()` and VLM analysis. Known issues documented in `docs/reviews/scorecandidate-review.md` (P1: wrong keyword for re-scoring, 100-point cap neutralizes AI score). These affect patch recommendation quality but not the apply mechanism.
- The `apply-media-patch.mjs` is format-agnostic: it does not care whether the patch was reviewed by a human, an agent, or auto-applied. The "reviewed" in the issue title refers to the intent that someone (human or agent) has decided the patch is ready before running apply.
