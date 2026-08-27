#!/usr/bin/env python3
"""
Tests for check_ram_available() — checks if sufficient RAM is available
to load the GLM-4.1V-9B deep model.

Run with: python3 __tests__/test_check_ram.py

TDD: Tests written first (red), implementation second (green).
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

from vlm_analyzer import check_ram_available, DEEP_MODEL_MIN_RAM_GB


def test_sufficient_ram():
    """Sufficient RAM (>=16GB available) → True."""
    # Mock psutil to return 20GB available
    import unittest.mock as mock
    
    class MockVM:
        available = 20 * 1024**3  # 20GB in bytes
    
    with mock.patch("builtins.__import__", side_effect=lambda name, *args, **kwargs: mock.MagicMock(virtual_memory=mock.MagicMock(return_value=MockVM())) if name == "psutil" else __import__(name, *args, **kwargs)):
        result = check_ram_available()
        assert result is True, f"Expected True with 20GB available, got {result}"


def test_insufficient_ram():
    """Insufficient RAM (<16GB available) → False."""
    import unittest.mock as mock
    
    class MockVM:
        available = 8 * 1024**3  # 8GB in bytes
    
    with mock.patch("builtins.__import__", side_effect=lambda name, *args, **kwargs: mock.MagicMock(virtual_memory=mock.MagicMock(return_value=MockVM())) if name == "psutil" else __import__(name, *args, **kwargs)):
        result = check_ram_available()
        assert result is False, f"Expected False with 8GB available, got {result}"


def test_exact_threshold():
    """Exactly at threshold (16GB) → True."""
    import unittest.mock as mock
    
    class MockVM:
        available = DEEP_MODEL_MIN_RAM_GB * 1024**3  # exactly 16GB
    
    with mock.patch("builtins.__import__", side_effect=lambda name, *args, **kwargs: mock.MagicMock(virtual_memory=mock.MagicMock(return_value=MockVM())) if name == "psutil" else __import__(name, *args, **kwargs)):
        result = check_ram_available()
        assert result is True, f"Expected True at exactly 16GB, got {result}"


def test_just_below_threshold():
    """Just below threshold (15.9GB) → False."""
    import unittest.mock as mock
    
    class MockVM:
        available = int(15.9 * 1024**3)
    
    with mock.patch("builtins.__import__", side_effect=lambda name, *args, **kwargs: mock.MagicMock(virtual_memory=mock.MagicMock(return_value=MockVM())) if name == "psutil" else __import__(name, *args, **kwargs)):
        result = check_ram_available()
        assert result is False, f"Expected False with 15.9GB, got {result}"


def test_psutil_import_fails_fail_open():
    """psutil import fails → True (fail-open: better to try than never)."""
    import unittest.mock as mock
    
    original_import = __import__
    
    def mock_import(name, *args, **kwargs):
        if name == "psutil":
            raise ImportError("No module named 'psutil'")
        return original_import(name, *args, **kwargs)
    
    with mock.patch("builtins.__import__", side_effect=mock_import):
        result = check_ram_available()
        assert result is True, f"Expected True (fail-open) when psutil unavailable, got {result}"


if __name__ == "__main__":
    tests = [
        ("test_sufficient_ram", test_sufficient_ram),
        ("test_insufficient_ram", test_insufficient_ram),
        ("test_exact_threshold", test_exact_threshold),
        ("test_just_below_threshold", test_just_below_threshold),
        ("test_psutil_import_fails_fail_open", test_psutil_import_fails_fail_open),
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
