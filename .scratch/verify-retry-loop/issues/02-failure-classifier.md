# 02 — Failure classifier

**What to build:** A pure function `classifyFailure(report)` that inspects a verification report and returns a failure category string: `"subtitle-alignment"`, `"audio-sync-drift"`, `"cue-gaps"`, `"audio-sync-skipped"`, or `"unknown"`. Returns `null` when the report passes. When multiple categories fail, the one with the most errors is chosen; ties broken by priority (audio-sync-drift > subtitle-alignment > cue-gaps).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `classifyFailure(report)` returns `null` when `summary.passed === true`
- [ ] Returns `"audio-sync-drift"` when `report.audioSync` has scenes with `ok: false`
- [ ] Returns `"subtitle-alignment"` when `wordSequence.matches === false`
- [ ] Returns `"cue-gaps"` when `gaps.violations.length > 0`
- [ ] Returns `"audio-sync-skipped"` when `audioSync.checked === 0 && audioSync.skipped > 0`
- [ ] Returns `"unknown"` for any other FAIL pattern
- [ ] When multiple categories fail, picks the one with most errors
- [ ] Handles null/undefined report fields gracefully (no crash)
- [ ] Tests cover all scenarios from spec matrix: #1 (PASS), #6 (multiple), #13 (skipped), #17 (empty fields)
