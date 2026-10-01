#!/usr/bin/env python3
"""#391 pending item — K-frames (arXiv 2510.13891) with the QUERY-CONDITIONED
P1/P2 priority restored, i.e. the part the `m_kframes` bench arm dropped.

Background: the bench arm `m_kframes` runs the paper's Appendix D.2 allocator
with w≡1 (query weights deleted), so it degrades into length-weighted uniform
sampling with midpoints inside each segment. The user's point: at that point the
method has nothing left to test, so either drop it or run it as written.

This script runs it as written, end to end, on Video-MME:

  1. P1  clip segmentation: scene cuts -> segments (same as the bench arm).
  2. P1' captions: a LOCAL VLM (MiniCPM-o 4.5, same model as the QA arms)
     writes one English description per segment. No Gemini key is used, so the
     pipeline stays runnable offline; the docstring states this substitution.
  3. P1' relevance: per (question, segment) an LLM scores how likely the
     segment's caption answers the question — the paper's P2 priority w_j.
     Same local VLM, one letter per pair, so cost is (#segments x #questions)
     short generations.
  4. D.2 allocator: k_j from the gemma-style weights w_j * ℓ_j (largest
     remainder to the budget), frames equally spaced inside each segment.

Compared against the query-free arm (w≡1) over the SAME videos and the SAME
frame budget, so the only difference is whether the caption+relevance stage
runs. If the query-conditioned version does not beat w≡1, the paper's headline
mechanism adds nothing over length weighting measured here, which is exactly
what the pending item needs to settle.

Scope: a 3-video pilot first (VM_MAX_VIDEOS=3) — 9 questions, and segment counts
are small, so the caption+scoring passes are cheap. Scale only if the pilot
shows the machinery is sane.

Output: results/exp_kframes_query.json
Run:  ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/exp_kframes_query.py
Env:  KFQ_MAX_VIDEOS=3 KFQ_BUDGET=16 KFQ_OUT=...
"""

import json
import math
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme")
CACHE = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "loader_cache")
FRAME_CACHE = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "frames")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import video_loader as vl  # noqa: E402
import vlm_analyzer as vlm  # noqa: E402

MAX_VIDEOS = int(os.environ.get("KFQ_MAX_VIDEOS", "3"))
BUDGET = int(os.environ.get("KFQ_BUDGET", "16"))
# The paper's P1 unit is a *clip* with describable content. On Video-MME the
# decoded 0.08 scene cuts are cut-rate (subtitle and narration hard cuts fire on
# every line change: -qTAeVGl_e8 = 91 cuts over 83 s, 82 of them sub-second), and
# a sub-second segment has nothing to caption, so P1'/P2 would be scored on
# text-free fragments. Segments shorter than this are merged into the FOLLOWING
# one — the paper's own granularity is coarser than a hard cut. Documented
# because it is a deliberate deviation from the `m_kframes` bench arm.
MIN_SEG = float(os.environ.get("KFQ_MIN_SEG", "2.0"))
OUT = os.path.join(RESULTS, os.environ.get(
    "KFQ_OUT", "exp_kframes_query.json"))
ARMS = ("kframes_query", "kframes_queryfree")
SUBSET_NAME = "bench_subset_100.csv"

CAPTION_PROMPT = ("Describe, in one short English sentence, what happens in "
                  "this video segment. Mention people, the main action and the "
                  "setting. Answer with the sentence only.")
# P2 relevance: the paper scores P(segment answers the question). We take a
# 4-way letter instead of a probability so the value is deterministic and
# inspectable; A is the top bucket.
RELEVANCE_PROMPT = ("Given this question about a video:\n{question}\n\n"
                    "and this description of one segment of the video:\n"
                    "{caption}\n\n"
                    "How likely is this segment to contain the answer? "
                    "A=very likely, B=possibly, C=unlikely, D=no relation. "
                    "Answer with the option letter only.")
RELEVANCE_WEIGHT = {"A": 4.0, "B": 3.0, "C": 2.0, "D": 1.0}


def segments(video, duration):
    cuts = [t for t in sorted({round(t, 2) for t in
                               bc.derive_scene_timestamps(video, "0.08", None)})
            if 0 < t < duration]
    edges = [0.0] + cuts + [duration]
    raw = [(x, y) for x, y in zip(edges, edges[1:]) if y - x > 1e-6]
    # Merge sub-MIN_SEG segments into the following one (see MIN_SEG above).
    merged = []
    for x, y in raw:
        if merged and (y - x) < MIN_SEG and merged[-1][1] - merged[-1][0] < MIN_SEG:
            merged[-1] = (merged[-1][0], y)
        elif merged and (y - x) < MIN_SEG:
            merged[-1] = (merged[-1][0], y)
        else:
            merged.append((x, y))
    # A final sub-MIN_SEG segment has no following segment, so fold it backwards.
    if len(merged) > 1 and merged[-1][1] - merged[-1][0] < MIN_SEG:
        head = merged.pop()
        merged[-1] = (merged[-1][0], head[1])
    return merged or [(0.0, duration)]


def allocate(lens, weights, budget):
    """P1/P2 -> k_j ∝ w_j * ℓ_j, largest remainder, capped by budget."""
    lens = [float(x) for x in lens]
    tot = sum(w * l for w, l in zip(weights, lens))
    k = min(budget, sum(lens))
    if tot <= 0:
        raw = [l / (sum(lens) or 1.0) * k for l in lens]
    else:
        raw = [w * l / tot * k for w, l in zip(weights, lens)]
    alloc = [int(math.floor(x)) for x in raw]
    order = sorted(range(len(raw)), key=lambda i: -(raw[i] - alloc[i]))
    i = 0
    while sum(alloc) < k and order:
        alloc[order[i % len(order)]] += 1
        i += 1
    while sum(alloc) > k:
        # Take back from the largest allocation that still has one to give.
        cand = max((j for j in range(len(alloc)) if alloc[j] > 0),
                   key=lambda j: alloc[j], default=None)
        if cand is None:
            break
        alloc[cand] -= 1
    return alloc


def seg_frames(segs, alloc):
    out = []
    for (x, y), c in zip(segs, alloc):
        if c <= 0:
            continue
        out += [round(x + (y - x) * (j + 0.5) / c, 2) for j in range(c)]
    return sorted(out)


def grab(video, ts, slug):
    """Grab frames at native production resolution (480p, the same downscale
    the production extractor applies). `size_w=None` is NOT usable here:
    bench_common.grab_frame builds `scale=None:-2`, ffmpeg rejects it, and it
    returns None — which this script used to turn into a silent zero-image
    generation, i.e. hallucinated captions for every segment (caught 2026-09-30
    when the pilot came back 44.4% vs 44.4% with empty captions)."""
    os.makedirs(FRAME_CACHE, exist_ok=True)
    paths = []
    for t in ts:
        p = os.path.join(FRAME_CACHE, f"{slug}_{t:07.2f}.jpg")
        if not os.path.exists(p):
            cell = bc.grab_frame(video, t, size_w=480)
            if cell is None:
                continue
            os.replace(cell, p)
        paths.append(p)
    return paths


def letter(out):
    m = re.search(r"[ABCD]", out.strip().upper())
    return m.group(0) if m else "C"


def kq_mcnemar(b, c):
    """Exact two-sided binomial test on discordant pairs (the repo's standard
    paired test; see exp_videomme_qa)."""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    tail = sum(math.comb(n, i) for i in range(0, k + 1)) / (2 ** n)
    return min(1.0, 2 * tail)


def generate(model, processor, prompt, images, max_tokens):
    # An empty image list means the selector found nothing; generating on zero
    # images happily returns hallucinated text and would be recorded as an
    # answer. Refuse instead, so the cause stays separable from a real result.
    if not images:
        raise ValueError("no frames to generate on")
    from mlx_vlm import generate as mlx_generate
    from mlx_vlm.prompt_utils import apply_chat_template as act
    pr = act(processor, model.config, prompt, add_generation_prompt=True,
             num_images=len(images), num_audios=0)
    out = mlx_generate(model, processor, prompt=pr, image=images,
                       temperature=0.0, max_tokens=max_tokens, verbose=False)
    return vlm.strip_control_tokens(vlm._extract_response_text(out))


def main():
    import pandas as pd
    import pyarrow.parquet as pq

    df = pq.read_table(os.path.join(VM, "test.parquet")).to_pandas()
    subset = pd.read_csv(os.path.join(VM, SUBSET_NAME))
    videos = sorted(set(subset["videoID"]) & set(df["videoID"]))[:MAX_VIDEOS]
    videos = [v for v in videos if os.path.exists(
        os.path.join(VM, "videos", f"{v}.mp4"))]
    qa = df[df["videoID"].isin(videos)]

    if os.path.exists(OUT):
        prev = json.load(open(OUT, encoding="utf-8")) if False else \
            json.load(open(OUT, encoding="utf-8"))
    else:
        prev = {}
    rows = prev.get("rows", [])
    meta = prev.get("meta", {})

    model, processor = vlm.load_model(vlm.MODEL_ID)
    try:
        vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)
    except Exception as e:
        print(f"warmup: {e}", flush=True)

    def dump():
        agg = {}
        for r in rows:
            if str(r.get("pred", "")).startswith("ERR:"):
                continue
            a = agg.setdefault(r["arm"], {"correct": 0, "total": 0})
            a["total"] += 1
            a["correct"] += int(r["correct"])
        for k in agg:
            agg[k]["acc"] = round(100 * agg[k]["correct"] / agg[k]["total"], 1)
        # Per-question pairing (both arms answered the same question is what
        # makes the comparison a McNemar, not two marginal rates).
        by_q = {}
        for r in rows:
            if str(r.get("pred", "")).startswith("ERR:"):
                continue
            by_q.setdefault((r["videoID"], r["question_id"]),
                            {})[r["arm"]] = bool(r["correct"])
        x = sum(1 for v in by_q.values()
                if len(v) == 2 and v["kframes_query"] and not v["kframes_queryfree"])
        y = sum(1 for v in by_q.values()
                if len(v) == 2 and v["kframes_queryfree"] and not v["kframes_query"])
        paired = {"pairs": sum(1 for v in by_q.values() if len(v) == 2),
                  "query_only": x, "queryfree_only": y,
                  "mcnemar_exact_p": round(kq_mcnemar(x, y), 4)}
        json.dump({"arms": list(ARMS), "budget": BUDGET, "videos": len(videos),
                   "summary": agg, "paired": paired, "meta": meta, "rows": rows},
                  open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"{len(videos)} videos | budget={BUDGET} | arms={ARMS}", flush=True)
    for vi, vid in enumerate(videos):
        video = os.path.join(VM, "videos", f"{vid}.mp4")
        duration = bc.asset_duration(video)
        segs = segments(video, duration)
        if vid in meta and meta[vid].get("segments") == len(segs):
            caps = meta[vid]["captions"]
        else:
            caps = []
            for (x, y) in segs:
                paths = grab(video, [round((x + y) / 2, 2)], f"{vid[:8]}_cap")
                try:
                    caps.append(generate(model, processor, CAPTION_PROMPT,
                                         paths, 60).strip())
                except Exception as e:
                    # A caption failure must stay visible in the artifact: an
                    # empty caption silently becomes relevance 1.0 (= "no
                    # relation") and the query arm quietly degenerates into the
                    # query-free arm, which is what produced a fake 44.4% tie.
                    caps.append(f"ERR:{type(e).__name__}: {str(e)[:60]}")
            meta[vid] = {"durationS": round(duration, 2),
                         "segments": len(segs),
                         "segBounds": [[round(x, 2), round(y, 2)]
                                       for x, y in segs],
                         "captions": caps}
        sub = qa[qa["videoID"] == vid]
        # Relevance (P2) needs the question text, so it is scored per question.
        for _, q in sub.iterrows():
            opts = list(q["options"]) if isinstance(q["options"], list) else \
                [o.strip() for o in str(q["options"]).split("|")]
            qtext = (f"{q['question']} Options: "
                     + " ".join(f"{'ABCD'[i]}. {o}" for i, o in enumerate(opts)))
            if vid not in meta or "relevance" not in meta[vid]:
                meta[vid]["relevance"] = {}
            rel = meta[vid]["relevance"].get(str(q["question_id"]))
            if rel is None:
                res = {}
                for i, cap in enumerate(caps):
                    key = (vid, q["question_id"], i)
                    cache = meta.get("_relevance", {}).get("/".join(map(str, key)))
                    if cache is not None:
                        res[i] = RELEVANCE_WEIGHT[cache]
                        continue
                    p = RELEVANCE_PROMPT.format(question=qtext, caption=cap)
                    cpath = grab(video, [round((segs[i][0] + segs[i][1]) / 2, 2)],
                                 f"{vid[:8]}_cap")
                    try:
                        res[i] = RELEVANCE_WEIGHT[letter(
                            generate(model, processor, p, cpath, 4))]
                    except Exception as e:
                        # Never fall back to a plausible-looking constant: that
                        # is how a scoring outage hides inside a query arm that
                        # then ties by construction. Record it, then keep going.
                        meta.setdefault("_relevance_error", {})[
                            "/".join((vid, str(q["question_id"]), str(i)))] = \
                            f"{type(e).__name__}: {str(e)[:80]}"
                        res[i] = None
                    else:
                        meta.setdefault("_relevance", {})[
                            "/".join((vid, str(q["question_id"]), str(i)))] = \
                            [k for k, v in RELEVANCE_WEIGHT.items()
                             if v == res[i]][0]
                rel = [res.get(i) for i in range(len(segs))]
                if any(r is None for r in rel):
                    print(f"!! {vid} {q['question_id']}: relevance unscorable "
                          f"for {sum(1 for r in rel if r is None)} segments -- "
                          f"this pair's query arm degenerates to query-free, "
                          f"do NOT quote it", flush=True)
                rel = [r if r is not None else 1.0 for r in rel]
                meta[vid]["relevance"][str(q["question_id"])] = rel
            lens = [y - x for x, y in segs]
            for arm, w in (("kframes_query", rel),
                           ("kframes_queryfree", [1.0] * len(segs))):
                if any(r["videoID"] == vid and r["question_id"] ==
                       q["question_id"] and r["arm"] == arm and
                       not str(r.get("pred", "")).startswith("ERR:")
                       for r in rows):
                    continue
                ts = seg_frames(segs, allocate(lens, w, BUDGET))
                frames = grab(video, ts, f"{vid[:8]}_{arm[:3]}")
                row = {"videoID": vid, "question_id": q["question_id"],
                       "arm": arm, "frames": len(frames), "allocation":
                       allocate(lens, w, BUDGET),
                       "answer": q["answer"]}
                try:
                    raw = generate(model, processor,
                                   (f"{q['question']}\nOptions:\n"
                                    + "\n".join(f"{'ABCD'[i]}. {o}"
                                                for i, o in enumerate(opts))
                                    + "\n\nAnswer with the option letter only "
                                      "(A, B, C, or D)."),
                                   frames, 8)
                    row["pred"] = letter(raw)
                    row["raw"] = raw[:80]
                except Exception as e:
                    row["pred"] = f"ERR:{str(e)[:40]}"
                    row["raw"] = ""
                row["correct"] = row["pred"] == q["answer"]
                rows.append(row)
                dump()
                print(f"[{vi+1}/{len(videos)}] {vid} {q['question_id']} {arm}: "
                      f"{row['pred']} (want {q['answer']}, "
                      f"{row['frames']}f)", flush=True)
    dump()
    with open(OUT, encoding="utf-8") as fh:
        d = json.load(fh)
    print(json.dumps(d["summary"], ensure_ascii=False, indent=1), flush=True)
    print(f"DONE → {OUT}", flush=True)


if __name__ == "__main__":
    main()
