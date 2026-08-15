# 04 — Archive Stale Spec/Tickets from docs/ Root

**What to build:** Move 7 completed spec/tickets files from `docs/` root to `docs/archive/`. One file has a duplicated `tickets-` prefix in its name and is renamed during the move. Update `docs/archive/README.md` with 7 new entries. Grep-check for any other docs that reference the old paths and update if found.

**Blocked by:** None — can start immediately (independent of doc structure changes).

**Status:** ready-for-agent

Files to move:
- `docs/spec-asset-sourcer.md` → `docs/archive/spec-asset-sourcer.md`
- `docs/spec-media-fullscreen-mode.md` → `docs/archive/spec-media-fullscreen-mode.md`
- `docs/spec-voice-prosody-optimization.md` → `docs/archive/spec-voice-prosody-optimization.md`
- `docs/tickets-asset-sourcer.md` → `docs/archive/tickets-asset-sourcer.md`
- `docs/tickets-media-fullscreen-mode.md` → `docs/archive/tickets-media-fullscreen-mode.md`
- `docs/tickets-tickets-remotion-frame-verification.md` → `docs/archive/tickets-remotion-frame-verification.md` (rename: remove duplicate prefix)
- `docs/tickets-voice-prosody-optimization.md` → `docs/archive/tickets-voice-prosody-optimization.md`

- [ ] All 7 files moved to `docs/archive/`
- [ ] `tickets-tickets-remotion-frame-verification.md` renamed to `tickets-remotion-frame-verification.md` during move
- [ ] `docs/archive/README.md` updated with 7 new entries
- [ ] grep-check completed: no other docs reference the old paths (if found, references updated)
- [ ] No file contents are modified during the move
