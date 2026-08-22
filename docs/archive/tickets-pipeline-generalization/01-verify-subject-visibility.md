# 01 — Dynamic company registry for checkSubjectVisibility

**What to build:** Verification script recognizes any company from the video's own `meta.keyEntities.companies` and `scene.texts.subject`, instead of a hardcoded list of 10 companies. New companies (like Unitree) no longer trigger false "subject visibility" warnings.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `checkSubjectVisibility(scenes, meta)` reads `meta.keyEntities.companies` as primary source
- [x] Falls back to checking `scene.texts.subject` field (hook template already renders this)
- [x] Falls back to `KNOWN_COMPANIES` list when `meta` is not passed (backwards compat)
- [x] `runAllSceneDataChecks(scenes, seriesMeta, opts)` passes `opts.meta` through to `checkSubjectVisibility`
- [x] `verify-video.mjs` passes `meta` to `runAllSceneDataChecks`
- [x] Tests: new company not in KNOWN_COMPANIES → pass when meta has it
- [x] Tests: no meta, no subject → warn
- [x] Tests: existing KNOWN_COMPANIES still work without meta
- [x] Scenario matrix rows 1, 2, 16 covered
