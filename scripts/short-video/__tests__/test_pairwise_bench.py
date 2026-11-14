"""Tests for the #541 pairwise arm (bench/relevance/pairwise_bench.py).

The pairwise run is research scaffolding, but its verdict parser and the
pair-level aggregation are what every number in the report rests on. Pinned
here: fail-closed parsing, role mapping under both orders, pair construction
(human GT only, no same-asset pairs), and the pair-level counting rules.
"""

import importlib.util
import json
import os

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
BENCH_DIR = os.path.abspath(os.path.join(HERE, "..", "bench", "relevance"))
BENCH = os.path.join(BENCH_DIR, "pairwise_bench.py")
MANIFEST = os.path.join(BENCH_DIR, "cases.json")


def load_bench():
    spec = importlib.util.spec_from_file_location("pairwise_bench", BENCH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bench = load_bench()

LABELS = {
    "A1": "usable",
    "A2": "unusable",
    "A3": "usable",
    "B1": "usable",
    "B2": "unusable",
    "C1": "unsure",
    "C2": "unusable",
    "D1": "unsure",
    "D2": "unusable",
    "E1": "usable",
    "E2": "unusable",
    "F1": "usable",
    "F2": "unusable",
}


# ─── parser (fail-closed) ───


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("## Winner\nA\n## Why\nlogo visible", "a"),
        ("## Winner\n**B**\n## Why\nno logo", "b"),
        ("## Winner\ntie\n## Why\nsame", "tie"),
        ("## Winner\nImage A shows the logo", "a"),
        ("## Winner\nA, B or tie", "a"),  # echoed format line still resolves to a token
        ("## Winner\nMaybe A", None),
        ("## Winner\n", None),
        ("", None),
        (None, None),
        ("I would pick the first one", None),  # no section -> no verdict, not a guess
        ("## Why\nbecause\n## Winner\nB", "b"),
    ],
)
def test_parse_winner(raw, expected):
    assert bench.parse_winner(raw) == expected


def test_role_of_maps_both_orders():
    assert bench.role_of("a", "ab") == "positive"
    assert bench.role_of("b", "ab") == "negative"
    assert bench.role_of("a", "ba") == "negative"
    assert bench.role_of("b", "ba") == "positive"
    assert bench.role_of("tie", "ab") == "tie"
    assert bench.role_of(None, "ab") == "unparsed"


# ─── pairs come from human GT only ───


def test_build_pairs_uses_usable_cases_and_drops_self_pairs():
    manifest = bench.rb.load_manifest(MANIFEST)
    pairs = bench.build_pairs(manifest, LABELS)
    assert len(pairs) == 25  # 5 usable cases x 5 other images
    assert {pair["caseId"] for pair in pairs} == {"A1", "A3", "B1", "E1", "F1"}
    for pair in pairs:
        assert pair["positiveAsset"] != pair["negativeAsset"]
        assert pair["gt"] == "positive"
        assert pair["gtSource"] == "derived"


def test_build_pairs_excludes_unsure_and_unusable_as_positives():
    manifest = bench.rb.load_manifest(MANIFEST)
    pairs = bench.build_pairs(manifest, {"C1": "unsure", "D1": "unsure"})
    assert pairs == []


def test_debatable_pairs_are_flagged_not_dropped():
    manifest = bench.rb.load_manifest(MANIFEST)
    pairs = {pair["id"]: pair for pair in bench.build_pairs(manifest, LABELS)}
    assert pairs["F1xA"]["debatable"]
    assert pairs["A3xF"]["debatable"]
    assert not pairs["A1xB"]["debatable"]


def test_debatable_set_only_names_real_pairs():
    manifest = bench.rb.load_manifest(MANIFEST)
    ids = {pair["id"] for pair in bench.build_pairs(manifest, LABELS)}
    assert set(bench.DEBATABLE_PAIRS) <= ids


def test_focus_tuple_normalizes_queue_focus_and_falls_back():
    assert bench.focus_tuple({"x": 0.455, "y": 0.5}) == (0.455, 0.5)
    assert bench.focus_tuple([0.1, 0.9]) == (0.1, 0.9)
    # A missing/invalid hint must not crash the crop — center is production's default.
    assert bench.focus_tuple(None) == (0.5, 0.5)
    assert bench.focus_tuple("A") == (0.5, 0.5)


# ─── pair-level aggregation ───


def make_pairs():
    claim = {"voiceover": "v", "assetNeed": "a"}
    return [
        {"id": "P1", "caseId": "X1", "claim": claim, "positiveAsset": "A",
         "negativeAsset": "B", "gt": "positive", "gtSource": "derived", "debatable": None},
        {"id": "P2", "caseId": "X1", "claim": claim, "positiveAsset": "A",
         "negativeAsset": "C", "gt": "positive", "gtSource": "derived", "debatable": None},
    ]


def run(pair_id, order, role, attempt=0):
    return {
        "pairId": pair_id,
        "caseId": "X1",
        "order": order,
        "winnerToken": None,
        "winnerRole": role,
        "ms": 1,
        "raw": "",
        "error": None,
        "attempt": attempt,
    }


def test_summary_pair_outcomes_are_two_order_strict():
    runs = [
        run("P1", "ab", "positive"),
        run("P1", "ba", "positive"),
        run("P2", "ab", "positive"),
        run("P2", "ba", "negative"),
    ]
    stats = bench.summary(make_pairs(), runs)
    assert stats["pairs"]["bothPositive"] == 1
    assert stats["pairs"]["lenientPositive"] == 2
    assert stats["pairs"]["negativeAny"] == 1
    assert stats["pairs"]["strictRate"] == 0.5
    assert stats["positionFlips"] == [{"pairId": "P2", "ab": "positive", "ba": "negative"}]
    # Per-order tallies stay raw: three positive orders out of four.
    assert stats["orders"]["positive"] == 3
    assert stats["orders"]["valid"] == 4


def test_summary_counts_tie_and_unparsed_without_calling_them_wins():
    runs = [
        run("P1", "ab", "tie"),
        run("P1", "ba", "tie"),
        run("P2", "ab", "unparsed"),
        run("P2", "ba", "unparsed"),
    ]
    stats = bench.summary(make_pairs(), runs)
    assert stats["pairs"]["bothPositive"] == 0
    assert stats["pairs"]["tieOnly"] == 1
    assert stats["pairs"]["unparsed"] == 1
    assert stats["orders"]["positiveRate"] == 0.0
    assert stats["orders"]["unparsed"] == 2


def test_summary_repeats_flag_drift():
    runs = [
        run("P1", "ab", "positive"),
        run("P1", "ba", "positive"),
        run("P2", "ab", "positive"),
        run("P2", "ba", "positive"),
        run("P1", "ab", "negative", attempt=1),
        run("P1", "ba", "positive", attempt=1),
    ]
    stats = bench.summary(make_pairs(), runs)
    assert stats["repeats"]["P1"]["attempts"] == 2
    assert stats["repeats"]["P1"]["stable"] is False
    assert "P2" not in stats["repeats"]


def test_summary_excludes_debatable_rows_from_the_clean_subset():
    pairs = make_pairs()
    pairs[1]["debatable"] = "generic building"
    runs = [
        run("P1", "ab", "positive"),
        run("P1", "ba", "positive"),
        run("P2", "ab", "negative"),
        run("P2", "ba", "negative"),
    ]
    stats = bench.summary(pairs, runs)
    assert stats["pairs"]["pairs"] == 2
    assert stats["pairsExcludingDebatable"]["pairs"] == 1
    assert stats["pairsExcludingDebatable"]["bothPositive"] == 1
    assert stats["debatableRows"][0]["pairId"] == "P2"
