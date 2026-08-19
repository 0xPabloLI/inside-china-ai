# 07 — Asset-sourcer auto-step + CSS chart template

**What to build:** Pipeline automatically triggers asset-sourcer for scenes with missing media files. New CSS chart scene template for stock price / data visualization.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] New Step 1.5 in `main.mjs`: after scene-data load, before TTS
- [x] For each scene with `media` field where file doesn't exist → trigger `asset-sourcer` search
- [x] Keywords from `meta.keyEntities.companies[0]` + scene `name`
- [x] Non-blocking: if search fails, scene renders without media (graceful degradation)
- [x] New `visualType: "chart"` support in scene dispatcher
- [x] New `sceneChart()` template function: renders CSS/SVG bar chart from `texts.chartData`
- [x] `chartData` format: `{ bars: [{ label, value, color? }], yAxis: "PRICE (¥)", source: "..." }`
- [x] Chart fits in hero slot, source in support slot
- [x] Tests: missing media file → asset-sourcer triggered
- [x] Tests: existing media file → no sourcer call
- [x] Tests: chart template renders bars from chartData
- [x] Tests: empty chartData → renders empty chart with source only
- [x] Scenario matrix rows 8, 15 covered
