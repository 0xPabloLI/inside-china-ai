# 06 — Scene-Data Claim IDs & Verify Integration

**What to build:** Extend scene-data to optionally carry `claimIds` on scenes that contain material claims. The `verify-video.mjs` pre-flight check validates that claim IDs are well-formed strings (if present) but does NOT require them on every scene — scenes without material claims (hook, CTA, transition) are exempt. A helper function `getClaimIdsForScene(scene)` extracts claim IDs from a scene object. The claim IDs enable traceability from video → article → evidence pack for fact correction during video production.

**Blocked by:** 01 (Schema Contracts — claim ID format), 05 (Claim-Evidence Auditor — for the validation logic pattern)

**Status:** ready-for-agent

- [ ] Scene data objects can optionally include `claimIds: string[]` field
- [ ] `lib/research/scene-claims.mjs` exports `getClaimIdsForScene(scene)` → returns `string[]` (empty if none)
- [ ] `verify-video.mjs` pre-flight includes optional check: if `claimIds` present, validate they are non-empty strings
- [ ] Scenes without `claimIds` are valid (backward compatible — existing content works)
- [ ] All existing scene-data tests still pass (regression)
- [ ] New tests in `__tests__/research/scene-claims.test.mjs` cover the optional field and backward compat
