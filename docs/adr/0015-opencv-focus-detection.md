# Visual Focus Detection: OpenCV Subprocess

The VLM layer (ADR-0009) excels at semantic analysis but is unreliable for spatial localization — `focusRegion` outputs vary between prompts, and coordinate precision is coarse. The pipeline needs deterministic, lightweight spatial analysis to detect faces and saliency hotspots, producing "protected regions" that prevent text overlays from covering key subjects.

**Use OpenCV 4.10.0.84 (contrib) via a dedicated Python subprocess** (`focus_detector.py`), managed by the `visual-analyzer.mjs` Node.js gateway alongside the VLM subprocess. The two subprocesses are independent — separate startup, memory, and lifecycle.

## Considered Options

- **VLM-only** (reuse Qwen3-VL for spatial tasks): Unstable — same image, different prompts produce different `focusRegion` values. Slow (20-30s vs <200ms for OpenCV). No bounding-box precision.
- **YOLO / SAM** (deep learning detectors): Heavyweight, requires GPU or slow CPU inference, additional model management. Overkill for face detection + saliency.
- **Cloud vision APIs**: Per-call cost, privacy concerns. Local-first design principle.
- **OpenCV 5.0**: Removed `CascadeClassifier` and `cv2.saliency` modules. Pinned to 4.10.0.84.

## Consequences

- Architecture, performance, and API details: see `docs/video-workflow.md` → VLM Asset Analysis.
- `focus_detector.py` runs in the shared unified venv (`~/.video-tts-env`, ADR-0011).
- OpenCV 4.10.0.84 is pinned. Upgrading to 5.x requires migrating to a different face detector and saliency alternative.
- Alternatives survey: `docs/research/asset-focus-detection-alternatives.md`.
