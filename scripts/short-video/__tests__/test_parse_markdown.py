#!/usr/bin/env python3
"""
Test suite for parse_markdown_to_dict() — boundary cases.

Covers scenarios from spec-vlm-semantic-merge.md Scenario Matrix rows 1-8.
Run: npm run test:python (the suite runner), or
     python3 scripts/short-video/__tests__/test_parse_markdown.py.

Each table entry is one pytest test (#555); before the suite had a runner the
table only executed under a bare direct call and collected 0 tests under
pytest.
"""
import sys
import os

# Add the lib directory to path so we can import vlm_analyzer
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

import pytest  # noqa: E402

from vlm_analyzer import parse_markdown_to_dict

MANDATORY_KEYS = ["description", "subjects", "contentKind", "fit", "criticalEdgeText", "reason"]


def _cases():
    """(name, input_text, expected_fields) triples — one pytest test each."""
    return [
        # Test 1: Normal Markdown with all 6 sections (Scenario 1)
        ("test_normal_markdown", """
## Description
A humanoid robot demonstrating household tasks in a kitchen setting.

## Subjects
robot, kitchen, product

## Content Kind
product_demo

## Fit
contain

## Critical Edge Text
yes — bottom edge has product label text

## Reason
Bottom edge has product label text that would be cropped in vertical format.
""",
         {"description": "A humanoid robot demonstrating household tasks in a kitchen setting.",
          "subjects": ["robot", "kitchen", "product"],
          "contentKind": "product_demo",
          "fit": "contain",
          "criticalEdgeText": "yes — bottom edge has product label text",
          "reason": "Bottom edge has product label text that would be cropped in vertical format."}),

        # Test 2: Code-fenced Markdown (Scenario 2)
        ("test_code_fenced", """```markdown
## Description
A robot in a factory.

## Subjects
robot, factory

## Content Kind
talking_head

## Fit
cover

## Critical Edge Text
no

## Reason
Subject fills the frame.
```""",
         {"description": "A robot in a factory.",
          "subjects": ["robot", "factory"],
          "contentKind": "talking_head",
          "fit": "cover",
          "criticalEdgeText": "no",
          "reason": "Subject fills the frame."}),

        # Test 3: Extra sections (Scenario 3)
        ("test_extra_sections", """
## Description
A cityscape at night.

## Subjects
city, night, skyline

## Content Kind
landscape

## Fit
cover

## Critical Edge Text
no

## Reason
No critical edge content.

## Mood
Calm and atmospheric.
""",
         {"description": "A cityscape at night.",
          "subjects": ["city", "night", "skyline"],
          "contentKind": "landscape",
          "fit": "cover",
          "criticalEdgeText": "no",
          "reason": "No critical edge content.",
          "mood": "Calm and atmospheric."}),

        # Test 4: No headers — free text (Scenario 4)
        ("test_no_headers", "Just some free text without any markdown headers at all.",
         {"description": "Just some free text without any markdown headers at all.",
          "subjects": [],
          "contentKind": None,
          "fit": None,
          "criticalEdgeText": None,
          "reason": None}),

        # Test 5: Partial sections — Description + Subjects only (Scenario 5)
        ("test_partial_sections", """
## Description
A partial analysis.

## Subjects
robot, demo
""",
         {"description": "A partial analysis.",
          "subjects": ["robot", "demo"],
          "contentKind": None,
          "fit": None,
          "criticalEdgeText": None,
          "reason": None}),

        # Test 6: Subjects as newline-separated (Scenario 6)
        ("test_newline_subjects", """
## Description
A robot demo.

## Subjects
robot
kitchen
product

## Content Kind
product_demo

## Fit
cover

## Critical Edge Text
no

## Reason
Clean edges.
""",
         {"description": "A robot demo.",
          "subjects": ["robot", "kitchen", "product"],
          "contentKind": "product_demo",
          "fit": "cover",
          "criticalEdgeText": "no",
          "reason": "Clean edges."}),

        # Test 7: Non-standard contentKind (Scenario 7)
        ("test_non_standard_content_kind", """
## Description
A demo video.

## Subjects
demo

## Content Kind
demo

## Fit
cover

## Critical Edge Text
no

## Reason
Standard demo.
""",
         {"description": "A demo video.",
          "subjects": ["demo"],
          "contentKind": "demo",
          "fit": "cover",
          "criticalEdgeText": "no",
          "reason": "Standard demo."}),

        # Test 8: Non-standard fit value (Scenario 8)
        ("test_non_standard_fit", """
## Description
A wide landscape.

## Subjects
landscape, nature

## Content Kind
landscape

## Fit
fill

## Critical Edge Text
no

## Reason
Wide landscape.
""",
         {"description": "A wide landscape.",
          "subjects": ["landscape", "nature"],
          "contentKind": "landscape",
          "fit": None,  # "fill" is not valid → null
          "criticalEdgeText": "no",
          "reason": "Wide landscape."}),

        # Test 9: Empty text
        ("test_empty_text", "",
         {"description": "",
          "subjects": [],
          "contentKind": None,
          "fit": None,
          "criticalEdgeText": None,
          "reason": None}),

        # Test 10: Whitespace-only text
        ("test_whitespace_only", "   \n  \t  \n  ",
         {"description": "",
          "subjects": [],
          "contentKind": None,
          "fit": None,
          "criticalEdgeText": None,
          "reason": None}),

        # Test 11: Relevance body prefixed with "Score N" — the real 2B
        # claim-mode output format observed in T8 verification
        ("test_relevance_score_prefix", """
## Description
A series of neon-lit 3D cubes stacked in a vertical column.

## Content Kind
text_screenshot

## Relevance
Score 0
The provided video does not contain any information about AI training cost.

## Relevance Reason
The video does not match the scene claim in any way.
""",
         {"relevance": 0,
          "relevanceReason": "The video does not match the scene claim in any way."}),

        # Test 12: Relevance body is a bolded integer
        ("test_relevance_bold_int", """
## Description
A glowing bar chart.

## Relevance
**70**
""",
         {"relevance": 70}),

        # Test 13: Relevance body starts with integer then dash + prose
        ("test_relevance_int_dash_prose", """
## Description
A factory floor.

## Relevance
0 - the video is unrelated to the scene claim
""",
         {"relevance": 0}),

        # Test 14: Relevance body is prose with spelled-out numbers —
        # must fail closed to None (no fabricated score)
        ("test_relevance_prose_no_int", """
## Description
A city skyline.

## Relevance
The video shows nine blocks but no chart at all.
""",
         {"relevance": None}),

        # Test 15: Relevance integer out of range must fail closed
        ("test_relevance_out_of_range", """
## Description
A demo.

## Relevance
135
""",
         {"relevance": None}),

        # Test 16: Digit-initial prose must fail closed — only a number that
        # IS the score (bare / /100 / dash-prose tail) is trusted; "3
        # examples…" is prose that happens to start with a digit
        ("test_relevance_digit_initial_prose", """
## Description
A chart.

## Relevance
3 examples of charts and nothing more
""",
         {"relevance": None}),

        # Test 17: "N out of 100" phrasing is prose, not the enumerated
        # score format — fail closed rather than guess
        ("test_relevance_out_of_100_prose", """
## Description
A demo.

## Relevance
85 out of 100 for matching the claim
""",
         {"relevance": None}),
    ]


CASES = _cases()


@pytest.mark.parametrize(
    ("name", "input_text", "expected"), CASES, ids=[case[0] for case in CASES]
)
def test_parse_markdown(name, input_text, expected):
    """Expected fields must match and every mandatory key must be present."""
    result = parse_markdown_to_dict(input_text)
    for key, val in expected.items():
        assert key in result, f"{name}: missing key '{key}'"
        assert result[key] == val, f"{name}: key '{key}' expected={val!r}, got={result[key]!r}"
    for mandatory_key in MANDATORY_KEYS:
        assert mandatory_key in result, f"{name}: missing mandatory key '{mandatory_key}'"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
