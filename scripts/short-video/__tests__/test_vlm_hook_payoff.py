"""Hook payoff prompt + parser tests (#1206).

Import is light: vlm_analyzer.py only imports stdlib at module level; torch/mlx
load lazily inside functions, so these tests run in the CI venv without models.
"""

import os
import sys

sys.path.insert(
    0, os.path.join(os.path.dirname(__file__), "..", "lib")
)

from vlm_analyzer import (  # noqa: E402
    _degraded_result,
    build_hook_payoff_prompt,
    parse_markdown_to_dict,
)


def test_prompt_names_the_printed_claim_and_asks_for_the_action():
    prompt = build_hook_payoff_prompt({"promise": "IT LIFTS A CAR."})
    assert '"IT LIFTS A CAR."' in prompt
    assert "## Payoff" in prompt
    assert "## Payoff Reason" in prompt
    # The action-level question is the whole point: this is not the #294
    # subject-level relevance check.
    assert "does the promised payoff actually happen" in prompt


def test_prompt_without_a_claim_still_asks_about_the_action():
    prompt = build_hook_payoff_prompt({})
    assert "prints no claim text" in prompt
    assert "## Payoff" in prompt


def test_parses_the_three_verdicts():
    raw = "## Payoff\npass\n## Payoff Reason\nA robot lifts the front of a car."
    parsed = parse_markdown_to_dict(raw)
    assert parsed["payoff"] == "pass"
    assert parsed["payoffReason"] == "A robot lifts the front of a car."

    assert parse_markdown_to_dict("## Payoff\npartial\n## Payoff Reason\nx")["payoff"] == "partial"
    assert parse_markdown_to_dict("## Payoff\nabsent\n## Payoff Reason\nx")["payoff"] == "absent"


def test_parses_a_prose_answer_that_names_exactly_one_verdict():
    parsed = parse_markdown_to_dict("## Payoff\nThe payoff is absent in these frames.")
    assert parsed["payoff"] == "absent"


def test_ambiguous_prose_fails_closed():
    parsed = parse_markdown_to_dict("## Payoff\nIt could be pass or absent.")
    assert parsed["payoff"] is None


def test_missing_section_is_none_not_pass():
    parsed = parse_markdown_to_dict("## Description\nA robot in a kitchen.")
    assert parsed["payoff"] is None
    assert parsed["payoffReason"] is None


def test_accepts_a_lengthened_header():
    parsed = parse_markdown_to_dict("## Hook Payoff\nabsent\n## Payoff Reason\nNo car.")
    assert parsed["payoff"] == "absent"


def test_headerless_answer_opens_with_the_verdict():
    parsed = parse_markdown_to_dict("pass\n\nThe front wheel lifts off the ground.")
    assert parsed["payoff"] == "pass"
    assert parsed["payoffReason"] == "The front wheel lifts off the ground."


def test_headerless_description_that_mentions_a_verdict_later_is_not_a_verdict():
    parsed = parse_markdown_to_dict(
        "A robot walks through a villa.\n\nThe car is absent from these frames."
    )
    assert parsed["payoff"] is None
    assert "robot walks" in parsed["description"]


def test_degraded_result_keeps_the_hook_payoff_shape():
    degraded = _degraded_result("model unavailable")
    assert degraded["payoff"] is None
    assert degraded["payoffReason"] is None
    assert degraded["error"] == "model unavailable"
