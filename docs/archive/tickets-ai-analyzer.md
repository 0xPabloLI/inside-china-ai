# 01 — Python subprocess: mlx-vlm bridge

**What to build:** A Python script (`scripts/short-video/lib/ai_analyzer.py`) that loads `mlx-community/Qwen3-VL-8B-Instruct-8bit` via mlx-vlm, listens on stdin for JSON requests, and writes JSON responses to stdout. Each request is a single line of line-delimited JSON: `{"action": "describe_image", "path": "/abs/path/to/file.jpg"}` or `{"action": "describe_video", "path": "/abs/path/to/clip.mp4"}`. Each response is a single line: `{"description": "...", "error": null}` or `{"description": "", "error": "message"}`. The process auto-exits after 5 minutes of stdin idle. Video analysis uses Qwen3-VL's native video processor (`--video path --fps 1.0`) with a fallback to ffmpeg frame extraction (1 fps → multi-image input) if the native path raises. The VLM prompt focuses on main subject, setting, and visible technology/products/brands, at temperature 0.0 for deterministic output.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Python script loads `mlx-community/Qwen3-VL-8B-Instruct-8bit` via mlx-vlm on startup
- [ ] Responds to `describe_image` requests: takes a file path, returns a 1-2 sentence description
- [ ] Responds to `describe_video` requests: uses native `--video path --fps 1.0` path via mlx-vlm
- [ ] Video fallback: if native video input raises, extract frames via ffmpeg at 1 fps and pass as multi-image input
- [ ] Line-delimited JSON IPC: one request per stdin line, one response per stdout line
- [ ] 5-minute idle timer: if no stdin input for 5 minutes, process exits gracefully (exit code 0)
- [ ] Error handling: file not found / corrupt / unsupported format → returns `{"description": "", "error": "reason"}`
- [ ] Runs in `~/.video-tts-env` Python venv (shared with F5-TTS and whisperx)
- [ ] ffmpeg path: `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`
# 02 — Node.js library: ai-analyzer.mjs

**What to build:** A Node.js module (`scripts/short-video/lib/ai-analyzer.mjs`) that exports `describeImage(imagePath)`, `describeVideo(videoPath)`, and `closeAnalyzer()`. The module manages a long-lived Python subprocess (from ticket 01) via `child_process.spawn`, communicating with line-delimited JSON over stdin/stdout. On first call, it spawns the Python process (using `~/.video-tts-env/bin/python3`). Subsequent calls reuse the running process. If the process has exited (crash or idle timeout), the next call respawns it. Requests are queued serially (one at a time, matching the serial analysis decision — Apple Silicon is memory-bandwidth-bound). `closeAnalyzer()` sends an exit command and kills the subprocess. When mlx-vlm is unavailable (Python not found, model fails to load, process exits immediately with error), the module logs a warning and returns empty descriptions — the pipeline continues with keyword-based scoring. Tests mock the subprocess (no actual model loading) and verify: request/response format, lifecycle (spawn/reuse/respawn/close), fallback behavior, and serial queuing.

**Blocked by:** 01 (Python subprocess: mlx-vlm bridge)

**Status:** ready-for-agent

- [ ] Exports `describeImage(imagePath) → Promise<string>`, `describeVideo(videoPath) → Promise<string>`, `closeAnalyzer()`
- [ ] Spawns Python subprocess on first call using `~/.video-tts-env/bin/python3` and the script path from ticket 01
- [ ] Reuses running process for subsequent calls (no re-spawn per call)
- [ ] Detects process exit (crash/idle timeout) and respawns on next call
- [ ] Serial queuing: if 3 calls come in rapidly, they execute one at a time in order
- [ ] `closeAnalyzer()` sends `{"action": "exit"}` then kills the subprocess
- [ ] Graceful degradation: Python/model unavailable → `console.warn` + returns empty string
- [ ] Graceful degradation: video analysis fails → returns empty string (Python script handles internal fallback, but if entire process crashes, Node catches)
- [ ] Unit tests mock subprocess (stdin/stdout) — no real model loading
- [ ] Unit tests cover: normal describe, process crash + respawn, idle timeout + respawn, explicit close, unavailable VLM
# 03 — scoreCandidate enhancement: AI description scoring

**What to build:** Enhance `scoreCandidate()` in `scripts/short-video/lib/asset-sourcer.mjs` to accept an optional third parameter `aiDescription`. When `aiDescription` is present, add a content-match score (0-30 points) based on text similarity between the AI description and the scene's voiceover/narration text. The similarity check uses simple token overlap (number of meaningful word stems shared between description and keyword/voiceover, normalized to 0-30). When `aiDescription` is absent or empty, `scoreCandidate` behaves identically to the current implementation — zero behavior change, fully backward compatible. Existing tests must pass without modification.

**Blocked by:** 02 (Node.js library: ai-analyzer.mjs)

**Status:** ready-for-agent

- [ ] `scoreCandidate(candidate, keyword, aiDescription?)` — optional 3rd parameter
- [ ] When `aiDescription` present: compute token overlap with keyword (and optionally scene voiceover if available) → 0-30 points
- [ ] When `aiDescription` absent or empty string: score is identical to current (no change)
- [ ] Max score cap remains 100 (existing keyword 40 + duration 25 + size 20 + resolution 15 + new content 30, clamped to 100)
- [ ] All existing `asset-sourcer.test.mjs` tests for `scoreCandidate` pass without modification
- [ ] New test cases: `scoreCandidate` with `aiDescription` present (matching, non-matching, empty)
# 04 — Asset sourcer integration: end-to-end AI analysis

**What to build:** Wire the AI analyzer into the asset sourcer pipeline. After the download loop (API sources + yt-dlp + CDP sources) and before `assignAssetsToScenes()`, call `describeImage` or `describeVideo` on each downloaded asset. Store the result in `asset.aiDescription`. Pass `aiDescription` to the enhanced `scoreCandidate`. Add an `aiAnalysis` section to the JSON report (per-asset: description, analysis time, success/failure). At end of batch, call `closeAnalyzer()`. For accepted assets (those assigned to scenes), append `aiDescription` to their `catalog.yml` entry. When VLM is unavailable, log warning and skip — pipeline continues with keyword-only scoring. Log per-asset analysis progress (like the existing download progress logs).

**Blocked by:** 03 (scoreCandidate enhancement)

**Status:** ready-for-agent

- [ ] Import `describeImage`, `describeVideo`, `closeAnalyzer` from `lib/ai-analyzer.mjs`
- [ ] After download loop, before `assignAssetsToScenes`: iterate `allAssets`, call `describeImage`/`describeVideo` based on `asset.type`
- [ ] Store result in `asset.aiDescription`
- [ ] Pass `aiDescription` to `scoreCandidate` in the scoring step
- [ ] JSON report includes `aiAnalysis` section: `[{ path, description, success, analysisTimeMs }]`
- [ ] Call `closeAnalyzer()` at end of batch (in a `finally` block)
- [ ] VLM unavailable: `console.warn("AI analysis layer not available")` + skip analysis, continue pipeline
- [ ] Per-asset progress log: `🔍 Analyzing: unitree-demo.mp4... (3/20)`
- [ ] Accepted assets' descriptions appended to `catalog.yml` entries
- [ ] Integration test: mock ai-analyzer, verify report has `aiAnalysis` section, `scoreCandidate` receives descriptions
- [ ] Integration test: VLM unavailable → pipeline completes with keyword-only scoring, warning logged
