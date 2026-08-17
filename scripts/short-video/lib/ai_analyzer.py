#!/usr/bin/env python3
"""
AI Analyzer — Python subprocess for VLM-powered asset understanding.

Loads mlx-community/Qwen3-VL-8B-Instruct-8bit via mlx-vlm, listens on stdin
for line-delimited JSON requests, writes JSON responses to stdout.

Actions:
  - describe_image:  {"action": "describe_image", "path": "/abs/path/to/file.jpg"}
  - describe_video:  {"action": "describe_video", "path": "/abs/path/to/clip.mp4"}
  - exit:            {"action": "exit"}

Response format (one line):
  {"description": "...", "error": null}
  {"description": "", "error": "reason"}

Auto-exits after 5 minutes of stdin idle.

Video analysis uses Qwen3-VL native video processor (--video path --fps 1.0).
Falls back to ffmpeg frame extraction (1 fps → multi-image input) if native
video path raises.

Runs in ~/.vlm-env Python venv (separate from ~/.video-tts-env to avoid
transformers version conflicts: mlx-vlm needs >=5.14, qwen-tts needs 4.57.3).
ffmpeg path: /opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
"""

import sys
import json
import os
import threading
import time
import subprocess
import tempfile
import glob

# ─── Constants ───

MODEL_ID = "mlx-community/Qwen3-VL-8B-Instruct-8bit"
FALLBACK_MODEL_ID = "mlx-community/Qwen3-VL-8B-Instruct-4bit"
FFMPEG_PATH = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
IDLE_TIMEOUT_SECONDS = 300  # 5 minutes
PROMPT = (
    "Describe what is happening in this video/image in 1-2 sentences. "
    "Focus on the main subject, setting, and any visible technology, "
    "products, or brands."
)
VIDEO_FPS = 1.0
MAX_VIDEO_SECONDS = 8  # cap analysis at 8s of video


# ─── Idle timer ───

class IdleTimer:
    """Background thread that exits the process after a period of stdin idle."""

    def __init__(self, timeout_seconds):
        self.timeout = timeout_seconds
        self._last_activity = time.time()
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def touch(self):
        """Reset the idle timer — called when stdin input is received."""
        with self._lock:
            self._last_activity = time.time()

    def _run(self):
        while not self._stop.wait(10):
            with self._lock:
                elapsed = time.time() - self._last_activity
            if elapsed >= self.timeout:
                sys.stderr.write(
                    f"[ai_analyzer] Idle for {int(elapsed)}s, exiting.\n"
                )
                sys.stderr.flush()
                os._exit(0)

    def stop(self):
        self._stop.set()


# ─── Model loading ───

def load_model(model_id):
    """Load the VLM model and processor via mlx_vlm.

    Returns (model, processor) or raises on failure.
    """
    from mlx_vlm import load
    from mlx_vlm.utils import load_config

    model, processor = load(model_id)
    return model, processor


def generate_response(model, processor, image_paths=None, video_path=None,
                      fps=VIDEO_FPS, max_frames=None):
    """Generate a text description from image(s) or video.

    Uses mlx_vlm.generate with the configured prompt at temperature 0.0.
    """
    from mlx_vlm import generate
    from mlx_vlm.prompt_utils import apply_prompt_template

    # Build prompt
    prompt = PROMPT

    if video_path is not None:
        # Native video input path
        response = generate(
            model,
            processor,
            prompt=prompt,
            video=video_path,
            fps=fps,
            max_frames=max_frames,
            temperature=0.0,
            verbose=False,
        )
    elif image_paths is not None:
        if isinstance(image_paths, str):
            image_paths = [image_paths]
        response = generate(
            model,
            processor,
            prompt=prompt,
            image=image_paths,
            temperature=0.0,
            verbose=False,
        )
    else:
        raise ValueError("Either image_paths or video_path must be provided")

    # mlx_vlm.generate may return a string or a dict with 'text' key
    if isinstance(response, dict):
        return response.get("text", str(response))
    return str(response)


# ─── Video fallback: ffmpeg frame extraction ───

def extract_frames(video_path, fps=1.0, max_seconds=MAX_VIDEO_SECONDS):
    """Extract frames from a video using ffmpeg at the given fps.

    Returns a list of temporary image file paths.
    Returns empty list on failure.
    """
    tmpdir = tempfile.mkdtemp(prefix="ai_analyzer_frames_")
    output_pattern = os.path.join(tmpdir, "frame_%04d.jpg")

    cmd = [
        FFMPEG_PATH,
        "-y",
        "-i", video_path,
        "-t", str(max_seconds),  # cap at max_seconds
        "-vf", f"fps={fps}",
        "-q:v", "2",
        output_pattern,
    ]

    try:
        subprocess.run(
            cmd,
            capture_output=True,
            timeout=30,
            check=True,
        )
    except Exception as e:
        sys.stderr.write(f"[ai_analyzer] ffmpeg frame extraction failed: {e}\n")
        sys.stderr.flush()
        return []

    frames = sorted(glob.glob(output_pattern))
    return frames


# ─── Request handlers ───

def handle_describe_image(model, processor, path):
    """Handle a describe_image request.

    Returns (description, error) tuple.
    """
    if not os.path.exists(path):
        return "", f"File not found: {path}"

    try:
        from PIL import Image
        # Verify the file is a valid image
        img = Image.open(path)
        img.verify()  # Raises if corrupt
    except Exception as e:
        return "", f"Invalid or corrupt image: {e}"

    try:
        description = generate_response(model, processor, image_paths=path)
        return description.strip(), None
    except Exception as e:
        return "", f"VLM generation failed: {e}"


def handle_describe_video(model, processor, path):
    """Handle a describe_video request.

    Tries native video input first, falls back to ffmpeg frame extraction.

    Returns (description, error) tuple.
    """
    if not os.path.exists(path):
        return "", f"File not found: {path}"

    # Try native video input
    try:
        description = generate_response(
            model, processor, video_path=path,
            fps=VIDEO_FPS,
        )
        return description.strip(), None
    except Exception as e:
        sys.stderr.write(
            f"[ai_analyzer] Native video input failed, falling back to "
            f"frame extraction: {e}\n"
        )
        sys.stderr.flush()

    # Fallback: extract frames via ffmpeg, pass as multi-image input
    frames = extract_frames(path, fps=VIDEO_FPS, max_seconds=MAX_VIDEO_SECONDS)
    if not frames:
        return "", "Both native video and frame extraction failed"

    try:
        description = generate_response(model, processor, image_paths=frames)
        # Clean up temp frames
        _cleanup_frames(frames)
        return description.strip(), None
    except Exception as e:
        _cleanup_frames(frames)
        return "", f"VLM generation from frames failed: {e}"


def _cleanup_frames(frame_paths):
    """Remove temporary frame files and their directory."""
    if not frame_paths:
        return
    tmpdir = os.path.dirname(frame_paths[0])
    for f in frame_paths:
        try:
            os.unlink(f)
        except OSError:
            pass
    try:
        os.rmdir(tmpdir)
    except OSError:
        pass


# ─── Main loop ───

def main():
    """Main IPC loop: read line-delimited JSON from stdin, write responses to stdout."""

    # Load model
    sys.stderr.write(f"[ai_analyzer] Loading model: {MODEL_ID}\n")
    sys.stderr.flush()

    try:
        model, processor = load_model(MODEL_ID)
        sys.stderr.write("[ai_analyzer] Model loaded successfully.\n")
        sys.stderr.flush()
    except Exception as e:
        # Try fallback model
        sys.stderr.write(
            f"[ai_analyzer] Failed to load {MODEL_ID}: {e}\n"
            f"[ai_analyzer] Trying fallback: {FALLBACK_MODEL_ID}\n"
        )
        sys.stderr.flush()
        try:
            model, processor = load_model(FALLBACK_MODEL_ID)
            sys.stderr.write(f"[ai_analyzer] Fallback model loaded.\n")
            sys.stderr.flush()
        except Exception as e2:
            # Output error JSON and exit
            sys.stdout.write(
                json.dumps({"description": "", "error": f"Model load failed: {e2}"}) + "\n"
            )
            sys.stdout.flush()
            sys.exit(1)

    # Start idle timer
    idle_timer = IdleTimer(IDLE_TIMEOUT_SECONDS)

    # Read requests line by line
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        idle_timer.touch()

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            response = {"description": "", "error": f"Invalid JSON: {e}"}
        else:
            action = request.get("action", "")

            if action == "exit":
                idle_timer.stop()
                sys.exit(0)

            elif action == "describe_image":
                path = request.get("path", "")
                desc, err = handle_describe_image(model, processor, path)
                response = {"description": desc, "error": err}

            elif action == "describe_video":
                path = request.get("path", "")
                desc, err = handle_describe_video(model, processor, path)
                response = {"description": desc, "error": err}

            else:
                response = {"description": "", "error": f"Unknown action: {action}"}

        # Write response as single line
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()

    # stdin closed (EOF)
    idle_timer.stop()
    sys.exit(0)


if __name__ == "__main__":
    main()
