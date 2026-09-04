# Spec: AI Analysis Layer — VLM-Powered Asset Understanding

## Problem Statement

The short video pipeline's asset sourcer (`scripts/short-video/lib/asset-sourcer.mjs`) currently scores and assigns downloaded media assets to scenes using **keyword title matching** and **metadata heuristics** (duration, file size, resolution). This approach cannot understand the actual visual content of downloaded images and videos. An asset titled "Unitree Robot Demo" might show a building exterior, a conference stage, or a blank screen — the current scorer has no way to tell.

The user needs an AI analysis layer that uses a Vision Language Model (Qwen3-VL-8B) to look at each downloaded asset, generate a content description, and feed that description into the asset-to-scene assignment logic — so that scenes get matched with assets whose **visual content** actually fits the scene's narration, not just whose title matches a keyword.

## Solution

Add a new module `scripts/short-video/lib/ai-analyzer.mjs` that provides VLM-powered content analysis as an importable Node.js library. The module wraps a Python subprocess running mlx-vlm (Qwen3-VL-8B-Instruct-8bit) via a long-lived child process with stdin/stdout JSON IPC. Any pipeline step can import and call it — asset-sourcer is the first consumer.

The analyzer produces a natural-language description for each asset (image or video). For videos, it uses Qwen3-VL's native video input path (supported in mlx-vlm source code via `processing_qwen3_vl.py`), with a fallback to ffmpeg frame extraction + multi-image input if the native video path fails.

When the VLM is unavailable (mlx-vlm not installed, model not downloaded, Python error), the analyzer degrades gracefully — it returns empty descriptions and the pipeline falls back to the existing keyword-based scoring, with a warning logged.

## User Stories

1. As a video producer, I want the asset sourcer to understand what each downloaded image/video actually shows, so that assets are assigned to scenes based on visual content rather than just title keywords.
2. As a video producer, I want video assets to be analyzed via direct video input to the VLM, so that temporal content (motion, action sequences) is captured in the description rather than just a single frame.
3. As a developer, I want `ai-analyzer.mjs` to be an importable library with simple async functions (`describeImage`, `describeVideo`), so that I can call it from asset-sourcer and future pipeline steps without setting up an API server.
4. As a developer, I want the VLM model to load once and stay resident in a Python subprocess for the duration of a batch analysis, so that analyzing 20 assets doesn't reload the 8B model 20 times.
5. As a developer, I want the Python subprocess to auto-exit after 5 minutes of idle time, so that the 11 GB of model memory is released when analysis is done and other processes (F5-TTS, RAG reindex) need the memory.
6. As a developer, I want the analyzer to gracefully degrade when mlx-vlm is not installed or the model fails to load, so that the asset sourcer pipeline continues with keyword-based scoring instead of crashing.
7. As a video producer, I want the analysis results (descriptions) stored in the asset sourcer's JSON report, so that I can review what the VLM saw and verify the assignment makes sense.
8. As a video producer, I want accepted assets' descriptions written into `catalog.yml`, so that future RAG queries and content searches can find assets by semantic content.
9. As a developer, I want the `describeVideo` function to fall back to ffmpeg frame extraction if the native video input path fails, so that video analysis works even if the mlx-vlm video processor has a bug.
10. As a developer, I want the analysis to run serially (one asset at a time), so that I don't over-subscribe the single GPU on Apple Silicon (memory bandwidth is the bottleneck, not compute).
11. As a developer, I want the next image to be preloaded into memory while the current image is being analyzed, so that serial analysis is I/O-optimal even without parallel inference.
12. As a video producer, I want the VLM configured with Q5_K_M or 8-bit quantization, so that the quality loss is minimal (1% or 0.14% respectively) while keeping memory footprint under 12 GB on my 32 GB Mac.

## Implementation Decisions

### Architecture

- **Node.js layer** (`lib/ai-analyzer.mjs`): Exports `describeImage(imagePath)`, `describeVideo(videoPath)`, and `closeAnalyzer()`. Manages the Python subprocess lifecycle.
- **Python layer** (`lib/ai_analyzer.py`): Long-lived process. Loads Qwen3-VL-8B-Instruct-8bit once via mlx-vlm. Communicates via stdin (JSON requests) / stdout (JSON responses). Auto-exits after 5 minutes of idle time.
- **No API server, no HTTP, no OpenAI-compatible interface.** Pure library + subprocess.

### Model Configuration

- **Model**: `mlx-community/Qwen3-VL-8B-Instruct-8bit` (9.85 GB file, ~11 GB resident memory)
- **Runtime**: mlx-vlm (Python package, installed in `~/.video-tts-env` venv)
- **Fallback model** (if 8-bit too heavy): `mlx-community/Qwen3-VL-8B-Instruct-4bit` (~5.5 GB)
- **Video input**: `mlx_vlm.generate(--model ... --video path --fps 1.0)` — uses Qwen3-VL's native video processor (`processing_qwen3_vl.py`, registered in `__init__.py`, config has `video_token_id: 151656`)
- **Video fallback**: ffmpeg extract frames at 1 fps → pass as multi-image input to mlx-vlm
- **Prompt**: `"Describe what is happening in this video/image in 1-2 sentences. Focus on the main subject, setting, and any visible technology, products, or brands."`
- **Temperature**: 0.0 (deterministic, for consistent asset descriptions)

### Subprocess Lifecycle (Q8)

- Node.js spawns Python process on first call (`describeImage` or `describeVideo`).
- Model loads once (~10s), then serves requests via stdin/stdout JSON.
- Python process has a background timer: 5 minutes idle → graceful exit.
- Node.js tracks process state: if process exited, next call respawns it.
- `closeAnalyzer()` explicitly kills the subprocess (called at end of asset-sourcer batch).

### Integration with Asset Sourcer (Q1)

- `ai-analyzer` is called **after download, before assignment** — between the existing download loop and `assignAssetsToScenes()`.
- Each downloaded asset gets `aiDescription` added to its object.
- `scoreCandidate()` is enhanced: if `aiDescription` exists, it's used as an additional scoring signal (text similarity between description and scene voiceover/narration).
- The JSON report includes a new `aiAnalysis` section per asset.

### Results Storage (Q5)

- **Short-lived**: `aiDescription` field in asset-sourcer's JSON report (reviewed by user, ephemeral).
- **Long-lived**: accepted assets' descriptions written to `catalog.yml` (indexed by RAG, `content_type: "asset-catalog"`).

### Graceful Degradation (Q9)

- If mlx-vlm not installed → warning + skip AI analysis, use existing `scoreCandidate` only.
- If Python process crashes → warning + skip, continue with keyword scoring.
- If video input fails → fallback to frame extraction; if that also fails → empty description, skip.
- Pattern: matches existing `triggerRagReindex()` non-blocking design (try/catch + warning).

### Concurrency (Q10)

- Serial analysis (one asset at a time). MLX on Apple Silicon is memory-bandwidth-bound — parallel inference cannot speed it up.
- I/O preloading: Python process reads next image while current inference runs.

## Testing Decisions

### Test Seam

The primary test seam is the **Node.js library API** — `describeImage`, `describeVideo`, and the subprocess lifecycle management. Tests mock the Python subprocess (stdin/stdout) and verify:

1. JSON request/response format correctness
2. Subprocess lifecycle (spawn, idle timeout, respawn, explicit close)
3. Fallback behavior (VLM unavailable, video input fails, model not found)
4. Result format (description string, frameCount for videos)

### Prior Art

- `lib/upscale.mjs` + `__tests__/upscale.test.mjs` — same pattern: Node.js wrapper calling external tool (Real-ESRGAN CLI), tested by mocking the external command. The AI analyzer tests follow this pattern but mock stdin/stdout instead of `execSync`.
- `lib/asset-sourcer.mjs` + `__tests__/asset-sourcer.test.mjs` — the consumer side. Integration tests verify that `aiDescription` is consumed by `scoreCandidate` and `assignAssetsToScenes`.
- `lib/publish-utils.mjs` `triggerRagReindex()` — the graceful degradation pattern (try/catch + warning, non-blocking).

### Test Coverage Requirements

- Unit tests for `ai-analyzer.mjs` (mocked subprocess): request building, response parsing, lifecycle management, fallback paths.
- Unit tests for `asset-sourcer.mjs` enhanced `scoreCandidate` (with `aiDescription` present/absent).
- Integration test: `describeVideo` fallback from native video to frame extraction.

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File                                                   | Modification                                                                                                                                                                                                                     | Risk                                                                                                                                                                                                     | Assessment                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/short-video/lib/asset-sourcer.mjs`            | Add `import { describeImage, describeVideo, closeAnalyzer }` at top. Call analyzer after download loop, before `assignAssetsToScenes`. Enhance `scoreCandidate` to use `aiDescription`. Add `aiAnalysis` section to report JSON. | **Medium** — modifies existing data flow (adds a step between download and assignment). `scoreCandidate` gains an optional parameter (backward compatible — if no `aiDescription`, behaves identically). | 1. Existing tests for `scoreCandidate` (without `aiDescription`) must still pass — no behavior change when analyzer is absent. 2. `assignAssetsToScenes` is unchanged. 3. Worst case: analyzer adds a slow step to the pipeline, but it's after downloads so no data loss. |
| `scripts/short-video/__tests__/asset-sourcer.test.mjs` | Add test cases for `scoreCandidate` with `aiDescription` present. Add integration test for analyzer-enhanced scoring.                                                                                                            | **Low** — pure addition of new test cases.                                                                                                                                                               | No existing tests are modified, only new cases added.                                                                                                                                                                                                                      |
| `scripts/short-video/assets/catalog.yml`               | Append `aiDescription` field to entries for accepted assets (when analyzer runs).                                                                                                                                                | **Low** — additive field in YAML.                                                                                                                                                                        | RAG reindex already handles arbitrary fields in catalog entries. No schema change needed.                                                                                                                                                                                  |

### Section 2: Behavioral Scenarios

| #   | Scenario                                                               | Expected Behavior                                                                                | Risk                                                                                 | Mitigation                                                                                        |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 1   | mlx-vlm not installed, asset-sourcer runs                              | Pipeline continues with keyword scoring, logs warning "AI analysis layer not available"          | No analysis happens, user gets same quality as before                                | Graceful degradation (Q9) — try/catch + warning, identical to `triggerRagReindex` pattern         |
| 2   | mlx-vlm installed, model not downloaded                                | Pipeline continues with keyword scoring, logs warning "Model not found"                          | Same as #1                                                                           | Same pattern — Python script exits with error, Node.js catches                                    |
| 3   | 20 assets downloaded, VLM available                                    | Serial analysis: ~90s total (10s model load + 20×4s inference). Each asset gets `aiDescription`. | Slow but acceptable — user is waiting for batch to finish anyway                     | Progress logging per asset (like download progress)                                               |
| 4   | Video asset: native video input works                                  | `describeVideo` calls mlx-vlm with `--video path --fps 1.0`, returns description                 | None — happy path                                                                    | —                                                                                                 |
| 5   | Video asset: native video input fails                                  | `describeVideo` catches error, falls back to ffmpeg frame extraction (1fps → multi-image input)  | ffmpeg might also fail (missing binary)                                              | If ffmpeg also fails, return empty description, pipeline continues with keyword scoring           |
| 6   | Python process crashes mid-batch                                       | Node.js detects process exit, respawns, retries current asset                                    | Current asset might get analyzed twice (idempotent — VLM at temp 0 is deterministic) | Track "last analyzed asset" — on respawn, skip already-analyzed assets                            |
| 7   | Python process idle 5 min                                              | Python auto-exits, releasing ~11 GB memory                                                       | Next call needs to respawn (10s delay)                                               | Acceptable — 5 min idle means batch is done; next batch expects fresh load                        |
| 8   | 32GB Mac running F5-TTS + VLM simultaneously                           | F5-TTS (~4GB) + VLM (~11GB) + macOS (~6GB) = 21GB, fits in 32GB                                  | If user also opens browser/IDE, memory pressure                                      | VLM auto-exits after 5 min idle. F5-TTS and VLM run at different pipeline stages, not concurrent. |
| 9   | Asset with no `aiDescription` (analysis skipped)                       | `scoreCandidate` behaves identically to current implementation                                   | None — backward compatible                                                           | `scoreCandidate(candidate, keyword, aiDescription?)` — optional 3rd param                         |
| 10  | User calls `describeImage` from a different module (not asset-sourcer) | Returns description string, starts Python subprocess if not running                              | Subprocess lifecycle managed by ai-analyzer, not caller                              | `closeAnalyzer()` available for explicit cleanup; idle timeout as safety net                      |
| 11  | Multiple rapid calls to `describeImage`                                | Requests queue in stdin pipe, Python processes serially, responses come back in order            | If stdout buffer fills, deadlock                                                     | Use line-delimited JSON (one request/response per line), not multi-line JSON                      |
| 12  | Very large video file (>100MB)                                         | mlx-vlm video processor might be slow or OOM                                                     | Analysis might timeout                                                               | Cap video analysis at 8s of video (match yt-dlp download limit); skip if longer                   |
| 13  | Corrupt image file                                                     | Python raises exception on PIL decode                                                            | Pipeline stalls on that asset                                                        | try/catch per asset, return empty description, log warning, continue                              |

## Out of Scope

- **CLIP integration** — separate model for fast image-text similarity scoring. Can be added in a later phase as a pre-filter before VLM.
- **YOLO object detection** — separate model for specific object/logo detection. Discussed but deferred to future spec.
- **Multi-user serving** — no server/API layer. Single-user, single-process.
- **Ollama integration for VLM** — mlx-vlm is the chosen runtime. Ollama continues for text-only models (bge-m3).
- **Real-ESRGAN upscaling** — already implemented in `upscale.mjs`, separate concern.
- **Prompt engineering** — the exact VLM prompt will be tuned during implementation. Spec only defines the intent.

## Further Notes

### Environment Setup

- mlx-vlm installed in `~/.video-tts-env` Python venv (existing, shared with F5-TTS and whisperx [[memory:17868067581926031155]])
- Model: `mlx-community/Qwen3-VL-8B-Instruct-8bit` (auto-downloaded from HuggingFace on first run)
- ffmpeg at `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg` (existing, used for video frame extraction fallback)

### Grill Decisions Summary

| Decision              | Choice                                                                                            | Rationale                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Q1: Pipeline position | After download, before assignment                                                                 | Direct value: replace keyword scoring with content-based scoring                                       |
| Q2: What to analyze   | Content description                                                                               | One job: "see and describe" — matching done by existing scorer                                         |
| Q3: Video strategy    | Native video input (mlx-vlm has Qwen3-VL video processor in source), fallback to frame extraction | Verified: `processing_qwen3_vl.py`, `__init__.py` registration, v0.6.6 "Fix Qwen3-VL PIL video inputs" |
| Q4: Model coexistence | Not concurrent with RAG/TTS                                                                       | Pipeline stages are serial; VLM runs during asset analysis, not during TTS                             |
| Q5: Results storage   | report.json (ephemeral) + catalog.yml (persistent)                                                | Matches existing catalog pattern                                                                       |
| Q6: Architecture      | Internal library, no API/server                                                                   | Not a service — just an importable module                                                              |
| Q7: API design        | Minimal: `describeImage`, `describeVideo`                                                         | Matching logic stays in caller (asset-sourcer)                                                         |
| Q8: Python process    | Long-lived + 5 min idle timeout                                                                   | Balance: fast batch analysis + automatic memory release                                                |
| Q9: Fallback          | Warning + continue with keyword scoring                                                           | Matches `triggerRagReindex` pattern                                                                    |
| Q10: Concurrency      | Serial + I/O preloading                                                                           | Apple Silicon memory-bandwidth-bound; parallel doesn't help                                            |
