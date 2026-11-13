# Visual Focus Detection: OpenCV Subprocess

The VLM layer (ADR-0009) excels at semantic analysis but is unreliable for spatial localization — `focusRegion` outputs vary between prompts, and coordinate precision is coarse. The pipeline needs deterministic, lightweight spatial analysis to detect faces and saliency hotspots, producing "protected regions" that prevent text overlays from covering key subjects.

**Use OpenCV via a dedicated Python subprocess** (`focus_detector.py`), managed by the `visual-analyzer.mjs` Node.js gateway alongside the VLM subprocess. The two subprocesses are independent — separate startup, memory, and lifecycle. Inside the subprocess: `cv2.FaceDetectorYN` (YuNet, `scripts/short-video/models/face_detection_yunet_2023mar.onnx`) for faces and a numpy spectral-residual saliency map (#396).

## Considered Options

- **VLM-only** (reuse Qwen3-VL for spatial tasks): Unstable — same image, different prompts produce different `focusRegion` values. Slow (20-30s vs <200ms for OpenCV). No bounding-box precision.
- **YOLO / SAM** (deep learning detectors): Heavyweight, requires GPU or slow CPU inference, additional model management. Overkill for face detection + saliency.
- **Cloud vision APIs**: Per-call cost, privacy concerns. Local-first design principle.
- **Haar Cascade + `cv2.saliency` (OpenCV 4.10, the original choice)**: Both were removed in OpenCV 5.x, and the production interpreter (`~/.venvs/mlx-vlm`) runs 5.0.0 — the detector silently returned `degraded` on every request while tests probed a separate 4.10 venv (#396). Replaced by YuNet (faster, fewer false positives on graphics) plus a numpy saliency implementation that exists in both 4.x and 5.x.

## Consequences

- Architecture, performance, and API details: see `docs/video-production-runbook.md` → VLM Asset Analysis.
- `focus_detector.py` runs in the production VLM venv (`~/.venvs/mlx-vlm`, ADR-0011), which is also what `probeFocusRuntime()` and both focus test suites check — one interpreter, no second-venv probe (#396).
- Weights are a checked-in 232 KB ONNX file (MIT, opencv/opencv_zoo) with its SHA256 in `scripts/short-video/models/README.md`; `FOCUS_FACE_MODEL` overrides the path.
- Both OpenCV 4.x and 5.x work: YuNet exists in both, and saliency no longer depends on `cv2.saliency`. `lib/requirements-focus.txt` pins the 5.x runtime actually in use.
- Alternatives survey: `docs/research/asset-focus-detection-alternatives.md`.
