# 04 — Cue gap relaxation

**What to build:** A pure function `relaxGapParams(attempt)` that returns relaxed gap parameters based on the retry attempt number. Attempt 0 = default params (`GAP_THRESHOLD = 0.5`, `CHAIN_GAP_FRAMES = 2`). Attempt 1 = `GAP_THRESHOLD = 0.6`, `CHAIN_GAP_FRAMES = 2`. Attempt 2 = `GAP_THRESHOLD = 0.7`, `CHAIN_GAP_FRAMES = 1`. Returns `null` after attempt 2 (no further relaxation possible). The returned params are used to re-run `buildCues()` with adjusted constants.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `relaxGapParams(0)` returns default gap parameters
- [ ] `relaxGapParams(1)` increases `GAP_THRESHOLD` by 0.1s
- [ ] `relaxGapParams(2)` reduces `CHAIN_GAP_FRAMES` to 1
- [ ] `relaxGapParams(3)` returns `null` (exhausted)
- [ ] Function is pure (no side effects, no global state mutation)
- [ ] Tests cover spec matrix: #5 (cue gap repair)
