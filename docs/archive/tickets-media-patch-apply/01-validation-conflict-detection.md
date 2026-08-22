# 01 — Validation + Conflict Detection Pure Functions

**What to build:** The validation layer that checks a media-patch entry before any file mutation — schema validation, scene existence, path containment, media type, conflict detection (none / already-applied / conflict), and idempotency check.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `validatePatchEntry(entry, scenes)` exported from `apply-media-patch.mjs`:
  - Checks `entry.sceneId` is a number and exists in `scenes`
  - Checks `entry.media` is an object with `type` ∈ ["image", "video"] and non-empty `path`
  - Path containment: `resolve(contentDir, media.path)` starts with `contentDir + path.sep` — rejects absolute paths, `../` traversal, `~` prefixes
  - Returns `{ valid: boolean, errors: string[], reason?: string }`
- [ ] `detectConflict(patchMedia, existingMedia)` exported:
  - Returns `"none"` if no existing media
  - Returns `"already-applied"` if `type` + `path` match (idempotency)
  - Returns `"conflict"` if media exists but differs
- [ ] Tests cover scenarios #3 (conflict), #4 (already-applied), #7 (absolute path), #8 (traversal), #9 (invalid type), #10 (scene not found), #17 (null media)
