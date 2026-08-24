# 04 — Full Pipeline: understandVideo() + Output

**What to build:** Combine download → transcribe → VLM analysis into a single `understandVideo(url, options)` call. Merge results into structured JSON, optionally write to disk.

**Blocked by:** 03 — Audio Extraction & ASR Transcription

**Status:** ready-for-agent

- [x] Export `understandVideo(url, options)` → returns `{ url, platform, author, title, duration, transcript, visualAnalysis, summary, status }`
- [x] Options: `{ transcript?: true, visual?: true, outputDir?: '/tmp', writeFile?: true }`
- [x] VLM: calls `analyzeAssetSemantics(videoPath)` from visual-analyzer.mjs
- [x] VLM cleanup: calls `closeVisualAnalyzer()` after analysis
- [x] `status`: `"ok"` | `"degraded"` | `"error"`
- [x] Write JSON to `{outputDir}/{platform}-{videoId}-understanding.json` when writeFile=true
- [x] transcript=false → skip ASR, `transcript: null`
- [x] visual=false → skip VLM, `visualAnalysis: null`, skip closeVisualAnalyzer
- [x] Both fail → `status: "degraded"`, both fields null
- [x] Download fail → `status: "error"`, throw or return error structure
- [x] Unit tests covering scenarios #9, #13-15, #18-19, #23
- [x] E2e smoke test (skip if whisper-cli/VLM unavailable)
