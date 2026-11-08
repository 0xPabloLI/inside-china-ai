#!/usr/bin/env python3
"""#991: semantics prompt text budget for vlm_analyzer.py.

The VLM semantics prompt is paid once per analyzed asset — tens to hundreds of
inferences per asset pack — but until this file there was no size gate, so any
future explanatory sentence added to `build_semantics_prompt()` landed silently.
The T2V side already has one (`prompt-budget.mjs` / `PromptBudgetError`).

Decision recorded in `docs/video-production-runbook.md` § 语义 Prompt 契约（#334）:
the #334 rules are ACCEPTED at their measured size instead of being compressed
back to the pre-#334 1079-char image base. Getting to `1079 * 1.05 = 1133`
would have required cutting ~40% of `_CRITICAL_EDGE_RULE` + `_FIT_RULE`, i.e.
deleting the edge→Fit mapping that stopped Fit from oscillating (chart →
contain, clean subject → cover on the same 5-asset A/B). The ceilings below
lock today's measured values so the prompt can only get smaller, never grow.

Counts are characters (`len()`), not estimated tokens: Python side has no
token estimator, and inventing one here would be a second source of truth.

Run: npm run test:python (or python3 scripts/short-video/__tests__/test_semantics_prompt_budget.py)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

import pytest  # noqa: E402

from vlm_analyzer import (  # noqa: E402
    SEMANTICS_PROMPT_IMAGE,
    SEMANTICS_PROMPT_IMAGE_CLAIM,
    SEMANTICS_PROMPT_VIDEO,
    SEMANTICS_PROMPT_VIDEO_CLAIM,
    _CRITICAL_EDGE_RULE,
    _FIT_RULE,
    build_semantics_prompt,
)

# Fixed claim so the claim-mode totals are reproducible. Its length is part of
# the measured value — do not "shorten the fixture" to make a failure disappear.
CLAIM = {
    "voiceover": "Qwen4 beats Claude at coding benchmarks.",
    "assetNeed": "benchmark chart comparison",
}

# (id, actual text, ceiling, upstream reference). Ceilings are literal on
# purpose: the #991 measurement on the accepted prompt text. If a failure
# says "+N over", the text grew and someone must shrink it or re-open the
# decision — never bump the number to make the test green.
BUDGETS = [
    (
        "image base constant",
        SEMANTICS_PROMPT_IMAGE,
        1446,
        "pre-#334 base was 1079; #334 added the two rules (+367 = +34.0%)",
    ),
    (
        "image claim constant",
        SEMANTICS_PROMPT_IMAGE_CLAIM,
        1152,
        "the claim variant drops the example, keeps the two rules",
    ),
    (
        "video base constant",
        SEMANTICS_PROMPT_VIDEO,
        534,
        "videos never asked for Fit, so #334 left this prompt unchanged",
    ),
    (
        "video claim constant",
        SEMANTICS_PROMPT_VIDEO_CLAIM,
        367,
        "compact video claim base",
    ),
    (
        "critical edge rule",
        _CRITICAL_EDGE_RULE,
        380,
        "shared block: edge evidence the Fit decision derives from",
    ),
    (
        "fit rule",
        _FIT_RULE,
        403,
        "shared block: single-word cover/contain decision",
    ),
    (
        "built image claim prompt",
        build_semantics_prompt(is_video=False, claim=CLAIM),
        2136,
        "base constants + claim preamble + Relevance/Relevance Reason sections",
    ),
    (
        "built video claim prompt",
        build_semantics_prompt(is_video=True, claim=CLAIM),
        1351,
        "video claim base + claim preamble + Relevance/Relevance Reason sections",
    ),
]


@pytest.mark.parametrize(
    ("name", "text", "ceiling", "reference"),
    BUDGETS,
    ids=[row[0] for row in BUDGETS],
)
def test_semantics_prompt_within_budget(name, text, ceiling, reference):
    actual = len(text)
    assert actual <= ceiling, (
        f"{name} is {actual} chars, budget {ceiling} "
        f"(+{actual - ceiling} over). {reference}. "
        "Shrink the text in vlm_analyzer.py, or re-open the size decision in "
        "docs/video-production-runbook.md § 语义 Prompt 契约（#334）."
    )
