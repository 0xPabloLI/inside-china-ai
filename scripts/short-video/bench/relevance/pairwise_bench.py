#!/usr/bin/env python3
"""#541 pairwise arm — "which of these two images better supports this line?"

Bench-only (NOT production code, NOT imported by the pipeline, and it does not
add a pairwise action to `vlm_analyzer.py`). It answers the one question the
single-answer arm cannot: absolute scores are pinned to three anchors (100/50/0),
so a generic-but-acceptable image can land on "0" and be rejected while a
side-by-side comparison still prefers it. The recorded case is F1 (glass
atrium vs "研究机构建筑外观": first pass 0, human said usable).

Design decisions and why:

  - Pairs are built from human GT only. Each human-usable case contributes its
    own claim; the competitors are every other image asset. The expected winner
    is the image the human accepted for that claim (positive). Same-asset pairs
    are dropped (an image against itself is not a comparison), leaving
    5 usable cases x 5 other assets = 25 pairs.
  - The negative side's GT is DERIVED, not human: the contents are unrelated
    to that claim's subject (code screenshot, chart poster, circuit-board
    macro, server aisle, atrium). Two pairs are flagged `debatable` because a
    generic building exterior could arguably serve a generic "company HQ"
    claim; every metric is reported both including and excluding them.
  - Both orders run for every pair (positive as A, then as B). Position bias is
    a known failure mode of pairwise prompting, and one order cannot measure
    it. A pair that only wins in one position is reported as such.
  - Both images get the same preprocessing production applies: the 9:16
    saliency-anchored crop from `queue.json`, then the long-edge resize. The
    model must judge the framing the viewer would actually see.
  - temperature 0.0 is inherited from `generate_response` (no override), so a
    repeat measures decoding/transport determinism, not model uncertainty.
  - The prompt is strict: one `## Winner` section, `A | B | tie`. An answer
    that cannot be parsed is `unparsed`, never counted as a win for either
    side (fail-closed).

Usage (paths relative to this directory):
  python pairwise_bench.py run  --assets-dir /path/to/checkout/scripts/short-video/assets \\
                                --out ../../../.scratch/relevance-pairwise \\
                                --labels ../../../.scratch/relevance-541/labels.json
  python pairwise_bench.py eval --out ../../../.scratch/relevance-pairwise \\
                                --labels ../../../.scratch/relevance-541/labels.json
"""

import argparse
import importlib.util
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
ANALYZER = os.path.join(REPO_ROOT, "scripts", "short-video", "lib", "vlm_analyzer.py")

sys.path.insert(0, HERE)
import relevance_bench as rb  # noqa: E402  (sibling module, same bench)

DEFAULT_MANIFEST = os.path.join(HERE, "cases.json")
DEFAULT_ENGINE = "qwen3-vl-moe"
DEFAULT_FOCUS_DIR = os.path.join(REPO_ROOT, ".scratch", "relevance-541")

# Pairs whose negative side is arguably usable for the positive claim: a
# generic glass atrium could serve a generic "company HQ" claim. Kept in the
# run (dropping them would hide a real disagreement) but split out in eval.
DEBATABLE_PAIRS = {
    "A3xF": "泛指的中国科技公司总部 vs 通用玻璃中庭：两者都可当泛化占位，仅 A 带可见标识",
    "F1xA": "研究机构建筑外观 vs 带阿里标识的办公楼：A 也是建筑外观，但品牌指向错误",
}

PAIRWISE_PROMPT = """You are choosing ONE visual for a single narration line in a vertical short video.

Scene narration: "{voiceover}"
Desired visual: "{assetNeed}"

Two candidate images follow, in this order: the first image is Image A, the second image is Image B.
Decide which image better supports this narration as the visual for that line.
Judge only what is actually visible. The line may describe an event (a launch, funding, a benchmark result) that no photo can show; in that case ask which image is the more credible visual for the subject of the line. On-screen text in any language is not evidence against an image.

Answer in exactly this format:
## Winner
A, B or tie
## Why
<one short sentence>
"""

WINNER_LINE = re.compile(r"^(?:image\s*)?\*{0,2}(A|B|tie)\*{0,2}\b", re.IGNORECASE)


# ─── analyzer loading ───


def load_analyzer(path=ANALYZER):
    """Import the production analyzer module without running its CLI."""
    spec = importlib.util.spec_from_file_location("vlm_analyzer_bench", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ─── pairs ───


def human_labels(labels_path):
    payload = rb.read_json(labels_path)
    return {
        case_id: value.get("verdict")
        for case_id, value in (payload.get("claims") or {}).items()
    }


def build_pairs(manifest, labels):
    """Human-usable cases x every other image asset, same asset excluded."""
    image_assets = [
        key for key, spec in manifest["assets"].items() if spec.get("type") == "image"
    ]
    pairs = []
    for case in manifest["cases"]:
        if labels.get(case["id"]) != "usable":
            continue
        if case["asset"] not in image_assets:
            continue
        for asset in image_assets:
            if asset == case["asset"]:
                continue
            pairs.append(
                {
                    "id": f"{case['id']}x{asset}",
                    "caseId": case["id"],
                    "claim": case["claim"],
                    "positiveAsset": case["asset"],
                    "negativeAsset": asset,
                    "gt": "positive",
                    "gtSource": "derived",
                    "debatable": DEBATABLE_PAIRS.get(f"{case['id']}x{asset}"),
                }
            )
    return pairs


def build_prompt(claim):
    return PAIRWISE_PROMPT.format(
        voiceover=claim["voiceover"].strip(),
        assetNeed=claim["assetNeed"].strip(),
    )


# ─── parsing ───


def parse_winner(raw):
    """Return "A", "B", "tie" or None (fail-closed).

    Only the `## Winner` section is read. Outside it, the words A/B appear in
    the prompt echo and in "Image A/B" prose, so free-text scanning would
    manufacture verdicts.
    """
    if not isinstance(raw, str) or not raw.strip():
        return None
    match = re.search(r"##\s*Winner\s*[:\-]?\s*\n+(.{0,60})", raw, re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    first_line = match.group(1).strip().splitlines()[0].strip() if match.group(1).strip() else ""
    token = WINNER_LINE.match(first_line)
    if token:
        return token.group(1).lower()
    return None


def role_of(winner, order):
    """Map an A/B/tie token to the pair roles, given the order it was asked in."""
    if winner is None:
        return "unparsed"
    if winner == "tie":
        return "tie"
    first, second = ("positive", "negative") if order == "ab" else ("negative", "positive")
    return first if winner.lower() == "a" else second


# ─── inference ───


def focus_tuple(value):
    """Normalize a queue.json cropFocus ({"x","y"}) to the tuple `simulate_crop` takes."""
    if isinstance(value, dict) and isinstance(value.get("x"), (int, float)) \
            and isinstance(value.get("y"), (int, float)):
        return (float(value["x"]), float(value["y"]))
    if isinstance(value, (list, tuple)) and len(value) == 2:
        return (float(value[0]), float(value[1]))
    return (0.5, 0.5)


def prepare_pair_images(analyzer, entries):
    """Production framing for each side: 9:16 crop anchored on its own saliency, then resize.

    `entries` is [(path, assetKey)]. Only temp files are tracked for cleanup —
    an image that needs no crop/resize IS the original asset path, and deleting
    it would destroy the fixture.
    """
    prepared, cleanups = [], []
    try:
        for path, asset_key in entries:
            crop_path, crop_cleanup = analyzer.simulate_crop(
                path, target_ratio=9 / 16, focus=asset_key,
            )
            if crop_cleanup:
                cleanups.append(crop_cleanup)
            actual_path, resize_cleanup = analyzer.resize_image_if_needed(crop_path)
            if resize_cleanup:
                cleanups.append(resize_cleanup)
            prepared.append(actual_path)
        return prepared, cleanups
    except Exception:
        for path in cleanups:
            analyzer._unlink_quiet(path)
        raise


def run_pair(analyzer, model, processor, engine, pair, order, focus_map, paths, prompt,
             max_tokens=160):
    """One pairwise inference. Returns the run record (raw text kept for audit)."""
    entries = [(paths["positive"], focus_tuple(focus_map.get(pair["positiveAsset"]))),
               (paths["negative"], focus_tuple(focus_map.get(pair["negativeAsset"])))]
    if order == "ba":
        entries.reverse()
    prepared, cleanups = prepare_pair_images(analyzer, entries)
    started = time.monotonic()
    error = None
    raw = ""
    try:
        raw = analyzer.generate_response(
            model, processor, engine=engine,
            image_paths=prepared, prompt_text=prompt, max_tokens=max_tokens,
        )
    except Exception as exc:  # one broken pair must not lose the other 24
        error = f"{type(exc).__name__}: {exc}"
    elapsed = time.monotonic() - started
    # Cleanup happens after generate() returned, so mlx-vlm has already read
    # the temp crops; unlinking earlier would break the image load.
    for path in cleanups:
        analyzer._unlink_quiet(path)
    token = parse_winner(raw)
    return {
        "pairId": pair["id"],
        "caseId": pair["caseId"],
        "order": order,
        "winnerToken": token,
        "winnerRole": "error" if error else role_of(token, order),
        "ms": int(elapsed * 1000),
        "raw": raw[:4000],
        "error": error,
    }


# ─── run ───


def cmd_run(args):
    manifest = rb.load_manifest(args.manifest)
    rb.require_assets(args.assets_dir, manifest)
    labels = human_labels(args.labels)
    pairs = build_pairs(manifest, labels)
    if args.only:
        wanted = {item.strip() for item in args.only.split(",") if item.strip()}
        pairs = [pair for pair in pairs if pair["id"] in wanted]
        missing = wanted - {pair["id"] for pair in pairs}
        if missing:
            raise SystemExit(f"unknown pair ids: {sorted(missing)}")
    if args.max_pairs:
        pairs = pairs[: args.max_pairs]
    if not pairs:
        raise SystemExit("no pairs — is the labels file missing usable verdicts?")

    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, "pairwise.json")
    focus = rb.load_crop_focus(args.queue_out)
    payload = rb.read_json(path) if (args.resume and os.path.isfile(path)) else {}
    payload["meta"] = {
        "issue": "#541",
        "arm": "pairwise",
        "engine": args.engine,
        "analyzer": os.path.relpath(ANALYZER, REPO_ROOT),
        "analyzerSha256": rb.file_sha256(ANALYZER),
        "modelConfigSha256": rb.file_sha256(rb.VLM_MODEL_CONFIG),
        "manifestSha256": rb.file_sha256(args.manifest),
        "labels": os.path.abspath(args.labels),
        "assetsDir": os.path.abspath(args.assets_dir),
        "temperature": 0.0,
        "framing": "saliency-crop" if focus else "center-crop",
        "orders": ["ab", "ba"],
        "pairs": len(pairs),
        "debatable": sorted(DEBATABLE_PAIRS),
        "startedAt": payload.get("meta", {}).get("startedAt") or now_iso(),
    }
    payload["pairs"] = pairs
    payload.setdefault("runs", [])
    rb.write_json(path, payload)

    def done(pair_id, order, attempt):
        return any(
            run["pairId"] == pair_id
            and run["order"] == order
            and run["attempt"] == attempt
            for run in payload["runs"]
        )

    def record(run, attempt):
        run["attempt"] = attempt
        payload["runs"].append(run)
        rb.write_json(path, payload)
        print(f"  {run['pairId']} {run['order']}#{attempt} -> {run['winnerRole']} "
              f"({run['ms']}ms)", file=sys.stderr)

    engine, model_id = rb_load_engine(args.engine)
    analyzer = load_analyzer()

    def run_one(pair, order, attempt):
        paths = {
            "positive": rb.asset_path(args.assets_dir, manifest, pair["positiveAsset"]),
            "negative": rb.asset_path(args.assets_dir, manifest, pair["negativeAsset"]),
        }
        # Each side is cropped with its own saliency anchor: that is the framing
        # production would show if this asset were picked.
        run = run_pair(
            analyzer, model, processor, engine, pair, order, focus, paths,
            build_prompt(pair["claim"]),
        )
        record(run, attempt)

    model, processor = analyzer.load_model(model_id)
    try:
        for pair in pairs:
            for order in ("ab", "ba"):
                if not done(pair["id"], order, 0):
                    run_one(pair, order, 0)

        repeat_ids = [item for item in args.repeat_pairs.split(",") if item]
        repeat_pairs = [pair for pair in pairs if pair["id"] in set(repeat_ids)]
        if len(repeat_pairs) != len(repeat_ids):
            print(f"  warning: unknown repeat pairs skipped: "
                  f"{sorted(set(repeat_ids) - {p['id'] for p in repeat_pairs})}", file=sys.stderr)
        for attempt in range(1, args.repeats):
            for pair in repeat_pairs:
                for order in ("ab", "ba"):
                    if not done(pair["id"], order, attempt):
                        run_one(pair, order, attempt)
    finally:
        del model, processor
    payload["meta"]["finishedAt"] = now_iso()
    rb.write_json(path, payload)
    print(f"pairwise: {path}  pairs={len(pairs)} runs={len(payload['runs'])}")


def rb_load_engine(engine):
    """(engine, model_id) from the shared vlm-model.json — same source as production."""
    config = rb.read_json(rb.VLM_MODEL_CONFIG)
    entry = (config.get("engines") or {}).get(engine)
    if not entry or not entry.get("modelId"):
        raise SystemExit(f"engine {engine!r} not declared in {rb.VLM_MODEL_CONFIG}")
    return engine, os.path.expanduser(entry["modelId"])


# ─── eval ───


def summary(pairs, runs):
    """Turn flat runs into the numbers the report quotes. Pure, so tests can pin it."""
    main = [run for run in runs if run.get("attempt") == 0]
    by_id = {pair["id"]: pair for pair in pairs}

    def tally(items):
        counts = {"positive": 0, "negative": 0, "tie": 0, "unparsed": 0, "error": 0}
        for run in items:
            counts[run["winnerRole"]] = counts.get(run["winnerRole"], 0) + 1
        valid = counts["positive"] + counts["negative"] + counts["tie"]
        return {
            **counts,
            "total": len(items),
            "valid": valid,
            "positiveRate": round(counts["positive"] / valid, 4) if valid else None,
            "positiveCi": rb.wilson(counts["positive"], valid),
            "tieRate": round(counts["tie"] / valid, 4) if valid else None,
            "tieCi": rb.wilson(counts["tie"], valid),
        }

    def outcome(pair_id):
        orders = {run["order"]: run["winnerRole"] for run in main if run["pairId"] == pair_id}
        roles = list(orders.values())
        if "error" in roles:
            return "error"
        if roles.count("positive") == len(roles) == 2:
            return "both-positive"
        if "negative" in roles:
            return "negative"
        if "positive" in roles:
            return "one-positive"
        if "tie" in roles:
            return "tie-only"
        return "unparsed"

    pair_rows = []
    for pair in pairs:
        pair_rows.append(
            {
                **pair,
                "outcome": outcome(pair["id"]),
                "roles": {
                    run["order"]: run["winnerRole"]
                    for run in main if run["pairId"] == pair["id"]
                },
            }
        )

    def pair_counts(rows):
        """Pair-level counts. Flags are independent, so a pair can be both
        'positive won once' and 'negative won once' — that is a split verdict,
        not a win or a loss."""
        both = sum(
            1 for row in rows
            if row["roles"] and all(role == "positive" for role in row["roles"].values())
        )
        lenient = sum(1 for row in rows if "positive" in row["roles"].values())
        negative = sum(1 for row in rows if "negative" in row["roles"].values())
        tie_only = sum(
            1 for row in rows
            if row["roles"].values()
            and not {"positive", "negative"} & set(row["roles"].values())
            and "tie" in row["roles"].values()
        )
        unparsed = sum(
            1 for row in rows
            if not {"positive", "negative", "tie"} & set(row["roles"].values())
        )
        return {
            "pairs": len(rows),
            "bothPositive": both,
            "lenientPositive": lenient,
            "negativeAny": negative,
            "tieOnly": tie_only,
            "unparsed": unparsed,
            "strictRate": round(both / len(rows), 4) if rows else None,
            "strictCi": rb.wilson(both, len(rows)),
            "lenientRate": round(lenient / len(rows), 4) if rows else None,
            "lenientCi": rb.wilson(lenient, len(rows)),
        }

    clean = [row for row in pair_rows if not row["debatable"]]
    debatable = [row for row in pair_rows if row["debatable"]]

    # Position bias: a pair whose role verdict flips between the two orders is
    # the signal. Unparsed/error orders are left out of the count and reported.
    flips = []
    for pair in pairs:
        roles = {run["order"]: run["winnerRole"] for run in main if run["pairId"] == pair["id"]}
        if roles.get("ab") in ("positive", "negative") and roles.get("ba") in ("positive", "negative"):
            if roles["ab"] != roles["ba"]:
                flips.append({"pairId": pair["id"], "ab": roles["ab"], "ba": roles["ba"]})

    repeats = {}
    for pair in pairs:
        attempts = sorted({
            run["attempt"] for run in runs
            if run["pairId"] == pair["id"] and run.get("attempt", 0) > 0
        })
        if not attempts:
            continue
        seen = {}
        for attempt in [0, *attempts]:
            roles = sorted(
                run["winnerRole"] for run in runs
                if run["pairId"] == pair["id"] and run["attempt"] == attempt
            )
            seen[attempt] = roles
        reference = seen[0]
        repeats[pair["id"]] = {
            "attempts": len(seen),
            "stable": all(value == reference for value in seen.values()),
            "byAttempt": seen,
        }

    return {
        "orders": tally(main),
        "byOrder": {
            order: tally([run for run in main if run["order"] == order])
            for order in ("ab", "ba")
        },
        "pairs": pair_counts(pair_rows),
        "pairsExcludingDebatable": pair_counts(clean),
        "debatableRows": [
            {"pairId": row["id"], "outcome": row["outcome"], "why": row["debatable"]}
            for row in debatable
        ],
        "positionFlips": flips,
        "byCase": {
            case_id: pair_counts([row for row in pair_rows if row["caseId"] == case_id])
            for case_id in sorted({row["caseId"] for row in pair_rows})
        },
        "repeats": repeats,
        "pairRows": pair_rows,
        "unusedPairIds": sorted(set(by_id) - {row["id"] for row in pair_rows}),
    }


def single_answer_cross_check(scores_path, pairs, stats):
    """Compare each positive case's single-answer verdict with its pairwise outcome."""
    if not scores_path or not os.path.isfile(scores_path):
        return None
    payload = rb.read_json(scores_path)
    first = {}
    for run in payload.get("runs", []):
        if run.get("arm") != "intra" or run.get("repeat") != 0:
            continue
        record = {"firstPass": run.get("firstPass"), "secondPass": run.get("secondPass")}
        first[run["caseId"]] = record
    rows = []
    for case_id in sorted({pair["caseId"] for pair in pairs}):
        case_pairs = [row for row in stats["pairRows"] if row["caseId"] == case_id]
        record = first.get(case_id) or {}
        score = (record.get("firstPass") or {}).get("relevance")
        rows.append(
            {
                "caseId": case_id,
                "firstPass": score,
                "singleAnswerAdmitted": rb.admitted(record) if record else None,
                "pairwiseBothPositive": sum(1 for row in case_pairs if row["outcome"] == "both-positive"),
                "pairwisePairs": len(case_pairs),
                "pairwiseNegative": sum(1 for row in case_pairs if row["outcome"] == "negative"),
            }
        )
    return rows


def render_report(stats, cross_check, meta):
    lines = [
        "# #541 pairwise 臂 — 自动生成报告",
        "",
        f"- 生成时间：{now_iso()}",
        f"- 引擎：`{meta.get('engine')}` · 温度 0.0 · 每题双向提问（A/B 互换）",
        f"- analyzer sha256：`{str(meta.get('analyzerSha256'))[:12]}` · "
        f"模型配置 sha256：`{str(meta.get('modelConfigSha256'))[:12]}`",
        f"- 题量：{stats['pairs']['pairs']} 对（正样本 = 人工判可用的图，负样本 = 其余素材）",
        "- GT：正样本来自 `labels.json`（人工）；负样本是**派生** GT（内容上明显不能承载该 claim），"
        "其中 2 对标记 `debatable` 并单列",
        "",
        "## 逐次判定（按 order 计）",
        "",
        "| order | 正胜 | 负胜 | tie | 未解析 | 正胜率 | Wilson 95% |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for order, label in (("ab", "ab（正=A）"), ("ba", "ba（正=B）"), (None, "合计")):
        bucket = stats["orders"] if order is None else stats["byOrder"][order]
        lines.append(
            f"| {label} | {bucket['positive']} | {bucket['negative']} | {bucket['tie']} | "
            f"{bucket['unparsed'] + bucket['error']} | {bucket['positiveRate']} | "
            f"{bucket['positiveCi'][0]}–{bucket['positiveCi'][1]} |"
        )
    pair = stats["pairs"]
    clean = stats["pairsExcludingDebatable"]
    lines += [
        "",
        "## 按对汇总（两向一致才算）",
        "",
        "| 口径 | 题数 | 两向都正胜 | 任一向正胜 | 任一向负胜 | 仅 tie | 未解析 | 严格正胜率 | Wilson 95% |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        f"| 全部 | {pair['pairs']} | {pair['bothPositive']} | {pair['lenientPositive']} | "
        f"{pair['negativeAny']} | {pair['tieOnly']} | {pair['unparsed']} | "
        f"{pair['strictRate']} | {pair['strictCi'][0]}–{pair['strictCi'][1]} |",
        f"| 排除 debatable | {clean['pairs']} | {clean['bothPositive']} | {clean['lenientPositive']} | "
        f"{clean['negativeAny']} | {clean['tieOnly']} | {clean['unparsed']} | "
        f"{clean['strictRate']} | {clean['strictCi'][0]}–{clean['strictCi'][1]} |",
        "",
        "## 按 claim 分列",
        "",
        "| case | 对 | 两向都正胜 | 任一向负胜 | 仅 tie |",
        "| --- | --- | --- | --- | --- |",
    ]
    for case_id, bucket in stats["byCase"].items():
        lines.append(
            f"| {case_id} | {bucket['pairs']} | {bucket['bothPositive']} | "
            f"{bucket['negativeAny']} | {bucket['tieOnly']} |"
        )
    if stats["debatableRows"]:
        lines += ["", "debatable 明细：", ""]
        for row in stats["debatableRows"]:
            lines.append(f"- `{row['pairId']}`：{row['outcome']} — {row['why']}")
    lines += ["", "## 位置偏差", ""]
    flips = stats["positionFlips"]
    lines.append(
        f"两个 order 角色判定不一致的题：{len(flips)} 对"
        + ("（详见 pairwise.json）" if flips else "；无位置翻转")
    )
    for flip in flips:
        lines.append(f"- `{flip['pairId']}`：ab={flip['ab']} / ba={flip['ba']}")
    if stats["repeats"]:
        lines += ["", "## 确定性（重跑）", ""]
        for pair_id, info in stats["repeats"].items():
            lines.append(
                f"- `{pair_id}`：{info['attempts']} 次，"
                f"{'一致' if info['stable'] else '有漂移'} — {info['byAttempt']}"
            )
    if cross_check:
        lines += [
            "",
            "## 与单问（首轮绝对分）对照",
            "",
            "单问的分数只存在于「该图 × 该图自己的 claim」，不能给跨 claim 的同一对排序；"
            "因此这里只对照正样本本体的单问准入与 pairwise 表现。",
            "",
            "| case | 单问首轮 | 单问准入 | pairwise 两向都正胜 | 负胜 |",
            "| --- | --- | --- | --- | --- |",
        ]
        for row in cross_check:
            lines.append(
                f"| {row['caseId']} | {row['firstPass']} | "
                f"{'放行' if row['singleAnswerAdmitted'] else '拒绝'} | "
                f"{row['pairwiseBothPositive']}/{row['pairwisePairs']} | {row['pairwiseNegative']} |"
            )
    lines += [
        "",
        "> n=25 对（正样本仅 5 个 claim），只报实测，不外推到「模型可用/不可用」。",
    ]
    return "\n".join(lines) + "\n"


def cmd_eval(args):
    out = os.path.abspath(args.out)
    payload = rb.read_json(os.path.join(out, "pairwise.json"))
    stats = summary(payload["pairs"], payload["runs"])
    cross = single_answer_cross_check(args.scores, payload["pairs"], stats)
    metrics = {key: value for key, value in stats.items() if key != "pairRows"}
    metrics["crossCheck"] = cross
    metrics["meta"] = payload.get("meta")
    rb.write_json(os.path.join(out, "pairwise-metrics.json"), metrics)

    report = render_report(stats, cross, payload.get("meta") or {})
    with open(os.path.join(out, "report.md"), "w", encoding="utf-8") as fh:
        fh.write(report)
    print(report)


# ─── cli ───


def main():
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--manifest", default=DEFAULT_MANIFEST)
    common.add_argument("--assets-dir", default=rb.DEFAULT_ASSETS_DIR)
    parser = argparse.ArgumentParser(description="#541 pairwise arm (bench-only)")
    sub = parser.add_subparsers(dest="command", required=True)

    run_parser = sub.add_parser("run", parents=[common], help="run the pairwise comparisons")
    run_parser.add_argument("--out", required=True)
    run_parser.add_argument("--labels", required=True, help="human labels.json")
    run_parser.add_argument(
        "--queue-out", default=DEFAULT_FOCUS_DIR,
        help="directory holding queue.json (saliency crops); center crop when absent",
    )
    run_parser.add_argument("--engine", default=DEFAULT_ENGINE)
    run_parser.add_argument("--repeats", type=int, default=3, help="total attempts for the repeat pairs")
    run_parser.add_argument(
        "--repeat-pairs", default="F1xA,A1xB,B1xE",
        help="comma-separated pair ids re-run for determinism",
    )
    run_parser.add_argument("--only", default=None, help="comma-separated pair ids (smoke)")
    run_parser.add_argument("--max-pairs", type=int, default=0)
    run_parser.add_argument("--resume", action="store_true")

    eval_parser = sub.add_parser("eval", parents=[common], help="metrics + report")
    eval_parser.add_argument("--out", required=True)
    eval_parser.add_argument("--scores", default=None, help="relevance-541/scores.json for the cross-check")
    eval_parser.add_argument("--labels", default=None, help="accepted for symmetry; unused by eval")

    args = parser.parse_args()
    {"run": cmd_run, "eval": cmd_eval}[args.command](args)


if __name__ == "__main__":
    main()
