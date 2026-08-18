# 03 — Receipt + Dry-Run Output

**What to build:** The reporting layer — `media-receipt.json` generation and `--dry-run` console output formatting, completing the full end-to-end workflow.

**Blocked by:** 02 — Patch Application + Atomic Write + Backup + Rollback

**Status:** ready-for-agent

- [ ] `generateReceipt(applied, skipped, meta)` exported from `apply-media-patch.mjs`:
  - Returns receipt object with `appliedAt`, `content`, `patchFile`, `backupPath`, `applied[]`, `skipped[]`, `summary{}`
  - Written to `output/media-receipt.json` after successful application
- [ ] `formatDryRun(applied, skipped)` exported:
  - Returns human-readable string with per-scene diff (`+` add, `!` conflict, `=` already-applied, `-` skip) and summary line
  - `--dry-run` mode: prints this, writes nothing
- [ ] Tests cover scenarios #2 (dry-run no mutation), #6 (unassigned skipped in receipt), #18 (empty patch array)
- [ ] End-to-end test: run `main(['--content', 'test-slug', '--dry-run'])` and verify no files modified, console output correct
