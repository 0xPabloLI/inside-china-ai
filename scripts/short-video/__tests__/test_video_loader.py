#!/usr/bin/env python3
"""#417 ticket-1 — unified video loader: timeline contract + cache.

Scenarios (spec `docs/specs/spec-video-loader-417.md`):
- S1  pure visual load: frames == requested times, no audio/transcript
- S4  timeline contract: frame times ⊂ audio bounds ⊆ transcript bounds (sampled)
- S5  cache hit / invalidation (frame set, ASR switch) + key layout
- S6  source without audio track: empty audio_track, transcript.status=no_audio
- S7  ASR runner failure: transcript.status=unavailable, no raise

Fixtures are generated with ffmpeg (real media, no mocks).

Run: ~/.venvs/mlx-vlm/bin/python -m pytest \
  scripts/short-video/__tests__/test_video_loader.py -v
"""
import hashlib
import json
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

from video_loader import (  # noqa: E402
    LOADER_VERSION,
    frames_with_text,
    load_video,
    process_qwen_mm_info,
    to_minicpm_units,
    to_qwen_omni,
    to_text_interleaved,
)

FFMPEG = os.environ.get("VIDEO_LOADER_FFMPEG",
                        "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg")

ASR_SPEC = {"engine": "whisper.cpp", "model": "turbo", "max_context": 0}


def _make_video(path, with_audio):
    cmd = [FFMPEG, "-nostdin", "-y",
           "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10:duration=4"]
    if with_audio:
        cmd += ["-f", "lavfi", "-i", "sine=frequency=440:duration=4"]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast"]
    cmd += ["-c:a", "aac", "-shortest"] if with_audio else ["-an"]
    cmd += [str(path)]
    proc = subprocess.run(cmd, capture_output=True, timeout=120)
    assert proc.returncode == 0, proc.stderr.decode()[-400:]
    assert os.path.getsize(path) > 1000


@pytest.fixture(scope="module")
def av_video(tmp_path_factory):
    path = tmp_path_factory.mktemp("loader") / "av.mp4"
    _make_video(path, with_audio=True)
    return str(path)


@pytest.fixture(scope="module")
def silent_video(tmp_path_factory):
    path = tmp_path_factory.mktemp("loader") / "silent.mp4"
    _make_video(path, with_audio=False)
    return str(path)


def fake_asr(segments, language="en"):
    def runner(video_path, spec):
        return {"language": language,
                "text": " ".join(s["text"] for s in segments),
                "segments": [dict(s) for s in segments]}
    return runner


def _bounds(track):
    return [s["start"] for s in track["segments"]] + [track["segments"][-1]["end"]]


# ─── S1: pure visual ───

def test_s1_pure_visual_frames_match_request(av_video, tmp_path):
    res = load_video(av_video, {"frame_times": [0.0, 1.0, 2.0],
                                "want_audio": False,
                                "cache_dir": str(tmp_path)})
    assert res["duration_s"] == pytest.approx(4.0, abs=0.2)
    assert [f["t"] for f in res["frames"]] == [0.0, 1.0, 2.0]
    for f in res["frames"]:
        with open(f["path"], "rb") as fh:
            assert fh.read(3) == b"\xff\xd8\xff"          # JPEG SOI
        assert os.path.getsize(f["path"]) > 500
    assert res["audio_track"]["segments"] == []
    assert res["transcript"]["status"] == "not_requested"
    assert res["transcript"]["segments"] == []
    assert res["timeline"] == {"frame_times": [0.0, 1.0, 2.0],
                               "audio_bounds": [],
                               "transcript_bounds": []}


def test_frame_times_normalized_and_validated(av_video, tmp_path):
    res = load_video(av_video, {"frame_times": [2.0, 1.0, 1.0, 0.5],
                                "want_audio": False, "cache_dir": str(tmp_path)})
    assert [f["t"] for f in res["frames"]] == [0.5, 1.0, 2.0]
    with pytest.raises(ValueError):
        load_video(av_video, {"frame_times": [], "cache_dir": str(tmp_path)})
    with pytest.raises(ValueError):
        load_video(av_video, {"frame_times": [99.0], "cache_dir": str(tmp_path)})


# ─── S4: timeline contract ───

def test_s4_frame_times_subset_of_audio_and_transcript_bounds(av_video, tmp_path):
    times = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
    asr_segments = [{"start": 0.0, "end": 1.2, "text": "alpha"},
                    {"start": 1.2, "end": 2.6, "text": "beta"},
                    {"start": 2.6, "end": 4.0, "text": "gamma"}]
    res = load_video(av_video, {"frame_times": times, "want_audio": True,
                                "cache_dir": str(tmp_path),
                                "asr": ASR_SPEC,
                                "asr_runner": fake_asr(asr_segments)})
    tl = res["timeline"]
    audio_bounds = _bounds(res["audio_track"])
    assert audio_bounds == times + [res["duration_s"]] or \
        audio_bounds == times + [pytest.approx(res["duration_s"])]
    # sampled assertion (10%): every sampled frame time is an audio boundary
    step = max(1, len(times) // 10)
    for t in times[::step]:
        assert t in [round(b, 3) for b in audio_bounds]
    # audio bounds ⊆ transcript bounds (the transcript grid IS the audio grid)
    assert set(audio_bounds) <= set(tl["transcript_bounds"])
    assert res["transcript"]["status"] == "ok"
    assert res["transcript"]["language"] == "en"
    # text attribution by ASR-segment midpoint: 7 audio cells, 3 carry text
    assert [s["text"] for s in res["transcript"]["segments"]] == \
        ["", "alpha", "", "beta", "", "", "gamma"]
    assert res["transcript"]["raw_segments"] == asr_segments
    # every audio segment has a wav on disk and a well-formed span
    for seg in res["audio_track"]["segments"]:
        assert seg["end"] > seg["start"]
        assert os.path.getsize(seg["path"]) > 1000
    assert all(os.path.exists(s["path"]) for s in res["audio_track"]["segments"])


# ─── S5: cache ───

def test_s5_cache_hit_and_invalidation(av_video, tmp_path):
    req = {"frame_times": [0.0, 1.0], "want_audio": True, "cache_dir": str(tmp_path)}
    first = load_video(av_video, req)
    assert first["cache"]["hit"] is False
    mtime = os.path.getmtime(first["frames"][0]["path"])

    second = load_video(av_video, req)
    assert second["cache"]["hit"] is True
    assert second["cache"]["key"] == first["cache"]["key"]
    assert second["frames"][0]["path"] == first["frames"][0]["path"]
    assert os.path.getmtime(second["frames"][0]["path"]) == mtime
    # a cache hit rebuilds the same result, not just the same paths
    assert second["frames"] == first["frames"]
    assert second["audio_track"] == first["audio_track"]
    assert second["transcript"] == first["transcript"]
    assert second["timeline"] == first["timeline"]

    changed_frames = load_video(av_video, {"frame_times": [0.0, 2.0],
                                           "want_audio": True,
                                           "cache_dir": str(tmp_path)})
    assert changed_frames["cache"]["hit"] is False
    assert changed_frames["cache"]["key"] != first["cache"]["key"]

    ctx_off = load_video(av_video, {**req, "asr": ASR_SPEC,
                                    "asr_runner": fake_asr([])})
    ctx_on = load_video(av_video, {**req,
                                   "asr": {**ASR_SPEC, "max_context": 5},
                                   "asr_runner": fake_asr([])})
    assert ctx_off["cache"]["key"] != ctx_on["cache"]["key"]
    assert ctx_on["cache"]["hit"] is False


def test_cache_layout_manifest_names_real_artifacts(av_video, tmp_path):
    res = load_video(av_video, {"frame_times": [0.0, 1.0], "want_audio": True,
                                "cache_dir": str(tmp_path), "asr": ASR_SPEC,
                                "asr_runner": fake_asr(
                                    [{"start": 0.0, "end": 2.0, "text": "hi"}])})
    key = res["cache"]["key"]
    assert len(key) == 64 and all(c in "0123456789abcdef" for c in key)
    assert os.path.basename(res["cache"]["dir"]) == key
    man = json.load(open(os.path.join(res["cache"]["dir"], "manifest.json")))
    assert man["key"] == key
    assert man["loader_version"] == LOADER_VERSION
    assert man["video_sha256"] == hashlib.sha256(
        open(av_video, "rb").read()).hexdigest()
    assert man["frame_times"] == [0.0, 1.0]
    assert man["asr"] == ASR_SPEC
    for rel in man["files"]:
        assert os.path.exists(os.path.join(res["cache"]["dir"], rel)), rel
    assert os.path.exists(os.path.join(res["cache"]["dir"], "transcript.json"))


def test_no_cache_dir_still_materializes(av_video):
    res = load_video(av_video, {"frame_times": [0.0], "want_audio": False})
    assert res["cache"]["key"] is None and res["cache"]["hit"] is False
    assert os.path.getsize(res["frames"][0]["path"]) > 500


# ─── S6 / S7: degraded transcript ───

def test_s6_no_audio_track(silent_video, tmp_path):
    res = load_video(silent_video, {"frame_times": [0.0, 1.0],
                                    "want_audio": True,
                                    "cache_dir": str(tmp_path),
                                    "asr": ASR_SPEC,
                                    "asr_runner": fake_asr(
                                        [{"start": 0.0, "end": 1.0, "text": "x"}])})
    assert len(res["frames"]) == 2
    assert res["audio_track"]["segments"] == []
    assert res["transcript"]["status"] == "no_audio"
    assert res["transcript"]["segments"] == []


def test_s7_asr_failure_is_reported_not_raised(av_video, tmp_path):
    def boom(video_path, spec):
        raise RuntimeError("whisper-cli missing")

    res = load_video(av_video, {"frame_times": [0.0, 1.0], "want_audio": True,
                                "cache_dir": str(tmp_path), "asr": ASR_SPEC,
                                "asr_runner": boom})
    assert res["transcript"]["status"] == "unavailable"
    assert "whisper-cli missing" in res["transcript"]["unavailable"]
    assert res["transcript"]["segments"] == []
    assert len(res["frames"]) == 2
    assert len(res["audio_track"]["segments"]) == 2


# ─── ticket-2: model adapters (no model calls) ───

def _loaded(av_video, tmp_path, times, **extra):
    req = {"frame_times": times, "want_audio": True, "cache_dir": str(tmp_path)}
    req.update(extra)
    return load_video(av_video, req)


def test_adapter_text_interleaved_modes(av_video, tmp_path):
    long_text = " ".join(["word"] * 600)          # 2999 chars > max_chars
    res = _loaded(av_video, tmp_path, [0.0, 1.0, 2.0], asr=ASR_SPEC,
                  asr_runner=fake_asr(
                      [{"start": 0.0, "end": 1.0, "text": long_text},
                       {"start": 1.0, "end": 2.0, "text": "tail"},
                       {"start": 2.0, "end": 4.0, "text": "end"}]))
    block = to_text_interleaved(res)
    assert len(block) == 2000 and block == res["transcript"]["text"][:2000]
    assert to_text_interleaved(res, mode="full") == res["transcript"]["text"]
    ts = to_text_interleaved(res, mode="ts")
    assert ts.splitlines()[0].startswith("[00:00.0] word")
    assert ts.splitlines()[-1] == "[00:02.0] end"
    assert len(ts.splitlines()) == 3
    # missing transcript renders empty (caller keeps its own gate)
    visual = _loaded(av_video, tmp_path, [0.0, 1.0], want_audio=False)
    assert to_text_interleaved(visual) == ""
    assert to_text_interleaved(visual, mode="ts") == ""


def test_adapter_frames_with_text_follows_grid(av_video, tmp_path):
    res = _loaded(av_video, tmp_path, [0.0, 1.0, 2.0], asr=ASR_SPEC,
                  asr_runner=fake_asr(
                      [{"start": 0.0, "end": 1.2, "text": "alpha"},
                       {"start": 1.2, "end": 4.0, "text": "beta"}]))
    paired = frames_with_text(res)
    assert [p["t"] for p in paired] == [0.0, 1.0, 2.0]
    assert [p["text"] for p in paired] == ["alpha", "", "beta"]
    assert all(p["path"].endswith(".jpg") for p in paired)


def test_adapter_minicpm_units_pairs_frames_and_audio(av_video, tmp_path):
    import numpy as np
    res = _loaded(av_video, tmp_path, [0.0, 1.0, 2.0])
    units = to_minicpm_units(res)
    assert units["num_images"] == units["num_audios"] == 3
    assert units["sample_rate"] == 16000
    assert units["images"] == [f["path"] for f in res["frames"]]
    assert [len(a) for a in units["audios"]] == [16000, 16000, 32000]
    assert all(a.dtype == np.float32 for a in units["audios"])
    assert all(np.abs(a).max() > 0.01 for a in units["audios"])   # real 440 Hz tone
    assert units["unit_spans"][0] == {"start": 0.0, "end": 1.0}
    assert units["unit_spans"][-1]["end"] == res["duration_s"]


def test_adapter_minicpm_units_trailing_frame_padded(av_video, tmp_path):
    res = _loaded(av_video, tmp_path, [0.0, 1.0, 2.0, 3.0, 4.0])
    segs = res["audio_track"]["segments"]
    assert len(segs) == 4                      # [4.0, 4.0) has no audio
    units = to_minicpm_units(res)
    assert units["num_images"] == units["num_audios"] == 5
    assert len(units["audios"][-1]) == 1600    # official pad floor
    assert not units["audios"][-1].any()
    with pytest.raises(ValueError):
        to_minicpm_units(res, max_units=4)
    visual = _loaded(av_video, tmp_path, [0.0, 1.0], want_audio=False)
    with pytest.raises(ValueError):
        to_minicpm_units(visual)


def test_adapter_qwen_omni_payload_and_missing_package(av_video, tmp_path):
    res = _loaded(av_video, tmp_path, [0.0], want_audio=False)
    conversations = to_qwen_omni(res, "describe the video")
    content = conversations[0]["content"]
    assert conversations[0]["role"] == "user"
    assert content[0] == {"type": "video", "video": av_video,
                          "use_audio_in_video": True}
    assert content[1] == {"type": "text", "text": "describe the video"}
    with pytest.raises(RuntimeError, match="qwen-omni-utils"):
        process_qwen_mm_info(conversations)


# ─── ticket-2b: batch grid fast path + production wiring ───

def _count_ffmpeg_calls(monkeypatch):
    import video_loader
    calls = []
    real_run = subprocess.run

    def counting(cmd, **kwargs):
        if isinstance(cmd, (list, tuple)) and cmd and "ffmpeg" in str(cmd[0]):
            calls.append(list(cmd))
        return real_run(cmd, **kwargs)

    monkeypatch.setattr(video_loader.subprocess, "run", counting)
    return calls


def test_grid_materialization_is_one_decode(av_video, tmp_path, monkeypatch):
    calls = _count_ffmpeg_calls(monkeypatch)
    res = load_video(av_video, {"frame_times": [0.0, 1.0, 2.0, 3.0],
                                "want_audio": False, "cache_dir": str(tmp_path)})
    assert [f["t"] for f in res["frames"]] == [0.0, 1.0, 2.0, 3.0]
    assert len(calls) == 1
    assert calls[0][calls[0].index("-vf") + 1] == "fps=1"
    assert float(calls[0][calls[0].index("-t") + 1]) == 4.0


def test_non_grid_times_fall_back_to_seeks(av_video, tmp_path, monkeypatch):
    calls = _count_ffmpeg_calls(monkeypatch)
    res = load_video(av_video, {"frame_times": [0.0, 0.5, 2.0],
                                "want_audio": False, "cache_dir": str(tmp_path)})
    assert [f["t"] for f in res["frames"]] == [0.0, 0.5, 2.0]
    assert len(calls) == 3
    assert all("-frames:v" in c for c in calls)


def test_no_cache_dir_writes_no_cache_artifacts(av_video):
    res = load_video(av_video, {"frame_times": [0.0, 1.0], "want_audio": False})
    assert sorted(os.listdir(res["cache"]["dir"])) == ["frames"]
    assert res["transcript"]["status"] == "not_requested"


def test_extract_frames_s1_grid_and_cleanup(av_video):
    from vlm_analyzer import _cleanup_frames, extract_frames

    # production windowed grid: ceil(span x fps) frames at start + k/fps
    frames = extract_frames(av_video, fps=1.0, start_ms=0, end_ms=4000)
    assert len(frames) == 4
    assert all(os.path.getsize(f) > 500 for f in frames)
    root = os.path.dirname(os.path.dirname(os.path.abspath(frames[0])))
    _cleanup_frames(frames)
    assert not os.path.exists(root)

    frames = extract_frames(av_video, fps=2.0, start_ms=1000, end_ms=3000)
    assert len(frames) == 4
    _cleanup_frames(frames)

    # a grid reaching past the probed duration clamps instead of failing
    frames = extract_frames(av_video, fps=1.0, start_ms=0, end_ms=60000)
    assert len(frames) == 4
    _cleanup_frames(frames)

    assert extract_frames("/nonexistent.mp4") == []
