# 06 — Wire loop into main.mjs

**What to build:** Replace the direct `verifySubtitles()` call in `main.mjs` Step 6 with `verifyWithRetry()`. Add `--max-retries N` CLI flag (default 2, parsed via existing `getArg()` pattern). `--max-retries 0` preserves exact current behavior (single-shot verify). `--skip-verify` and "no subtitles" paths remain unchanged. The returned `{ report, videoPath }` from `verifyWithRetry()` updates `result.path` if repair changed the video file.

**Blocked by:** 01 (Remotion audio fix), 05 (verify-retry loop)

**Status:** ready-for-agent

- [ ] `main.mjs` Step 6 calls `verifyWithRetry()` instead of `verifySubtitles()`
- [ ] `--max-retries` flag parsed, default 2
- [ ] `--max-retries 0` = single-shot verify (same as current behavior)
- [ ] `--skip-verify` path unchanged
- [ ] "No subtitles generated" path unchanged
- [ ] Final FAIL still writes diagnostics bundle and exits(1)
- [ ] `result.path` updated if repair re-burned the video
- [ ] Tests cover spec matrix: #9, #10, #11, #16, #19
