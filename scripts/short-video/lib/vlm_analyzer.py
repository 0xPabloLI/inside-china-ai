#!/usr/bin/env python3
"""
AI Analyzer — Python subprocess for VLM-powered asset understanding.

Loads the engine declared by vlm-model.json (default MiniCPM-o 4.5; fallback
Qwen3-VL-30B-A3B via --engine) through mlx-vlm, listens on stdin for
line-delimited JSON requests, writes JSON responses to stdout.

Actions:
  - analyze_semantics: {"action": "analyze_semantics", "path": "/abs/path/to/file"}
  - analyze_audio:     {"action": "analyze_audio", "path": "/abs/path/to/audio.wav"}
  - exit:              {"action": "exit"}

Response format (one line):
  {"description": "...", "subjects": ["..."], "contentKind": "...",
   "fit": "..."|null, "criticalEdgeText": "..."|null, "reason": "..."|null,
   "relevance": int 0-100|null, "relevanceReason": "..."|null,
   "error": null}
  {"description": "", "subjects": [], ..., "error": "reason"}

VLM outputs Markdown with ## Section headers. Python parses it via
parse_markdown_to_dict() — pure string manipulation, no LLM needed.

Video analysis uses native video input via mlx_vlm.generate(video=) for
full-video analysis. When a time window (startMs/endMs) is provided,
ffmpeg frame extraction is used instead (native video can't select a
time range).

Image preprocessing: images with longest edge > MAX_IMAGE_LONG_EDGE are
resized to prevent high-resolution hallucinations (probabilistic bug in
Qwen3-VL at resolutions > ~2000px).

Runs in the VLM venv ~/.venvs/mlx-vlm (mlx-vlm 0.7.2 — required for the
minicpm engine; the qwen3-vl-moe fallback also runs there).
ffmpeg path: /opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
"""

import argparse
import sys
import json
import os
import re
import threading
import time
import subprocess
import tempfile
import glob
from PIL import Image, ImageOps

# ─── Constants ───

# Engine + model id single source of truth (#351, #361): vlm-model.json is
# read by BOTH this process and the Node side (visual-analyzer.mjs
# getVlmModelId), so the cache key's model material can never name a
# model/engine different from the one that actually runs inference. The file
# declares a default engine plus one modelId per engine; --engine overrides
# the default for this process. Change engines only in that file.
VLM_ENGINE_MINICPM = "minicpm"  # MiniCPM-o 4.5: vision + ASR + audio emotion
VLM_ENGINE_QWEN = "qwen3-vl-moe"  # Qwen3-VL-30B-A3B: vision only (fallback)
VALID_ENGINES = (VLM_ENGINE_MINICPM, VLM_ENGINE_QWEN)

_VLM_MODEL_CONFIG = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "vlm-model.json"
)


def _read_vlm_config(path):
    """Read the shared engine/model config, fail-fast on any malformation."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError) as err:  # JSONDecodeError subclasses ValueError
        raise RuntimeError(
            f"Cannot read the VLM config from {path} "
            f"(single source of truth, shared with visual-analyzer.mjs): {err}"
        ) from err


def resolve_engine(config, requested_engine=None):
    """Resolve (engine, model_id) for the requested engine.

    requested_engine=None → the config's default engine. An unknown engine or
    a missing/empty modelId raises RuntimeError — fail-fast, never a silent
    fallback to another engine (a wrong-engine run would poison the cache key
    and silently degrade quality).
    """
    engine = (requested_engine or config.get("engine") or "").strip()
    engines = config.get("engines")
    if not engine:
        raise RuntimeError(
            'vlm-model.json must declare a non-empty string "engine" '
            "(single source of truth, shared with visual-analyzer.mjs)"
        )
    if not isinstance(engines, dict) or engine not in engines:
        raise RuntimeError(
            f'vlm-model.json has no engine "{engine}" under "engines" '
            f"(available: {sorted(engines) if isinstance(engines, dict) else []})"
        )
    model_id = (engines.get(engine) or {}).get("modelId")
    if not isinstance(model_id, str) or not model_id.strip():
        raise RuntimeError(
            f'vlm-model.json engines["{engine}"] must declare a non-empty '
            'string "modelId" (single source of truth, shared with '
            "visual-analyzer.mjs)"
        )
    return engine, os.path.expanduser(model_id.strip())


_VLM_CONFIG = _read_vlm_config(_VLM_MODEL_CONFIG)
DEFAULT_ENGINE, MODEL_ID = resolve_engine(_VLM_CONFIG)
FFMPEG_PATH = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
IDLE_TIMEOUT_SECONDS = 300  # 5 minutes
VIDEO_FPS = 1.0
MAX_VIDEO_SECONDS = 8  # cap analysis at 8s of video
MAX_IMAGE_LONG_EDGE = 1920  # resize images with longer edge > this to prevent hallucinations


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

SEMANTICS_PROMPT_AUDIO = """Analyze this audio for use in a short video production pipeline. Provide your analysis as Markdown with the following sections:

## Transcription
Transcribe the speech in this audio. If the audio is not speech, describe what you hear.

## Language
The language spoken (e.g., "Chinese", "English", "mixed").

## Emotion
The primary emotion conveyed: happy, sad, angry, surprised, fearful, disgusted, neutral, excited, calm

## Tone
Describe the tone of voice in 1-2 sentences.

## Speaking Style
The speaking style: hook, narrative, cta, conversational, formal, casual
"""

VALID_FITS = {"cover", "contain"}

# MiniCPM-o emits duplex control tokens around audio output (observed:
# "<|SOA>" prefix, "<|tts_eos|>" suffix). They are transport markers, not
# content — strip them before the Markdown parser sees the text. The closing
# ">" is optional: MiniCPM-o emits "<|SOA>" bare but "<|tts_eos|>" with the
# full "<|...|>" shape.
_CONTROL_TOKEN_RE = re.compile(r"<\|(?:SOA|tts_eos)\|?>")


def strip_control_tokens(text):
    """Remove MiniCPM-o duplex control tokens (e.g. <|SOA>, <|tts_eos|>)."""
    if not text:
        return text
    return _CONTROL_TOKEN_RE.sub("", text).strip()


def build_semantics_prompt(is_video=False, claim=None):
    """Build the semantics prompt, optionally with a scene-claim relevance block.

    claim=None → exactly the base prompt (backward compatible with all
    existing callers). When a claim ({voiceover, assetNeed}) is provided,
    the scene's narration and desired visual are injected and the model is
    asked for `## Relevance` (bare 0-100 integer) + `## Relevance Reason`.
    """
    base = SEMANTICS_PROMPT_VIDEO if is_video else SEMANTICS_PROMPT_IMAGE
    if not claim:
        return base

    voiceover = str(claim.get("voiceover") or "").strip()
    need = str(claim.get("assetNeed") or "").strip()

    block = "\n\n## Scene Claim (judge relevance against this)\n"
    if voiceover:
        block += f'Scene narration: "{voiceover}"\n'
    if need:
        block += f'Desired visual: "{need}"\n'
    block += (
        "\n## Relevance\n"
        "Score 0-100: how well this asset supports the scene claim above. "
        "100 = directly supports it, 50 = loosely related, 0 = completely unrelated. "
        "Output the bare integer only.\n\n"
        "## Relevance Reason\n"
        "One sentence explaining the score.\n"
    )
    return base + block


# ─── Markdown parser ───

def _parse_relevance_value(body):
    """Extract a 0-100 integer from a `## Relevance` section body.

    Models don't always emit the bare integer the prompt asks for — observed
    variants: "70", "**70**", "Score 0\\n<prose>", "0 - <prose>". The first
    line must BE the score (bare, /100-suffixed, or dash + prose tail);
    digit-initial prose like "3 examples of charts" or "85 out of 100"
    fails closed to None — a fabricated score here is how the gate
    hallucination incident happened.
    """
    if not body:
        return None
    first_line = body.strip().split("\n", 1)[0].strip().strip("*").strip()
    match = re.match(
        r"^(?:score|relevance)?\s*[:\-]?\s*(\d{1,3})(?:\s*/\s*100)?(?:\s*[-–]\s.*)?$",
        first_line,
        re.IGNORECASE,
    )
    if not match:
        return None
    value = int(match.group(1))
    return value if 0 <= value <= 100 else None


def parse_markdown_to_dict(raw_text):
    """Parse VLM Markdown output into a dict with 8 mandatory keys.

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
    fit, criticalEdgeText, reason, relevance (int 0-100 or None),
    relevanceReason. Missing fields = None/[].
    """
    result = {
        "description": None,
        "subjects": None,
        "contentKind": None,
        "fit": None,
        "criticalEdgeText": None,
        "reason": None,
        "relevance": None,
        "relevanceReason": None,
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

    # relevance — integer 0-100 or None (missing/invalid = fail-closed upstream)
    if "relevance" in raw_sections:
        result["relevance"] = _parse_relevance_value(raw_sections["relevance"])
    else:
        result["relevance"] = None

    # relevanceReason
    if "relevance_reason" in raw_sections:
        result["relevanceReason"] = raw_sections["relevance_reason"]
    else:
        result["relevanceReason"] = None

    # 5. Add unknown sections as extra key-value pairs
    known_keys = {"description", "subjects", "content_kind", "fit",
                  "critical_edge_text", "reason", "relevance", "relevance_reason"}
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


def _extract_response_text(response):
    """Pull the text out of an mlx_vlm generate() return value."""
    if hasattr(response, "text"):
        return response.text
    if isinstance(response, dict):
        return response.get("text", str(response))
    return str(response)


def generate_response(model, processor, engine=DEFAULT_ENGINE,
                      image_paths=None, prompt_text=None,
                      video_path=None, audio_path=None, max_tokens=1000):
    """Generate a text response for image(s), frames, native video or audio.

    Engine dispatch (the two engines take different prompt/input APIs):
      - qwen3-vl-moe: HF-style `processor.apply_chat_template(messages)` and
        native video input via `generate(video=)`.
      - minicpm: `mlx_vlm.prompt_utils.apply_chat_template(processor,
        model.config, prompt)` with `image=` / `audio=`. No native video —
        video callers pass ffmpeg-extracted frames as `image_paths`.

    Args:
        prompt_text: SEMANTICS_PROMPT_IMAGE / SEMANTICS_PROMPT_VIDEO /
                      SEMANTICS_PROMPT_AUDIO.
        video_path: native-video path (qwen engine only).
        audio_path: audio path (minicpm engine only).
    """
    from mlx_vlm import generate

    effective_prompt = prompt_text if prompt_text is not None else SEMANTICS_PROMPT_IMAGE

    if engine == VLM_ENGINE_MINICPM:
        from mlx_vlm.prompt_utils import apply_chat_template as mlx_apply_chat_template

        kwargs = {}
        if audio_path is not None:
            prompt = mlx_apply_chat_template(
                processor, model.config, effective_prompt,
                add_generation_prompt=True, num_audios=1,
            )
            kwargs["audio"] = [audio_path]
        else:
            if video_path is not None:
                raise ValueError(
                    "minicpm engine has no native video support — pass extracted "
                    "frames as image_paths"
                )
            if image_paths is None:
                raise ValueError("image_paths, video_path or audio_path is required")
            if isinstance(image_paths, str):
                image_paths = [image_paths]
            prompt = mlx_apply_chat_template(
                processor, model.config, effective_prompt,
                add_generation_prompt=True, num_images=len(image_paths),
            )
            kwargs["image"] = image_paths

        response = generate(
            model, processor, prompt=prompt, temperature=0.0,
            max_tokens=max_tokens, verbose=False, **kwargs,
        )
        return strip_control_tokens(_extract_response_text(response))

    # qwen3-vl-moe — HF-style chat template + native video
    content = []
    if video_path is not None:
        content.append({"type": "video", "video": video_path})
    else:
        if image_paths is None:
            raise ValueError("image_paths or video_path is required")
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
        response = generate(
            model, processor, prompt=prompt, video=video_path,
            temperature=0.0, max_tokens=max_tokens, verbose=False,
        )
    else:
        response = generate(
            model, processor, prompt=prompt, image=image_paths,
            temperature=0.0, max_tokens=max_tokens, verbose=False,
        )
    return _extract_response_text(response)


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

def _parse_crop_focus(raw):
    """Normalize a request's cropFocus hint into a (x, y) tuple.

    Accepts {"x": float, "y": float} in normalized [0, 1] source space;
    clamps components into range. Anything malformed (missing fields, wrong
    types, junk from a stale caller) falls back to None so simulate_crop
    keeps its historical center behavior — a broken hint must never break
    analysis.
    """
    if not isinstance(raw, dict):
        return None
    x, y = raw.get("x"), raw.get("y")
    if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
        return None
    if isinstance(x, bool) or isinstance(y, bool):
        return None
    return (max(0.0, min(1.0, float(x))), max(0.0, min(1.0, float(y))))


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


# ─── Inference seam ───

def _unlink_quiet(path):
    """Unlink a temp file, ignoring missing/unremovable paths."""
    if not path:
        return
    try:
        os.unlink(path)
    except OSError:
        pass


def _extract_minicpm_frames(processor, video_path, fps=2.0, max_frames=16):
    """Sample frames for the minicpm engine (no native video support).

    minicpm always goes through frame extraction — there is no native-video
    pass-through. Frames come from mlx_vlm's resolve_video_inputs, the same
    path the MiniCPM-o benchmark used.
    """
    from mlx_vlm.generate.video import resolve_video_inputs

    resolution = resolve_video_inputs(processor, [video_path], fps=fps, max_frames=max_frames)
    return resolution.images


def run_vlm_inference(model, processor, path, is_video, prompt_text,
                      engine=DEFAULT_ENGINE, start_ms=None, end_ms=None,
                      sample_fps=VIDEO_FPS, crop_focus=None):
    """Run one VLM generation pass over `path` with media-type preprocessing.

    Video: engine-dependent input —
      - qwen3-vl-moe: native video via generate(video=).
      - minicpm: mlx_vlm frame sampling (resolve_video_inputs) since it has no
        native video support.
    A time window (start_ms/end_ms) always falls back to ffmpeg frame
    extraction on both engines (neither can seek natively).

    Image: simulate the 9:16 cover crop (anchored on crop_focus when supplied,
    e.g. a saliency centroid or a prior cropFocus — #198) → resize if above
    MAX_IMAGE_LONG_EDGE → generate → unlink both temp files.

    Returns the raw markdown string; raises on failure (caller decides
    fallback behavior).
    """
    if is_video:
        if start_ms is not None or end_ms is not None:
            # Windowed analysis — frame extraction (no engine can seek natively)
            frames = extract_frames(
                path, fps=sample_fps,
                max_seconds=MAX_VIDEO_SECONDS,
                start_ms=start_ms, end_ms=end_ms,
            )
            if not frames:
                raise RuntimeError("Frame extraction failed")
            try:
                return generate_response(
                    model, processor, engine=engine, image_paths=frames,
                    prompt_text=prompt_text,
                )
            finally:
                _cleanup_frames(frames)
        if engine == VLM_ENGINE_MINICPM:
            frames = _extract_minicpm_frames(processor, path)
            return generate_response(
                model, processor, engine=engine, image_paths=frames,
                prompt_text=prompt_text,
            )
        # qwen3-vl-moe — native video path
        return generate_response(
            model, processor, engine=engine, video_path=path,
            prompt_text=prompt_text,
        )

    # Image — simulate the 9:16 cover crop the viewer will see, anchored on
    # the supplied focus (center when no hint), then resize large images.
    crop_path, crop_cleanup = simulate_crop(
        path, target_ratio=9/16, focus=crop_focus or (0.5, 0.5),
    )
    try:
        actual_path, temp_path = resize_image_if_needed(crop_path)
        try:
            return generate_response(
                model, processor, engine=engine, image_paths=actual_path,
                prompt_text=prompt_text,
            )
        finally:
            _unlink_quiet(temp_path)
    finally:
        _unlink_quiet(crop_cleanup)


def run_audio_inference(model, processor, path, engine=VLM_ENGINE_MINICPM,
                        prompt_text=None):
    """Run one audio pass (ASR + emotion + tone + style).

    Audio is only available on the minicpm engine — qwen3-vl-moe has no audio
    tower, so it raises (caller degrades; never silently returns empty).
    """
    if engine != VLM_ENGINE_MINICPM:
        raise ValueError(
            f"engine '{engine}' has no audio support (audio requires '{VLM_ENGINE_MINICPM}')"
        )
    return generate_response(
        model, processor, engine=engine, audio_path=path,
        prompt_text=prompt_text if prompt_text is not None else SEMANTICS_PROMPT_AUDIO,
        max_tokens=1000,
    )



# ─── Request handler ───

def handle_analyze_semantics(model, processor, path, engine=DEFAULT_ENGINE,
                             window=None, claim=None, crop_focus=None):
    """Handle an analyze_semantics request.

    Dispatches to image or video prompt based on file extension.
    Outputs Markdown which is parsed by parse_markdown_to_dict.

    When window is provided (dict with startMs/endMs/sampleFps), uses it for
    frame extraction to ensure the analyzed temporal range matches.

    When claim ({voiceover, assetNeed}) is provided, the prompt gains a
    scene-claim block and the output gains Relevance/Relevance Reason.

    When crop_focus ((x, y) in normalized [0, 1]) is provided, the image crop
    simulation anchors on it so the VLM judges the framing the viewer will
    actually see (#198).

    Returns (result_dict, error) tuple.
    """
    if not os.path.exists(path):
        return {}, f"File not found: {path}"

    ext = os.path.splitext(path)[1].lower()
    is_video = ext in (".mp4", ".mov", ".avi", ".mkv")
    prompt_text = build_semantics_prompt(is_video, claim)

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
            source_mode = "frames"
        else:
            # Image — verify first
            try:
                img = Image.open(path)
                img.verify()
            except Exception as e:
                return {}, f"Invalid or corrupt image: {e}"
            source_mode = None  # images don't have sourceMode

        raw = run_vlm_inference(
            model, processor, path, is_video, prompt_text,
            engine=engine, start_ms=start_ms, end_ms=end_ms,
            sample_fps=sample_fps, crop_focus=crop_focus,
        )
    except Exception as e:
        return {}, f"VLM generation failed: {e}"

    # Parse Markdown output
    result = parse_markdown_to_dict(raw)

    # Add sourceMode for video assets
    if is_video and source_mode:
        result["sourceMode"] = source_mode

    return result, None


# Audio output sections → response field names. parse_markdown_to_dict keeps
# unknown sections as snake_case keys; map them to the camelCase contract the
# Node side consumes.
_AUDIO_FIELD_MAP = {
    "transcription": "transcription",
    "language": "language",
    "emotion": "emotion",
    "tone": "tone",
    "speaking_style": "speakingStyle",
}


def handle_analyze_audio(model, processor, path, engine=VLM_ENGINE_MINICPM):
    """Handle an analyze_audio request (ASR + emotion + tone + speaking style).

    Only the minicpm engine carries an audio tower; a request on any other
    engine degrades with an explicit error (never an empty success). Returns
    (result_dict, error).
    """
    if not os.path.exists(path):
        return {}, f"File not found: {path}"

    try:
        raw = run_audio_inference(model, processor, path, engine=engine)
    except Exception as e:
        return {}, f"Audio analysis failed: {e}"

    parsed = parse_markdown_to_dict(raw)
    result = {field: parsed.get(key) for key, field in _AUDIO_FIELD_MAP.items()}
    return result, None


# ─── Main loop ───

def _warmup(model, processor, engine):
    """Run a dummy 1x1 image inference to trigger MLX kernel compilation.

    The first real inference after model load pays ~34s of MLX compile
    overhead. By running a trivial warmup here, that cost is absorbed at
    startup (before the first IPC request), so the first request latency
    is predictable and the idle timeout doesn't fire during compilation.
    """
    import tempfile

    # Create a 1x1 white pixel JPEG
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        warmup_path = f.name
    try:
        img = Image.new("RGB", (1, 1), (255, 255, 255))
        img.save(warmup_path, "JPEG")
        generate_response(
            model, processor, engine=engine,
            image_paths=[warmup_path],
            prompt_text="Describe this image in one word.",
            max_tokens=5,
        )
    finally:
        os.unlink(warmup_path)


def main():
    """Main IPC loop: read line-delimited JSON from stdin, write responses to stdout."""

    parser = argparse.ArgumentParser(
        description="VLM analyzer subprocess (line-delimited JSON over stdin/stdout)"
    )
    parser.add_argument(
        "--engine", default=None, choices=VALID_ENGINES,
        help=f"VLM engine to load (default: vlm-model.json 'engine' = {DEFAULT_ENGINE})",
    )
    args = parser.parse_args()

    engine, model_id = resolve_engine(_VLM_CONFIG, args.engine)

    # Load model
    sys.stderr.write(f"[vlm_analyzer] Engine={engine} loading model: {model_id}\n")
    sys.stderr.flush()

    try:
        model, processor = load_model(model_id)
        sys.stderr.write("[vlm_analyzer] Model loaded successfully.\n")
        sys.stderr.flush()
    except Exception as e:
        # No fallback — fail fast so the caller (visual-analyzer.mjs)
        # can handle the error and return a degraded result.
        sys.stderr.write(
            f"[vlm_analyzer] Failed to load {model_id} (engine={engine}): {e}\n"
        )
        sys.stderr.flush()
        degraded = _degraded_result(f"Model load failed: {e}")
        sys.stdout.write(json.dumps(degraded) + "\n")
        sys.stdout.flush()
        sys.exit(1)

    # Warmup: run a dummy 1x1 image inference to eliminate cold-start jitter
    # (first real inference pays ~34s MLX compile overhead; warmup moves that
    # cost to model-load time so the first request latency is predictable).
    try:
        _warmup(model, processor, engine)
        sys.stderr.write("[vlm_analyzer] Warmup complete.\n")
        sys.stderr.flush()
    except Exception as e:
        sys.stderr.write(f"[vlm_analyzer] Warmup failed (non-fatal): {e}\n")
        sys.stderr.flush()

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
                claim = request.get("claim")
                crop_focus = _parse_crop_focus(request.get("cropFocus"))
                result, err = handle_analyze_semantics(
                    model, processor, path, engine=engine,
                    window=window, claim=claim, crop_focus=crop_focus,
                )
                if err:
                    response = _degraded_result(err)
                else:
                    response = {**result, "error": None}

            elif action == "analyze_audio":
                path = request.get("path", "")
                result, err = handle_analyze_audio(
                    model, processor, path, engine=engine,
                )
                if err:
                    response = _degraded_audio_result(err)
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
    """Return a degraded result dict with all fields null/empty.

    Field set mirrors the JS-side DEGRADED_RESULT in visual-analyzer.mjs so
    the IPC shape stays symmetric across the boundary.
    """
    return {
        "description": "",
        "subjects": [],
        "contentKind": None,
        "fit": None,
        "criticalEdgeText": None,
        "reason": None,
        "relevance": None,
        "relevanceReason": None,
        "error": error,
    }


def _degraded_audio_result(error):
    """Degraded shape for analyze_audio (mirrors handle_analyze_audio keys)."""
    return {
        "transcription": None,
        "language": None,
        "emotion": None,
        "tone": None,
        "speakingStyle": None,
        "error": error,
    }


if __name__ == "__main__":
    main()
