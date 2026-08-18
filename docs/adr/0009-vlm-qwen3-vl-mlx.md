# VLM Analysis Layer: Qwen3-VL-8B via mlx-vlm

## Context

The video pipeline needs to understand visual assets (images, videos) before assigning them to scenes. Specifically, it needs to:

1. **Describe** what an asset shows (subject, setting, technology, brands) — used for matching assets to scene narration
2. **Analyze fit** — determine whether a landscape asset should use `cover` (crop) or `contain` (letterbox) when placed in a 9:16 canvas, and where the main subject is positioned (top/center/bottom)
3. **Score** asset-scene relevance — does this image/video match what the scene is talking about?

This must run **locally** (no per-call API cost for 10-20 assets per video, 20+ videos/month) and on **Apple Silicon** (the development machine is an M2 Pro Mac).

## Decision

**Use `mlx-community/Qwen3-VL-8B-Instruct-8bit` (9.2GB) via mlx-vlm (0.6.13)** as the VLM, running as a persistent Python subprocess managed by a Node.js library.

### Architecture

```
visual-analyzer.mjs (Node.js library)
  ├── spawns → vlm_analyzer.py (Python subprocess)
  │     ├── loads mlx-vlm + Qwen3-VL-8B-Instruct-8bit
  │     ├── listens on stdin for JSON requests
  │     ├── writes JSON responses to stdout
  │     └── auto-exits after 5min idle
  └── communicates via line-delimited JSON protocol
```

### API surface

- `describeImage(path)` → string description
- `describeVideo(path)` → string description (native video input, fps=1.0, max 8s)
- `analyzeFit(path)` → `{fit: "cover"|"contain", focus: "top"|"center"|"bottom", reason: string}`
- `closeVisualAnalyzer()` → terminates subprocess

### Performance characteristics (M2 Pro)

| Operation | Time |
|-----------|------|
| Model load | ~12-17s (once, persistent) |
| Image inference | ~20-30s per image |
| Video inference | ~100-120s per video (10MB, 8s) |
| Batch (20 assets) | ~40min+ |

## Why not alternatives

### Cloud VLM APIs (GPT-4V, Claude Vision, Gemini Vision)
- **Cost:** $0.01-0.03 per image call. 20 assets × 20 videos/month = 400 calls/month = $4-12/month. Acceptable but not free.
- **Latency:** 2-5s per image (vs 20-30s local). Faster, but network round-trips add up.
- **Privacy:** Assets may include unpublished research, internal documents. Local inference keeps them on-device.
- **Vendor lock-in:** Vision model quality changes between API versions. Local model is reproducible.
- **Decision:** Local-first is a design principle (same as TTS — see ADR-0008). Cloud APIs are a fallback, not primary.

### LLaVA / other local VLMs
- **LLaVA-1.5-7B:** Available via mlx-vlm, but weaker on Chinese content and technology/brand recognition.
- **Qwen2-VL:** Predecessor. Qwen3-VL has better video understanding and instruction following.
- **Qwen3-VL-8B-Instruct-4bit (4.6GB):** Available as fallback. 8bit is preferred for quality; 4bit is the automatic fallback if 8bit fails to load.

### Ollama-based VLM
- Ollama does not support vision models natively (as of 2026-08). Would need a separate runtime.
- mlx-vlm is purpose-built for Apple Silicon and supports Qwen3-VL's video processing pipeline.

## Key technical decisions

### 1. Chat template required for prompt construction
`processor.apply_chat_template()` must be used to construct the prompt with `<image>`/`<video>` placeholders. Passing plain text directly causes the processor to not insert `image_token_index` into `input_ids`, leading to `masked_scatter` shape mismatch error.

### 2. Native video input (not frame extraction)
Qwen3-VL supports native video input via `--video path --fps 1.0`. This is preferred over ffmpeg frame extraction because:
- The model processes temporal information (motion, transitions) that frame extraction loses
- Single inference call vs. multi-image batch
- Fallback to frame extraction exists if native path raises

### 3. 180s response timeout
Video analysis can take 100s+. The Node.js library's `RESPONSE_TIMEOUT_MS` is set to 180s (initially 60s, raised after video analysis timeouts).

### 4. Graceful degradation
If Python is not found or model load fails, `visual-analyzer.mjs` returns empty strings and logs a warning. The pipeline continues without VLM descriptions — asset scoring falls back to keyword matching only.

## Trade-offs

| Aspect | Qwen3-VL-8B local | Cloud API |
|--------|-------------------|-----------|
| **Cost** | $0 (free) | $4-12/month |
| **Speed (image)** | 20-30s | 2-5s |
| **Speed (video)** | 100-120s | 5-10s |
| **Quality** | Good (8B params) | Better (GPT-4V, Claude) |
| **Chinese content** | Strong (Qwen family) | Varies by provider |
| **Reproducibility** | Exact (model pinned) | Changes with API updates |
| **Batch throughput** | ~40min for 20 assets | ~2min parallel |
| **Privacy** | On-device | Data sent to cloud |

### Known limitations
- Video analysis is slow (~2min per video). Batch analysis of 20 assets can take 40min+.
- `objc` warnings: AVFFrameReceiver/AVFAudioReceiver class duplication between `av` and `cv2` libraries (non-functional, cosmetic).
- 8B model occasionally hallucinates brands or details not visible in the image.

## Consequences

- VLM requires `~/.video-tts-env` (Python 3.12) with mlx-vlm 0.6.13 installed (see ADR-0011).
- Qwen3-VL-8B-Instruct-8bit model (9.2GB) in HF cache. 4bit fallback (4.6GB) auto-selected if 8bit fails.
- `visual-analyzer.mjs` is integrated into `asset-sourcer.mjs` — after downloading assets, each asset is analyzed and its description is used for `scoreCandidate()` matching.
- `analyzeFit()` is called during scene-data review to determine landscape-to-vertical placement strategy.
- The VLM subprocess is shared across all assets in a pipeline run (model loaded once, reused).
- Future model upgrade requires: (1) update `MODEL_ID` in `vlm_analyzer.py`, (2) verify `apply_chat_template` compatibility, (3) re-run end-to-end validation.
