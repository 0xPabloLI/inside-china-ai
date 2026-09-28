#!/usr/bin/env python3
"""#391 Exp 5 — Video-MME short-subset QA eval for frame-selection methods
(bench-only, NOT production code).

Protocol: for each downloaded video (3 QA pairs each), run the selection
methods, feed each method's selected frames + the question + 4 options to
MiniCPM-o in image mode, parse the answer letter, and score accuracy per
method. This is the INDIRECT (KFS-Bench-criticized) evaluation — recorded as
such; the direct geometric metrics live in criteria_matrix / exp_tiered.

Env knobs (one VLM pass costs minutes per video, so arms are runnable
separately and merged into one artifact rather than recomputed):
  VM_METHODS    comma-separated subset of the arms to run (default all)
  VM_MAX_VIDEOS cap on videos (default 24)
  VM_OUT        output filename under results/ (default exp_videomme_qa.json)

Rows of a method that is (re)run replace that method's earlier rows; rows of
methods that are not run are carried over as they were.

Prereq: videos under .scratch/keyframe-bench/videomme/videos/,
SigLIP model under .scratch/keyframe-bench/models/siglip/.

Run: ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/exp_videomme_qa.py
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import exp_siglip as es  # noqa: E402
import exp_tiered as et  # noqa: E402

BUDGET = 16
ALL_METHODS = ["uniform_16", "tiered", "tiered_v3", "maxinfo_siglip"]
METHODS = [m.strip() for m in
           os.environ.get("VM_METHODS", ",".join(ALL_METHODS)).split(",")
           if m.strip()]
MAX_VIDEOS = int(os.environ.get("VM_MAX_VIDEOS", "24"))
OUT_NAME = os.environ.get("VM_OUT", "exp_videomme_qa.json")


def uniform_sel(duration, budget=BUDGET):
    n = max(int(duration * 1.0), 2)
    idx = [round(i * (n - 1) / (budget - 1)) for i in range(budget)]
    return sorted({round(min(i / 1.0, duration - 0.05), 2) for i in idx})


def grab(video, ts, out_dir, prefix):
    from PIL import Image
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for i, t in enumerate(ts):
        cell = bc.grab_frame(video, t, size_w=448)
        if cell is None:
            continue
        p = os.path.join(out_dir, f"{prefix}_{i:02d}.jpg")
        img = Image.open(cell)
        img.save(p, quality=88)
        os.unlink(cell)
        paths.append(p)
    return paths


def parse_lenient(raw):
    """Original scorer: first A-D character anywhere. Kept because the
    uniform/tiered numbers already on disk used it — changing only the scorer
    would make the new arms incomparable with them."""
    m = re.search(r"[ABCD]", raw.strip().upper())
    return m.group(0) if m else "?"


def parse_strict(raw):
    """PR #407 P1 alternative: the letter has to be the answer, not a letter
    inside prose ('D'ON'T, 'B'ASED, 'A'NSWER all match lenient). Both are
    recorded per row so the disagreement rate is measured, not argued."""
    s = raw.strip().upper()
    m = re.match(r"^\s*\[?([ABCD])\]?[\s.:!]*$", s)
    return m.group(1) if m else "?"


def select(name, video, duration):
    if name == "uniform_16":
        return uniform_sel(duration)
    if name == "tiered":
        return et.tiered_timestamps(video)[0]
    if name == "tiered_v3":
        return et.tiered_timestamps(video, densify=True)[0]
    if name == "maxinfo_siglip":
        return es.maxinfo_timestamps(video, BUDGET)
    raise ValueError(name)


def main():
    import pandas as pd
    import pyarrow.parquet as pq
    import vlm_analyzer as vlm

    df = pq.read_table(os.path.join(VM, "test.parquet")).to_pandas()
    subset = pd.read_csv(os.path.join(VM, "bench_subset.csv"))
    videos = sorted(set(subset["videoID"]) & set(df["videoID"]))[:MAX_VIDEOS]
    qa = df[df["videoID"].isin(videos)]
    print(f"{len(videos)} videos, {len(qa)} QA pairs in scope", flush=True)
    print(f"arms: {METHODS}", flush=True)

    out_path = os.path.join(RESULTS, OUT_NAME)
    prev = {}
    if os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as f:
            prev = json.load(f)
    details = [r for r in prev.get("details", []) if r["method"] not in METHODS]
    results = {m: {"correct": 0, "total": 0} for m in METHODS}
    for r in details:
        agg = results.setdefault(r["method"], {"correct": 0, "total": 0})
        agg["total"] += 1
        agg["correct"] += int(r["correct"])

    model, processor = vlm.load_model(vlm.MODEL_ID)
    try:
        vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)
    except Exception as e:
        print(f"warmup failed: {e}", flush=True)

    def dump():
        scored = [r for r in details if "pred_strict" in r]
        diff = [r for r in scored if r["pred_strict"] != r["pred"]]
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({"arms_run": METHODS, "arms_in_file": sorted(results),
                       "parser_check": {
                           "rows_with_raw": len(scored),
                           "strict_ne_lenient": len(diff),
                           "strict_correct": sum(
                               1 for r in scored
                               if r["pred_strict"] == r["answer"]),
                           "lenient_correct_on_diff_rows": sum(
                               1 for r in diff if r["correct"])},
                       "summary": results, "details": details},
                      f, indent=2, ensure_ascii=False)

    for vi, vid in enumerate(videos):
        video = os.path.join(VM, "videos", f"{vid}.mp4")
        if not os.path.exists(video):
            print(f"SKIP (no video): {vid}", flush=True)
            continue
        duration = bc.asset_duration(video)
        sub = qa[qa["videoID"] == vid]
        selections = {}
        for m in METHODS:
            try:
                ts = select(m, video, duration)
                selections[m] = grab(video, ts, os.path.join(VM, "frames"),
                                     f"{vid[:8]}_{m}")
            except Exception as e:
                print(f"{vid} {m} selection FAILED: {type(e).__name__}: {e}",
                      flush=True)
                selections[m] = []
        for _, q in sub.iterrows():
            opts = list(q["options"]) if isinstance(q["options"], list) else \
                [o.strip() for o in str(q["options"]).split("|")]
            prompt = (f"{q['question']}\nOptions:\n"
                      + "\n".join(f"{'ABCD'[i]}. {o}" for i, o in enumerate(opts))
                      + "\n\nAnswer with the option letter only (A, B, C, or D).")
            for m in METHODS:
                frames = selections.get(m) or []
                if not frames:
                    continue
                try:
                    raw = vlm.generate_response(
                        model, processor, engine=vlm.DEFAULT_ENGINE,
                        image_paths=frames, prompt_text=prompt, max_tokens=8)
                    pred = parse_lenient(raw)
                except Exception as e:
                    pred, raw = f"ERR:{str(e)[:40]}", ""
                correct = pred == q["answer"]
                results[m]["total"] += 1
                results[m]["correct"] += int(correct)
                details.append({"videoID": vid, "question_id": q["question_id"],
                                "method": m, "pred": pred, "answer": q["answer"],
                                "correct": correct, "raw": raw[:80],
                                "pred_strict": parse_strict(raw)})
        acc = {m: (f"{results[m]['correct']}/{results[m]['total']}"
                   if results[m]["total"] else "-") for m in METHODS}
        print(f"[{vi+1}/{len(videos)}] {vid}: {acc}", flush=True)
        dump()

    print("\n=== FINAL ===", flush=True)
    for m in sorted(results):
        t = results[m]["total"]
        c = results[m]["correct"]
        print(f"{m:16s} {c}/{t} = {c / t * 100:.1f}%" if t else f"{m:16s} n/a",
              flush=True)
    print(f"DONE → {out_path}", flush=True)


if __name__ == "__main__":
    main()
