# 05 — Verify-retry loop

**What to build:** The `verifyWithRetry()` function in `lib/verify-retry.mjs` that wraps `verifySubtitles()` with a bounded retry loop. On FAIL: classify the failure via `classifyFailure()`, dispatch the appropriate repair action (using `applyDriftCorrection()` for audio drift, `runWhisperAlignment()` + `regenerateSubtitles()` for alignment, `relaxGapParams()` for cue gaps), re-burn subtitles from the presubs/raw video, then re-verify. Only accept repairs where `summary.errors` strictly decreased; otherwise rollback to pre-repair state. Log each attempt with category, repair action, and errors-before→errors-after. On final FAIL, write diagnostics bundle (existing behavior).

**Blocked by:** 02 (failure classifier), 03 (audio drift compensation), 04 (cue gap relaxation)

**Status:** ready-for-agent

- [ ] `verifyWithRetry()` calls `verifySubtitles()` and returns immediately on PASS
- [ ] On FAIL, classifies via `classifyFailure()` and dispatches repair
- [ ] Audio-sync drift repair: extracts drift values, calls `applyDriftCorrection()`, re-renders `.ass`, re-burns from presubs/raw
- [ ] Subtitle alignment repair: re-runs `runWhisperAlignment()`, calls `regenerateSubtitles()`, re-burns
- [ ] Cue gap repair: calls `relaxGapParams()`, re-runs `buildCues()` with relaxed params, re-burns
- [ ] Repair only accepted if `summary.errors < previousErrors` (strict decrease)
- [ ] On rollback, pre-repair `videoPath` and `assPath` are restored
- [ ] Logs: attempt N/max, category, repair action, errors before→after, accepted/rolled back
- [ ] After max retries, writes diagnostics bundle and returns final report
- [ ] Handles repair action crashes (try/catch, returns `{ success: false }`)
- [ ] Checks file pre-conditions before repair (presubs/raw exists, audio files exist)
- [ ] Tests cover spec matrix: #1-8, #12, #13, #15, #16
