"""strip_control_tokens regex tests (PR #378 review b2).

The regex must strip MiniCPM-o duplex control tokens in both observed shapes:
"<|SOA>" (bare ">") and "<|tts_eos|>" (full "<|...|>"). Import is light —
vlm_analyzer.py only imports stdlib at module level; torch/mlx are loaded
lazily inside functions.
"""

import os
import sys

sys.path.insert(
    0, os.path.join(os.path.dirname(__file__), "..", "lib")
)

import pytest  # noqa: E402

from vlm_analyzer import strip_control_tokens  # noqa: E402


def test_strips_observed_soa_prefix_and_tts_eos_suffix():
    assert strip_control_tokens("<|SOA>你好世界<|tts_eos|>") == "你好世界"


def test_strips_variants_with_full_delimiters():
    # The regex accepts the closing "|" optionally on both tokens.
    assert strip_control_tokens("<|SOA|>hello<|tts_eos>") == "hello"


def test_plain_text_untouched():
    text = "## Description\nA humanoid robot in a kitchen."
    assert strip_control_tokens(text) == text


def test_strips_control_tokens_mid_text():
    assert strip_control_tokens("a<|SOA>b<|tts_eos|>c") == "abc"


if __name__ == "__main__":
    # Before #555 a bare `python3 <this file>` ran nothing and exited 0 — the
    # file only defines tests. Direct runs now go through pytest instead of
    # passing as a no-op.
    raise SystemExit(pytest.main([__file__, "-q"]))
