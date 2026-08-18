# 02 — Patch Application + Atomic Write + Backup + Rollback

**What to build:** The core mutation logic — regex-based insert/replace of `media` fields in `scene-data.mjs` text, with backup, atomic write (`.tmp` → `rename`), post-apply `validateMedia()` check, and rollback on failure.

**Blocked by:** 01 — Validation + Conflict Detection Pure Functions

**Status:** ready-for-agent

- [ ] `applyPatchesToText(fileContent, patches, options)` exported from `apply-media-patch.mjs`:
  - For each valid patch entry: locate scene by `id: <sceneId>`, insert `media: { ... },` before `voiceover:` field (if no existing media), or replace existing `media: { ... }` block (if `--force`)
  - Returns `{ modifiedContent, applied: [], skipped: [], errors: [] }`
  - Does not write to disk — pure text transformation
- [ ] `main(args)` orchestration:
  - Parse CLI args (`--content`, `--patch`, `--dry-run`, `--force`)
  - Read patch JSON + scene-data.mjs
  - Validate all entries (T1 functions) — abort if any error, no mutation
  - Backup `scene-data.mjs` → `scene-data.mjs.bak`
  - Apply patches to text in memory
  - Atomic write: `scene-data.mjs.tmp` → `rename`
  - Run `validateMedia()` on each modified scene
  - If validation errors: restore original, mark receipt "rolled back"
- [ ] Tests cover scenarios #1 (standard insert), #5 (force replace), #11 (missing patch file), #12 (missing scene-data), #13 (duplicate scene entries), #14 (re-run idempotent), #15 (rollback on validation error), #16 (warnings non-blocking), #19 (force + containment fail), #20 (non-standard format)
