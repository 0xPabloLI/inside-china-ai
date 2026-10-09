#!/usr/bin/env python3
"""转写重复护栏（#418 互补件）—— 判据与边界测试。

模块从 bench 迁到 lib：它现在是生产转写出口（loader 归格前、whisper.cpp 解析后）
的护栏，不再是 bench 工具。本测试钉住三件事：

- 极端循环（同一 n-gram 连续 ≥6 个块）被收敛，保留首次出现并带标记；
- 真实重复口语不动（保守不对称：inspect 标记 ≠ collapse 改写）；
- 已知边界（多词短语循环在短文本上不触发）用测试记录，改动需有意识。

Run: ~/.venvs/mlx-vlm/bin/python -m pytest \
  scripts/short-video/__tests__/test_asr_repetition_guard.py -v
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

from asr_repetition_guard import (  # noqa: E402
    collapse_repetition,
    inspect_transcript,
)


def test_extreme_single_word_loop_collapses_to_first_occurrence():
    """实测 0ag_Qi5OEd0："Kampung" ×26 —— 收敛成首次出现 + 标记。"""
    text = "intro " + " ".join(["Kampung"] * 26) + " outro"
    stats = inspect_transcript(text)
    assert stats["contaminated"] is True
    assert stats["worst_run"] == 24  # 26 词 → 24 个连续同 n-gram

    out = collapse_repetition(text)
    # 首个 3-gram 块保留 + 标记；"outro" 前的 2 个残词不再构成完整循环块。
    assert out == ("intro Kampung Kampung Kampung [重复×8已收敛] "
                   "Kampung Kampung outro")


def test_genuine_repeated_shout_is_not_rewritten():
    """实测 2Gg4OQo7-zA：真实体育解说 "Goal!" ×10 连喊 11.6s。

    inspect 判污染（worst_run=8），但 collapse 的块计数（≥6 个连续同 n-gram
    块）不动它 —— 这个不对称是有意的：宁可漏收敛也不删真实内容。
    """
    text = ("It's for Iniesta. " + " ".join(["Goal!"] * 10)
            + " Oh that's a terrible back-hitter")
    assert inspect_transcript(text)["contaminated"] is True
    assert collapse_repetition(text) == text


def test_phrase_loop_is_a_recorded_boundary():
    """多词短语循环在短文本上不触发，这是已知边界，不是回归。

    实测 1pHkv4KUiFY："Thank you." ×8 跨 226s（30s/段）未被收敛：
    worst_run 只测单字周期（短语循环的 stride-1 n-gram 交替出现），
    coverage 有 40 词下限（防短文本误伤）。改动此边界需单独设计评审。
    """
    text = " ".join(["Thank you."] * 8)
    stats = inspect_transcript(text)
    assert stats["contaminated"] is False
    assert collapse_repetition(text) == text


def test_wordless_script_is_skipped():
    """CJK 无词边界：按空格切词失效，n-gram 判定不适用（如实跳过）。"""
    text = "大家好" * 50
    stats = inspect_transcript(text)
    assert stats["skipped"] == "wordless-script"
    assert stats["contaminated"] is False
    assert collapse_repetition(text) == text


def test_short_and_empty_inputs_are_no_ops():
    assert inspect_transcript("")["skipped"] == "too-short"
    assert collapse_repetition("") == ""
    assert collapse_repetition("hello world") == "hello world"


def test_scattered_repeats_are_left_alone():
    """分散出现的同一短语（正常口语）不动 —— 只收敛连续循环。"""
    text = ("we ship it fast. the team is here. we ship it fast. "
            "the team is here. we ship it fast. done.")
    assert collapse_repetition(text) == text
