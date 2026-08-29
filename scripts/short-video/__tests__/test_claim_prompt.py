#!/usr/bin/env python3
"""
Tests for scene-claim relevance support in vlm_analyzer.py (spec #130 D5/D6).

Covers:
  - build_semantics_prompt backward compat (claim=None → base prompt unchanged)
  - claim injection (voiceover + assetNeed + Relevance section present)
  - parse_markdown_to_dict relevance parsing (valid / missing / invalid / out-of-range)

Run: python3 scripts/short-video/__tests__/test_claim_prompt.py
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

from vlm_analyzer import (
    SEMANTICS_PROMPT_IMAGE,
    SEMANTICS_PROMPT_VIDEO,
    build_semantics_prompt,
    parse_markdown_to_dict,
)

CLAIM = {
    "voiceover": "Qwen4 beats Claude at coding benchmarks.",
    "assetNeed": "benchmark chart comparison",
}

failures = []


def check(name, condition, detail=""):
    if condition:
        print(f"  ✅ {name}")
    else:
        failures.append(name)
        print(f"  ❌ {name} {detail}")


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

check("claim image prompt starts with base prompt", claim_image.startswith(SEMANTICS_PROMPT_IMAGE))
check("claim video prompt starts with base prompt", claim_video.startswith(SEMANTICS_PROMPT_VIDEO))
check("claim voiceover injected", "Qwen4 beats Claude at coding benchmarks." in claim_image)
check("assetNeed injected", "benchmark chart comparison" in claim_image)
check("Relevance section present", "## Relevance" in claim_image)
check("Relevance Reason section present", "## Relevance Reason" in claim_image)

empty_claim = build_semantics_prompt(is_video=False, claim={"voiceover": "", "assetNeed": ""})
check(
    "empty claim strings still request Relevance section",
    "## Relevance" in empty_claim,
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
    ("annotated value", "## Relevance\n85/100\n"),
    ("empty", "## Relevance\n\n"),
]:
    result = parse_markdown_to_dict(raw + "\n## Description\nd\n")
    check(f"{name} → None", result.get("relevance") is None, f"got {result.get('relevance')!r}")

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

if failures:
    print(f"\n❌ {len(failures)} failing: {failures}")
    sys.exit(1)
print("\n✅ All claim prompt tests passed")
