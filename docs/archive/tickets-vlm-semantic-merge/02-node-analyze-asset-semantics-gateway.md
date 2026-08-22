# 02 — Node: analyzeAssetSemantics gateway + delete old APIs

**What to build:** The Node.js gateway (`visual-analyzer.mjs`) gets a new `analyzeAssetSemantics(assetPath)` export that sends `analyze_semantics` action to the Python subprocess and returns a structured object. Old exports (`describeImage`, `describeVideo`, `analyzeFit`, `parseFitResponse`) and constants (`VALID_FITS`, `VALID_FOCUSES`) are deleted. `handleResponse` and `requestQueue` are simplified.

**Blocked by:** 01 — Python action name and response format must be defined first.

**Status:** ready-for-agent

**Spec:** `docs/specs/spec-vlm-semantic-merge.md`

- [ ] New `analyzeAssetSemantics(assetPath)` → `Promise<AssetSemantics>` — pushes to requestQueue with `action: "analyze_semantics"`, no `isFit` flag
- [ ] `handleResponse` simplified: `JSON.parse(line)` → if `response.error` resolve with degraded result; else resolve with response object (minus `error` field)
- [ ] Degraded result: `{description: "", subjects: [], contentKind: null, fit: null, criticalEdgeText: null, reason: null}`
- [ ] `requestQueue` entry: `{resolve, reject, action: "analyze_semantics", path}` — no `isFit` flag needed
- [ ] Delete: `describeImage`, `describeVideo`, `analyzeFit`, `parseFitResponse`, `VALID_FITS`, `VALID_FOCUSES`
- [ ] `closeVisualAnalyzer`, `detectFocus`, `closeFocusDetector`, `closeFocusDetector` unchanged
- [ ] Focus detector subsystem (spawn, pending Map, generation, etc.) unchanged
- [ ] Rewrite `visual-analyzer.test.mjs`: delete ~20 tests for old APIs, add ~20 new tests for `analyzeAssetSemantics` covering: export exists, normal path (mock returns full dict), degradation (Python unavailable, timeout, crash), queue (serial processing, multiple requests), video path, empty response, IPC protocol (action name sent correctly)
- [ ] Update JSDoc header: API list reflects new export, no old exports mentioned
