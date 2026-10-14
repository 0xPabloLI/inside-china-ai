"""
Tests for estimate_target_seconds and related helpers in f5_mlx_batch_tts.py.

Run via the suite runner: npm run test:python.
Run directly with: python3 test_f5_duration.py (prints the same
"Results: N passed, 0 failed" summary the vitest wrapper test-f5-duration.test.mjs
parses). The checks also run at import time and record into RESULTS, so pytest
replays them as one test per check instead of collecting 0 tests (#555).

These tests do NOT require the F5 model or any large downloads.
They only test the pure Python duration estimation logic.
"""
import sys
import os
import json

# pytest drives the suite (#555). The vitest wrapper
# (test-f5-duration.test.mjs) instead spawns this file with the TTS venv's
# python (~/.video-tts-env, Python 3.12, no pytest), so a direct run must stay
# self-contained — hence the tolerant import.
try:
    import pytest
except ImportError:  # pragma: no cover - exercised by the wrapper's venv
    pytest = None

# Add parent dir to path so we can import from f5_mlx_batch_tts
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from f5_mlx_batch_tts import (
    estimate_target_seconds,
    is_cjk_char,
    normalize_for_duration,
    count_cjk_characters,
    count_latin_words,
    count_major_punctuation,
    CJK_CHARS_PER_SECOND,
    LATIN_WORDS_PER_SECOND,
    PUNCTUATION_PAUSE_SECONDS,
    MIN_TARGET_SECONDS,
)

RESULTS = []


def check(name, condition, detail=""):
    RESULTS.append((name, bool(condition), detail))


def run_tests():
    print("Running F5 duration estimation tests...\n")

    # ── is_cjk_char ──
    print("is_cjk_char:")
    check("大 is CJK", is_cjk_char("大") is True)
    check("家 is CJK", is_cjk_char("家") is True)
    check("A is not CJK", is_cjk_char("A") is False)
    check("， is CJK punct", is_cjk_char("，") is True)
    check("5 is not CJK", is_cjk_char("5") is False)
    check("space is not CJK", is_cjk_char(" ") is False)

    # ── normalize_for_duration ──
    print("\nnormalize_for_duration:")
    check("strips markdown bold", "**" not in normalize_for_duration("**hello**"))
    check("strips URLs", "http" not in normalize_for_duration("check https://example.com out"))
    check("collapses whitespace", normalize_for_duration("a  b   c") == "a b c")

    # ── count_cjk_characters ──
    print("\ncount_cjk_characters:")
    check("pure Chinese", count_cjk_characters("大家好今天天气很好") == 9)
    check("mixed CJK+Latin", count_cjk_characters("DeepSeek发布了新模型") == 6)
    check("pure English returns 0", count_cjk_characters("Hello World") == 0)
    check("empty string returns 0", count_cjk_characters("") == 0)

    # ── count_latin_words ──
    print("\ncount_latin_words:")
    check("pure English", count_latin_words("Hello World") == 2)
    check("pure Chinese returns 0", count_latin_words("大家好") == 0)
    check("mixed text", count_latin_words("DeepSeek 发布了 新模型") == 1)
    check("empty string returns 0", count_latin_words("") == 0)

    # ── count_major_punctuation ──
    print("\ncount_major_punctuation:")
    check("Chinese commas", count_major_punctuation("你好，世界，大家好") == 2)
    check("Chinese period", count_major_punctuation("你好。") == 1)
    check("English comma", count_major_punctuation("Hello, World") == 1)
    check("mixed punct", count_major_punctuation("Hello！World。") == 2)
    check("no punct", count_major_punctuation("Hello World") == 0)

    # ── estimate_target_seconds: pure Chinese ──
    print("\nestimate_target_seconds (pure Chinese):")
    # 9 CJK chars / 4.5 = 2.0s
    dur = estimate_target_seconds("大家好今天天气很好")
    check("9 CJK chars ≈ 2.0s", abs(dur - 9/4.5) < 0.01, f"got {dur:.3f}s")

    # Old formula: len("大家好今天天气很好".split()) / 2.8 = 1/2.8 = 0.357s (WRONG!)
    check("much longer than old formula", dur > 1.0, f"old formula would give 0.357s, got {dur:.3f}s")

    # ── estimate_target_seconds: pure English ──
    print("\nestimate_target_seconds (pure English):")
    # 2 words / 2.8 = 0.714s
    dur = estimate_target_seconds("Hello World")
    check("2 words ≈ 0.714s", abs(dur - 2/2.8) < 0.01, f"got {dur:.3f}s")

    # ── estimate_target_seconds: mixed CJK+Latin ──
    print("\nestimate_target_seconds (mixed):")
    # "DeepSeek 发布了新模型" = 6 CJK + 1 Latin word + 0 punct
    # = 6/4.5 + 1/2.8 = 1.333 + 0.357 = 1.690s
    dur = estimate_target_seconds("DeepSeek 发布了新模型")
    check("6 CJK + 1 word ≈ 1.69s", abs(dur - (6/4.5 + 1/2.8)) < 0.01, f"got {dur:.3f}s")

    # ── estimate_target_seconds: with punctuation ──
    print("\nestimate_target_seconds (with punctuation):")
    # "大家好，今天天气很好。" = 9 CJK + 0 Latin + 2 punct
    # = 9/4.5 + 0 + 2*0.15 = 2.000 + 0.30 = 2.300s
    dur_with_punct = estimate_target_seconds("大家好，今天天气很好。")
    dur_without_punct = estimate_target_seconds("大家好今天天气很好")
    check("with punct is longer", dur_with_punct > dur_without_punct, f"with={dur_with_punct:.3f}s, without={dur_without_punct:.3f}s")
    check("punct adds 0.3s", abs(dur_with_punct - dur_without_punct - 2*PUNCTUATION_PAUSE_SECONDS) < 0.01, f"diff={dur_with_punct - dur_without_punct:.3f}s")

    # ── estimate_target_seconds: numbers and brand names ──
    print("\nestimate_target_seconds (numbers/brands):")
    dur = estimate_target_seconds("DeepSeek的估值达到500亿美元")
    check("mixed with numbers produces reasonable duration", dur > 1.0, f"got {dur:.3f}s")
    check("no NaN", dur == dur and dur > 0, f"got {dur:.3f}s")

    # ── estimate_target_seconds: minimum duration ──
    print("\nestimate_target_seconds (minimum):")
    dur = estimate_target_seconds("好")
    check("single char respects minimum", dur >= MIN_TARGET_SECONDS, f"got {dur:.3f}s, min={MIN_TARGET_SECONDS}s")

    # ── estimate_target_seconds: empty/edge ──
    print("\nestimate_target_seconds (edge cases):")
    dur = estimate_target_seconds("")
    check("empty string respects minimum", dur >= MIN_TARGET_SECONDS, f"got {dur:.3f}s")

    dur = estimate_target_seconds("   ")
    check("whitespace only respects minimum", dur >= MIN_TARGET_SECONDS, f"got {dur:.3f}s")

    # ── Regression: old formula vs new ──
    print("\nRegression (old formula vs new):")
    chinese_sentence = "商汤科技发布了最新的人工智能大模型"
    old_dur = len(chinese_sentence.split()) / 2.8  # = 1/2.8 = 0.357s
    new_dur = estimate_target_seconds(chinese_sentence)
    check("new formula is significantly longer for Chinese", new_dur > old_dur * 3, f"old={old_dur:.3f}s, new={new_dur:.3f}s")


def _report():
    """Direct-run summary — the "Results: N passed, 0 failed" shape the
    vitest wrapper (test-f5-duration.test.mjs) greps for."""
    failed = [(name, detail) for name, ok, detail in RESULTS if not ok]
    for name, detail in failed:
        print(f"  ✗ {name} — {detail}")
    passed = len(RESULTS) - len(failed)
    print(f"\n{'='*40}")
    print(f"Results: {passed} passed, {len(failed)} failed")
    print(f"{'='*40}")
    return not failed


# Populate RESULTS at import so pytest can parametrize over it (#555).
run_tests()


if pytest is not None:
    @pytest.mark.parametrize(
        ("name", "condition", "detail"), RESULTS, ids=[result[0] for result in RESULTS]
    )
    def test_recorded_checks(name, condition, detail):
        assert condition, f"{name} {detail}"


if __name__ == "__main__":
    raise SystemExit(0 if _report() else 1)
