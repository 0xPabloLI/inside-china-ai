#!/usr/bin/env python3
"""
Tests for per-scene reference overrides in f5_mlx_batch_tts.py (#35 方案 B).

resolve_item_ref(): a manifest entry may carry its own ref_audio/ref_text for
emotion-specific cloning; anything missing falls back to the run-level default
pair, so a legacy manifest (no ref fields) behaves exactly as before.
ref_duration_seconds(): memoized ffprobe — per-item refs make repeated probes
likely.

Run: npm run test:python (the suite runner), or
     python3 scripts/short-video/__tests__/test_manifest_refs.py.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest  # noqa: E402

from f5_mlx_batch_tts import resolve_item_ref, ref_duration_seconds


def test_entry_without_ref_fields_falls_back_to_default_pair():
    audio, text = resolve_item_ref({"sceneId": 1, "text": "x"}, "/d/a.wav", "default text")
    assert audio == "/d/a.wav" and text == "default text"


def test_entry_with_both_ref_fields_overrides_the_default_pair():
    item = {"sceneId": 2, "text": "x", "ref_audio": "/vs/hook.wav", "ref_text": "hook text"}
    audio, text = resolve_item_ref(item, "/d/a.wav", "default text")
    assert audio == "/vs/hook.wav" and text == "hook text"


def test_partial_override_fills_the_missing_half_from_defaults():
    item = {"sceneId": 3, "text": "x", "ref_audio": "/vs/hook.wav"}
    audio, text = resolve_item_ref(item, "/d/a.wav", "default text")
    assert audio == "/vs/hook.wav" and text == "default text"


def test_empty_string_ref_fields_fall_back_to_defaults():
    item = {"sceneId": 4, "text": "x", "ref_audio": "", "ref_text": ""}
    audio, text = resolve_item_ref(item, "/d/a.wav", "default text")
    assert audio == "/d/a.wav" and text == "default text"


def test_ref_duration_seconds_probes_once_and_memoizes(tmp_path):
    wav = str(tmp_path / "ref.wav")
    os.system(
        f"ffmpeg -y -f lavfi -i sine=frequency=440:duration=1.5 -ar 24000 '{wav}' 2>/dev/null"
    )
    cache = {}
    d1 = ref_duration_seconds(wav, cache)
    d2 = ref_duration_seconds(wav, cache)
    assert 1.0 < d1 < 2.0, f"unexpected duration {d1}"
    assert d1 == d2
    assert wav in cache


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
