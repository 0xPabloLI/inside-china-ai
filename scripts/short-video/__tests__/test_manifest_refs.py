#!/usr/bin/env python3
"""
Tests for per-scene reference overrides in f5_mlx_batch_tts.py (#35 方案 B).

resolve_item_ref(): a manifest entry may carry its own ref_audio/ref_text for
emotion-specific cloning; anything missing falls back to the run-level default
pair, so a legacy manifest (no ref fields) behaves exactly as before.
ref_duration_seconds(): memoized ffprobe — per-item refs make repeated probes
likely.

Run: python3 scripts/short-video/__tests__/test_manifest_refs.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from f5_mlx_batch_tts import resolve_item_ref, ref_duration_seconds


def run_tests():
    results = []

    # Test 1: entry without ref fields → default pair
    def test_defaults():
        audio, text = resolve_item_ref({"sceneId": 1, "text": "x"}, "/d/a.wav", "default text")
        assert audio == "/d/a.wav" and text == "default text"
        return "PASS: entry without ref fields falls back to the default pair"

    # Test 2: entry with both fields → override
    def test_override():
        item = {"sceneId": 2, "text": "x", "ref_audio": "/vs/hook.wav", "ref_text": "hook text"}
        audio, text = resolve_item_ref(item, "/d/a.wav", "default text")
        assert audio == "/vs/hook.wav" and text == "hook text"
        return "PASS: entry with ref fields overrides the default pair"

    # Test 3: partial override — ref_audio only, ref_text falls back
    def test_partial():
        item = {"sceneId": 3, "text": "x", "ref_audio": "/vs/hook.wav"}
        audio, text = resolve_item_ref(item, "/d/a.wav", "default text")
        assert audio == "/vs/hook.wav" and text == "default text"
        return "PASS: partial override fills the missing half from defaults"

    # Test 4: empty-string ref fields fall back (falsy = absent)
    def test_empty_string():
        item = {"sceneId": 4, "text": "x", "ref_audio": "", "ref_text": ""}
        audio, text = resolve_item_ref(item, "/d/a.wav", "default text")
        assert audio == "/d/a.wav" and text == "default text"
        return "PASS: empty-string ref fields fall back to defaults"

    # Test 5: ref_duration_seconds memoizes per path
    def test_duration_memo():
        tmpdir = tempfile.mkdtemp()
        wav = os.path.join(tmpdir, "ref.wav")
        os.system(
            f"ffmpeg -y -f lavfi -i sine=frequency=440:duration=1.5 -ar 24000 '{wav}' 2>/dev/null"
        )
        cache = {}
        d1 = ref_duration_seconds(wav, cache)
        d2 = ref_duration_seconds(wav, cache)
        assert 1.0 < d1 < 2.0, f"unexpected duration {d1}"
        assert d1 == d2
        assert wav in cache
        return "PASS: ref_duration_seconds probes once and memoizes"

    for test in [
        test_defaults,
        test_override,
        test_partial,
        test_empty_string,
        test_duration_memo,
    ]:
        try:
            results.append(test())
        except AssertionError as e:
            print(f"FAIL: {e}", file=sys.stderr)
            sys.exit(1)

    for line in results:
        print(line)


if __name__ == "__main__":
    run_tests()
