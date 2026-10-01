#!/usr/bin/env python3
"""#391 loader-axis, round 3 — STRICT official package, three paired arms.

Why this exists: the user's standing objection is that the official MiniCPM-o
loading layer was never run through the **official package** — the earlier
rounds either used our re-implementation (`video_loader.to_minicpm_units`) or
mixed sources between the arms, so "official loading has no gain" was never
measured against the official code itself.

This script closes that with three arms over the SAME questions:

  official_units   官方包 `minicpmo.utils.get_video_frame_audio_segments`
                   的产物（`precompute_official_units.py` 用独立 venv
                   `~/.venvs/omni-official` 真跑官方代码落盘）：帧 + 逐段音频
  official_vision  同一批官方帧，只喂帧、不喂音频
  loader_vision    `lib/video_loader.load_video` 的帧，只喂帧（对照我方复现）

`official_units` vs `official_vision` is the cleanest statement of "does the
official unit format help": identical frames, identical questions, the only
difference is whether audio enters the context. `official_vision` vs
`loader_vision` then separates our re-implementation from the official frames.

Frames are used exactly as the official package wrote them (JPEG quality 88,
no resize, no re-encode), and audio as the float16 numpy arrays the official
loader produced — so the model input is the official package's own output, not
a re-derivation of it.

Output: results/exp_omni_units_qa_official.json
Run:  ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/exp_omni_units_qa_official.py
Env: OUO_MAX_VIDEOS=11 OUO_OUT=... OUO_ARMS=official_units,official_vision,loader_vision
"""

import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme")
OFFICIAL = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "official_units")
CACHE = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "loader_cache")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import video_loader as vl  # noqa: E402
import vlm_analyzer as vlm  # noqa: E402

MAX_VIDEOS = int(os.environ.get("OUO_MAX_VIDEOS", "11"))
OUT = os.path.join(RESULTS, os.environ.get(
    "OUO_OUT", "exp_omni_units_qa_official.json"))
ARMS = [s.strip() for s in os.environ.get(
    "OUO_ARMS", "official_units,official_vision,loader_vision").split(",")
    if s.strip()]
ARM_LABELS = {
    "official_units": "official_units|官方产物|official",
    "official_vision": "official_vision|官方帧纯视觉|official",
    "loader_vision": "loader_vision|loader帧纯视觉|loader",
}


def official_unit_paths(vid):
    """(frame paths, audio arrays) exactly as the official package wrote them."""
    import numpy as np
    d = os.path.join(OFFICIAL, vid)
    man_path = os.path.join(d, "manifest.json")
    if not os.path.exists(man_path):
        return None, None, None
    with open(man_path, encoding="utf-8") as fh:
        man = json.load(fh)
    paths = [os.path.join(d, f"frame_{i:03d}.jpg")
             for i in range(man["frames"])]
    segs = [np.load(os.path.join(d, f"audio_{i:03d}.npy"))
            for i in range(man["audios"])]
    return paths, segs, man


def loader_frame_paths(vid, duration):
    """Loader frames under the OFFICIAL sampling rule — the frames the previous
    round's vision arm used, so this arm is comparable with it."""
    video = os.path.join(VM, "videos", f"{vid}.mp4")
    # Mirror official_frame_times() from exp_omni_units_qa_loader.py: the
    # long/short branch and the round(idx/10, 1) timestamps are the official
    # rule, reused here so the only difference left is which decoder produced
    # the pixels.
    import subprocess
    import tempfile
    long_video = duration > 64
    fps = 10 if long_video else 1
    tmp = tempfile.mkdtemp(prefix="ouo_frames_")
    try:
        subprocess.run(
            [bc.FFMPEG, "-nostdin", "-y", "-i", video, "-vf", f"fps={fps}",
             os.path.join(tmp, "f_%06d.jpg")], capture_output=True, check=True)
        n = len([f for f in os.listdir(tmp) if f.endswith(".jpg")])
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)
    if long_video:
        idx = bc.official_uniform_sample(list(range(n)), 64)
        times = [round(i / fps, 1) for i in idx]
    else:
        times = [float(i) for i in range(n)]
    res = vl.load_video(video, {"frame_times": times, "want_audio": False,
                                "cache_dir": CACHE})
    return [f["path"] for f in res["frames"]], res


def prompt_for(q):
    opts = list(q["options"]) if isinstance(q["options"], list) else \
        [o.strip() for o in str(q["options"]).split("|")]
    return (f"{q['question']}\nOptions:\n"
            + "\n".join(f"{'ABCD'[i]}. {o}" for i, o in enumerate(opts))
            + "\n\nAnswer with the option letter only (A, B, C, or D).")


def parse_letter(out):
    import re
    m = re.search(r"[ABCD]", out.strip().upper())
    return m.group(0) if m else "?"


def mcnemar_exact(b, c):
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    tail = sum(math.comb(n, i) for i in range(0, k + 1)) / (2 ** n)
    return min(1.0, 2 * tail)


def main():
    import pandas as pd
    import pyarrow.parquet as pq
    from mlx_vlm import generate as mlx_generate
    from mlx_vlm.prompt_utils import apply_chat_template as act

    df = pq.read_table(os.path.join(VM, "test.parquet")).to_pandas()
    subset = pd.read_csv(os.path.join(VM, "bench_subset_100.csv"))
    videos = sorted(set(subset["videoID"]) & set(df["videoID"]))[:MAX_VIDEOS]
    # Only videos with a real official artifact can host the official arms;
    # the loader arm is computed on demand, so it never restricts the set.
    videos = [v for v in videos if os.path.exists(
        os.path.join(OFFICIAL, v, "manifest.json"))]
    qa = df[df["videoID"].isin(videos)]

    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as fh:
            prev = json.load(fh)
    else:
        prev = {}
    done = {(r["videoID"], r["arm"]) for r in prev.get("details", [])
            if not str(r.get("pred", "")).startswith("ERR:")}
    details = list(prev.get("details", []))
    meta = dict(prev.get("meta", {}))

    model, processor = vlm.load_model(vlm.MODEL_ID)
    try:
        vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)
    except Exception as e:
        print(f"warmup: {e}", flush=True)

    print(f"{len(videos)} videos | {len(videos) * 3} QA pairs | arms={ARMS}",
          flush=True)

    def dump():
        # ERR rows are harness/transient failures, not answers: they never
        # enter summary/paired (see #436 review, f1d3e2a8), and a superseded
        # ERR row is dropped when its (video, arm) later succeeds.
        ok = {(r["videoID"], r["arm"]) for r in details
              if not str(r.get("pred", "")).startswith("ERR:")}
        kept = [r for r in details
                if not (str(r.get("pred", "")).startswith("ERR:")
                        and (r["videoID"], r["arm"]) in ok)]
        scored = [r for r in kept if not str(r.get("pred", "")).startswith("ERR:")]
        summary = {}
        for r in scored:
            agg = summary.setdefault(r["arm"], {"correct": 0, "total": 0})
            agg["total"] += 1
            agg["correct"] += int(r["correct"])
        paired = {}
        if {"official_units", "official_vision", "loader_vision"} <= set(summary):
            byq = {}
            for r in scored:
                byq.setdefault((r["videoID"], r["question_id"]),
                               {})[r["arm"]] = r["correct"]

            def pair(a, b):
                n = x = y = 0
                for arms in byq.values():
                    if a not in arms or b not in arms:
                        continue
                    n += 1
                    x += int(arms[a] and not arms[b])
                    y += int(arms[b] and not arms[a])
                return {"pairs": n, f"{a}_only": x, f"{b}_only": y,
                        "mcnemar_exact_p": round(mcnemar_exact(x, y), 4)}

            paired = {
                "units_vs_official_vision": pair("official_units",
                                                 "official_vision"),
                "official_vision_vs_loader_vision": pair("official_vision",
                                                         "loader_vision"),
                "units_vs_loader_vision": pair("official_units",
                                               "loader_vision"),
            }
        errors = [{"videoID": r["videoID"], "arm": r["arm"], "pred": r["pred"]}
                  for r in kept if str(r.get("pred", "")).startswith("ERR:")]
        with open(OUT, "w", encoding="utf-8") as fh:
            json.dump({"arms_run": ARMS, "videos": len(videos),
                       "summary": summary, "paired": paired, "errors": errors,
                       "meta": meta, "details": kept},
                      fh, ensure_ascii=False, indent=1)

    for vi, vid in enumerate(videos):
        video = os.path.join(VM, "videos", f"{vid}.mp4")
        duration = bc.asset_duration(video)
        off_frames, off_segs, man = official_unit_paths(vid)
        if off_frames is None:
            print(f"SKIP (no official artifact): {vid}", flush=True)
            continue
        loader_frames, lres = loader_frame_paths(vid, duration)
        meta[vid] = {
            "durationS": round(duration, 2),
            "official_frames": len(off_frames),
            "official_audios": len(off_segs) if off_segs is not None else 0,
            "official_audio_secs": (round(sum(len(s) for s in off_segs) / 16000, 2)
                                    if off_segs is not None else None),
            "loader_frames": len(loader_frames),
            "frame_count_match": len(off_frames) == len(loader_frames),
        }
        feeds = {
            "official_units": (off_frames, list(off_segs)),
            "official_vision": (off_frames, None),
            "loader_vision": (loader_frames, None),
        }
        sub = qa[qa["videoID"] == vid]
        for _, q in sub.iterrows():
            prompt = prompt_for(q)
            for arm in ARMS:
                if (vid, arm) in done:
                    continue
                frames, audio = feeds[arm]
                t0 = time.time()
                try:
                    pr = act(processor, model.config, prompt,
                             add_generation_prompt=True,
                             num_images=len(frames),
                             num_audios=(len(audio) if audio else 0))
                    out = vlm.strip_control_tokens(vlm._extract_response_text(
                        mlx_generate(model, processor, prompt=pr, image=frames,
                                     audio=audio, temperature=0.0,
                                     max_tokens=8, verbose=False)))
                    pred = parse_letter(out)
                except Exception as e:
                    pred, out = f"ERR:{str(e)[:40]}", ""
                details.append({"videoID": vid, "question_id": q["question_id"],
                                "arm": arm, "pred": pred, "answer": q["answer"],
                                "correct": pred == q["answer"], "raw": out[:80]})
                dump()
                print(f"[{vi+1}/{len(videos)}] {vid} {q['question_id']} "
                      f"{arm}: {pred} (want {q['answer']}, "
                      f"{time.time()-t0:.0f}s)", flush=True)
    dump()
    print(f"\nDONE → {OUT}", flush=True)
    with open(OUT, encoding="utf-8") as fh:
        d = json.load(fh)
    for arm, agg in sorted(d["summary"].items()):
        print(f"{arm:16s} {agg['correct']}/{agg['total']} = "
              f"{100 * agg['correct'] / max(1, agg['total']):.1f}%")
    print("paired:", json.dumps(d["paired"], ensure_ascii=False))


if __name__ == "__main__":
    main()
