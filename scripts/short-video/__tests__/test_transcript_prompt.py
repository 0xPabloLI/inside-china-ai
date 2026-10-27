#!/usr/bin/env python3
"""
Tests for the A1 transcript block + video-input capability in vlm_analyzer.py
(#542 L3/L1).

Covers:
  - build_semantics_prompt backward compat (transcript=None → base prompt)
  - transcript injection for videos: position (before the task), bench-parity
    header wording and 2000-char cap (bench_prompt.py is the measured arm)
  - images ignore a transcript (no audio channel)
  - claim block stays after the base prompt (transcript, base+claim order)
  - whitespace-only transcript → no block
  - videoInput capability: real config values + fail-fast on malformed entries
  - resolve_source_mode: native / frames / image

Run: npm run test:python (the suite runner), or
     python3 scripts/short-video/__tests__/test_transcript_prompt.py for the report form.

The checks below run at import time and record into RESULTS; pytest replays
them as one test per check (#555), so the file contributes real tests instead
of a bare "0 collected".
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
BENCH_DIR = os.path.join(os.path.dirname(__file__), "..", "bench", "keyframe")
sys.path.insert(0, BENCH_DIR)

import pytest  # noqa: E402

from vlm_analyzer import (  # noqa: E402
    SEMANTICS_PROMPT_IMAGE,
    SEMANTICS_PROMPT_VIDEO,
    SEMANTICS_PROMPT_VIDEO_CLAIM,
    TRANSCRIPT_HEAD,
    TRANSCRIPT_MAX_CHARS,
    VIDEO_INPUT_FRAMES,
    VIDEO_INPUT_NATIVE,
    build_semantics_prompt,
    resolve_source_mode,
    validate_video_inputs,
    video_input_for,
)
import bench_prompt as bq  # noqa: E402

CLAIM = {
    "voiceover": "Qwen4 beats Claude at coding benchmarks.",
    "assetNeed": "benchmark chart comparison",
}

TRANSCRIPT = "今天我们来聊一下通义千问的最新版本。这个模型在编码基准上超过了对手。"

RESULTS = []


def check(name, condition, detail=""):
    RESULTS.append((name, bool(condition), detail))


# ── build_semantics_prompt: transcript ──

print("build_semantics_prompt transcript:")

check(
    "transcript=None video → base prompt unchanged",
    build_semantics_prompt(is_video=True, transcript=None) == SEMANTICS_PROMPT_VIDEO,
)
check(
    "transcript=None image → base prompt unchanged",
    build_semantics_prompt(is_video=False, transcript=None) == SEMANTICS_PROMPT_IMAGE,
)
check(
    "default args → base image prompt unchanged",
    build_semantics_prompt() == SEMANTICS_PROMPT_IMAGE,
)

with_transcript = build_semantics_prompt(is_video=True, transcript=TRANSCRIPT)

check(
    "video + transcript → header first (before the task)",
    with_transcript.startswith(f"{TRANSCRIPT_HEAD}\n{TRANSCRIPT}\n\n"),
    f"got {with_transcript[:60]!r}",
)
check(
    "video + transcript → base prompt follows the block",
    with_transcript.endswith(SEMANTICS_PROMPT_VIDEO),
)
check(
    "transcript text present exactly once",
    with_transcript.count(TRANSCRIPT) == 1,
)

check(
    "image + transcript → transcript ignored (no audio channel)",
    build_semantics_prompt(is_video=False, transcript=TRANSCRIPT) == SEMANTICS_PROMPT_IMAGE,
)
check(
    "whitespace-only transcript → no block",
    build_semantics_prompt(is_video=True, transcript="   \n ") == SEMANTICS_PROMPT_VIDEO,
)
check(
    "transcript is stripped before injection",
    build_semantics_prompt(is_video=True, transcript=f"  {TRANSCRIPT}  ").startswith(
        f"{TRANSCRIPT_HEAD}\n{TRANSCRIPT}\n\n"
    ),
)

long_transcript = "字" * (TRANSCRIPT_MAX_CHARS + 500)
capped = build_semantics_prompt(is_video=True, transcript=long_transcript)
check(
    f"transcript capped at {TRANSCRIPT_MAX_CHARS} chars",
    f"{TRANSCRIPT_HEAD}\n" + long_transcript[:TRANSCRIPT_MAX_CHARS] + "\n\n" in capped,
    f"len={len(capped)}",
)

with_claim = build_semantics_prompt(is_video=True, claim=CLAIM, transcript=TRANSCRIPT)
check("claim + transcript → transcript first", with_claim.startswith(TRANSCRIPT_HEAD))
check("claim + transcript → claim block present", "## Relevance" in with_claim)
check(
    "claim + transcript → claim context precedes the compact claim base",
    with_claim.index("Scene claim for relevance scoring:")
    < with_claim.index(SEMANTICS_PROMPT_VIDEO_CLAIM),
)
check(
    "claim context is not an output-shaped `## ` section",
    "## Scene Claim" not in with_claim,
)
check(
    "claim=None + transcript → no claim block",
    "Scene claim for relevance scoring:" not in with_transcript,
)

# ── bench parity (the measured arm is bench_prompt.py) ──

print("bench parity:")

check(
    "header wording matches the bench ASR_HEAD verbatim",
    TRANSCRIPT_HEAD == bq.ASR_HEAD,
    f"py={TRANSCRIPT_HEAD!r} bench={bq.ASR_HEAD!r}",
)
check(
    "char cap matches the bench DEFAULT_MAX_CHARS",
    TRANSCRIPT_MAX_CHARS == bq.DEFAULT_MAX_CHARS,
    f"py={TRANSCRIPT_MAX_CHARS} bench={bq.DEFAULT_MAX_CHARS}",
)

bench_prompt = bq.build_prompt("question?", ["a", "b", "c", "d"], TRANSCRIPT, "block")
production_prompt = build_semantics_prompt(is_video=True, transcript=TRANSCRIPT)
check(
    "both inject the same head line",
    bench_prompt.split("\n", 1)[0] == production_prompt.split("\n", 1)[0],
)
check(
    "both inject the transcript on the line right after the head",
    bench_prompt.split("\n")[1] == production_prompt.split("\n")[1] == TRANSCRIPT,
)

# ── videoInput capability (#542 L1) ──

print("videoInput capability:")

check(
    "minicpm declares frames (no native video support)",
    video_input_for("minicpm") == VIDEO_INPUT_FRAMES,
    f"got {video_input_for('minicpm')!r}",
)
check(
    "qwen3-vl-moe declares native",
    video_input_for("qwen3-vl-moe") == VIDEO_INPUT_NATIVE,
    f"got {video_input_for('qwen3-vl-moe')!r}",
)
check(
    "qwen3-vl-thinking declares native",
    video_input_for("qwen3-vl-thinking") == VIDEO_INPUT_NATIVE,
    f"got {video_input_for('qwen3-vl-thinking')!r}",
)

for name, config, expected in [
    ("engines missing", {"engine": "minicpm"}, 'an "engines" object'),
    ("engine entry not an object", {"engines": {"minicpm": "frames"}}, "videoInput"),
    ("videoInput missing", {"engines": {"minicpm": {"modelId": "m"}}}, "videoInput"),
    (
        "videoInput unknown",
        {"engines": {"minicpm": {"modelId": "m", "videoInput": "still"}}},
        "videoInput",
    ),
]:
    try:
        validate_video_inputs(config)
        check(f"validate_video_inputs raises on {name}", False, "no raise")
    except RuntimeError as e:
        check(f"validate_video_inputs raises on {name}", expected in str(e), str(e)[:80])

try:
    video_input_for("no-such-engine")
    check("video_input_for raises on an unknown engine", False, "no raise")
except RuntimeError:
    check("video_input_for raises on an unknown engine", True)

# ── resolve_source_mode ──

print("resolve_source_mode:")

check(
    "video + native engine + no window → native",
    resolve_source_mode(True, "qwen3-vl-moe", windowed=False) == "native",
)
check(
    "video + native engine + window → frames",
    resolve_source_mode(True, "qwen3-vl-moe", windowed=True) == "frames",
)
check(
    "video + frames engine → frames",
    resolve_source_mode(True, "minicpm", windowed=False) == "frames",
)
check("image → None", resolve_source_mode(False, "qwen3-vl-moe", windowed=False) is None)

# ── Report ──

# One pytest test per recorded check: a failing check names itself instead of
# sinking the whole file into a collection-time sys.exit (#555).
@pytest.mark.parametrize(
    ("name", "condition", "detail"), RESULTS, ids=[result[0] for result in RESULTS]
)
def test_recorded_checks(name, condition, detail):
    assert condition, f"{name} {detail}"


def _report():
    failed = [(name, detail) for name, ok, detail in RESULTS if not ok]
    for name, detail in failed:
        print(f"  ❌ {name} {detail}")
    print(f"Results: {len(RESULTS) - len(failed)} passed, {len(failed)} failed")
    return not failed


if __name__ == "__main__":
    raise SystemExit(0 if _report() else 1)
