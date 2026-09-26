#!/usr/bin/env python3
"""
Test suite for #391 — frame_strategy uniform/scene parameterization.

Covers (spec scenarios):
- S1: default frame_strategy/uniform = same extraction path as today
  (resolve_video_inputs, no ffmpeg scene subprocess)
- S5: invalid frame_strategy / max_frames / sample_fps fail fast
- scene extraction: filtergraph + -frames:v cap + vfr image2pipe command
  construction, window -ss/-t slicing (D3), mjpeg decode, fail-fast on
  ffmpeg errors
- S4: per-window scene extraction (2 windows → 2 invocations with the right
  startMs/endMs), merge contract unchanged (#360 eight fields)

ffmpeg subprocess is mocked (subprocess.run monkeypatched) — no real ffmpeg,
no model, no venv needed.

Run: ~/.venvs/mlx-vlm/bin/python -m pytest \
  scripts/short-video/__tests__/test_frame_strategy.py -v
"""
import io
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

from vlm_analyzer import (  # noqa: E402
    DEFAULT_MAX_FRAMES,
    DEFAULT_UNIFORM_FPS,
    FRAME_STRATEGY_SCENE,
    FRAME_STRATEGY_UNIFORM,
    SCENE_SELECT_FILTER,
    _decode_mjpeg_stream,
    _extract_minicpm_frames,
    _extract_scene_frames,
    handle_analyze_semantics,
    run_vlm_inference,
    validate_frame_params,
)


# ─── validate_frame_params (S5 + defaults) ───

class TestValidateFrameParams:
    def test_defaults_reproduce_current_behavior(self):
        # S1: absent params → uniform / 16 / 2.0 byte-for-byte defaults
        assert validate_frame_params(None, None, None) == {
            "strategy": "uniform", "max_frames": 16, "sample_fps": 2.0,
        }

    def test_valid_scene_params_pass_through(self):
        assert validate_frame_params("scene", 32, 1.0) == {
            "strategy": "scene", "max_frames": 32, "sample_fps": 1.0,
        }

    def test_unknown_strategy_rejected(self):
        for bad in ("adaptive", "keyframe", "", "UNIFORM", 1, []):
            with pytest.raises(RuntimeError, match="frame_strategy"):
                validate_frame_params(bad, None, None)

    def test_invalid_max_frames_rejected(self):
        for bad in (0, -1, 16.5, "16", True, [16]):
            with pytest.raises(RuntimeError, match="max_frames"):
                validate_frame_params("uniform", bad, None)

    def test_invalid_sample_fps_rejected(self):
        for bad in (0, -2.0, "2", True):
            with pytest.raises(RuntimeError, match="sample_fps"):
                validate_frame_params("uniform", None, bad)


# ─── _decode_mjpeg_stream ───

def _jpeg_bytes(color, size=(8, 6)):
    """Build one in-memory JPEG (PIL) for synthetic mjpeg stream tests."""
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "JPEG")
    return buf.getvalue()


class TestDecodeMjpegStream:
    def test_two_jpeg_frames_decode(self):
        a, b = _jpeg_bytes((250, 0, 0)), _jpeg_bytes((0, 250, 0))
        frames = _decode_mjpeg_stream(a + b)
        assert len(frames) == 2
        assert frames[0].size == (8, 6)
        # JPEG is lossy — allow small per-channel drift around the solid color
        assert abs(frames[0].getpixel((0, 0))[0] - 250) <= 4
        assert abs(frames[1].getpixel((0, 0))[1] - 250) <= 4

    def test_empty_stream_yields_no_frames(self):
        assert _decode_mjpeg_stream(b"") == []

    def test_undecodable_chunk_skipped(self):
        a = _jpeg_bytes((0, 0, 255))
        junk = a[:3] + b"\x00" * 10  # SOI marker followed by garbage
        good = _jpeg_bytes((0, 0, 255))
        frames = _decode_mjpeg_stream(junk + good)
        assert len(frames) == 1


# ─── _extract_scene_frames (mocked ffmpeg subprocess) ───

class TestExtractSceneFrames:
    def _mock_run(self, monkeypatch, payload=b"", returncode=0):
        """Monkeypatch subprocess.run; return the recorded-calls list."""
        calls = []

        def fake_run(cmd, capture_output=None, timeout=None):
            calls.append({"cmd": cmd, "timeout": timeout})
            return subprocess.CompletedProcess(
                cmd, returncode,
                stdout=payload,
                stderr=b"" if returncode == 0 else b"ffmpeg boom",
            )

        monkeypatch.setattr("vlm_analyzer.subprocess.run", fake_run)
        return calls

    def test_whole_file_command_construction(self, monkeypatch):
        calls = self._mock_run(monkeypatch, payload=_jpeg_bytes((1, 2, 3)))
        frames, meta = _extract_scene_frames("/abs/video.mp4", max_frames=16)

        cmd = calls[0]["cmd"]
        vf_idx = cmd.index("-vf")
        assert cmd[vf_idx + 1] == SCENE_SELECT_FILTER
        assert "gt(scene,0.08)" in SCENE_SELECT_FILTER
        assert "eq(n,0)" in SCENE_SELECT_FILTER
        assert "not(mod(t,8))" in SCENE_SELECT_FILTER
        assert "scale=480:480:force_original_aspect_ratio=decrease" in \
            SCENE_SELECT_FILTER
        assert cmd[cmd.index("-frames:v") + 1] == "16"  # cap enforcement
        assert cmd[cmd.index("-fps_mode") + 1] == "vfr"
        assert cmd[cmd.index("-f") + 1] == "image2pipe"
        assert cmd[cmd.index("-vcodec") + 1] == "mjpeg"
        assert cmd[-1] == "pipe:1"
        # No -ss/-t when no window given — whole file
        assert "-ss" not in cmd
        assert "-t" not in cmd
        # Frames decoded from the mjpeg payload
        assert len(frames) == 1
        assert meta["strategy"] == "scene"
        assert meta["frameCount"] == 1
        assert meta["extractionMs"] >= 0
        assert meta["windowStartMs"] is None

    def test_window_slicing_uses_ss_before_input(self, monkeypatch):
        calls = self._mock_run(monkeypatch, payload=_jpeg_bytes((9, 9, 9)))
        _frames, meta = _extract_scene_frames(
            "/abs/video.mp4", max_frames=8, start_ms=14000, end_ms=30000,
        )

        cmd = calls[0]["cmd"]
        # -ss BEFORE -i (fast seek), -t after -i; seconds conversion
        ss_idx, i_idx, t_idx = cmd.index("-ss"), cmd.index("-i"), cmd.index("-t")
        assert ss_idx < i_idx < t_idx
        assert cmd[ss_idx + 1] == "14.0"
        assert cmd[i_idx + 1] == "/abs/video.mp4"
        assert cmd[t_idx + 1] == "16.0"
        assert meta["windowStartMs"] == 14000
        assert meta["windowEndMs"] == 30000

    def test_cap_enforcement_via_frames_v(self, monkeypatch):
        calls = self._mock_run(monkeypatch, payload=b"")
        _extract_scene_frames("/abs/video.mp4", max_frames=32)
        cmd = calls[0]["cmd"]
        assert cmd[cmd.index("-frames:v") + 1] == "32"

    def test_nonzero_returncode_raises(self, monkeypatch):
        self._mock_run(monkeypatch, returncode=1)
        with pytest.raises(RuntimeError, match="scene frame extraction failed"):
            _extract_scene_frames("/abs/video.mp4")

    def test_ffmpeg_missing_raises(self, monkeypatch):
        def fake_run(cmd, **kwargs):
            raise FileNotFoundError("no such file or directory: ffmpeg")

        monkeypatch.setattr("vlm_analyzer.subprocess.run", fake_run)
        with pytest.raises(RuntimeError, match="ffmpeg not found"):
            _extract_scene_frames("/abs/video.mp4")


# ─── _extract_minicpm_frames dispatch (S1 + scene routing) ───

class _FakeResolution:
    def __init__(self, n=3):
        self.images = [object() for _ in range(n)]


class TestExtractMinicpmFrames:
    def test_default_is_uniform_via_resolve_video_inputs(self, monkeypatch):
        """S1: default params take the resolve_video_inputs path — no ffmpeg."""
        # mlx_vlm.generate is a function in mlx-vlm 0.7.2, so the submodule
        # must be imported via importlib (same machinery vlm_analyzer uses).
        import importlib

        video_mod = importlib.import_module("mlx_vlm.generate.video")

        received = {}

        def fake_resolve(processor, paths, fps=None, max_frames=None):
            received["fps"] = fps
            received["max_frames"] = max_frames
            return _FakeResolution(4)

        monkeypatch.setattr(video_mod, "resolve_video_inputs", fake_resolve)
        run_calls = []

        def no_ffmpeg(*args, **kwargs):
            run_calls.append(args)
            raise AssertionError("ffmpeg called in uniform path")

        monkeypatch.setattr("vlm_analyzer.subprocess.run", no_ffmpeg)

        frames, meta = _extract_minicpm_frames(object(), "/abs/video.mp4")

        assert len(frames) == 4
        assert received == {"fps": 2.0, "max_frames": 16}  # current defaults
        assert meta["strategy"] == "uniform"
        assert meta["frameCount"] == 4
        assert run_calls == []

    def test_uniform_params_forwarded(self, monkeypatch):
        import importlib

        video_mod = importlib.import_module("mlx_vlm.generate.video")

        received = {}

        def fake_resolve(processor, paths, fps=None, max_frames=None):
            received.update(fps=fps, max_frames=max_frames)
            return _FakeResolution(2)

        monkeypatch.setattr(video_mod, "resolve_video_inputs", fake_resolve)
        _frames, meta = _extract_minicpm_frames(
            object(), "/abs/video.mp4", fps=1.0, max_frames=64,
        )
        assert received == {"fps": 1.0, "max_frames": 64}
        assert meta["frameCount"] == 2

    def test_scene_strategy_routes_to_scene_extractor(self, monkeypatch):
        routed = {}

        def fake_scene(video_path, max_frames=None, start_ms=None, end_ms=None):
            routed.update(video_path=video_path, max_frames=max_frames,
                          start_ms=start_ms, end_ms=end_ms)
            return [_jpeg_bytes((5, 5, 5))], {"strategy": "scene", "frameCount": 1}

        monkeypatch.setattr("vlm_analyzer._extract_scene_frames", fake_scene)
        frames, meta = _extract_minicpm_frames(
            object(), "/abs/video.mp4", frame_strategy="scene",
            max_frames=32, start_ms=1000, end_ms=9000,
        )
        assert len(frames) == 1
        assert routed == {"video_path": "/abs/video.mp4", "max_frames": 32,
                          "start_ms": 1000, "end_ms": 9000}
        assert meta["strategy"] == "scene"


# ─── run_vlm_inference scene-window wiring (S4) ───

class TestRunVlmInferenceSceneWindows:
    def _mp4(self, tmp_path):
        path = tmp_path / "clip.mp4"
        path.write_bytes(b"fake")
        return str(path)

    def test_windowed_scene_extraction_per_window(self, tmp_path, monkeypatch):
        """S4: scene + window → _extract_scene_frames with window bounds."""
        import vlm_analyzer

        scene_calls = []

        def fake_scene(video_path, max_frames=None, start_ms=None, end_ms=None):
            scene_calls.append((start_ms, end_ms, max_frames))
            return [_jpeg_bytes((7, 7, 7))], {"strategy": "scene", "frameCount": 1}

        gen_calls = []

        def fake_generate(model, processor, engine=None, image_paths=None,
                          prompt_text=None, **kwargs):
            gen_calls.append(len(image_paths))
            return "## Description\nScene frame desc.\n"

        monkeypatch.setattr(vlm_analyzer, "_extract_scene_frames", fake_scene)
        monkeypatch.setattr(vlm_analyzer, "generate_response", fake_generate)

        raw = run_vlm_inference(
            object(), object(), self._mp4(tmp_path), True, "prompt",
            engine="minicpm", start_ms=14000, end_ms=30000,
            frame_strategy="scene", max_frames=32,
        )

        assert "Scene frame desc." in raw
        assert scene_calls == [(14000, 30000, 32)]
        assert gen_calls == [1]

    def test_windowed_uniform_still_uses_extract_frames(self, tmp_path,
                                                        monkeypatch):
        """S1 regression: windowed uniform keeps the file-based extract path."""
        import vlm_analyzer

        extract_calls = []

        def fake_extract(path, fps=None, max_seconds=None, start_ms=None,
                         end_ms=None):
            extract_calls.append((start_ms, end_ms, fps))
            return ["/tmp/frame_0001.jpg"]

        monkeypatch.setattr(vlm_analyzer, "extract_frames", fake_extract)
        monkeypatch.setattr(
            vlm_analyzer, "generate_response",
            lambda *a, **k: "## Description\nuniform window.\n",
        )
        monkeypatch.setattr(vlm_analyzer, "_cleanup_frames", lambda frames: None)

        run_vlm_inference(
            object(), object(), self._mp4(tmp_path), True, "prompt",
            engine="minicpm", start_ms=0, end_ms=10000, sample_fps=1.0,
        )
        assert extract_calls == [(0, 10000, 1.0)]

    def test_scene_no_frames_raises(self, tmp_path, monkeypatch):
        import vlm_analyzer

        monkeypatch.setattr(
            vlm_analyzer, "_extract_scene_frames",
            lambda *a, **k: ([], {"strategy": "scene", "frameCount": 0}),
        )
        with pytest.raises(RuntimeError, match="no frames"):
            run_vlm_inference(
                object(), object(), self._mp4(tmp_path), True, "prompt",
                engine="minicpm", start_ms=0, end_ms=8000,
                frame_strategy="scene",
            )


# ─── handle_analyze_semantics param plumbing ───

class TestHandleAnalyzeSemanticsFrameParams:
    def _mp4(self, tmp_path):
        path = tmp_path / "clip.mp4"
        path.write_bytes(b"fake")
        return str(path)

    def test_invalid_strategy_fails_fast(self, tmp_path):
        result, err = handle_analyze_semantics(
            object(), object(), self._mp4(tmp_path),
            frame_strategy="adaptive",
        )
        assert result == {}
        assert err is not None and "frame_strategy" in err

    def test_invalid_max_frames_fails_fast(self, tmp_path):
        result, err = handle_analyze_semantics(
            object(), object(), self._mp4(tmp_path), max_frames=0,
        )
        assert result == {}
        assert err is not None and "max_frames" in err

    def test_params_threaded_to_inference(self, tmp_path, monkeypatch):
        """S4: 2 windows + scene → 2 per-window scene invocations; merge
        contract (#360 eight fields) unchanged."""
        import vlm_analyzer

        calls = []

        def fake_inference(model, processor, path, is_video, prompt_text,
                           **kwargs):
            calls.append(kwargs)
            idx = kwargs["start_ms"]
            return (f"## Description\nWindow at {idx}ms.\n\n"
                    f"## Subjects\nrobot\n\n## Content Kind\ntalking_head\n")

        monkeypatch.setattr(vlm_analyzer, "run_vlm_inference", fake_inference)
        result, err = handle_analyze_semantics(
            object(), object(), self._mp4(tmp_path),
            windows=[
                {"startMs": 0, "endMs": 15000, "sampleFps": 1.0},
                {"startMs": 15000, "endMs": 30000, "sampleFps": 1.0},
            ],
            frame_strategy="scene", max_frames=32,
        )

        assert err is None
        assert len(calls) == 2  # one scene extraction per window
        assert calls[0]["frame_strategy"] == "scene"
        assert calls[0]["max_frames"] == 32
        assert calls[0]["start_ms"] == 0
        assert calls[1]["start_ms"] == 15000
        # Merge contract intact (#360)
        for key in ("description", "subjects", "contentKind", "fit",
                    "criticalEdgeText", "reason", "relevance",
                    "relevanceReason"):
            assert key in result
        assert result["sourceMode"] == "frames"

    def test_defaults_absent_params_unchanged(self, tmp_path, monkeypatch):
        """S1: absent frame params → inference called without strategy kwargs
        override (defaults flow, uniform)."""
        import vlm_analyzer

        calls = []

        def fake_inference(model, processor, path, is_video, prompt_text,
                           **kwargs):
            calls.append(kwargs)
            return "## Description\nDefault path.\n"

        monkeypatch.setattr(vlm_analyzer, "run_vlm_inference", fake_inference)
        result, err = handle_analyze_semantics(
            object(), object(), self._mp4(tmp_path),
        )

        assert err is None
        assert len(calls) == 1
        assert calls[0]["frame_strategy"] == "uniform"
        assert calls[0]["max_frames"] == 16
        assert calls[0]["uniform_fps"] == 2.0
        assert result["description"] == "Default path."


# ─── constants ───

class TestConstants:
    def test_defaults_match_current_behavior(self):
        assert DEFAULT_MAX_FRAMES == 16
        assert DEFAULT_UNIFORM_FPS == 2.0
        assert FRAME_STRATEGY_UNIFORM == "uniform"
        assert FRAME_STRATEGY_SCENE == "scene"
