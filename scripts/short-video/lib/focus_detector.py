#!/usr/bin/env python3
"""
Focus Detector — Python subprocess for OpenCV-based visual focus detection.

Loads Haar Cascade face detector + Static Saliency Spectral Residual,
listens on stdin for line-delimited JSON requests, writes JSON responses
to stdout.

Actions:
  - analyze:  {"requestId": "uuid", "action": "analyze", "path": "/abs/path/to/file.jpg"}
  - exit:     {"action": "exit"}   (no response, no requestId)

Response format (one line):
  {"requestId": "uuid", "result": {<focus_analysis_output>}}

Auto-exits after 60 seconds of stdin idle.

Runs in ~/.video-tts-env Python venv (shared with VLM and F5-TTS).
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


# ─── Classifier ───

_face_cascade = None
_cascade_loaded = False

# Image format whitelist
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}
VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".flv"}


def init_classifier():
    """Load Haar Cascade once at startup. Set _cascade_loaded flag."""
    global _face_cascade, _cascade_loaded
    deps = load_deps()
    if deps is None:
        _cascade_loaded = False
        return
    cv2 = deps[0]
    try:
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        _face_cascade = cv2.CascadeClassifier(cascade_path)
        _cascade_loaded = not _face_cascade.empty()
        if not _cascade_loaded:
            sys.stderr.write(
                f"[focus_detector] Cascade file not found at: {cascade_path}\n"
            )
            sys.stderr.flush()
    except Exception as e:
        sys.stderr.write(f"[focus_detector] init_classifier error: {e}\n")
        sys.stderr.flush()
        _cascade_loaded = False


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

    if not _cascade_loaded:
        return _degraded("classifier_load_failed"), None

    try:
        rgb = load_normalized_rgb(path, Image, ImageOps, UnidentifiedImageError, np)
    except (UnidentifiedImageError, OSError, Exception) as e:
        sys.stderr.write(f"[focus_detector] Cannot read image {path}: {e}\n")
        sys.stderr.flush()
        return _degraded("cannot_read_image"), None

    img = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # ── Step 1: Face detection — output ALL faces ──
    faces = _face_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5
    )

    protected = []
    for (fx, fy, fw, fh) in faces:
        protected.append({
            "rect": [fx / w, fy / h, fw / w, fh / h],
            "kind": "face",
            "confidence": None,
            "confidenceKind": "not_provided",
        })

    # ── Step 2: Saliency — always compute as soft signal ──
    sal_success = False
    sal_map = None
    try:
        saliency = cv2.saliency.StaticSaliencySpectralResidual_create()
        sal_success, sal_map = saliency.computeSaliency(img)
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
    # Load classifier once at startup
    init_classifier()

    if not _cascade_loaded:
        sys.stderr.write("[focus_detector] Haar Cascade classifier not loaded")
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
    sys.exit(0)


if __name__ == "__main__":
    main()
