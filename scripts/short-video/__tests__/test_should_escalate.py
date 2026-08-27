#!/usr/bin/env python3
"""
Tests for should_escalate() — pure function that determines if the 2B model's
output should be escalated to the GLM-4.1V-9B deep model.

Run with: python3 -m pytest __tests__/test_should_escalate.py -v
Or:       python3 __tests__/test_should_escalate.py

TDD: Tests written first (red), implementation second (green).
"""

import sys
import os

# Add parent directory to path so we can import vlm_analyzer
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

from vlm_analyzer import should_escalate


# ─── Test fixtures ───

NORMAL_IMAGE_RESULT = {
    "description": "A humanoid robot demonstrating household tasks in a kitchen setting with various appliances visible in the background.",
    "subjects": ["robot", "kitchen", "product"],
    "contentKind": "product_demo",
    "fit": "contain",
    "criticalEdgeText": "yes — bottom edge has product label text",
    "reason": "Bottom edge has product label text that would be cropped in vertical format.",
}

NORMAL_VIDEO_RESULT = {
    "description": "A humanoid robot walking through a factory floor, demonstrating mobility and balance control systems.",
    "subjects": ["robot", "factory", "mobility"],
    "contentKind": "talking_head",
    "fit": None,  # videos don't have fit
    "criticalEdgeText": None,
    "reason": None,
}


# ─── Tests ───

def test_normal_image_no_escalation():
    """Scenario #1: Normal image output → no escalation."""
    assert should_escalate(NORMAL_IMAGE_RESULT, is_video=False) is False


def test_short_description_escalates():
    """Scenario #2: Short description (<100 chars) → escalate."""
    result = {**NORMAL_IMAGE_RESULT, "description": "A robot."}
    assert should_escalate(result, is_video=False) is True


def test_missing_fit_image_escalates():
    """Scenario #3: fit=None for image → escalate."""
    result = {**NORMAL_IMAGE_RESULT, "fit": None}
    assert should_escalate(result, is_video=False) is True


def test_missing_fit_video_no_escalation():
    """Scenario #13: fit=None for video → NO escalation (expected)."""
    assert should_escalate(NORMAL_VIDEO_RESULT, is_video=True) is False


def test_empty_description_escalates():
    """Scenario #4: Empty description → escalate."""
    result = {**NORMAL_IMAGE_RESULT, "description": ""}
    assert should_escalate(result, is_video=False) is True


def test_none_description_escalates():
    """Edge case: description=None → escalate."""
    result = {**NORMAL_IMAGE_RESULT, "description": None}
    assert should_escalate(result, is_video=False) is True


def test_whitespace_description_escalates():
    """Edge case: description with only whitespace → escalate."""
    result = {**NORMAL_IMAGE_RESULT, "description": "   \n\t  "}
    assert should_escalate(result, is_video=False) is True


def test_repetition_escalates():
    """Scenario #5: Same word/phrase repeated ≥3 times → escalate."""
    result = {**NORMAL_IMAGE_RESULT, "description": "robot robot robot in a kitchen"}
    assert should_escalate(result, is_video=False) is True


def test_repetition_two_times_no_escalation():
    """Edge case: word repeated only 2 times → NO escalation (needs ≥3)."""
    result = {**NORMAL_IMAGE_RESULT, "description": "A humanoid robot and another robot walking together in a spacious kitchen setting with modern stainless steel appliances."}
    assert should_escalate(result, is_video=False) is False


def test_content_kind_other_no_escalation():
    """Scenario #17: contentKind='other' is NOT an escalation signal."""
    result = {**NORMAL_IMAGE_RESULT, "contentKind": "other"}
    assert should_escalate(result, is_video=False) is False


def test_normal_video_no_escalation():
    """Scenario #7: Normal video output → no escalation."""
    assert should_escalate(NORMAL_VIDEO_RESULT, is_video=True) is False


def test_short_video_description_escalates():
    """Scenario #6 (partial): Short video description → escalate."""
    result = {**NORMAL_VIDEO_RESULT, "description": "Robot walks."}
    assert should_escalate(result, is_video=True) is True


def test_multiple_signals_escalates():
    """Multiple signals simultaneously → escalate (any one triggers)."""
    result = {
        "description": "robot robot robot",
        "subjects": [],
        "contentKind": "other",
        "fit": None,
        "criticalEdgeText": None,
        "reason": None,
    }
    assert should_escalate(result, is_video=False) is True


def test_exact_100_chars_no_escalation():
    """Boundary: description exactly 100 chars → NO escalation (threshold is <100)."""
    desc = "A" * 100
    result = {**NORMAL_IMAGE_RESULT, "description": desc}
    assert should_escalate(result, is_video=False) is False


def test_99_chars_escalates():
    """Boundary: description 99 chars → escalate (<100)."""
    desc = "A" * 99
    result = {**NORMAL_IMAGE_RESULT, "description": desc}
    assert should_escalate(result, is_video=False) is True


def test_empty_dict():
    """Edge case: empty dict → escalate."""
    assert should_escalate({}, is_video=False) is True


if __name__ == "__main__":
    # Run tests directly without pytest
    tests = [
        ("test_normal_image_no_escalation", test_normal_image_no_escalation),
        ("test_short_description_escalates", test_short_description_escalates),
        ("test_missing_fit_image_escalates", test_missing_fit_image_escalates),
        ("test_missing_fit_video_no_escalation", test_missing_fit_video_no_escalation),
        ("test_empty_description_escalates", test_empty_description_escalates),
        ("test_none_description_escalates", test_none_description_escalates),
        ("test_whitespace_description_escalates", test_whitespace_description_escalates),
        ("test_repetition_escalates", test_repetition_escalates),
        ("test_repetition_two_times_no_escalation", test_repetition_two_times_no_escalation),
        ("test_content_kind_other_no_escalation", test_content_kind_other_no_escalation),
        ("test_normal_video_no_escalation", test_normal_video_no_escalation),
        ("test_short_video_description_escalates", test_short_video_description_escalates),
        ("test_multiple_signals_escalates", test_multiple_signals_escalates),
        ("test_exact_100_chars_no_escalation", test_exact_100_chars_no_escalation),
        ("test_99_chars_escalates", test_99_chars_escalates),
        ("test_empty_dict", test_empty_dict),
    ]

    passed = 0
    failed = 0
    for name, test_fn in tests:
        try:
            test_fn()
            print(f"  ✓ {name}")
            passed += 1
        except AssertionError as e:
            print(f"  ✗ {name}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ✗ {name}: {e}")
            failed += 1

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)
