# Code Review: video-understand.mjs

> Date: 2026-08-25
> Commit: 87d861c
> Spec: docs/archive/spec-video-understand.mjs.md
> Tickets: docs/archive/tickets-video-understand/

## Standards Axis

### Findings

1. **Prettier formatting** — 45 Prettier errors in initial write (test + impl). All auto-fixed via `eslint --fix`. Zero remaining.
2. **Code conventions** — Follows project patterns:
   - `execAsync` pattern matches `post-process.mjs`
   - 2-space indentation, camelCase vars, PascalCase types
   - Mock pattern matches `upscale.test.mjs`
3. **Fowler smells** — None detected:
   - No Duplicated Code (each function has distinct responsibility)
   - No Feature Envy (functions operate on their own data)
   - No Speculative Generality (no unused params/abstractions)
4. **Module structure** — Clean separation: pure functions (`detectPlatform`, `parseVideoMeta`, `parseWhisperOutput`) are testable without I/O; orchestration functions (`downloadVideo`, `transcribeVideo`, `understandVideo`) are tested with mocks.

### Verdict

**Pass** — 0 violations after formatting fix.

## Spec Axis

### Findings

1. **All 23 scenario matrix rows covered** — 36 tests total
2. **All 6 exported functions implemented** — `detectPlatform`, `parseVideoMeta`, `parseWhisperOutput`, `downloadVideo`, `transcribeVideo`, `understandVideo`
3. **Degradation paths verified**:
   - Download failure → `status: "error"` (scenario #10, test: "returns error status when download fails")
   - whisper-cli unavailable → `transcript: null`, `status: "degraded"` (scenario #7, test: "degrades gracefully")
   - VLM unavailable → reuses `DEGRADED_RESULT` from visual-analyzer.mjs (scenario #9)
   - Both fail → `status: "degraded"` (scenario #23)
4. **Options handling** — defaults verified (scenario #13), `transcript=false` (scenario #14), `visual=false` (scenario #15), `writeFile=false` (scenario #19)
5. **Cross-step contracts**:
   - videoPath → ffmpeg (scenario #20): file existence checked before ffmpeg
   - audioPath → whisper (scenario #21): file existence checked before whisper
   - whisper JSON → transcript (scenario #22): `parseWhisperOutput` pure function tested

### Out of scope items correctly omitted

- LLM-generated summary (`summary: null`)
- Douyin download
- Batch processing
- Caching

### Verdict

**Pass** — All spec requirements implemented and tested.

## Summary

- Standards: 0 findings (after formatting fix)
- Spec: 0 findings (all requirements covered)
- Total: 36/36 tests passing
