# 02 — Extract Gapless Audio Track from video-workflow.md to L2

**What to build:** Move the "Gapless Audio Track (Drift Fix v2 — supersedes the AAC priming fix)" section (~30 lines of technical fault diagnosis narrative) from `docs/video-workflow.md` (L1) to a new file `docs/research/audio-drift-fix.md` (L2). Replace the L1 section with 2-3 lines of execution-level description + pointer. Add the new file to video-workflow.md's Design Decisions & References table.

**Blocked by:** 01 — Layer Placement Rules must exist first so the extraction follows the new rules.

**Status:** ready-for-agent

- [ ] `docs/research/audio-drift-fix.md` exists with full Gapless Audio Track content
- [ ] `docs/video-workflow.md` original section replaced with 2-3 line execution description
- [ ] Pointer to `docs/research/audio-drift-fix.md` is in the replacement text
- [ ] Design Decisions & References table at bottom of video-workflow.md has new row: `Audio drift fix | docs/research/audio-drift-fix.md | Root cause analysis, fix implementation, sync verification, diagnostics`
- [ ] No information is lost — every point in the original section has a corresponding point in the new file
- [ ] video-workflow.md remains executable-level: no fault diagnosis narrative remains
