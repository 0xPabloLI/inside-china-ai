#!/usr/bin/env python3
"""
Tests for scene-claim relevance support in vlm_analyzer.py (spec #130 D5/D6).

Covers:
  - build_semantics_prompt backward compat (claim=None → base prompt unchanged)
  - claim injection (voiceover + assetNeed + Relevance section present)
  - parse_markdown_to_dict relevance parsing (valid / missing / invalid / out-of-range)

Run: npm run test:python (the suite runner), or
     python3 scripts/short-video/__tests__/test_claim_prompt.py for the report form.

The checks below run at import time and record into RESULTS; pytest replays
them as one test per check (#555), so the file contributes real tests instead
of a bare "0 collected".
"""
import importlib.util
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

import pytest  # noqa: E402

from vlm_analyzer import (
    SEMANTICS_PROMPT_IMAGE,
    SEMANTICS_PROMPT_IMAGE_CLAIM,
    SEMANTICS_PROMPT_VIDEO,
    SEMANTICS_PROMPT_VIDEO_CLAIM,
    build_semantics_prompt,
    parse_markdown_to_dict,
)

CLAIM = {
    "voiceover": "Qwen4 beats Claude at coding benchmarks.",
    "assetNeed": "benchmark chart comparison",
}

RESULTS = []


def check(name, condition, detail=""):
    RESULTS.append((name, bool(condition), detail))


# ── build_semantics_prompt ──

print("build_semantics_prompt:")

check(
    "claim=None image → base prompt unchanged",
    build_semantics_prompt(is_video=False, claim=None) == SEMANTICS_PROMPT_IMAGE,
)
check(
    "claim=None video → base prompt unchanged",
    build_semantics_prompt(is_video=True, claim=None) == SEMANTICS_PROMPT_VIDEO,
)
check(
    "claim=None default arg → base prompt unchanged",
    build_semantics_prompt() == SEMANTICS_PROMPT_IMAGE,
)

claim_image = build_semantics_prompt(is_video=False, claim=CLAIM)
claim_video = build_semantics_prompt(is_video=True, claim=CLAIM)

check(
    "claim image context is preamble",
    claim_image.startswith("Scene claim for relevance scoring:"),
)
check(
    "claim video context is preamble",
    claim_video.startswith("Scene claim for relevance scoring:"),
)
check(
    "claim image prompt carries the compact claim base",
    SEMANTICS_PROMPT_IMAGE_CLAIM in claim_image,
)
check(
    "claim video prompt carries the compact claim base",
    SEMANTICS_PROMPT_VIDEO_CLAIM in claim_video,
)
check(
    "claim context precedes the first output section",
    claim_image.index("Scene claim for relevance scoring:")
    < claim_image.index("## Description"),
)
check("claim voiceover injected", "Qwen4 beats Claude at coding benchmarks." in claim_image)
check("assetNeed injected", "benchmark chart comparison" in claim_image)
check("Relevance section present", "## Relevance" in claim_image)
check("Relevance Reason section present", "## Relevance Reason" in claim_image)

# #334: claim mode keeps every section a downstream consumer reads. Subjects
# feeds scoreCandidate (the hook gate reads that score), Content Kind is
# persisted and rendered in the media-patch review, Fit drives hook
# assignment, and Critical Edge Text carries the merged Reason explanation.
for name, prompt in (("image", claim_image), ("video", claim_video)):
    check(f"claim {name} keeps Description", "## Description" in prompt)
    check(f"claim {name} keeps Subjects", "## Subjects" in prompt)
    check(f"claim {name} keeps Content Kind", "## Content Kind" in prompt)
    check(f"claim {name} drops the Reason section", "\n## Reason\n" not in prompt)
check("claim image keeps Fit", "## Fit" in claim_image)
check("claim image keeps Critical Edge Text", "## Critical Edge Text" in claim_image)
check("claim video drops Fit", "## Fit" not in claim_video)
check(
    "compact claim base is smaller than the base prompt",
    len(SEMANTICS_PROMPT_IMAGE_CLAIM) < len(SEMANTICS_PROMPT_IMAGE),
    f"claim={len(SEMANTICS_PROMPT_IMAGE_CLAIM)} base={len(SEMANTICS_PROMPT_IMAGE)}",
)

# #334: Fit is a single-word decision rule, and the redundant Reason section
# is gone from the base image prompt (Critical Edge Text owns the explanation).
check(
    "base image Fit asks for exactly one word",
    "Output exactly one word: cover or contain." in SEMANTICS_PROMPT_IMAGE,
)
check(
    "base image Fit forbids emitting both words",
    "Never output both words." in SEMANTICS_PROMPT_IMAGE,
)
check(
    "base image prompt has no separate Reason section",
    "\n## Reason\n" not in SEMANTICS_PROMPT_IMAGE,
)
check(
    "Critical Edge Text carries the fit explanation",
    "background texture" in SEMANTICS_PROMPT_IMAGE,
)
for name, prompt in (
    ("base image", SEMANTICS_PROMPT_IMAGE),
    ("claim image", SEMANTICS_PROMPT_IMAGE_CLAIM),
):
    check(
        f"{name} prompt orders Critical Edge Text before Fit",
        prompt.index("## Critical Edge Text") < prompt.index("## Fit"),
    )

empty_claim = build_semantics_prompt(is_video=False, claim={"voiceover": "", "assetNeed": ""})
check(
    "empty claim strings still request Relevance section",
    "## Relevance" in empty_claim,
)
check(
    "empty claim still uses the compact claim base",
    SEMANTICS_PROMPT_IMAGE_CLAIM in empty_claim,
)

# #334 point 4: the benchmark harness must send the production prompt text,
# not a copy that silently drifts. Assert the module-level constants are the
# same objects imported from vlm_analyzer.
_bench_path = os.path.join(os.path.dirname(__file__), "..", "lib", "test_minicpm_omni.py")
_spec = importlib.util.spec_from_file_location("test_minicpm_omni_bench", _bench_path)
_bench = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_bench)
check(
    "bench harness imports the production image prompt",
    _bench.SEMANTICS_PROMPT_IMAGE is SEMANTICS_PROMPT_IMAGE,
)
check(
    "bench harness imports the production video prompt",
    _bench.SEMANTICS_PROMPT_VIDEO is SEMANTICS_PROMPT_VIDEO,
)

# ── parse_markdown_to_dict: relevance ──

print("parse_markdown_to_dict relevance:")

valid = parse_markdown_to_dict(
    """## Description
A chart comparing benchmark scores.

## Subjects
chart, benchmark

## Relevance
85

## Relevance Reason
Chart directly shows the benchmark comparison.
"""
)
check("valid relevance parsed as int", valid.get("relevance") == 85, f"got {valid.get('relevance')!r}")
check(
    "relevanceReason parsed",
    valid.get("relevanceReason") == "Chart directly shows the benchmark comparison.",
    f"got {valid.get('relevanceReason')!r}",
)

missing = parse_markdown_to_dict(
    """## Description
A robot walking.

## Subjects
robot
"""
)
check("missing Relevance → None", missing.get("relevance") is None, f"got {missing.get('relevance')!r}")
check("missing Relevance Reason → None", missing.get("relevanceReason") is None)

for name, raw in [
    ("non-integer", "## Relevance\nmost relevant\n"),
    ("out of range", "## Relevance\n999\n"),
    ("empty", "## Relevance\n\n"),
    # "N out of 100" is prose, not the enumerated score format — fail closed
    # rather than guess (test_parse_markdown.py test_relevance_out_of_100_prose).
    ("out of 100 prose", "## Relevance\n85 out of 100 for matching the claim\n"),
]:
    result = parse_markdown_to_dict(raw + "\n## Description\nd\n")
    check(f"{name} → None", result.get("relevance") is None, f"got {result.get('relevance')!r}")

# A "/100"-suffixed integer IS the enumerated score format the prompt asks for
# (see _parse_relevance_value docstring), so it is trusted — not a fabrication.
# The earlier "annotated value → None" assertion predated that contract.
annotated = parse_markdown_to_dict("## Relevance\n85/100\n## Description\nd\n")
check("annotated /100 parsed as int", annotated.get("relevance") == 85, f"got {annotated.get('relevance')!r}")

boundary = parse_markdown_to_dict("## Relevance\n0\n## Description\nd\n")
check("0 is valid", boundary.get("relevance") == 0)
boundary2 = parse_markdown_to_dict("## Relevance\n100\n## Description\nd\n")
check("100 is valid", boundary2.get("relevance") == 100)

# Legacy parse behavior must not regress
legacy = parse_markdown_to_dict(
    """## Description
desc

## Subjects
a, b

## Content Kind
product_demo

## Fit
cover

## Critical Edge Text
no

## Reason
fine
"""
)
check(
    "legacy 6-key parse unaffected",
    legacy.get("fit") == "cover"
    and legacy.get("contentKind") == "product_demo"
    and legacy.get("description") == "desc",
)

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
