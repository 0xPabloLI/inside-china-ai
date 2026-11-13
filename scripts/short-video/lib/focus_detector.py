#!/usr/bin/env python3
"""
Focus Detector — Python subprocess for OpenCV-based visual focus detection.

Loads the YuNet face detector (cv2.FaceDetectorYN) + a Spectral Residual
saliency map, listens on stdin for line-delimited JSON requests, writes JSON
responses to stdout.

Actions:
  - analyze:  {"requestId": "uuid", "action": "analyze", "path": "/abs/path/to/file.jpg"}
  - exit:     {"action": "exit"}   (no response, no requestId)

Response format (one line):
  {"requestId": "uuid", "result": {<focus_analysis_output>}}

Auto-exits after 60 seconds of stdin idle.

Runs in the production VLM venv (`~/.venvs/mlx-vlm`, OpenCV 5.0) — the same
interpreter `visual-analyzer.mjs` spawns and `probeFocusRuntime()` checks
(#396). Both OpenCV 4.x and 5.x work: YuNet exists in both, and the saliency
map is computed in numpy so no `cv2.saliency` module is required.
"""

import sys
import json
import os
import time
import threading

# ─── Idle timer (reuses vlm_analyzer.py pattern) ───


class IdleTimer:
    """Background thread that exits the process after a period of stdin idle.

    Uses Event.wait(poll_interval) instead of sleep(timeout) to avoid
    doubling the actual exit time. Lock protects _last_activity.
    """

    def __init__(self, timeout_seconds, poll_interval=None):
        self.timeout = timeout_seconds
        self._poll = poll_interval or min(10.0, timeout_seconds / 10.0)
        self._last_activity = time.monotonic()
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None

    def touch(self):
        """Reset the idle timer — called on receive, dispatch start/end."""
        with self._lock:
            self._last_activity = time.monotonic()

    def start(self):
        """Start daemon watchdog thread."""
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        """Stop timer before graceful exit."""
        self._stop.set()

    def _run(self):
        while not self._stop.wait(self._poll):
            with self._lock:
                elapsed = time.monotonic() - self._last_activity
            if elapsed >= self.timeout:
                sys.stderr.write(
                    f"[focus_detector] Idle for {int(elapsed)}s, exiting.\n"
                )
                sys.stderr.flush()
                os._exit(0)


# ─── Dependency lazy-loading ───

_DEPS = None
_DEP_ERROR = None


def load_deps():
    """Lazy-load cv2, numpy, PIL. Returns tuple or None on failure."""
    global _DEPS, _DEP_ERROR
    if _DEPS is not None:
        return _DEPS
    if _DEP_ERROR is not None:
        return None
    try:
        import cv2
        import numpy as np
        from PIL import Image, ImageOps, UnidentifiedImageError
        _DEPS = (cv2, np, Image, ImageOps, UnidentifiedImageError)
    except ImportError as exc:
        _DEP_ERROR = exc
        sys.stderr.write(f"[focus_detector] Dependency import failed: {exc}\n")
        sys.stderr.flush()
    return _DEPS


# ─── Face detector (YuNet) ───

_face_detector = None
_detector_loaded = False

_HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODEL_PATH = os.path.join(
    _HERE, "..", "models", "face_detection_yunet_2023mar.onnx"
)
MODEL_PATH = os.path.abspath(os.environ.get("FOCUS_FACE_MODEL", DEFAULT_MODEL_PATH))

# Inputs are letterbox-free: the long side is scaled to this size and the
# aspect ratio preserved (#391 evaluation config).
INPUT_LONG_SIDE = 320
SCORE_THRESHOLD = 0.6
NMS_THRESHOLD = 0.3

# Image format whitelist
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}
VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".flv"}


def init_detector():
    """Load the YuNet ONNX model once at startup. Set _detector_loaded flag."""
    global _face_detector, _detector_loaded
    deps = load_deps()
    if deps is None:
        _detector_loaded = False
        return
    cv2 = deps[0]
    if not hasattr(cv2, "FaceDetectorYN"):
        sys.stderr.write(
            "[focus_detector] cv2.FaceDetectorYN unavailable "
            f"(OpenCV {getattr(cv2, '__version__', 'unknown')})\n"
        )
        sys.stderr.flush()
        _detector_loaded = False
        return
    if not os.path.isfile(MODEL_PATH):
        sys.stderr.write(f"[focus_detector] YuNet model not found at: {MODEL_PATH}\n")
        sys.stderr.flush()
        _detector_loaded = False
        return
    try:
        _face_detector = cv2.FaceDetectorYN.create(
            MODEL_PATH,
            "",
            (INPUT_LONG_SIDE, INPUT_LONG_SIDE),
            SCORE_THRESHOLD,
            NMS_THRESHOLD,
            5000,
        )
        _detector_loaded = _face_detector is not None
    except Exception as e:
        sys.stderr.write(f"[focus_detector] init_detector error: {e}\n")
        sys.stderr.flush()
        _detector_loaded = False


def detect_faces(img, cv2):
    """Run YuNet on `img`, returning normalized face rects.

    The frame is downscaled so its long side is at most INPUT_LONG_SIDE, and
    boxes are normalized against the (proportional) resized frame — the ratio
    to the source frame is identical because the aspect ratio is preserved.
    """
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest > INPUT_LONG_SIDE:
        scale = INPUT_LONG_SIDE / float(longest)
        frame = cv2.resize(
            img,
            (max(1, int(round(w * scale))), max(1, int(round(h * scale)))),
            interpolation=cv2.INTER_AREA,
        )
    else:
        frame = img
    fh, fw = frame.shape[:2]

    _face_detector.setInputSize((fw, fh))
    _count, faces = _face_detector.detect(frame)
    if faces is None:
        return []

    regions = []
    for row in faces:
        x, y, bw, bh = (float(v) for v in row[:4])
        score = float(row[-1])
        # Clamp to the frame so the normalized rect stays inside [0, 1].
        x0 = min(max(x, 0.0), fw)
        y0 = min(max(y, 0.0), fh)
        x1 = min(max(x + bw, 0.0), fw)
        y1 = min(max(y + bh, 0.0), fh)
        regions.append({
            "rect": [x0 / fw, y0 / fh, (x1 - x0) / fw, (y1 - y0) / fh],
            "kind": "face",
            "confidence": round(score, 4),
            "confidenceKind": "detector_score",
        })
    return regions


def compute_saliency(img, cv2, np):
    """Spectral Residual saliency (Hou & Zhang 2007) on numpy FFT.

    OpenCV 5.x dropped `cv2.saliency` entirely, and having one interpreter use
    the built-in module while another uses a fallback would make cached
    dispersion/centroid values interpreter-dependent. So this is the single
    implementation everywhere. It mirrors OpenCV's
    StaticSaliencySpectralResidual: 64x64 log-spectrum minus its 3x3 mean,
    inverse transform, Gaussian blur on the 64x64 map, resize, min-max
    normalize. Measured against OpenCV 4.10 on real assets: per-pixel MAE
    ~0.024, centroid within 0.01, dispersion within ~20% (both far above the
    0.01 consumer threshold).
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    small = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_AREA).astype(np.float32)
    spectrum = np.fft.fft2(small)
    log_amplitude = np.log(np.abs(spectrum) + 1.0)
    phase = np.angle(spectrum)
    residual = log_amplitude - cv2.blur(log_amplitude, (3, 3))
    sal_map = np.abs(np.fft.ifft2(np.exp(residual + 1j * phase))) ** 2
    sal_map = cv2.GaussianBlur(sal_map.astype(np.float32), (3, 3), 2.5)
    sal_map = cv2.resize(sal_map, (img.shape[1], img.shape[0]))
    sal_map = cv2.normalize(sal_map, None, 0.0, 1.0, cv2.NORM_MINMAX)
    return True, sal_map.astype(np.float32)


# ─── Result helpers ───


def _degraded(error_code):
    """Return a schema-complete degraded result."""
    return {
        "status": "degraded",
        "errorCode": error_code,
        "frame": None,
        "protectedRegions": [],
        "saliency": {"available": False, "dispersion": 0.0, "centroid": [0.5, 0.5]},
    }


def _unsupported(error_code):
    """Return a schema-complete unsupported result."""
    return {
        "status": "unsupported",
        "errorCode": error_code,
        "frame": None,
        "protectedRegions": [],
        "saliency": {"available": False, "dispersion": 0.0, "centroid": [0.5, 0.5]},
    }


# ─── Image loading (EXIF normalization) ───


def load_normalized_rgb(path, Image, ImageOps, UnidentifiedImageError, np):
    """Load image with EXIF rotation applied and converted to RGB.

    Returns numpy array (H, W, 3) in RGB order.
    Raises UnidentifiedImageError, OSError, or generic Exception on failure.
    """
    with Image.open(path) as source:
        normalized = ImageOps.exif_transpose(source).convert("RGB")
        return np.asarray(normalized).copy()


# ─── Analysis ───


def handle_analyze(path):
    """Analyze a static image. Returns (result_dict, error_string)."""
    ext = os.path.splitext(path)[1].lower()
    if ext in VIDEO_EXTS:
        return _unsupported("video_not_supported"), None
    if ext not in ALLOWED_IMAGE_EXTS:
        return _unsupported("unsupported_media_type"), None

    deps = load_deps()
    if deps is None:
        missing = str(_DEP_ERROR) if _DEP_ERROR else "unknown"
        if "cv2" in missing or "opencv" in missing.lower():
            return _degraded("opencv_not_available"), None
        elif "PIL" in missing or "pillow" in missing.lower():
            return _degraded("pillow_not_available"), None
        elif "numpy" in missing.lower():
            return _degraded("numpy_not_available"), None
        return _degraded("focus_dependency_not_available"), None

    cv2, np, Image, ImageOps, UnidentifiedImageError = deps

    if not _detector_loaded:
        return _degraded("classifier_load_failed"), None

    try:
        rgb = load_normalized_rgb(path, Image, ImageOps, UnidentifiedImageError, np)
    except (UnidentifiedImageError, OSError, Exception) as e:
        sys.stderr.write(f"[focus_detector] Cannot read image {path}: {e}\n")
        sys.stderr.flush()
        return _degraded("cannot_read_image"), None

    img = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    h, w = img.shape[:2]

    # ── Step 1: Face detection (YuNet) — output ALL faces ──
    protected = detect_faces(img, cv2)

    # ── Step 2: Saliency — always compute as soft signal ──
    sal_success = False
    sal_map = None
    try:
        sal_success, sal_map = compute_saliency(img, cv2, np)
    except Exception as e:
        sys.stderr.write(f"[focus_detector] Saliency computation error: {e}\n")
        sys.stderr.flush()
        sal_success = False

    sal_dispersion = 0.0
    sal_centroid = [0.5, 0.5]
    if sal_success and sal_map is not None:
        sal_variance = float(np.var(sal_map))
        sal_dispersion = min(sal_variance * 10.0, 1.0)
        ys = np.arange(h)
        xs = np.arange(w)
        total = np.sum(sal_map) + 1e-8
        sal_cy = float(np.sum(ys[:, None] * sal_map) / total) / h
        sal_cx = float(np.sum(xs[None, :] * sal_map) / total) / w
        sal_centroid = [sal_cx, sal_cy]

    # ── Determine status ──
    if not sal_success and len(protected) == 0:
        status = "degraded"
        error_code = "saliency_compute_failed"
    elif not sal_success and len(protected) > 0:
        status = "partial"
        error_code = "saliency_compute_failed"
    elif sal_dispersion < 0.01 and len(protected) == 0:
        status = "low_information"
        error_code = None
    else:
        status = "ok"
        error_code = None

    return {
        "status": status,
        "errorCode": error_code,
        "frame": {
            "width": w, "height": h,
            "orientation": "landscape" if w > h else "portrait",
            "orientationNormalized": True,
        },
        "protectedRegions": protected,
        "saliency": {
            "available": sal_success,
            "dispersion": sal_dispersion,
            "centroid": sal_centroid,
        },
    }, None


# ─── IPC helpers ───


def write_envelope(req_id, result):
    """Write a single response envelope to stdout."""
    response = {"requestId": req_id, "result": result}
    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()


def dispatch(req_id, path, timer):
    """Dispatch wrapper — guarantees every valid analyze request gets a response.

    Catches handler exceptions and returns focus_internal_error.
    """
    timer.touch()
    try:
        result, _ = handle_analyze(path)
    except Exception as exc:
        sys.stderr.write(f"[focus_detector] Handler exception for {req_id}: {exc}\n")
        sys.stderr.flush()
        result = _degraded("focus_internal_error")
    timer.touch()
    write_envelope(req_id, result)


# ─── Main ───


def main():
    # Load the YuNet detector once at startup
    init_detector()

    if not _detector_loaded:
        sys.stderr.write("[focus_detector] YuNet face detector not loaded")
        if load_deps() is None:
            dep_err = str(_DEP_ERROR) if _DEP_ERROR else "unknown"
            sys.stderr.write(f" (dependency missing: {dep_err})")
        sys.stderr.write(". Subprocess will return degraded results.\n")
        sys.stderr.flush()

    # Start idle timer (60s default, injectable for tests)
    timeout = float(os.environ.get("FOCUS_IDLE_TIMEOUT_SECONDS", "60"))
    timer = IdleTimer(timeout)
    timer.start()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        timer.touch()

        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            sys.stderr.write(f"[focus_detector] Invalid JSON: {line[:200]}\n")
            sys.stderr.flush()
            continue

        req_id = request.get("requestId", "")
        action = request.get("action", "")

        if action == "exit":
            timer.stop()
            break
        elif action == "analyze":
            path = request.get("path", "")
            dispatch(req_id, path, timer)
        else:
            write_envelope(req_id, _degraded("focus_protocol_error"))

    timer.stop()
    # cv2's ONNX session teardown stalls the interpreter after `sys.exit` —
    # measured 13s on OpenCV 5.0 and 72s on 4.10 once FaceDetectorYN is loaded.
    # Every response is already flushed, so exit hard exactly like IdleTimer.
    os._exit(0)


if __name__ == "__main__":
    main()
