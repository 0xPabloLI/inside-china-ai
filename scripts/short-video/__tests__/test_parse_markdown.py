#!/usr/bin/env python3
"""
Test suite for parse_markdown_to_dict() — 10 boundary cases.

Covers scenarios from spec-vlm-semantic-merge.md Scenario Matrix rows 1-8.
Run: python3 scripts/short-video/__tests__/test_parse_markdown.py
"""
import sys
import os

# Add the lib directory to path so we can import vlm_analyzer
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

from vlm_analyzer import parse_markdown_to_dict


def run_tests():
    """Run all 10 boundary cases and report results."""
    tests = [
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
    ]

    passed = 0
    failed = 0

    for name, input_text, expected in tests:
        try:
            result = parse_markdown_to_dict(input_text)
            # Check each expected field
            ok = True
            for key, val in expected.items():
                if key not in result:
                    print(f"  ✗ {name}: missing key '{key}'")
                    ok = False
                    break
                if result[key] != val:
                    print(f"  ✗ {name}: key '{key}' expected={val!r}, got={result[key]!r}")
                    ok = False
                    break
            # Check result has all 6 mandatory keys
            for mandatory_key in ["description", "subjects", "contentKind", "fit", "criticalEdgeText", "reason"]:
                if mandatory_key not in result:
                    print(f"  ✗ {name}: missing mandatory key '{mandatory_key}'")
                    ok = False
                    break
            if ok:
                print(f"  ✓ {name}")
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  ✗ {name}: raised {type(e).__name__}: {e}")
            failed += 1

    print(f"\n{'='*40}")
    print(f"Results: {passed}/{len(tests)} passed, {failed} failed")
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
