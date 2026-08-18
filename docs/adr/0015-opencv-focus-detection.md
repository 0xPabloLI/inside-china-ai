# Visual Focus Detection: OpenCV Subprocess with Generation Isolation

## Context

The video pipeline's VLM layer (Qwen3-VL-8B, ADR-0009) excels at semantic analysis ("what is this?") but is unreliable for spatial localization ("where is the focus?"). Testing showed `focusRegion` outputs vary between prompts on the same image, and `overlay` values are flat (all 0.3).

The pipeline needs a **deterministic, lightweight** spatial analysis capability to complement the VLM — one that can detect faces and saliency hotspots in image assets, producing structured "protected regions" that prevent text overlays from covering key subjects.

See `docs/specs/spec-visual-focus-detection.md` for the full spec and `docs/research/asset-focus-detection-alternatives.md` for the alternatives survey.

## Decision

**Use OpenCV 4.10.0.84 (contrib) via a dedicated Python subprocess** (`focus_detector.py`), managed by the `visual-analyzer.mjs` Node.js gateway alongside the existing VLM subprocess.

### Architecture

```
visual-analyzer.mjs (Node.js gateway — manages TWO independent subprocesses)
  ├── VLM subprocess: vlm_analyzer.py (Qwen3-VL-8B, ~11GB, 12-17s startup)
  │     └── describeImage / describeVideo / analyzeFit
  │
  └── Focus subprocess: focus_detector.py (OpenCV, ~200MB, <1s startup)  ← NEW
        └── detectFocus → Haar Cascade faces + Spectral Residual saliency
```

### Two-Phase Execution (peak memory non-overlapping)

```
Phase 1: detectFocus() batch → try/finally → closeFocusDetector() → release ~200MB
Phase 2: describeImage/Video() → VLM analysis → closeVisualAnalyzer() → release ~11GB
```

### API Surface

- `detectFocus(assetPath)` → `Promise<FocusResult>` — **never rejects**, returns schema-complete degraded result on failure
- `closeFocusDetector()` — closes focus subprocess only (idempotent)
- `closeVisualAnalyzer()` — closes both subprocesses

### Output Contract

```json
{
  "status": "ok | partial | low_information | degraded | unsupported",
  "errorCode": "string | null",
  "frame": { "width": 1920, "height": 1080, "orientation": "landscape", "orientationNormalized": true },
  "protectedRegions": [
    { "rect": [0.31, 0.10, 0.20, 0.42], "kind": "face", "confidence": null, "confidenceKind": "not_provided" }
  ],
  "saliency": { "available": true, "dispersion": 0.62, "centroid": [0.45, 0.38] }
}
```

## Why not alternatives

### VLM-only (reuse Qwen3-VL for spatial tasks)
- **Unstable**: same image, different prompts → different `focusRegion` values.
- **Slow**: 20-30s per image vs <200ms for OpenCV.
- **No coordinate precision**: VLM outputs coarse top/center/bottom, not bounding boxes.
- **Decision**: VLM stays for semantic analysis; spatial analysis delegated to OpenCV.

### YOLO / SAM (deep learning detectors)
- **Heavyweight**: requires GPU or slow CPU inference. Overkill for face detection + saliency.
- **Model management**: additional model downloads, versioning, compatibility concerns.
- **Decision**: Deferred to Phase 2 if Haar Cascade precision is insufficient. See spec §7.

### Cloud vision APIs (AWS Rekognition, Google Vision)
- **Cost**: per-call pricing. 20 assets × 20 videos/month = 400 calls.
- **Privacy**: assets may include unpublished research.
- **Decision**: Local-first design principle (same as VLM and TTS — ADR-0008, ADR-0009).

### OpenCV 5.0
- **Removed modules**: `CascadeClassifier` and `cv2.saliency` were removed in OpenCV 5.0.
- **Decision**: **Pinned to 4.10.0.84**. Version lock in `requirements-focus.txt`. Preflight check verifies version.

## Key technical decisions

### 1. Generation-based worker isolation

The Node.js gateway uses a `workerGeneration` counter to prevent data contamination when the subprocess restarts or times out:

- Each `detectFocus()` call stamps its request with the current `workerGeneration`.
- On timeout, crash, or non-JSON stdout: increment generation, **resolve all pending promises** from the old generation as `{status: "degraded", errorCode: "focus_worker_reset"}`, then spawn a new subprocess.
- Late-arriving responses from old workers are discarded (generation mismatch or requestId not in pending Map).

This ensures the "never reject" contract: every Promise resolves with a schema-complete result.

### 2. requestId-based IPC routing

Each `analyze` request carries a UUID v4. The Python subprocess echoes it in the response envelope. The Node gateway routes responses by `requestId` via a `Map<requestId, {resolve, timer, workerGeneration}>` — not FIFO assumption. This supports concurrent requests correctly.

### 3. IdleTimer with Event + Lock (shared pattern)

`focus_detector.py` reuses the same `IdleTimer` pattern as `vlm_analyzer.py`:
- `threading.Event.wait(poll_interval)` instead of `sleep(timeout)` — avoids doubling actual exit time.
- `threading.Lock` protects `_last_activity` — thread-safe.
- Default 60s idle timeout; injectable via `FOCUS_IDLE_TIMEOUT_SECONDS` env for testing.

### 4. EXIF normalization

Pillow `ImageOps.exif_transpose()` corrects orientation before converting to OpenCV array. `frame.orientationNormalized: true` signals this was done. Coordinates are relative to the normalized frame.

### 5. Failure-safe contract

`detectFocus()` **never rejects**. All error paths return schema-complete results:
- OpenCV not installed → `{status: "degraded", errorCode: "opencv_not_available"}`
- Image unreadable → `{status: "degraded", errorCode: "cannot_read_image"}`
- Video file → `{status: "unsupported", errorCode: "video_not_supported"}`
- Timeout → `{status: "degraded", errorCode: "focus_timeout"}`
- Worker reset → `{status: "degraded", errorCode: "focus_worker_reset"}`
- Internal exception → `{status: "degraded", errorCode: "focus_internal_error"}`

### 6. Output boundary — analysis metadata isolated from production code

`focusAnalysis` is written to `media-patch.json`'s top-level `analysis` field for human review. It does **not** enter the `media` object consumed by Remotion rendering. The `apply-media-patch.mjs` formatter outputs a human-readable comment summary above the `media` block, keeping the `media` object structurally clean.

## Performance characteristics (M2 Pro, measured)

| Operation | Time |
|-----------|------|
| Subprocess startup | <1s |
| Single image analysis (P50) | ~180ms |
| Single image analysis (P95) | <1s |
| Peak RSS | ~200MB |

## Dependencies

| Package | Version | Location |
|---------|---------|----------|
| `opencv-contrib-python` | 4.10.0.84 | `~/.video-tts-env` |
| `numpy` | 1.26.4 | `~/.video-tts-env` (shared) |
| `Pillow` | 10.4.0 | `~/.video-tts-env` (shared) |

> `opencv-contrib-python` (not `opencv-python`) is required — only the contrib package includes `cv2.saliency`.

Version lock file: `scripts/short-video/lib/requirements-focus.txt`

## Consequences

- `focus_detector.py` runs in the shared Unified Venv (`~/.video-tts-env`, ADR-0011).
- OpenCV 4.10.0.84 is pinned. Upgrading to 5.x requires migrating from `CascadeClassifier` to a different face detector (e.g., YuNet) and finding a saliency alternative.
- `detectFocus()` is integrated into `asset-sourcer.mjs` as Phase 1 (before VLM Phase 2). Results stored in `asset.focusAnalysis`.
- `assignAssetsToScenes()` maps `asset.focusAnalysis` to `media-patch.json`'s `analysis.focusAnalysis` field.
- `MediaField.focus` in `remotion/src/types.ts` is marked `@deprecated` — Phase 2 will replace it with `protectedRegions`-based slot scoring.
- Phase 2 consumers (not yet implemented): `MediaBackground.tsx` (slot scoring + objectPosition), `verify-video.mjs` (frame analysis), `scene-layout.mjs` (dynamic slots).
- 194 tests pass (14 visual-analyzer + focus_detector protocol tests + asset-sourcer integration + apply-media-patch output boundary).

## Relationship to ADR-0009

This ADR complements ADR-0009 (VLM layer). The `visual-analyzer.mjs` gateway now manages **two** subprocesses:
1. VLM (`vlm_analyzer.py`) — semantic analysis, unchanged from ADR-0009.
2. Focus (`focus_detector.py`) — spatial analysis, new per this ADR.

Both share the same Node.js gateway, IPC pattern (line-delimited JSON), idle timer mechanism, and Unified Venv — but are otherwise independent (separate startup, memory, lifecycle).
