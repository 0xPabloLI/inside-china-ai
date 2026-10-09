#!/usr/bin/env python3
"""#391 loader-axis, round 4 — frame-text ALIGNED feeding (user-requested).

Question: does feeding the transcript **aligned to the frame grid** (each frame
image followed by its own grid cell text, interleaved image-text) change QA
answers versus the block form and the official units route?

Arms over the SAME 92 videos / 276 questions, loader frames on the OFFICIAL
timetable (the same frame set as `loader_vision` in
`exp_omni_units_qa_official_full.json` — 79.0% — and the official arms there:
official_units 76.4% / official_vision 73.6%; those are the paired baselines,
not re-run here):

  loader_block       transcript as one block (ctx-off, 2000 chars) before the
                     question — the §17.3 C2-winning shape, on these frames
  loader_interleaved `frames_with_text`: one `<image>` token per frame, each
                     followed by `[MM:SS.s] <its grid cell text>`, then the
                     question. Template bypass: mlx-vlm's minicpmo chat
                     template only supports `"<image>" * n` as a PREFIX
                     (prompt_utils._format_with_token), so the interleaved
                     content carries the image tokens inline and is applied
                     with num_images=0.

ASR is NOT re-run: the precomputed ctx-off transcripts
(`.scratch/keyframe-bench/asr/<vid>.json`, same files behind the §17.3 C2
arms) are injected via `asr_runner`. The loader still needs
`want_audio=True` — its transcript grid is built on the audio segment chain
`[t_i, t_{i+1})`. Videos without a transcript file are SKIPPED loudly (a
missing transcript would silently degrade both arms into vision-only, the
exact harness failure class from PR #443).

Geometry/KFS are constants for this experiment (identical frame set and
timetable to the finale run — feeding shape cannot move them) and are not
re-run.

Output: results/exp_loader_feed_qa.json
Run:  ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/exp_loader_feed_qa.py
Env:  LFQ_MAX_VIDEOS=100 LFQ_OUT=exp_loader_feed_qa.json
      LFQ_ARMS=loader_block,loader_interleaved
"""

import json
import math
import os
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme")
# 转写目录。默认 ctx-off，与生产口径一致（#418）。此前默认 ctx-on 的 asr/，
# 而缓存键标签又写死 ctxoff —— 内容与标签不符（Q41⑤：92 条中 86 条证伪）。
# 现在标签由本目录名推导，默认值也归到 ctx-off；要复现历史 ctx-on 结果必须显式
# 传 LFQ_ASR_DIR=.scratch/keyframe-bench/asr。
ASR_DIR = os.path.join(WT_ROOT, os.environ.get(
    "LFQ_ASR_DIR", ".scratch/keyframe-bench/asr_ctxoff"))
CACHE = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "loader_cache")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import video_loader as vl  # noqa: E402
import vlm_analyzer as vlm  # noqa: E402

MAX_VIDEOS = int(os.environ.get("LFQ_MAX_VIDEOS", "11"))
OUT = os.path.join(RESULTS, os.environ.get(
    "LFQ_OUT", "exp_loader_feed_qa.json"))
ARMS = [s.strip() for s in os.environ.get(
    "LFQ_ARMS", "loader_block,loader_interleaved").split(",") if s.strip()]
ASR_MAX_CHARS = 2000
# 缓存键里的转写来源标签。**必须由 ASR_DIR 推导，不能写死**：
# 它进了 loader 的缓存键，而缓存里存的是转写原文——标签一旦与实际目录不符，
# 改了 ASR_DIR 之后缓存键不变 → 直接命中旧缓存 → 静默继续用旧转写，
# 而且 loader 的「缺文件就大声跳过」守卫不会触发（缓存先命中）。
# 2026-10-09 发现的历史不符：本文件曾写死 "asr-ctxoff-precomputed"，
# 而 ASR_DIR 指向 ctx-on 的 asr/；92 条缓存条目全部带着 ctxoff 标签，
# 其中 86 条经逐条文本比对确认实际是 ctx-on 内容。
ASR_SPEC = {"source": f"precomputed:{os.path.basename(ASR_DIR)}"}


def official_frame_times(video, duration):
    """The official sampling rule (same timetable as the finale's loader arm):
    <=64s videos at 1 fps; >64s decoded at 10 fps then uniformly sampled
    to 64 (round(idx/10, 1) timestamps)."""
    long_video = duration > 64
    fps = 10 if long_video else 1
    tmp = tempfile.mkdtemp(prefix="lfq_frames_")
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
        return [round(i / fps, 1) for i in idx]
    return [float(i) for i in range(n)]


def precomputed_asr_runner(video_path, spec):
    """Injected asr_runner: returns the stored engine output from ASR_DIR so
    WhisperX never runs. Raises on a missing file — the caller skips the
    video loudly instead of silently degrading the arms to vision-only.

    ASR_DIR defaults to the ctx-on `asr/` directory; the arms reported so far
    (loader_block 83.0% / loader_interleaved 80.8%, Q41①) were produced on it.
    Set LFQ_ASR_DIR=.scratch/keyframe-bench/asr_ctxoff for the repetition-fixed
    decode — that changes ASR_SPEC and therefore the cache key, so it will
    re-extract rather than silently reuse the ctx-on cache.
    """
    vid = os.path.splitext(os.path.basename(video_path))[0]
    with open(os.path.join(ASR_DIR, f"{vid}.json"), encoding="utf-8") as fh:
        return json.load(fh)


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
    missing_asr = [v for v in videos
                   if not os.path.exists(os.path.join(ASR_DIR, f"{v}.json"))]
    if missing_asr:
        print(f"SKIP (no precomputed transcript): {missing_asr}", flush=True)
        videos = [v for v in videos if v not in missing_asr]
    qa = df[df["videoID"].isin(videos)]

    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as fh:
            prev = json.load(fh)
    else:
        prev = {}
    done = {(r["videoID"], r["question_id"], r["arm"])
            for r in prev.get("details", [])
            if not str(r.get("pred", "")).startswith("ERR:")}
    details = list(prev.get("details", []))
    meta = dict(prev.get("meta", {}))

    model, processor = vlm.load_model(vlm.MODEL_ID)
    try:
        vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)
    except Exception as e:
        print(f"warmup: {e}", flush=True)
    model_type = model.config.model_type

    print(f"{len(videos)} videos | {qa.shape[0] * len(ARMS)} QA pairs "
          f"| arms={ARMS} | model_type={model_type}", flush=True)

    def dump():
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
        if {"loader_block", "loader_interleaved"} <= set(summary):
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

            paired = {"block_vs_interleaved": pair("loader_block",
                                                   "loader_interleaved")}
        errors = [{"videoID": r["videoID"], "arm": r["arm"], "pred": r["pred"]}
                  for r in kept if str(r.get("pred", "")).startswith("ERR:")]
        with open(OUT, "w", encoding="utf-8") as fh:
            json.dump({"arms_run": ARMS, "videos": len(videos),
                       "summary": summary, "paired": paired, "errors": errors,
                       "meta": meta, "details": kept},
                      fh, ensure_ascii=False, indent=1)

    import mlx.core as mx

    def _free_metal():
        # 64-image prompts + per-question templates fragment the Metal
        # allocator; the finale survived 828 inferences without this, but the
        # feed run hit kIOGPUCommandBufferCallbackErrorOutOfMemory at video 5
        # (a C++ terminate, uncatchable from Python). Freeing the cache per
        # question keeps peak pressure near the smoke test's.
        try:
            mx.metal.clear_cache()
        except Exception:
            pass

    for vi, vid in enumerate(videos):
        video = os.path.join(VM, "videos", f"{vid}.mp4")
        duration = bc.asset_duration(video)
        times = official_frame_times(video, duration)
        res = vl.load_video(video, {
            "frame_times": times, "want_audio": True, "asr": ASR_SPEC,
            "asr_runner": precomputed_asr_runner, "cache_dir": CACHE})
        if res["transcript"]["status"] != "ok":
            print(f"SKIP (transcript unavailable): {vid} "
                  f"({res['transcript'].get('unavailable')})", flush=True)
            continue
        frames = [f["path"] for f in res["frames"]]
        fwt = vl.frames_with_text(res)
        block_text = res["transcript"]["text"][:ASR_MAX_CHARS]
        nonempty = sum(1 for f in fwt if f["text"])
        meta[vid] = {
            "durationS": round(duration, 2),
            "frames": len(frames),
            "transcript_chars": len(res["transcript"]["text"]),
            "nonempty_cells": nonempty,
            "asr_status": res["transcript"]["status"],
        }
        sub = qa[qa["videoID"] == vid]
        for _, q in sub.iterrows():
            base_prompt = prompt_for(q)
            prompts = {
                "loader_block":
                    f"视频的语音转写（可能不完整、可能有错）：\n{block_text}\n\n"
                    + base_prompt,
                "loader_interleaved":
                    "".join(
                        "<image>" + (f"\n[{vl._mmss(f['t'])}] {f['text']}"
                                     if f["text"] else "")
                        for f in fwt) + "\n\n" + base_prompt,
            }
            for arm in ARMS:
                if (vid, q["question_id"], arm) in done:
                    continue
                prompt = prompts[arm]
                num_images = 0 if arm == "loader_interleaved" else len(frames)
                t0 = time.time()
                try:
                    pr = act(processor, model.config, prompt,
                             add_generation_prompt=True,
                             num_images=num_images)
                    out = vlm.strip_control_tokens(vlm._extract_response_text(
                        mlx_generate(model, processor, prompt=pr, image=frames,
                                     temperature=0.0, max_tokens=8,
                                     verbose=False)))
                    pred = parse_letter(out)
                except Exception as e:
                    pred, out = f"ERR:{str(e)[:40]}", ""
                details.append({"videoID": vid, "question_id": q["question_id"],
                                "arm": arm, "pred": pred, "answer": q["answer"],
                                "correct": pred == q["answer"], "raw": out[:80]})
                dump()
                _free_metal()
                print(f"[{vi+1}/{len(videos)}] {vid} {q['question_id']} "
                      f"{arm}: {pred} (want {q['answer']}, "
                      f"{time.time()-t0:.0f}s)", flush=True)
    dump()
    print(f"\nDONE → {OUT}", flush=True)
    with open(OUT, encoding="utf-8") as fh:
        d = json.load(fh)
    for arm, agg in sorted(d["summary"].items()):
        print(f"{arm:20s} {agg['correct']}/{agg['total']} = "
              f"{100 * agg['correct'] / max(1, agg['total']):.1f}%")


if __name__ == "__main__":
    main()
