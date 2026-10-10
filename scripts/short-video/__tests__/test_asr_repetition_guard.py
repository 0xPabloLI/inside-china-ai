#!/usr/bin/env python3
"""转写重复护栏（#418 互补件）—— 判据与边界测试。

模块从 bench 迁到 lib：它现在是生产转写出口（loader 归格前、whisper.cpp 解析后）
的护栏，不再是 bench 工具。本测试钉住三件事：

- 周期感知的循环（单元 1..16 词、重复 ≥6 次、跨度 ≥18 词）被收敛，保留首次出现并带标记；
- 真实重复口语不动（保守不对称：短于 18 词的连续重复不收敛 —— "Goal!" ×10、
  "Bang," ×14 是实测真内容；inspect 标记 ≠ collapse 改写）；
- 已知边界（交错多短语循环如 FEMA、<18 词的短语循环）用测试记录，改动需有意识。

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
    assert out == "intro Kampung [重复×26已收敛] outro"


def test_phrase_loop_collapses_with_its_own_period():
    """实测 -XpJeDGh8No："I'm not sure if I can do this." ×14（p=8）。

    旧判据只认 stride-1 的 n-gram 连续重复，这个循环整个漏掉
    （contaminated=False）；周期感知扫描按 8 词单元找到它并收敛。
    """
    unit = "I'm not sure if I can do this."
    text = (unit + " ") * 14 + "tail"
    stats = inspect_transcript(text)
    assert stats["contaminated"] is True
    assert stats["worst_run"] == 1  # 仍无 stride-1 n-gram 连续段

    out = collapse_repetition(text)
    assert out == f"{unit} [重复×14已收敛] tail"


def test_unaligned_period_run_collapses():
    """实测 7E6i3E-fsj4："Stay in the corner." ×23（p=4，92 词）。

    旧判据按 stride-3 块计数，p=4 的循环对不齐块边界而漏掉。
    """
    text = ("Ball can't go. " + " ".join(["Stay in the corner."] * 23)
            + " Watch out.")
    out = collapse_repetition(text)
    assert "Stay in the corner. [重复×23已收敛]" in out
    assert out.startswith("Ball can't go. Stay in the corner. [")
    assert out.endswith(" Watch out.")


def test_worst_run_measures_all_ngrams():
    """worst_run 取所有 n-gram 的最大连续次数，不再只看最高频那个。

    7E6i3E-fsj4："Hard." ×20 是连续循环，但最高频 3-gram 是分散的
    "stay in the" ×23 —— 旧口径报 worst_run=1，漏掉这个循环。
    """
    scattered = " stay in the corner" * 23
    text = "Ball can't go. " + " ".join(["Hard."] * 20) + scattered
    stats = inspect_transcript(text)
    assert stats["top_ngram"] == ("stay", "in", "the")
    assert stats["worst_run"] == 18  # 20 词 → 18 个连续同 n-gram
    assert stats["contaminated"] is True


def test_genuine_repeated_shout_is_not_rewritten():
    """实测 2Gg4OQo7-zA：真实体育解说 "Goal!" ×10（10 词 < 18 词下限）。

    这个不对称是有意的：宁可漏收敛也不删真实内容。同类的还有
    8np5YKYx3sU 的真实歌词 "Bang," ×14。
    """
    text = ("It's for Iniesta. " + " ".join(["Goal!"] * 10)
            + " Oh that's a terrible back-hitter")
    assert inspect_transcript(text)["contaminated"] is True
    assert collapse_repetition(text) == text


def test_short_phrase_loop_is_a_recorded_boundary():
    """短语循环短于 18 词下限时不触发，这是已知边界，不是回归。

    实测 1pHkv4KUiFY："Thank you." ×8（16 词，p=2）跨 226s 未收敛；
    同形状在真实演讲里出现（CwzjlmBLfrQ：92 词转写里的 ×6 致谢），
    所以下限保持保守。改动此边界需单独设计评审。
    """
    text = " ".join(["Thank you."] * 8)
    stats = inspect_transcript(text)
    assert stats["contaminated"] is False
    assert collapse_repetition(text) == text


def test_interleaved_loop_stays_detected_but_uncollapsed():
    """生产 whisper.cpp 的 FEMA 循环（2026-10-10 重捕原始输出）：

    17 段 / 488s / 4 种文本，"fema 语 + thank you" 交错且段长不等 ——
    没有单段 ≥18 词的周期运行，所以护栏只判（coverage）不改。
    根因是低信噪/音乐段（VAD 领域），不是本判据能安全收敛的形状。
    """
    segments = (["The End", "For more information, visit www.fema.org"]
                + ["Thank you."] * 8
                + ["For more information, visit www.fema.org"]
                + ["Thank you."] * 4
                + ["For more information visit www.fema.org", "Thank you."])
    text = " ".join(segments)
    assert inspect_transcript(text)["contaminated"] is True
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


def test_collapse_is_idempotent():
    for text in ("intro " + " ".join(["Kampung"] * 26) + " outro",
                 ("I'm not sure if I can do this. " * 14) + "tail"):
        once = collapse_repetition(text)
        assert collapse_repetition(once) == once
