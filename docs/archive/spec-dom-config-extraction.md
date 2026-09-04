# Spec: Extract DOM Verification Config from Central Verifier to Content Directories

## Goal

Move per-pipeline DOM verification config (`absentClasses`, `singleOccurrence`, `wordFit`) out of the central `verify-scene-dom.mjs` and into each content directory's `dom-config.mjs`. The verifier dynamically loads this file; if absent, uses defaults.

## Background

`verify-scene-dom.mjs` has a hardcoded `EXPECTATIONS` object with per-pipeline config. Adding a new pipeline requires editing this central file. After the `skipWatermark` cleanup (auto-detection), only 4 of 9 entries remain — the rest use defaults. This refactoring co-locates pipeline-specific config with the pipeline's content.

## Design Decisions (Grill Round 1 — all confirmed)

1. **File**: `content/<dir>/dom-config.mjs` (separate from `meta.mjs`, single responsibility)
2. **Export**: Named export `export const domConfig = { ... }` (consistent with `meta.mjs` pattern)
3. **Test fixtures**: `_test-fixtures/hook-standard/dom-config.mjs` uses same mechanism
4. **Default `absentClasses`**: `DEFAULT_ABSENT_CLASSES` constant stays in `verify-scene-dom.mjs`

## Interface Contract

### dom-config.mjs (per content directory)

```javascript
// content/restraint/pt1/dom-config.mjs
export const domConfig = {
  absentClasses: ["source-badge", "subscribe", "source-tag", "attribution"],
  singleOccurrence: { 4: ["PRICE CUT"] },
  wordFit: { 3: [".s3 .card .text"] },
};
```

### verify-scene-dom.mjs loading logic

```javascript
// Try to load dom-config.mjs; fall back to defaults if absent or broken
const DOM_CONFIG_PATH = join(__dirname, "content", contentDir, "dom-config.mjs");
let domConfig = null;
try {
  const mod = await import(`file://${DOM_CONFIG_PATH}`);
  domConfig = mod.domConfig || null;
} catch {
  // File doesn't exist or has syntax error — use defaults
}

const exp = {
  absentClasses: domConfig?.absentClasses || DEFAULT_ABSENT_CLASSES,
  singleOccurrence: domConfig?.singleOccurrence || {},
  wordFit: domConfig?.wordFit || {},
};
```

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File                                                  | Modification                                                                                        | Risk   | Assessment                                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify-scene-dom.mjs`                                | Remove `EXPECTATIONS` object; add dynamic import of `dom-config.mjs`; keep `DEFAULT_ABSENT_CLASSES` | Medium | Changes config loading mechanism. Verified by: existing tests (831 pass) + new tests for dynamic loading. Downstream: `main.mjs` calls this script — exit code contract unchanged. Worst case: config not loaded → falls back to defaults (safe degradation). |
| `content/restraint/pt1/dom-config.mjs`                | NEW file — extracted from EXPECTATIONS                                                              | Low    | New file, no existing consumers. Content matches current EXPECTATIONS entry.                                                                                                                                                                                  |
| `content/distillation/pt2/dom-config.mjs`             | NEW file — extracted from EXPECTATIONS                                                              | Low    | Same as above.                                                                                                                                                                                                                                                |
| `content/distillation/pt3/dom-config.mjs`             | NEW file — extracted from EXPECTATIONS                                                              | Low    | Same as above.                                                                                                                                                                                                                                                |
| `content/_test-fixtures/hook-standard/dom-config.mjs` | NEW file — extracted from EXPECTATIONS                                                              | Low    | Same as above.                                                                                                                                                                                                                                                |

### Section 2: Behavioral Scenarios

| #   | Scenario                                                                                                                       | Expected Behavior                                                               | Risk   | Mitigation                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| 1   | Content dir WITH `dom-config.mjs` (valid export)                                                                               | Load config from file, use `absentClasses`/`singleOccurrence`/`wordFit` from it | Low    | Unit test with mock `dom-config.mjs`                                                      |
| 2   | Content dir WITHOUT `dom-config.mjs` (most pipelines)                                                                          | Use defaults: `DEFAULT_ABSENT_CLASSES` + empty `{}`                             | Low    | Test: run verifier on kimi-sandbox (no dom-config.mjs) → passes with defaults             |
| 3   | `dom-config.mjs` has syntax error                                                                                              | Catch import error, print warning, use defaults                                 | Medium | Test: create invalid `dom-config.mjs` → verify defaults used + warning printed            |
| 4   | `dom-config.mjs` exports incomplete config (e.g. only `absentClasses`)                                                         | Merge with defaults: provided fields override, missing fields use defaults      | Low    | Test: export `{ absentClasses: ["custom"] }` → verify `singleOccurrence` defaults to `{}` |
| 5   | `dom-config.mjs` exports wrong shape (e.g. string instead of object)                                                           | Treat as no config, use defaults                                                | Medium | Test: export `"bad"` → verify defaults used                                               |
| 6   | Existing pipelines with EXPECTATIONS entries (restraint/pt1, distillation/pt2, distillation/pt3, _test-fixtures/hook-standard) | Behavior unchanged — same config loaded from new location                       | Low    | Run existing test suite (831 tests) — all pass                                            |
| 7   | New pipeline created without `dom-config.mjs`                                                                                  | Works with defaults, no central file to edit                                    | Low    | Test: create empty content dir → verifier runs with defaults                              |
| 8   | Test fixture `_test-fixtures/hook-standard` with `dom-config.mjs`                                                              | Loads config like any other content dir                                         | Low    | Test: run verifier on `_test-fixtures/hook-standard` → `wordFit` checks apply             |

## Files to Create

1. `content/restraint/pt1/dom-config.mjs`
2. `content/distillation/pt2/dom-config.mjs`
3. `content/distillation/pt3/dom-config.mjs`
4. `content/_test-fixtures/hook-standard/dom-config.mjs`

## Files to Modify

1. `verify-scene-dom.mjs` — remove `EXPECTATIONS`, add dynamic import
2. `__tests__/caption-utils.test.mjs` — no changes (unaffected)

## Out of Scope

- Moving `DEFAULT_ABSENT_CLASSES` to a shared lib (stays in verify-scene-dom.mjs)
- Moving other verifier config (EXEMPT_SELECTORS, BAND, BRAND_CHROME)
- Refactoring other central config files
