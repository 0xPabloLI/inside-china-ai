#!/usr/bin/env python3
"""#417 — unified video loader: one decode, one timeline.

ticket-1: decode + timeline contract + cache (S1/S4/S5/S6/S7).
ticket-2: model adapters `to_text_interleaved` / `to_minicpm_units` /
`to_qwen_omni` + production wiring (S2/S3).

Contract (spec `docs/specs/spec-video-loader-417.md`):

    load_video(video_path, request) -> {
        duration_s, frames[], audio_track, transcript, timeline, cache,
    }

Timeline invariant (S4): frame times ⊂ audio segment bounds ⊆ transcript
segment bounds. Audio bounds are derived from the frame-time chain — segment
`i = [t_i, t_{i+1})`, the last one ending at `duration_s` (official
"1 frame + 1 audio segment" spec, implemented locally). The transcript is
resampled onto that grid: each ASR segment is attributed to the cell holding
its midpoint — no word splitting, no duplication, no loss; the engine's own
segments stay in `transcript.raw_segments`.

Ticket boundary: this module does NOT pick frame times (the window plan /
selector is the input side) and does NOT run a model. The ASR engine is an
injected seam (`request["asr_runner"]`); ticket-2 wires the production engine
and deletes the scattered ffmpeg paths in `vlm_analyzer`.

Request keys:
    frame_times  required, list of absolute seconds (normalized: deduped,
                 sorted, rounded to ms; outside [0, duration] -> ValueError)
    want_audio   default True; False -> no audio segments, no transcript
    audio_sr     default 16000 (mono pcm_s16le wav)
    asr          None or dict spec, part of the cache key
    asr_runner   callable(video_path, spec) -> {language, text, segments[]}
    cache_dir    None -> temp dir, no cache key; else {cache_dir}/{key}/...
    ffmpeg/ffprobe  binary overrides (defaults: env, PATH, homebrew ffmpeg-full)

Statuses: transcript.status ∈ {ok, not_requested, no_audio, unavailable};
a missing/failing ASR engine is reported, never raised (S6/S7 — same infra
semantics as #415 ①).
"""
import glob
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from bisect import bisect_right
from datetime import datetime, timezone

LOADER_VERSION = 1
DEFAULT_SR = 16000
HOMEBREW_FFMPEG = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
HOMEBREW_FFPROBE = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe"


def _binary(env_key, name, fallback):
    return os.environ.get(env_key) or shutil.which(name) or fallback


def _ffmpeg_bin():
    return _binary("VIDEO_LOADER_FFMPEG", "ffmpeg", HOMEBREW_FFMPEG)


def _ffprobe_bin():
    return _binary("VIDEO_LOADER_FFPROBE", "ffprobe", HOMEBREW_FFPROBE)


def sha256_file(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def probe_media(video_path, ffprobe=None):
    """{duration_s, has_audio} via ffprobe (fail-fast on unreadable input)."""
    ffprobe = ffprobe or _ffprobe_bin()
    out = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(video_path)],
        capture_output=True, text=True, timeout=60)
    if out.returncode != 0 or not out.stdout.strip():
        raise RuntimeError(f"ffprobe failed for {video_path}: {out.stderr.strip()}")
    streams = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "a",
         "-show_entries", "stream=codec_type", "-of", "csv=p=0", str(video_path)],
        capture_output=True, text=True, timeout=60)
    return {"duration_s": float(out.stdout.strip()),
            "has_audio": bool(streams.stdout.strip())}


# ─── request normalization ──────────────────────────────────────────────────

def _normalize_frame_times(times, duration_s):
    if not isinstance(times, (list, tuple)) or not times:
        raise ValueError("frame_times must be a non-empty list of seconds")
    out = []
    for t in times:
        if isinstance(t, bool) or not isinstance(t, (int, float)):
            raise ValueError(f"frame time {t!r} is not a number")
        t = round(float(t), 3)
        if t < -1e-9 or t > duration_s + 1e-6:
            raise ValueError(f"frame time {t} outside [0, {duration_s:.3f}]")
        out.append(max(0.0, min(t, duration_s)))
    return sorted(set(out))


def _normalize_asr_spec(spec):
    if spec is None:
        return None
    if not isinstance(spec, dict):
        raise ValueError("asr must be a dict spec or None")
    for key, value in spec.items():
        if callable(value):
            raise ValueError(
                f"asr[{key!r}] is callable — pass engines via asr_runner, "
                "not inside the cache-keyed spec")
    return {k: spec[k] for k in sorted(spec)}


def _cache_key(video_sha256, frame_times, want_audio, audio_sr, asr_spec):
    payload = {"loader_version": LOADER_VERSION,
               "video_sha256": video_sha256,
               "frame_times": list(frame_times),
               "want_audio": bool(want_audio),
               "audio_sr": int(audio_sr),
               "asr": asr_spec}
    blob = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


# ─── decode ─────────────────────────────────────────────────────────────────

def _decode_ok(path):
    return os.path.exists(path) and os.path.getsize(path) > 0


def _extract_frame(video_path, t, out_path, ffmpeg, duration_s=None):
    """One full-resolution frame at t.

    A grid endpoint at exactly `duration_s` has no frame at or after it —
    `-ss <duration>` fails with "received no packets". The natural frame there
    is the video's last frame, so the final stretch is decoded and its last
    frame kept (the recorded timestamp stays the requested t: the plan's grid
    is what the timeline contract asserts, not the decoder's rounding).
    """
    proc = subprocess.run(
        [ffmpeg, "-nostdin", "-y", "-ss", f"{t:.3f}", "-i", str(video_path),
         "-frames:v", "1", "-q:v", "2", str(out_path)],
        capture_output=True, timeout=120)
    if not _decode_ok(out_path) and duration_s is not None \
            and t >= duration_s - 1e-6:
        tail_dir = tempfile.mkdtemp(prefix="video_loader_tail_")
        try:
            pattern = os.path.join(tail_dir, "f_%03d.jpg")
            subprocess.run(
                [ffmpeg, "-nostdin", "-y", "-sseof", "-0.5", "-i", str(video_path),
                 "-frames:v", "8", "-q:v", "2", pattern],
                capture_output=True, timeout=120)
            tail = sorted(glob.glob(os.path.join(tail_dir, "f_*.jpg")))
            if tail:
                shutil.copyfile(tail[-1], out_path)
        finally:
            shutil.rmtree(tail_dir, ignore_errors=True)
    if not _decode_ok(out_path):
        raise RuntimeError(
            f"frame extraction failed at t={t}: "
            f"{proc.stderr.decode('utf-8', 'replace')[-200:]}")


def _extract_audio_segment(video_path, start, end, out_path, sr, ffmpeg):
    proc = subprocess.run(
        [ffmpeg, "-nostdin", "-y", "-ss", f"{start:.3f}", "-i", str(video_path),
         "-t", f"{end - start:.3f}", "-vn", "-ac", "1", "-ar", str(sr),
         "-c:a", "pcm_s16le", str(out_path)],
        capture_output=True, timeout=120)
    if proc.returncode != 0 or not os.path.exists(out_path) \
            or os.path.getsize(out_path) == 0:
        raise RuntimeError(
            f"audio segment extraction failed for [{start}, {end}]: "
            f"{proc.stderr.decode('utf-8', 'replace')[-200:]}")


def _materialize(video_path, frame_times, duration_s, want_audio, has_audio,
                 sr, cache_dir, ffmpeg):
    frames = []
    frames_dir = os.path.join(cache_dir, "frames")
    os.makedirs(frames_dir, exist_ok=True)
    for i, t in enumerate(frame_times):
        rel = f"frames/frame_{i:03d}.jpg"
        _extract_frame(video_path, t, os.path.join(cache_dir, rel), ffmpeg,
                       duration_s=duration_s)
        frames.append({"t": t, "file": rel})

    audio_segments = []
    if want_audio and has_audio:
        audio_dir = os.path.join(cache_dir, "audio")
        os.makedirs(audio_dir, exist_ok=True)
        bounds = frame_times + [duration_s]
        for i, (a, b) in enumerate(zip(bounds, bounds[1:])):
            if b - a <= 1e-6:
                continue
            rel = f"audio/segment_{i:03d}.wav"
            _extract_audio_segment(video_path, a, b, os.path.join(cache_dir, rel),
                                   sr, ffmpeg)
            audio_segments.append({"start": round(a, 3), "end": round(b, 3),
                                   "file": rel})
    return frames, audio_segments


# ─── transcript ─────────────────────────────────────────────────────────────

def _transcript_grid(audio_segments):
    """Grid cells (start, end) over the audio segment chain."""
    return [(s["start"], s["end"]) for s in audio_segments]


def _attribute_transcript(asr, audio_segments, status, unavailable):
    """Transcript on the audio grid. Only status == "ok" carries segments —
    a missing engine (unavailable) or a silent source (no_audio) is an empty
    transcript plus a reason, so no consumer can mistake it for silence."""
    if status != "ok":
        return {"language": None, "text": "", "segments": [], "raw_segments": [],
                "status": status, "unavailable": unavailable}
    grid = [{"start": a, "end": b, "text": ""} for a, b in _transcript_grid(audio_segments)]
    raw = list((asr or {}).get("segments") or [])
    if grid and raw:
        starts = [cell["start"] for cell in grid]
        for seg in raw:
            mid = (float(seg["start"]) + float(seg["end"])) / 2.0
            if mid < starts[0]:
                continue
            idx = min(bisect_right(starts, mid) - 1, len(grid) - 1)
            text = str(seg.get("text", "")).strip()
            if text:
                grid[idx]["text"] = (grid[idx]["text"] + " " + text).strip()
    return {"language": (asr or {}).get("language"),
            "text": (asr or {}).get("text", ""),
            "segments": grid,
            "raw_segments": raw,
            "status": status,
            "unavailable": unavailable}


def _run_asr(runner, video_path, spec):
    """Returns (asr_dict, status, unavailable) — never raises (S7)."""
    if runner is None:
        return None, "unavailable", "no asr runner configured"
    try:
        result = runner(str(video_path), spec)
    except Exception as exc:  # noqa: BLE001 — infra failures are data, not crashes
        return None, "unavailable", f"{type(exc).__name__}: {exc}"
    if not isinstance(result, dict):
        return None, "unavailable", f"asr runner returned {type(result).__name__}"
    return result, "ok", None


# ─── cache ──────────────────────────────────────────────────────────────────

def _manifest_path(cache_dir):
    return os.path.join(cache_dir, "manifest.json")


def _read_manifest(cache_dir, key):
    path = _manifest_path(cache_dir)
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            man = json.load(fh)
    except (OSError, ValueError):
        return None
    if man.get("key") != key or man.get("loader_version") != LOADER_VERSION:
        return None
    for rel in man.get("files", []):
        if not os.path.exists(os.path.join(cache_dir, rel)):
            return None
    return man


def _assemble(cache_dir, man):
    frames = [{"t": f["t"], "path": os.path.join(cache_dir, f["file"])}
              for f in man["frames"]]
    audio_segments = [{"start": s["start"], "end": s["end"],
                       "path": os.path.join(cache_dir, s["file"])}
                      for s in man["audio_segments"]]
    with open(os.path.join(cache_dir, man["transcript_file"]), encoding="utf-8") as fh:
        transcript = json.load(fh)
    audio_bounds = [s["start"] for s in audio_segments] + \
        ([audio_segments[-1]["end"]] if audio_segments else [])
    transcript_bounds = [s["start"] for s in transcript["segments"]] + \
        ([transcript["segments"][-1]["end"]] if transcript["segments"] else [])
    return {"video": man["video"],
            "duration_s": man["duration_s"],
            "frames": frames,
            "audio_track": {"sr": man["audio_sr"], "segments": audio_segments},
            "transcript": transcript,
            "timeline": {"frame_times": list(man["frame_times"]),
                         "audio_bounds": audio_bounds,
                         "transcript_bounds": transcript_bounds}}


# ─── entry point ────────────────────────────────────────────────────────────

def load_video(video_path, request):
    video_path = str(video_path)
    if not os.path.exists(video_path):
        raise FileNotFoundError(video_path)
    request = dict(request or {})
    ffmpeg = request.get("ffmpeg") or _ffmpeg_bin()
    ffprobe = request.get("ffprobe") or _ffprobe_bin()

    media = probe_media(video_path, ffprobe)
    duration_s = round(media["duration_s"], 3)
    has_audio = bool(media["has_audio"])
    frame_times = _normalize_frame_times(request.get("frame_times"), duration_s)
    want_audio = bool(request.get("want_audio", True))
    audio_sr = int(request.get("audio_sr") or DEFAULT_SR)
    asr_spec = _normalize_asr_spec(request.get("asr"))
    runner = request.get("asr_runner")

    video_sha256 = sha256_file(video_path)
    cache_root = request.get("cache_dir")
    key = _cache_key(video_sha256, frame_times, want_audio, audio_sr, asr_spec)
    if cache_root:
        cache_dir = os.path.join(str(cache_root), key)
    else:
        cache_dir = tempfile.mkdtemp(prefix="video_loader_")
        key = None

    hit = False
    if key:
        man = _read_manifest(cache_dir, key)
        if man is not None:
            result = _assemble(cache_dir, man)
            hit = True
    if not hit:
        os.makedirs(cache_dir, exist_ok=True)
        frames, audio_segments = _materialize(
            video_path, frame_times, duration_s, want_audio, has_audio,
            audio_sr, cache_dir, ffmpeg)
        if not want_audio:
            transcript = _attribute_transcript(None, [], "not_requested", None)
        elif not has_audio:
            transcript = _attribute_transcript(
                None, [], "no_audio", "source has no audio track")
        else:
            asr, status, unavailable = _run_asr(runner, video_path, asr_spec)
            transcript = _attribute_transcript(asr, audio_segments, status,
                                               unavailable)
        man = {
            "key": key,
            "loader_version": LOADER_VERSION,
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "video": video_path,
            "video_sha256": video_sha256,
            "duration_s": duration_s,
            "has_audio": has_audio,
            "frame_times": list(frame_times),
            "want_audio": want_audio,
            "audio_sr": audio_sr,
            "asr": asr_spec,
            "asr_status": transcript["status"],
            "asr_unavailable": transcript["unavailable"],
            "frames": frames,
            "audio_segments": audio_segments,
            "transcript_file": "transcript.json",
            "files": [f["file"] for f in frames]
            + [s["file"] for s in audio_segments],
        }
        with open(os.path.join(cache_dir, "transcript.json"), "w",
                  encoding="utf-8") as fh:
            json.dump(transcript, fh, ensure_ascii=False, indent=1)
        with open(_manifest_path(cache_dir), "w", encoding="utf-8") as fh:
            json.dump(man, fh, ensure_ascii=False, indent=1)
        result = _assemble(cache_dir, man)

    result["cache"] = {"key": key, "dir": cache_dir, "hit": hit,
                       "manifest": _manifest_path(cache_dir)}
    return result


# ─── model adapters (ticket-2) ──────────────────────────────────────────────
#
# The loader produces aligned artifacts; these three adapters turn them into
# the input shape a target model wants. Measured context (research §17.3):
# raw-waveform feeding is harmful (-17pp), the transcript as text is the only
# audio form that helped, and the official unit packing showed no gain at
# 5-10x the generation time — so `to_text_interleaved` is the production-facing
# shape and `to_minicpm_units` stays for the engine-contract route.

def _mmss(t):
    return f"{int(t // 60):02d}:{t % 60:04.1f}"


def to_text_interleaved(load_result, mode="block", max_chars=2000, max_cells=80):
    """Transcript → prompt text.

    `block` (default) is the §17.3 winning shape: the whole transcript,
    truncated at max_chars. `full` is untruncated. `ts` renders the loader
    grid as "[MM:SS.s] text" lines (one per non-empty cell, first max_cells).
    A missing transcript (status != ok) renders as "" — the caller keeps its
    own gate (S7 semantics).
    """
    transcript = load_result.get("transcript") or {}
    if transcript.get("status") != "ok":
        return ""
    if mode == "full":
        return transcript.get("text", "")
    if mode == "ts":
        lines = []
        for cell in transcript.get("segments", []):
            text = (cell.get("text") or "").strip()
            if text:
                lines.append(f"[{_mmss(cell['start'])}] {text}")
            if len(lines) >= max_cells:
                break
        return "\n".join(lines)
    return transcript.get("text", "")[:max_chars]


def frames_with_text(load_result):
    """[{t, path, text}] — frame i paired with the transcript cell covering
    [t_i, t_{i+1}) (the loader grid uses the same indexing). A trailing frame
    at duration_s has no audio after it, so its text is ""."""
    cells = (load_result.get("transcript") or {}).get("segments") or []
    out = []
    for i, frame in enumerate(load_result.get("frames") or []):
        out.append({"t": frame["t"], "path": frame["path"],
                    "text": cells[i]["text"] if i < len(cells) else ""})
    return out


def _read_wav_mono(path):
    """16k mono pcm_s16le wav → float32 in [-1, 1] (stdlib `wave`, no new deps)."""
    import wave

    import numpy as np
    with wave.open(str(path), "rb") as fh:
        if fh.getnchannels() != 1 or fh.getsampwidth() != 2:
            raise ValueError(f"unsupported wav layout: {path}")
        data = np.frombuffer(fh.readframes(fh.getnframes()), dtype="<i2")
    return data.astype(np.float32) / 32768.0


def to_minicpm_units(load_result, max_units=64, min_samples=1600):
    """Official MiniCPM-o unit packing: unit i = (frame i, audio segment i),
    interleaved frame[0], audio[0], frame[1], audio[1], … (spec §17.3 note:
    no measured gain over pure vision; kept for the engine contract).

    Requires a 1:1 frame↔segment chain: `want_audio=True` at load time and a
    source with audio. A trailing frame at `duration_s` has no audio after it;
    the official spec pads such a segment to `min_samples` zeros, mirrored
    here (last segment only, exactly like the reference implementation).
    More than `max_units` frames raises — the loader never drops frames
    silently, callers subsample the plan instead.
    """
    import numpy as np
    frames = list(load_result.get("frames") or [])
    segments = list((load_result.get("audio_track") or {}).get("segments") or [])
    if not frames:
        raise ValueError("no frames to pack")
    if len(frames) > max_units:
        raise ValueError(
            f"{len(frames)} frames > max_units={max_units} — subsample the plan")
    if not segments:
        raise ValueError("unit packing needs audio segments "
                         "(want_audio=True and a source with audio)")
    if len(segments) not in (len(frames), len(frames) - 1):
        raise ValueError(f"frame/segment chain mismatch: {len(frames)} frames, "
                         f"{len(segments)} segments")
    audios = [_read_wav_mono(s["path"]) for s in segments]
    if len(audios) < len(frames):
        audios.append(np.zeros(min_samples, dtype=np.float32))
    if len(audios[-1]) < min_samples:
        audios[-1] = np.concatenate(
            [audios[-1], np.zeros(min_samples - len(audios[-1]), dtype=np.float32)])
    duration_s = load_result.get("duration_s")
    return {"images": [f["path"] for f in frames],
            "audios": audios,
            "num_images": len(frames),
            "num_audios": len(audios),
            "sample_rate": int((load_result.get("audio_track") or {}).get("sr")
                               or DEFAULT_SR),
            "unit_spans": [
                {"start": f["t"],
                 "end": frames[i + 1]["t"] if i + 1 < len(frames) else duration_s}
                for i, f in enumerate(frames)]}


def to_qwen_omni(load_result, prompt, use_audio_in_video=True):
    """`qwen-omni-utils` conversations payload for
    `process_mm_info(conversations, use_audio_in_video=True)`.

    Route note (spec §8): the video goes in whole — Qwen-Omni runs its own
    2 fps decode plus TMRoPE alignment, so the loader's frame times are NOT
    honored here. This adapter exists to make that explicit and to carry the
    payload shape; the package stays out of the repo environments.
    """
    video = load_result.get("video")
    if not video:
        raise ValueError("load_result has no video path")
    return [{"role": "user", "content": [
        {"type": "video", "video": video,
         "use_audio_in_video": bool(use_audio_in_video)},
        {"type": "text", "text": prompt}]}]


def process_qwen_mm_info(conversations, use_audio_in_video=True):
    """Lazy bridge to qwen-omni-utils; a clear error when it is absent."""
    try:
        from qwen_omni_utils import process_mm_info
    except ImportError as exc:
        raise RuntimeError(
            "qwen-omni-utils is not installed (spec §8 keeps it out of the "
            "repo environments; use an isolated venv for this route)") from exc
    return process_mm_info(conversations, use_audio_in_video=use_audio_in_video)
