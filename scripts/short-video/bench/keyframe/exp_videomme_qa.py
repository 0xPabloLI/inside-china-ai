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
  VM_SUBSET     subset csv name under videomme/ (default bench_subset.csv;
                the ~100-video expansion points at bench_subset_100.csv)
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
ALL_METHODS = ["uniform_16", "tiered", "tiered_v3", "tiered_v5", "slice",
               "maxinfo_siglip"]
METHODS = [m.strip() for m in
           os.environ.get("VM_METHODS", ",".join(ALL_METHODS)).split(",")
           if m.strip()]
MAX_VIDEOS = int(os.environ.get("VM_MAX_VIDEOS", "24"))
OUT_NAME = os.environ.get("VM_OUT", "exp_videomme_qa.json")
SUBSET_NAME = os.environ.get("VM_SUBSET", "bench_subset.csv")
AUDIO = os.environ.get("VM_AUDIO") == "1"   # feed the clip's audio to MiniCPM-o too
AUDIO_DIR = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "audio")
ASR_DIR = os.path.join(WT_ROOT, os.environ.get(
    "VM_ASR_DIR", ".scratch/keyframe-bench/asr"))   # ctx-off 复跑切 asr_ctxoff
ASR_TEXT = os.environ.get("VM_ASR") == "1"   # inject the ASR transcript into the prompt
ASR_MAX_CHARS = 2000
PRECOMPUTED = os.environ.get("VM_PRECOMPUTED")   # JSON: {videoID: {method: [ts,...]}}
OMNI_UNITS = os.environ.get("VM_OMNI_UNITS") == "1"   # 官方规格：帧+逐段音频交织
ASR_MODE = os.environ.get("VM_ASR_MODE", "block")     # block(默认) | ts | full | after


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


def transcript_text(vid, mode):
    """四种喂法对照：block=整块截断（默认，既有结果的口径）/ ts=逐段带时间戳 /
    full=不截断 / after=放在题目之后（由调用方处理位置）。"""
    p = os.path.join(ASR_DIR, f"{vid}.json")
    if not os.path.exists(p):
        return ""
    try:
        d = json.load(open(p, encoding="utf-8"))
    except Exception:
        return ""
    if mode == "ts":
        return "\n".join(f"[{int(s['start']//60):02d}:{s['start']%60:04.1f}] {s['text']}"
                         for s in d.get("segments", [])[:80])
    t = d.get("text", "")
    return t if mode == "full" else t[:ASR_MAX_CHARS]


def load_transcript(vid):
    """ASR transcript for the prompt (video is always given; empty if missing)."""
    p = os.path.join(ASR_DIR, f"{vid}.json")
    if not os.path.exists(p):
        return ""
    try:
        t = json.load(open(p, encoding="utf-8")).get("text", "")
    except Exception:
        return ""
    return t[:ASR_MAX_CHARS]


_PRECOMP_CACHE = {}


def _cap(ts, budget=BUDGET):
    """Subsample an over-budget list to <=budget keeping first/last — the same
    formula methods_bench.subsample uses for the geometric bench. Needed for
    the precomputed arms: raw detector output is uncapped (sd_content reaches
    57 frames on one video), and without this the QA arm would buy extra
    frames that every other arm is denied."""
    ts = sorted(float(t) for t in ts)
    if len(ts) <= budget:
        return ts
    idxs = sorted({round(i * (len(ts) - 1) / (budget - 1))
                   for i in range(budget)})
    return [ts[i] for i in idxs]


def _precomputed(name, vid):
    if not PRECOMPUTED or not vid:
        return None
    if not _PRECOMP_CACHE:
        _PRECOMP_CACHE.update(json.load(open(os.path.join(WT_ROOT, PRECOMPUTED),
                                             encoding="utf-8")))
    ts = _PRECOMP_CACHE.get(vid, {}).get(name)
    return None if ts is None else _cap(ts)


def select(name, video, duration, vid=None):
    # Loading-layer suffixes must be stripped before dispatch. Order matters
    # only for readability: "_asr_ts" does not end with "_asr", but listing
    # the modes explicitly documents the four VM_ASR_MODE values. (Missing
    # "_asr_ts/_asr_full/_asr_after" here is what silently zeroed the three
    # feeding-mode arms on 2026-09-29.)
    for suf in ("_audio", "_asr_ts", "_asr_full", "_asr_after", "_asr"):
        if name.endswith(suf):
            name = name[: -len(suf)]
            break
    pre = _precomputed(name, vid)
    if pre is not None:
        return pre
    if name == "uniform_16":
        return uniform_sel(duration)
    if name == "tiered":
        return et.tiered_timestamps(video)[0]
    if name == "tiered_v3":
        return et.tiered_timestamps(video, densify=True)[0]
    if name == "tiered_v5":
        return et.tiered_timestamps(video, densify=True,
                                    enforce_floor=True)[0]
    if name == "slice":
        import methods_bench3 as mb3
        return mb3.m_slice(video)
    if name in ("infoshot", "lvnet_tsc", "kffocus"):
        import methods_bench3 as mb3
        return {"infoshot": mb3.m_infoshot, "lvnet_tsc": mb3.m_lvnet_tsc,
                "kffocus": mb3.m_kffocus}[name](video)
    if name == "maxinfo_siglip":
        return es.maxinfo_timestamps(video, BUDGET)
    if name == "blockslide":
        import methods_bench as mb
        return _cap(mb.m_blockslide(video))
    if name == "kframes":
        import methods_bench3 as mb3
        return _cap(mb3.m_kframes(video))
    if name == "scene_008_cap16":
        return _cap(bc.derive_scene_timestamps(video, "0.08", BUDGET))
    if name == "iframe_even16":
        return _cap(bc.derive_iframe_timestamps(video, BUDGET, "even"))
    raise ValueError(name)


def ensure_audio(video, vid):
    """16 kHz mono wav for the omni engine (ffmpeg), cached per video."""
    os.makedirs(AUDIO_DIR, exist_ok=True)
    out = os.path.join(AUDIO_DIR, f"{vid}.wav")
    if os.path.exists(out):
        return out
    import subprocess
    r = subprocess.run([bc.FFMPEG, "-nostdin", "-y", "-i", video, "-vn",
                        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", out],
                       capture_output=True)
    return out if r.returncode == 0 and os.path.getsize(out) > 1000 else None


def main():
    import pandas as pd
    import pyarrow.parquet as pq
    import vlm_analyzer as vlm

    df = pq.read_table(os.path.join(VM, "test.parquet")).to_pandas()
    subset = pd.read_csv(os.path.join(VM, SUBSET_NAME))
    videos = sorted(set(subset["videoID"]) & set(df["videoID"]))[:MAX_VIDEOS]
    qa = df[df["videoID"].isin(videos)]
    if AUDIO or ASR_TEXT:
        global METHODS
        suffix = ("_audio" if AUDIO else
                  ("_asr" if ASR_MODE == "block" else f"_asr_{ASR_MODE}"))
        METHODS = [m + suffix for m in METHODS]
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
    sel_errors = {m: 0 for m in METHODS}

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
        audio_path = ensure_audio(video, vid) if AUDIO else None
        sub = qa[qa["videoID"] == vid]
        selections = {}
        for m in METHODS:
            try:
                ts = select(m, video, duration, vid)
                selections[m] = grab(video, ts, os.path.join(VM, "frames"),
                                     f"{vid[:8]}_{m}")
            except Exception as e:
                print(f"{vid} {m} selection FAILED: {type(e).__name__}: {e}",
                      flush=True)
                selections[m] = []
                sel_errors[m] += 1
        for _, q in sub.iterrows():
            opts = list(q["options"]) if isinstance(q["options"], list) else \
                [o.strip() for o in str(q["options"]).split("|")]
            transcript = (transcript_text(vid, ASR_MODE) if ASR_TEXT else "")
            head = (f"视频的语音转写（可能不完整、可能有错）：\n{transcript}\n\n"
                    if transcript and ASR_MODE != "after" else "")
            tail = (f"\n\n视频的语音转写（可能不完整）：\n{transcript}"
                    if transcript and ASR_MODE == "after" else "")
            prompt = (head + f"{q['question']}\nOptions:\n"
                      + "\n".join(f"{'ABCD'[i]}. {o}" for i, o in enumerate(opts))
                      + "\n\nAnswer with the option letter only (A, B, C, or D)."
                      + tail)
            for m in METHODS:
                frames = selections.get(m) or []
                if not frames:
                    continue
                try:
                    raw = vlm.generate_response(
                        model, processor, engine=vlm.DEFAULT_ENGINE,
                        image_paths=frames, prompt_text=prompt, max_tokens=8,
                        **({"audio_path": audio_path} if audio_path else {}))
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
    broken = [m for m in METHODS if results[m]["total"] == 0]
    if broken:
        # On 2026-09-29 three feeding-mode arms and two method arms ran for an
        # hour with every video failing at select() and still exited rc=0 —
        # the chains read rc, so a zero-row arm must be a non-zero exit.
        # sel_errors distinguishes "select() raised for every video" (dispatch
        # bug) from "no frames were grabbed" (bad timestamps).
        print(f"!! ARM(S) WITH ZERO ROWS: {broken} — "
              f"selection errors: { {m: sel_errors[m] for m in broken} } "
              f"of {len(videos)} videos", flush=True)
        sys.exit(2)


if __name__ == "__main__":
    main()
