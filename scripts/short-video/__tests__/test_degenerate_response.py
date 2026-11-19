#!/usr/bin/env python3
"""#1449: degenerate VLM output detection and retry contract.

The #541 expanded run had 6/102 outputs that repeated one token until the
token budget ran out, so the Relevance section never appeared. Those are tool
failures, not content verdicts; the analyzer retries once and then fails closed.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

from vlm_analyzer import (  # noqa: E402
    DEGENERACY_RETRY_SUFFIX,
    is_degenerate_response,
    is_incomplete_response,
)


def test_repeated_token_loop_is_degenerate():
    raw = (
        "## Description\nA technical blueprint of a mechanical assembly.\n\n"
        "## Subjects\n"
        + '"H10", ' * 163
    )
    assert is_degenerate_response(raw)


def test_repeated_phrase_loop_is_degenerate():
    raw = "## Subjects\n" + ", ".join(f'"Rack {1071 + i}"' for i in range(80))
    assert is_degenerate_response(raw)


def test_one_giant_token_run_is_degenerate():
    raw = "## Description\n" + "0" * 1200
    assert is_degenerate_response(raw)


def test_normal_analysis_is_not_degenerate():
    raw = """## Description
A conference stage with a large screen showing a product keynote.

## Subjects
stage, screen, audience

## Content Kind
event

## Relevance
72

## Relevance Reason
The stage is the setting where the narrated keynote happened.
"""
    assert not is_degenerate_response(raw)


def test_short_text_is_never_degenerate():
    assert not is_degenerate_response("## Relevance\n0\n")


def test_retry_suffix_forbids_repetition():
    assert "Do not repeat tokens" in DEGENERACY_RETRY_SUFFIX


def test_missing_relevance_section_is_incomplete():
    prompt = 'Scene claim for relevance scoring:\n\n## Relevance\nScore\n'
    raw = "## Description\nd\n## Subjects\ns\n## Critical Edge Text\nyes\n"
    assert is_incomplete_response(raw, prompt)


def test_complete_claim_response_is_not_incomplete():
    prompt = "## Relevance\nScore\n"
    raw = "## Description\nd\n## Relevance\n70\n"
    assert not is_incomplete_response(raw, prompt)


def test_non_claim_prompt_is_never_incomplete():
    assert not is_incomplete_response("## Description\nd\n", "Analyze this image")


def test_empty_response_is_incomplete_for_claim_prompt():
    assert is_incomplete_response("", "## Relevance\n")
