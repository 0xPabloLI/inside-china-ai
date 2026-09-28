#!/usr/bin/env python3
"""#391 Exp 5 — Video-MME short-subset QA eval for frame-selection methods
(bench-only, NOT production code).

Protocol: for each of ~24 downloaded short videos (3 QA pairs each), run the
selection methods (uniform_16 / tiered / maxinfo_siglip), feed each method's
selected frames + the question + 4 options to MiniCPM-o in image mode, parse
the answer letter, and score accuracy per method. This is the INDIRECT
(KFS-Bench-criticized) evaluation — recorded as such; the direct geometric
metrics live in criteria_matrix / exp_tiered.

Prereq: videos downloaded under .scratch/keyframe-bench/videomme/videos/,
SigLIP model under .scratch/keyframe-bench/models/siglip/.

Run: ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/exp_videomme_qa.py
"""

import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme")
SIGLIP_DIR = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "models", "siglip")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import exp_tiered as et  # noqa: E402

BUDGET = 16
MAX_VIDEOS = int(os.environ.get("VM_MAX_VIDEOS", "24"))


def uniform_sel(duration, budget=BUDGET):
    n = max(int(duration * 1.0), 2)
    idx = [round(i * (n - 1) / (budget - 1)) for i in range(budget)]
    return sorted({round(min(i / 1.0, duration - 0.05), 2) for i in idx})


def maxinfo_siglip_sel(video, budget=BUDGET):
    from exp_siglip import decode_rgb
    from transformers import SiglipModel
    from transformers.models.siglip.image_processing_siglip import SiglipImageProcessor
    import torch
    model = SiglipModel.from_pretrained(SIGLIP_DIR)
    processor = SiglipImageProcessor.from_pretrained(SIGLIP_DIR)
    model.eval()
    frames = decode_rgb(video)
    if not frames:
        return []
    inputs = processor(images=[f for _, f in frames], return_tensors="pt")
    import torch as _t
    with _t.no_grad():
        feats = model.get_image_features(**inputs)
    vecs = feats.numpy()
    vecs = vecs / (np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-9)
    ts = [t for t, _ in frames]
    sel, min_d = [0], np.linalg.norm(vecs - vecs[0], axis=1)
    while len(sel) < min(budget, len(ts)):
        i = int(np.argmax(min_d))
        if min_d[i] <= 0:
            break
        sel.append(i)
        min_d = np.minimum(min_d, np.linalg.norm(vecs - vecs[i], axis=1))
    return sorted(ts[i] for i in set(sel))


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


def main():
    import pyarrow.parquet as pq
    import vlm_analyzer as vlm
    import re

    df = pq.read_table(os.path.join(VM, "test.parquet")).to_pandas()
    subset = pd_read_csv = None
    import pandas as pd
    subset = pd.read_csv(os.path.join(VM, "bench_subset.csv"))
    vids = set(subset["videoID"])
    qa = df[df["videoID"].isin(vids)]
    videos = sorted(set(qa["videoID"]))[:MAX_VIDEOS]
    print(f"{len(videos)} videos, {len(qa)} QA pairs in scope", flush=True)

    model, processor = vlm.load_model(vlm.MODEL_ID)
    try:
        vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)
    except Exception as e:
        print(f"warmup failed: {e}", flush=True)

    def select(name, video, duration):
        if name == "uniform_16":
            return uniform_sel(duration)
        if name == "tiered":
            return et.tiered_timestamps(video)[0]
        if name == "maxinfo_siglip":
            return maxinfo_siglip_sel(video)
        raise ValueError(name)

    METHODS = ["uniform_16", "tiered", "maxinfo_siglip"]
    out_path = os.path.join(RESULTS, "exp_videomme_qa.json")
    results = {m: {"correct": 0, "total": 0} for m in METHODS}
    details = []

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
                                     f"{vid[:8]}_{m[:4]}")
            except Exception as e:
                print(f"{vid} {m} selection FAILED: {e}", flush=True)
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
                    match = re.search(r"[ABCD]", raw.strip().upper())
                    pred = match.group(0) if match else "?"
                except Exception as e:
                    pred = f"ERR:{str(e)[:40]}"
                correct = pred == q["answer"]
                results[m]["total"] += 1
                results[m]["correct"] += int(correct)
                details.append({"videoID": vid, "question_id": q["question_id"],
                                "method": m, "pred": pred, "answer": q["answer"],
                                "correct": correct})
        acc = {m: (f"{results[m]['correct']}/{results[m]['total']}"
                   if results[m]["total"] else "-") for m in METHODS}
        print(f"[{vi+1}/{len(videos)}] {vid}: {acc}", flush=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({"summary": results, "details": details}, f, indent=2,
                      ensure_ascii=False)

    print("\n=== FINAL ===", flush=True)
    for m in METHODS:
        t = results[m]["total"]
        c = results[m]["correct"]
        print(f"{m:16s} {c}/{t} = {c / t * 100:.1f}%" if t else f"{m:16s} n/a",
              flush=True)
    print(f"DONE → {out_path}", flush=True)


if __name__ == "__main__":
    main()