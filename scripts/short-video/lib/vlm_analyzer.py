#!/usr/bin/env python3
"""
AI Analyzer — Python subprocess for VLM-powered asset understanding.

Loads mlx-community/Qwen3-VL-2B-Instruct-4bit via mlx-vlm, listens on stdin
for line-delimited JSON requests, writes JSON responses to stdout.
Uses a Cascade Router: complex/low-confidence results escalate to
GLM-4.1V-9B-Thinking-4bit (lazy-loaded on first escalation).

Actions:
  - analyze_semantics: {"action": "analyze_semantics", "path": "/abs/path/to/file"}
  - exit:               {"action": "exit"}

Response format (one line):
  {"description": "...", "subjects": ["..."], "contentKind": "...",
   "fit": "..."|null, "criticalEdgeText": "..."|null, "reason": "..."|null,
   "error": null}
  {"description": "", "subjects": [], ..., "error": "reason"}

VLM outputs Markdown with ## Section headers. Python parses it via
parse_markdown_to_dict() — pure string manipulation, no LLM needed.

Video analysis uses Qwen3-VL native video processor (mlx-vlm 0.6.16+ has
a numpy-based Qwen3VLVideoProcessor that fixes the upstream broadcast_shapes
bug in transformers). Falls back to ffmpeg frame extraction if native video
fails.

Image preprocessing: images with longest edge > MAX_IMAGE_LONG_EDGE are
resized to prevent high-resolution hallucinations (probabilistic bug in
Qwen3-VL at resolutions > ~2000px).

Runs in ~/.video-tts-env Python venv (shared with F5-TTS and whisperx).
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
from PIL import Image, ImageOps

# ─── Constants ───

MODEL_ID = "mlx-community/Qwen3-VL-2B-Instruct-4bit"
FFMPEG_PATH = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
IDLE_TIMEOUT_SECONDS = 300  # 5 minutes
VIDEO_FPS = 1.0
MAX_VIDEO_SECONDS = 8  # cap analysis at 8s of video
MAX_IMAGE_LONG_EDGE = 1920  # resize images with longer edge > this to prevent hallucinations

# ─── Cascade Router: deep model constants ───

DEEP_MODEL_ID = "mlx-community/GLM-4.1V-9B-Thinking-4bit"
DEEP_MODEL_MIN_RAM_GB = 6  # GLM peak ~1.1GB, leave headroom for 2B + OS

SEMANTICS_PROMPT_IMAGE = """Analyze this image for use in a 9:16 vertical video. Provide your analysis as Markdown with the following sections:

## Description
1-2 sentences describing what is happening in this image.

## Subjects
Comma-separated key subject terms (e.g., "robot, kitchen, product").

## Content Kind
One of: product_demo, talking_head, landscape, chart, text_screenshot, other

## Fit
"cover" or "contain" — will this image be placed in a 9:16 vertical canvas? Use "cover" if edge content is non-critical and can be cropped. Use "contain" if edges have text/UI that must not be cropped.

## Critical Edge Text
"yes" or "no" followed by a brief note if yes (e.g., "yes — bottom edge has product label text").

## Reason
One sentence explaining the fit decision.

Example:
## Description
A humanoid robot demonstrating household tasks in a kitchen setting.

## Subjects
robot, kitchen, product

## Content Kind
product_demo

## Fit
contain

## Critical Edge Text
yes — bottom edge has product label text

## Reason
Bottom edge has product label text that would be cropped in vertical format.
"""

SEMANTICS_PROMPT_VIDEO = """Analyze this video for use in a 9:16 vertical video. Provide your analysis as Markdown with the following sections:

## Description
1-2 sentences describing what is happening in this video.

## Subjects
Comma-separated key subject terms (e.g., "robot, factory, mobility").

## Content Kind
One of: product_demo, talking_head, landscape, chart, text_screenshot, other

Example:
## Description
A humanoid robot walking through a factory floor, demonstrating mobility.

## Subjects
robot, factory, mobility

## Content Kind
talking_head
"""

VALID_FITS = {"cover", "contain"}

# Minimum description length (chars). Below this threshold, the 2B model's
# output is considered too short / low-confidence and escalated to GLM.
MIN_DESCRIPTION_CHARS = 100

# Minimum number of times a word must repeat to trigger repetition signal.
MIN_REPETITION_COUNT = 3


# ─── Cascade Router: escalation logic ───

def should_escalate(parsed_result, is_video=False):
    """Determine if the 2B model's output should be escalated to GLM-4.1V-9B.

    A pure function that inspects the parsed VLM output and returns True if
    any of the following signals are detected:

    1. Short output: description < 100 characters
    2. Missing fit (images only): fit is None for image assets
    3. Empty description: description is None, empty, or whitespace-only
    4. Repetition: same word/phrase repeated >= 3 times in description

    Args:
        parsed_result: Dict from parse_markdown_to_dict() with keys like
                       description, subjects, contentKind, fit, etc.
        is_video: If True, missing fit is NOT an escalation signal (videos
                  don't have a fit field in their prompt).

    Returns:
        True if escalation is recommended, False otherwise.
    """
    if not parsed_result:
        return True

    description = parsed_result.get("description")

    # Signal 3: Empty / None / whitespace-only description
    if not description or not description.strip():
        return True

    # Signal 1: Short description (< MIN_DESCRIPTION_CHARS chars)
    if len(description) < MIN_DESCRIPTION_CHARS:
        return True

    # Signal 2: Missing fit for images (videos don't have fit)
    if not is_video and parsed_result.get("fit") is None:
        return True

    # Signal 4: Repetition — same word repeated >= MIN_REPETITION_COUNT times
    words = description.lower().split()
    if len(words) >= MIN_REPETITION_COUNT:
        word_counts = {}
        for word in words:
            word_counts[word] = word_counts.get(word, 0) + 1
        for count in word_counts.values():
            if count >= MIN_REPETITION_COUNT:
                return True

    return False


# ─── Cascade Router: RAM check ───

def check_ram_available():
    """Check if sufficient RAM is available to load the GLM deep model.

    Returns True if available RAM >= DEEP_MODEL_MIN_RAM_GB.
    Returns True (fail-open) if psutil is unavailable — better to try
    loading and fail than to never try.
    """
    try:
        import psutil
        available = psutil.virtual_memory().available
        available_gb = available / (1024 ** 3)
        return available_gb >= DEEP_MODEL_MIN_RAM_GB
    except ImportError:
        sys.stderr.write(
            "[vlm_analyzer] psutil not available, skipping RAM check (fail-open)\n"
        )
        sys.stderr.flush()
        return True


# ─── Cascade Router: deep model lazy loading ───

# Module-level state for lazy-loaded GLM deep model.
_deep_model = None
_deep_processor = None
_deep_loaded = False


def get_deep_model():
    """Lazy-load the GLM deep model on first call. Returns (model, processor)
    or (None, None) if loading fails.
    """
    global _deep_model, _deep_processor, _deep_loaded

    if _deep_loaded and _deep_model is not None:
        return _deep_model, _deep_processor

    if not check_ram_available():
        sys.stderr.write(
            f"[vlm_analyzer] Insufficient RAM for {DEEP_MODEL_ID}, "
            f"skipping deep model load\n"
        )
        sys.stderr.flush()
        return None, None

    try:
        sys.stderr.write(f"[vlm_analyzer] Loading deep model: {DEEP_MODEL_ID}\n")
        sys.stderr.flush()
        _deep_model, _deep_processor = load_model(DEEP_MODEL_ID)
        _deep_loaded = True
        sys.stderr.write("[vlm_analyzer] Deep model loaded successfully.\n")
        sys.stderr.flush()
        return _deep_model, _deep_processor
    except Exception as e:
        sys.stderr.write(
            f"[vlm_analyzer] Failed to load deep model {DEEP_MODEL_ID}: {e}\n"
        )
        sys.stderr.flush()
        _deep_loaded = False
        return None, None


# ─── Markdown parser ───

def parse_markdown_to_dict(raw_text):
    """Parse VLM Markdown output into a dict with 6 mandatory keys.

    Logic:
    1. Strip markdown code fences (```markdown ... ```) if present
    2. Split by '## ' to get sections
    3. Key = first line of section → lowercase + snake_case
    4. Value = rest of section → trim
    5. subjects → split by comma → list of trimmed strings (fallback: newline)
    6. contentKind, fit → enum validation (case-insensitive)
    7. Unrecognized sections → kept as raw key-value pairs (no error)
    8. If no '## ' found at all → entire text becomes description, other fields = null

    Returns dict with mandatory keys: description, subjects, contentKind,
    fit, criticalEdgeText, reason. Missing fields = None/[].
    """
    result = {
        "description": None,
        "subjects": None,
        "contentKind": None,
        "fit": None,
        "criticalEdgeText": None,
        "reason": None,
    }

    if not raw_text or not raw_text.strip():
        result["description"] = ""
        result["subjects"] = []
        return result

    text = raw_text.strip()

    # 1. Strip markdown code fences
    if text.startswith("```"):
        # Remove opening fence (```markdown, ```json, or just ```)
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline + 1:]
        # Remove closing fence
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3].rstrip()
        text = text.strip()

    # 2. Check if there are any '## ' headers
    if "## " not in text:
        # No headers — entire text becomes description
        result["description"] = text.strip()
        result["subjects"] = []
        return result

    # 3. Split by '## ' to get sections
    # Skip content before the first '## '
    first_header = text.find("## ")
    if first_header > 0:
        preamble = text[:first_header].strip()
        if preamble:
            # There's content before the first header — keep as part of description
            pass  # will be handled below

    sections_text = text[first_header:] if first_header >= 0 else text

    # Split by '## ' — each section starts with the header name
    sections = sections_text.split("## ")
    raw_sections = {}
    for section in sections:
        if not section.strip():
            continue
        lines = section.strip().split("\n", 1)
        key = lines[0].strip().lower().replace(" ", "_")
        value = lines[1].strip() if len(lines) > 1 else ""
        raw_sections[key] = value

    # 4. Map known fields
    # description
    if "description" in raw_sections:
        result["description"] = raw_sections["description"]
    else:
        # If no description section but we have other sections, description = ""
        result["description"] = ""

    # subjects → split by comma (or newline if only 1 element)
    if "subjects" in raw_sections:
        subjects_raw = raw_sections["subjects"]
        subjects = [s.strip() for s in subjects_raw.split(",") if s.strip()]
        if len(subjects) <= 1 and subjects_raw:
            # Try newline split
            subjects = [s.strip() for s in subjects_raw.split("\n") if s.strip()]
        result["subjects"] = subjects
    else:
        result["subjects"] = []

    # contentKind — case-insensitive enum, unknown values kept as-is
    if "content_kind" in raw_sections:
        result["contentKind"] = raw_sections["content_kind"]

    # fit — enum validation (case-insensitive), invalid → null
    if "fit" in raw_sections:
        fit_val = raw_sections["fit"].lower().strip()
        if fit_val in VALID_FITS:
            result["fit"] = fit_val
        else:
            result["fit"] = None
    else:
        result["fit"] = None

    # criticalEdgeText
    if "critical_edge_text" in raw_sections:
        result["criticalEdgeText"] = raw_sections["critical_edge_text"]
    else:
        result["criticalEdgeText"] = None

    # reason
    if "reason" in raw_sections:
        result["reason"] = raw_sections["reason"]
    else:
        result["reason"] = None

    # 5. Add unknown sections as extra key-value pairs
    known_keys = {"description", "subjects", "content_kind", "fit",
                  "critical_edge_text", "reason"}
    for key, value in raw_sections.items():
        if key not in known_keys:
            result[key] = value

    return result


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
                    f"[vlm_analyzer] Idle for {int(elapsed)}s, exiting.\n"
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
                      fps=VIDEO_FPS, max_frames=None, prompt_text=None):
    """Generate a text response from image(s) or video.

    Uses mlx_vlm.generate with the specified prompt at temperature 0.0.
    The prompt is formatted via processor.apply_chat_template so that the
    correct image/video token placeholders are inserted into input_ids.

    Args:
        prompt_text: The prompt to use (SEMANTICS_PROMPT_IMAGE or
                      SEMANTICS_PROMPT_VIDEO).
    """
    from mlx_vlm import generate

    effective_prompt = prompt_text if prompt_text is not None else SEMANTICS_PROMPT_IMAGE

    # Build chat-template-formatted prompt with image/video placeholder
    content = []
    if video_path is not None:
        content.append({"type": "video", "video": video_path})
    if image_paths is not None:
        if isinstance(image_paths, str):
            image_paths = [image_paths]
        for img_path in image_paths:
            content.append({"type": "image", "image": img_path})
    content.append({"type": "text", "text": effective_prompt})

    messages = [{"role": "user", "content": content}]
    prompt = processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )

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

    # mlx_vlm.generate returns a GenerationResult with .text attribute,
    # or a dict with 'text' key, or a plain string.
    if hasattr(response, "text"):
        return response.text
    elif isinstance(response, dict):
        return response.get("text", str(response))
    return str(response)


# ─── Video fallback: ffmpeg frame extraction ───

def extract_frames(video_path, fps=1.0, max_seconds=MAX_VIDEO_SECONDS,
                       start_ms=None, end_ms=None):
    """Extract frames from a video using ffmpeg at the given fps.

    Returns a list of temporary image file paths.
    Returns empty list on failure.

    When start_ms/end_ms are provided, uses ffmpeg -ss/-t for windowed extraction.
    Otherwise, extracts from the start up to max_seconds.
    """
    tmpdir = tempfile.mkdtemp(prefix="vlm_analyzer_frames_")
    output_pattern = os.path.join(tmpdir, "frame_%04d.jpg")
    glob_pattern = os.path.join(tmpdir, "frame_*.jpg")

    cmd = [
        FFMPEG_PATH,
        "-y",
    ]

    # Windowed extraction: -ss before -i for fast seek
    if start_ms is not None:
        cmd.extend(["-ss", str(start_ms / 1000.0)])

    cmd.extend(["-i", video_path])

    # Duration limit
    if end_ms is not None and start_ms is not None:
        duration_s = (end_ms - start_ms) / 1000.0
        cmd.extend(["-t", str(duration_s)])
    else:
        cmd.extend(["-t", str(max_seconds)])

    cmd.extend([
        "-vf", f"fps={fps}",
        "-q:v", "2",
        output_pattern,
    ])

    try:
        subprocess.run(
            cmd,
            capture_output=True,
            timeout=30,
            check=True,
        )
    except Exception as e:
        sys.stderr.write(f"[vlm_analyzer] ffmpeg frame extraction failed: {e}\n")
        sys.stderr.flush()
        return []

    frames = sorted(glob.glob(glob_pattern))
    return frames


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


# ─── Image preprocessing ───

def simulate_crop(img_path, target_ratio=9/16, focus=(0.5, 0.5)):
    """Crop image to target_ratio (simulating object-fit: cover) from a focus point.

    Applies EXIF transpose + RGB conversion (matching focus_detector.py
    normalization) before cropping. This ensures crop simulation, VLM analysis,
    and focus detection all operate in the same coordinate system.

    Args:
        img_path: Path to the source image.
        target_ratio: Target width/height ratio (default 9/16 = 0.5625 for vertical).
        focus: (x, y) normalized [0,1] focus point for crop centering.

    Returns:
        (cropped_path, cleanup_path):
          - cropped_path: Path to the cropped image (temp file or original if no crop needed)
          - cleanup_path: Path to delete after use (or None if no temp file created)
    """
    try:
        img = Image.open(img_path)
        img = ImageOps.exif_transpose(img).convert("RGB")
        w, h = img.size

        # Check if horizontal crop is needed (source wider than target)
        source_ratio = w / h
        if source_ratio <= target_ratio:
            # Source is narrower or same ratio — no horizontal crop needed
            return img_path, None

        # Calculate crop dimensions
        new_w = int(h * target_ratio)
        # Focus-adjusted crop start: center the crop on the focus point
        focus_x = max(0.0, min(1.0, focus[0]))
        left = int((w - new_w) * focus_x)
        left = max(0, min(left, w - new_w))
        cropped = img.crop((left, 0, left + new_w, h))

        # Save cropped version
        fd, tmp = tempfile.mkstemp(suffix=".jpg")
        os.close(fd)
        cropped.save(tmp, "JPEG", quality=90)
        sys.stderr.write(
            f"[vlm_analyzer] Cropped {img_path} from {w}x{h} to {new_w}x{h} "
            f"(focus: {focus_x:.2f})\n"
        )
        sys.stderr.flush()
        return tmp, tmp
    except Exception as e:
        sys.stderr.write(f"[vlm_analyzer] Crop simulation failed, using original: {e}\n")
        sys.stderr.flush()
        return img_path, None


def resize_image_if_needed(img_path):
    """Resize image if longest edge > MAX_IMAGE_LONG_EDGE.

    Applies EXIF transpose normalization before dimension check to ensure
    the VLM and focus detector operate in the same coordinate system.

    Returns (path_to_use, temp_path_to_clean_or_None).
    If no resize needed, returns (img_path, None).
    """
    try:
        img = Image.open(img_path)
        img = ImageOps.exif_transpose(img)
        w, h = img.size
        longest = max(w, h)
        if longest <= MAX_IMAGE_LONG_EDGE:
            return img_path, None

        scale = MAX_IMAGE_LONG_EDGE / longest
        new_w, new_h = int(w * scale), int(h * scale)
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        fd, tmp = tempfile.mkstemp(suffix=".jpg")
        os.close(fd)
        img.save(tmp, "JPEG", quality=90)
        sys.stderr.write(
            f"[vlm_analyzer] Resized {img_path} from {w}x{h} to {new_w}x{new_h}\n"
        )
        sys.stderr.flush()
        return tmp, tmp
    except Exception as e:
        sys.stderr.write(f"[vlm_analyzer] Resize failed, using original: {e}\n")
        sys.stderr.flush()
        return img_path, None


# ─── Request handler ───

def handle_analyze_semantics(model, processor, path, window=None):
    """Handle an analyze_semantics request.

    Dispatches to image or video prompt based on file extension.
    Outputs Markdown which is parsed by parse_markdown_to_dict.

    When window is provided (dict with startMs/endMs/sampleFps), uses it for
    frame extraction to ensure the analyzed temporal range matches.

    Returns (result_dict, error) tuple.
    """
    if not os.path.exists(path):
        return {}, f"File not found: {path}"

    ext = os.path.splitext(path)[1].lower()
    is_video = ext in (".mp4", ".mov", ".avi", ".mkv")

    # Parse window parameters
    if window:
        start_ms = window.get("startMs")
        end_ms = window.get("endMs")
        sample_fps = window.get("sampleFps", VIDEO_FPS)
    else:
        start_ms = None
        end_ms = None
        sample_fps = VIDEO_FPS

    try:
        if is_video:
            # Try native video input (mlx-vlm 0.6.16+ has numpy-based
            # Qwen3VLVideoProcessor that fixes the broadcast_shapes bug).
            # Fall back to ffmpeg frame extraction if native fails.
            try:
                raw = generate_response(
                    model, processor, video_path=path,
                    fps=sample_fps, prompt_text=SEMANTICS_PROMPT_VIDEO,
                )
                source_mode = "native"
            except Exception as e:
                sys.stderr.write(
                    f"[vlm_analyzer] Native video failed, falling back to frames: {e}\n"
                )
                sys.stderr.flush()
                frames = extract_frames(
                    path, fps=sample_fps,
                    max_seconds=MAX_VIDEO_SECONDS,
                    start_ms=start_ms, end_ms=end_ms,
                )
                if not frames:
                    return {}, "Both native video and frame extraction failed"
                try:
                    raw = generate_response(
                        model, processor, image_paths=frames,
                        prompt_text=SEMANTICS_PROMPT_VIDEO,
                    )
                finally:
                    _cleanup_frames(frames)
                source_mode = "frames"
        else:
            # Image — verify first
            try:
                img = Image.open(path)
                img.verify()
            except Exception as e:
                return {}, f"Invalid or corrupt image: {e}"

            # Preprocess: simulate 9:16 center crop for landscape images
            # (VLM sees what the viewer will see after cover crop)
            crop_path, crop_cleanup = simulate_crop(path, target_ratio=9/16, focus=(0.5, 0.5))
            try:
                # Preprocess: resize large images to prevent hallucinations
                actual_path, temp_path = resize_image_if_needed(crop_path)
                try:
                    raw = generate_response(
                        model, processor, image_paths=actual_path,
                        prompt_text=SEMANTICS_PROMPT_IMAGE,
                    )
                finally:
                    if temp_path:
                        try:
                            os.unlink(temp_path)
                        except OSError:
                            pass
            finally:
                if crop_cleanup:
                    try:
                        os.unlink(crop_cleanup)
                    except OSError:
                        pass
            source_mode = None  # images don't have sourceMode
    except Exception as e:
        return {}, f"VLM generation failed: {e}"

    # Parse Markdown output
    result = parse_markdown_to_dict(raw)

    # Add sourceMode for video assets
    if is_video and source_mode:
        result["sourceMode"] = source_mode

    # ─── Cascade Router: escalate to GLM if 2B output is low-confidence ───
    if should_escalate(result, is_video=is_video):
        sys.stderr.write(
            f"[vlm_analyzer] Escalating to deep model: {DEEP_MODEL_ID}\n"
        )
        sys.stderr.flush()

        deep_model, deep_processor = get_deep_model()
        if deep_model is not None:
            try:
                # Re-run with GLM using the same prompt and asset
                if is_video:
                    deep_raw = generate_response(
                        deep_model, deep_processor, video_path=path,
                        fps=sample_fps, prompt_text=SEMANTICS_PROMPT_VIDEO,
                    )
                else:
                    # For images, apply same preprocessing (crop + resize)
                    # as the 2B path. The temp files from the 2B run are
                    # already cleaned up by their finally blocks, so we
                    # re-preprocess here. GLM benefits from the same
                    # hallucination prevention.
                    crop_path2, crop_cleanup2 = simulate_crop(
                        path, target_ratio=9/16, focus=(0.5, 0.5))
                    try:
                        actual_path2, temp_path2 = resize_image_if_needed(
                            crop_path2)
                        try:
                            deep_raw = generate_response(
                                deep_model, deep_processor,
                                image_paths=actual_path2,
                                prompt_text=SEMANTICS_PROMPT_IMAGE,
                            )
                        finally:
                            if temp_path2:
                                try:
                                    os.unlink(temp_path2)
                                except OSError:
                                    pass
                    finally:
                        if crop_cleanup2:
                            try:
                                os.unlink(crop_cleanup2)
                            except OSError:
                                pass

                deep_result = parse_markdown_to_dict(deep_raw)

                # Preserve sourceMode from the 2B run for videos
                if is_video and source_mode:
                    deep_result["sourceMode"] = source_mode

                deep_result["escalated"] = True
                return deep_result, None

            except Exception as e:
                sys.stderr.write(
                    f"[vlm_analyzer] Deep model generation failed, "
                    f"using 2B result: {e}\n"
                )
                sys.stderr.flush()
        else:
            sys.stderr.write(
                "[vlm_analyzer] Deep model unavailable, using 2B result\n"
            )
            sys.stderr.flush()
    else:
        sys.stderr.write(
            "[vlm_analyzer] 2B output sufficient, no escalation needed\n"
        )
        sys.stderr.flush()

    result["escalated"] = False
    return result, None


# ─── Main loop ───

def main():
    """Main IPC loop: read line-delimited JSON from stdin, write responses to stdout."""

    # Load model
    sys.stderr.write(f"[vlm_analyzer] Loading model: {MODEL_ID}\n")
    sys.stderr.flush()

    try:
        model, processor = load_model(MODEL_ID)
        sys.stderr.write("[vlm_analyzer] Model loaded successfully.\n")
        sys.stderr.flush()
    except Exception as e:
        # No fallback — fail fast so the caller (visual-analyzer.mjs)
        # can handle the error and return a degraded result.
        sys.stderr.write(f"[vlm_analyzer] Failed to load {MODEL_ID}: {e}\n")
        sys.stderr.flush()
        degraded = _degraded_result(f"Model load failed: {e}")
        sys.stdout.write(json.dumps(degraded) + "\n")
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
            response = _degraded_result(f"Invalid JSON: {e}")
        else:
            action = request.get("action", "")
            request_id = request.get("requestId", "")

            if action == "exit":
                idle_timer.stop()
                sys.exit(0)

            elif action == "analyze_semantics":
                path = request.get("path", "")
                window = request.get("window")
                result, err = handle_analyze_semantics(model, processor, path, window=window)
                if err:
                    response = _degraded_result(err)
                else:
                    response = {**result, "error": None}

            else:
                response = _degraded_result(f"Unknown action: {action}")

            # R1 fix: echo requestId back so Node can route responses
            if request_id:
                response["requestId"] = request_id

        # Write response as single line
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()

    # stdin closed (EOF)
    idle_timer.stop()
    sys.exit(0)


def _degraded_result(error):
    """Return a degraded result dict with all fields null/empty."""
    return {
        "description": "",
        "subjects": [],
        "contentKind": None,
        "fit": None,
        "criticalEdgeText": None,
        "reason": None,
        "error": error,
    }


if __name__ == "__main__":
    main()
