# 01 — VLM `analyze_fit` action (Python + JS)

**What to build:** A new VLM action that examines a landscape image/video asset and returns `{fit, focus, reason}` JSON. The Python subprocess (`ai_analyzer.py`) gets a new `analyze_fit` action handler with a dedicated prompt. The JS bridge (`ai-analyzer.mjs`) exposes `analyzeFit(path)` returning a parsed object. On VLM unavailability or parse failure, returns `{}` so callers fall back to defaults.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `ai_analyzer.py`: `handle_analyze_fit(model, processor, path)` handler with dedicated FIT_PROMPT
- [ ] `ai_analyzer.py`: `analyze_fit` action in main loop
- [ ] `ai-analyzer.mjs`: `analyzeFit(assetPath)` export returning `{fit, focus, reason}` or `{}`
- [ ] `parseFitResponse(text)` pure function: JSON.parse → regex fallback → value validation → `{}` on failure
- [ ] Tests: `parseFitResponse` covers valid JSON, markdown-wrapped, extra text, invalid values, empty string
- [ ] Tests: `analyzeFit()` mock subprocess, verify request format and response parsing
- [ ] Tests: degradation when VLM unavailable (returns `{}`)
