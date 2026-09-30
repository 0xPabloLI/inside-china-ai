#!/usr/bin/env python3
"""#417 ticket-2c — loader 装载的官方单元在 #391 QA 臂上的配对 A/B。

问题：「音频不伤视觉」在**生产 loader**（`lib/video_loader.py`）的装载路径上
是否依然成立。先前 #391 的单元臂（`exp_omni_units_qa.py`）用的是官方包预计算
产物，帧与纯视觉臂不同源；本脚本把两臂放到**同一帧集合**上：

  vision  只喂 loader 的帧
  units   loader 装载 → `to_minicpm_units()` 的「1 帧 + 1 段音频」逐对交织

两臂只有「音频进不进上下文」这一处差异，因此差值就是音频的净效应；同一题配对，
用精确 McNemar 报 b/c 与 p。

帧规则与官方一致（`precompute_official_units.py` 走的 `minicpmo` 分支）：
时长 ≤ 64s 走 1fps；> 64s 走 10fps 后 `uniform_sample(64)`，时间戳 `round(idx/10, 1)`。
帧计数沿用官方做法（真跑一遍 fps 抽帧数文件），这样 loader 的帧时刻与官方臂
逐点一致；音频段由 loader 按帧时刻链切（16k 单声道，最后一段到片尾）。
官方预计算产物在盘上时做一次交叉校验（帧数、逐段时长）。

Run: ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/exp_omni_units_qa_loader.py
Env: OUQA_MAX_VIDEOS=12 OUQA_OUT=exp_videomme_units_loader.json
     OUQA_ARMS=vision,units OUQA_CACHE=.scratch/keyframe-bench/loader_cache
"""

import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme")
OFFICIAL = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "official_units")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import video_loader as vl  # noqa: E402
import vlm_analyzer as vlm  # noqa: E402

MAX_VIDEOS = int(os.environ.get("OUQA_MAX_VIDEOS", "12"))
OUT = os.path.join(RESULTS, os.environ.get("OUQA_OUT",
                                           "exp_videomme_units_loader.json"))
CACHE = os.path.join(WT_ROOT, os.environ.get(
    "OUQA_CACHE", ".scratch/keyframe-bench/loader_cache"))
MAX_UNITS = int(os.environ.get("MAX_NUM_FRAMES", "64"))
ARMS = [s.strip() for s in os.environ.get("OUQA_ARMS", "vision,units").split(",")
        if s.strip()]


def uniform_sample(seq, n):
    return bc.official_uniform_sample(seq, n)


def official_frame_times(video, duration):
    """官方抽帧规则下的时刻表 + 该路径名（short/long）。

    帧计数沿用官方实现：真跑一遍 fps 抽帧再数文件（官方就是数文件）。多花一次
    解码，换来与官方臂逐点一致的时刻表，而不是近似公式。
    """
    long_video = duration > MAX_UNITS
    fps = 10 if long_video else 1
    tmp = tempfile.mkdtemp(prefix="ouqa_frames_")
    try:
        subprocess.run(
            [bc.FFMPEG, "-nostdin", "-y", "-i", video, "-vf", f"fps={fps}",
             os.path.join(tmp, "f_%06d.jpg")], capture_output=True, check=True)
        n = len([f for f in os.listdir(tmp) if f.endswith(".jpg")])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if long_video:
        idx = uniform_sample(list(range(n)), MAX_UNITS)
        return [round(i / fps, 1) for i in idx], "long"
    return [float(i) for i in range(n)], "short"


def _wav_secs(path):
    import wave
    with wave.open(str(path), "rb") as fh:
        return round(fh.getnframes() / fh.getframerate(), 3)


def _frame_mad(path_a, path_b):
    """Mean abs diff of two JPEGs of the same moment (downscaled grayscale).

    Bytes can never match (official re-encodes at quality 88, the loader uses
    ffmpeg -q:v 2), so identity is measured as pixel agreement instead.
    """
    import numpy as np
    from PIL import Image
    a = Image.open(path_a).convert("L").resize((64, 36))
    b = Image.open(path_b).convert("L").resize((64, 36))
    return round(float(np.abs(np.asarray(a, dtype=np.int16)
                              - np.asarray(b, dtype=np.int16)).mean()), 2)


def check_against_official(vid, frame_times, units, load_result):
    """Cross-check the loader's units against the official package output.

    Segment lengths are read from the written wavs, not from the analytic
    `unit_spans`: when the audio stream is shorter than the video (this subset
    has one), the real file is shorter than [t_i, t_{i+1}) and the analytic
    span would report a difference the loader does not have.
    """
    d = os.path.join(OFFICIAL, vid)
    man_path = os.path.join(d, "manifest.json")
    if not os.path.exists(man_path):
        return None
    with open(man_path, encoding="utf-8") as fh:
        man = json.load(fh)
    segs = list((load_result.get("audio_track") or {}).get("segments") or [])
    got = [_wav_secs(s["path"]) for s in segs]
    ref = list(man.get("audio_secs") or [])
    diffs = [round(abs(a - b), 3) for a, b in zip(got, ref)]
    mads = {}
    for i in range(min(units["num_images"], int(man.get("frames") or 0))):
        off = os.path.join(d, f"frame_{i:03d}.jpg")
        if os.path.exists(off):
            mads[i] = _frame_mad(off, units["images"][i])
    vals = sorted(mads.values())
    n = len(vals)
    return {"frames_official": man.get("frames"), "frames_loader": units["num_images"],
            "audios_official": man.get("audios"), "audios_loader": units["num_audios"],
            "segment_secs_max_abs_diff": max(diffs) if diffs else None,
            "segment_secs_mean_abs_diff": (round(sum(diffs) / len(diffs), 3)
                                           if diffs else None),
            "frame_mad": {"n": n,
                          "median": vals[n // 2] if n else None,
                          "p90": vals[min(n - 1, int(0.9 * n))] if n else None,
                          "max": vals[-1] if n else None,
                          "gt10": sum(1 for v in vals if v > 10)},
            "first_frame_times": frame_times[:4], "last_frame_times": frame_times[-2:]}


def mcnemar_exact(b, c):
    """Two-sided exact McNemar (binomial) p-value."""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    tail = sum(math.comb(n, i) for i in range(0, k + 1)) / (2 ** n)
    return min(1.0, 2 * tail)


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


def main():
    import pandas as pd
    import pyarrow.parquet as pq
    from mlx_vlm import generate as mlx_generate
    from mlx_vlm.prompt_utils import apply_chat_template as act

    df = pq.read_table(os.path.join(VM, "test.parquet")).to_pandas()
    subset = pd.read_csv(os.path.join(VM, "bench_subset_100.csv"))
    videos = sorted(set(subset["videoID"]) & set(df["videoID"]))[:MAX_VIDEOS]
    qa = df[df["videoID"].isin(videos)]

    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as fh:
            prev = json.load(fh)
    else:
        prev = {}
    done = {(r["videoID"], r["arm"]) for r in prev.get("details", [])
            if not str(r.get("pred", "")).startswith("ERR:")}
    details = list(prev.get("details", []))
    loader_meta = dict(prev.get("loader_meta", {}))
    validations = dict(prev.get("official_cross_check", {}))

    model, processor = vlm.load_model(vlm.MODEL_ID)
    try:
        vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)
    except Exception as e:
        print(f"warmup: {e}", flush=True)

    print(f"{len(videos)} videos | {len(qa)} QA pairs | arms={ARMS} "
          f"| loader cache={CACHE}", flush=True)

    def dump():
        # An ERR row is a harness/transient failure (mlx OOM, processor glitch),
        # not an answer: counting it as "wrong" would bias the paired counts the
        # research doc quotes, and leaving it in `done` would pin it forever.
        # Keep the newest row per (video, arm) and drop ERR rows a later retry
        # replaced; ERR rows that persist stay in the file as an audit trail.
        ok_pairs = {(r["videoID"], r["arm"]) for r in details
                    if not str(r.get("pred", "")).startswith("ERR:")}
        kept = [r for r in details
                if not (str(r.get("pred", "")).startswith("ERR:")
                        and (r["videoID"], r["arm"]) in ok_pairs)]
        scored = [r for r in kept if not str(r.get("pred", "")).startswith("ERR:")]
        summary = {}
        for r in scored:
            agg = summary.setdefault(r["arm"], {"correct": 0, "total": 0})
            agg["total"] += 1
            agg["correct"] += int(r["correct"])
        paired = {}
        if {"vision", "units"} <= set(summary):
            by = {}
            for r in scored:
                by.setdefault((r["videoID"], r["question_id"]), {})[r["arm"]] = r
            b = c = n = 0
            for arms in by.values():
                if "vision" not in arms or "units" not in arms:
                    continue
                n += 1
                v, u = arms["vision"]["correct"], arms["units"]["correct"]
                b += int(u and not v)
                c += int(v and not u)
            paired = {"pairs": n, "units_only": b, "vision_only": c,
                      "mcnemar_exact_p": round(mcnemar_exact(b, c), 4)}
        errors = [{"videoID": r["videoID"], "arm": r["arm"], "pred": r["pred"]}
                  for r in kept if str(r.get("pred", "")).startswith("ERR:")]
        with open(OUT, "w", encoding="utf-8") as fh:
            json.dump({"arms_run": ARMS, "videos": len(videos), "summary": summary,
                       "paired": paired, "errors": errors,
                       "official_cross_check": validations,
                       "loader_meta": loader_meta, "details": kept},
                      fh, ensure_ascii=False, indent=1)

    for vi, vid in enumerate(videos):
        video = os.path.join(VM, "videos", f"{vid}.mp4")
        if not os.path.exists(video):
            print(f"SKIP (no video): {vid}", flush=True)
            continue
        todo = [a for a in ARMS if (vid, a) not in done]
        if not todo:
            print(f"[{vi+1}/{len(videos)}] {vid}: cached", flush=True)
            continue
        duration = bc.asset_duration(video)
        ts, path = official_frame_times(video, duration)
        t0 = time.time()
        r = vl.load_video(video, {"frame_times": ts, "want_audio": True,
                                  "cache_dir": CACHE})
        units = vl.to_minicpm_units(r)
        units["paths"] = units["images"]           # mlx_vlm 用 image=paths
        if vid not in validations:
            chk = check_against_official(vid, ts, units, r)
            if chk:
                validations[vid] = chk
        loader_meta[vid] = {
            "durationS": round(duration, 2), "frame_rule": path,
            "frames": units["num_images"], "units": units["num_audios"],
            "cache_hit": bool(r["cache"]["hit"]),
            "cache_key": (r["cache"]["key"] or "")[:16],
            "segment_secs_head": [round(u["end"] - u["start"], 3)
                                  for u in units["unit_spans"][:4]],
            "load_ms": round((time.time() - t0) * 1000, 1)}
        sub = qa[qa["videoID"] == vid]
        for _, q in sub.iterrows():
            prompt = prompt_for(q)
            for arm in todo:
                audio = list(units["audios"]) if arm == "units" else None
                t1 = time.time()
                try:
                    pr = act(processor, model.config, prompt,
                             add_generation_prompt=True,
                             num_images=units["num_images"],
                             num_audios=units["num_audios"] if audio else 0)
                    kw = {"audio": audio} if audio else {}
                    out = vlm.strip_control_tokens(vlm._extract_response_text(
                        mlx_generate(model, processor, prompt=pr,
                                     image=units["paths"], temperature=0.0,
                                     max_tokens=8, verbose=False, **kw)))
                    pred = parse_letter(out)
                except Exception as e:
                    pred, out = f"ERR:{str(e)[:40]}", ""
                details.append({"videoID": vid, "question_id": q["question_id"],
                                "arm": arm, "pred": pred, "answer": q["answer"],
                                "correct": pred == q["answer"], "raw": out[:80],
                                "gen_ms": round((time.time() - t1) * 1000, 1)})
        dump()
        acc = {}
        for r_ in details:
            if r_["videoID"] == vid:
                a = acc.setdefault(r_["arm"], [0, 0])
                a[0] += int(r_["correct"])
                a[1] += 1
        print(f"[{vi+1}/{len(videos)}] {vid} {path} dur={duration:.1f}s "
              f"units={units['num_audios']} load={loader_meta[vid]['load_ms']:.0f}ms "
              + " ".join(f"{k}={v[0]}/{v[1]}" for k, v in sorted(acc.items())),
              flush=True)

    dump()
    with open(OUT, encoding="utf-8") as fh:
        final = json.load(fh)
    print("\n=== FINAL ===", flush=True)
    for arm, agg in sorted(final["summary"].items()):
        t = agg["total"]
        print(f"{arm:8s} {agg['correct']}/{t} = "
              f"{100 * agg['correct'] / max(1, t):.1f}%", flush=True)
    if final["paired"]:
        p = final["paired"]
        print(f"paired n={p['pairs']} units_only={p['units_only']} "
              f"vision_only={p['vision_only']} McNemar p={p['mcnemar_exact_p']}",
              flush=True)
    for vid, chk in sorted(final["official_cross_check"].items()):
        print(f"official {vid}: frames {chk['frames_official']} vs "
              f"{chk['frames_loader']}, segs {chk['audios_official']} vs "
              f"{chk['audios_loader']}, seg-len max|Δ|="
              f"{chk['segment_secs_max_abs_diff']}s", flush=True)
    print(f"DONE → {OUT}", flush=True)


if __name__ == "__main__":
    main()
