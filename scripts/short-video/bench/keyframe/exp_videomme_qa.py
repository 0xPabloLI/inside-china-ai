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
import time

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

BUDGET = int(os.environ.get("VM_BUDGET", "16"))  # 24 = legacy24 arm as-is
# (the production shape carries up to 24 frames; the default 16 keeps every
# historical arm comparable — _cap uses this to trim precomputed lists, so a
# legacy24 run without the override would silently lose 8 frames)
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
VM_ENGINE = os.environ.get("VM_ENGINE", "").strip()   # 引擎覆盖（如 qwen3-vl-moe）
NATIVE_VIDEO = os.environ.get("VM_NATIVE_VIDEO") == "1"   # 原生视频输入（qwen 引擎），跳过选帧
# 视觉像素预算覆盖。默认 0 = 用模型自带值；给值则把 Qwen3-VL/Omni 的 max_pixels
# 改到这个数，用于 2×2 因子对照（同一模型在两个预算下、两个模型在同一预算下）。
VM_MAX_PIXELS = int(os.environ.get("VM_MAX_PIXELS", "0"))
# 生成长度。8 是 QA 臂的最小值（只输出一个选项字母）；Thinking 臂必须放大，
# 否则推理链没走完就被截断，分数反映的是截断而不是能力。
MAX_TOKENS = int(os.environ.get("VM_MAX_TOKENS", "8"))
THINK_STRIP = os.environ.get("VM_THINK_STRIP") == "1"   # 打分前剥掉  thinking 块
if AUDIO and ASR_TEXT:
    # The row suffix can only label one feeding mode, but the prompt would
    # carry both — rows would merge into the results under the wrong name.
    raise SystemExit("VM_AUDIO=1 and VM_ASR=1 are mutually exclusive arms")


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


def strip_thinking(raw):
    """Drop the reasoning block so the scorer sees only the answer.

    A Thinking model emits its chain-of-thought before answering, and
    ``parse_lenient`` scans for the first A-D character anywhere — which would
    happily match a letter inside the reasoning. Cut at the LAST closing tag so
    a model that re-enters reasoning after answering still scores on its final
    answer. No closing tag means no reasoning block, so the text passes through
    untouched (Instruct arms are unaffected by this path)."""
    s = raw
    for close in ("</think" + ">", "</thinking>", "<|/think|>"):
        i = s.rfind(close)
        if i != -1:
            return s[i + len(close):]
    return s


# A capital A-D that is not glued to other letters: 'C' in "The answer is C"
# matches, the 'a' inside "answer" does not.
_THINK_LETTER = re.compile(r"(?<![A-Za-z])([ABCD])(?![A-Za-z])")


def parse_thinking(raw):
    """Scorer for reasoning arms; returns (letter, tier).

    The lenient scorer is unusable here: it takes the first A-D character
    anywhere, and the word "answer" contains an "A", so "The answer is C"
    scored as "A". Historical arms keep lenient — their numbers are already on
    disk and the scorer must not move under them — while reasoning arms are new
    and get the parser that actually reads the answer. The tier is recorded so
    a run that leans on the loose path is visible rather than silent.
    """
    s = strip_thinking(raw)
    strict = parse_strict(s)
    if strict != "?":
        return strict, "strict"
    m = _THINK_LETTER.search(s)
    if m:
        return m.group(1), "loose"
    return "?", "none"


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
    if ts is None and PRECOMPUTED:
        # 2026-10-05 事故教训：medium 档 uniform_16 键缺失时静默 fallback 拿了
        # 别的方法的时刻表（84 题答案与 uniform_96 逐字节全同，臂报废）。
        # 提供了 PRECOMPUTED 就不许 fallback——缺键是配置错误，必须响亮失败。
        raise KeyError(f"precomputed timetable miss: video {vid} has no "
                       f"timestamps for method '{name}' ({PRECOMPUTED})")
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
    if os.path.exists(out) and os.path.getsize(out) > 1000:
        return out
    import subprocess
    r = subprocess.run([bc.FFMPEG, "-nostdin", "-y", "-i", video, "-vn",
                        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", out],
                       capture_output=True)
    ok = r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 1000
    if not ok and os.path.exists(out):
        # A partial wav left by a failed conversion must be deleted, or later
        # runs' exists() short-circuit serves it as cache forever.
        os.unlink(out)
    return out if ok else None


def main():
    import pandas as pd
    import pyarrow.parquet as pq
    import vlm_analyzer as vlm

    if VM_ENGINE:
        # 换引擎做跨模型对比（vlm-model.json 里须有该引擎条目）。
        vlm.DEFAULT_ENGINE, vlm.MODEL_ID = vlm.resolve_engine(
            vlm._VLM_CONFIG, requested_engine=VM_ENGINE)
        print(f"engine override: {vlm.DEFAULT_ENGINE} ({vlm.MODEL_ID})",
              flush=True)

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
    if VM_MAX_PIXELS:
        # 同一调用里视频走 video_processor、图片走 image_processor，只改一个会让
        # 两条路径用不同预算；一个都改不动就响亮退出，不静默用回模型自带值。
        changed = []
        for name in ("processor", "video_processor", "image_processor"):
            obj = processor if name == "processor" else getattr(processor, name, None)
            if obj is None or not hasattr(obj, "max_pixels"):
                continue
            before = obj.max_pixels
            obj.max_pixels = VM_MAX_PIXELS
            changed.append(f"{name}:{before}->{obj.max_pixels}")
        if not changed:
            raise SystemExit(
                f"VM_MAX_PIXELS={VM_MAX_PIXELS} 但没有任何 processor 暴露 "
                "max_pixels；拒绝静默按默认预算跑")
        print(f"[max_pixels] {'; '.join(changed)}", flush=True)
    try:
        vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)
    except Exception as e:
        print(f"warmup failed: {e}", flush=True)
    sel_errors = {m: 0 for m in METHODS}
    no_frames = {m: 0 for m in METHODS}
    sel_noout = {m: 0 for m in METHODS}
    raised = set()          # (method, videoID) whose select() raised

    def dump():
        # Rows without model output (no_frames / sel_error) must not enter the
        # scorer-agreement block: they would inflate rows_with_raw and count as
        # strict!=lenient on every one of them, turning parser_check into a
        # measure of how often the selector returned nothing.
        scored = [r for r in details if "pred_strict" in r
                  and not r.get("no_frames") and not r.get("sel_error")]
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
        selections = {} if NATIVE_VIDEO else {}
        raised_here = set()
        if not NATIVE_VIDEO:
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
                    raised_here.add(m)
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
                if not frames and not NATIVE_VIDEO:
                    # A selector that returns nothing is a RESULT, not a skipped
                    # question: the model cannot answer, so the row counts against
                    # it. Dropping these rows instead (what earlier runs did) lets
                    # an arm score only the videos where it happens to fire —
                    # sd_threshold read 45.4% on 36/92 videos this way, when the
                    # honest number on the full set is 17.8%.
                    # The CAUSE still has to stay separable: select() raising is a
                    # harness bug, selecting nothing is a method property, and
                    # conflating them hides a dispatch crash inside a plausible 0%.
                    bug = m in raised_here
                    results[m]["total"] += 1
                    details.append({"videoID": vid, "question_id": q["question_id"],
                                    "method": m,
                                    "pred": "SELERR" if bug else "NOFRAMES",
                                    "answer": q["answer"], "correct": False,
                                    "raw": "", "pred_strict": "?",
                                    "sel_error": bug, "no_frames": not bug})
                    (sel_noout if bug else no_frames)[m] += 1
                    continue
                try:
                    t0 = time.time()
                    if NATIVE_VIDEO:
                        raw = vlm.generate_response(
                            model, processor, engine=vlm.DEFAULT_ENGINE,
                            video_path=video, prompt_text=prompt,
                            max_tokens=MAX_TOKENS)
                    else:
                        raw = vlm.generate_response(
                            model, processor, engine=vlm.DEFAULT_ENGINE,
                            image_paths=frames, prompt_text=prompt,
                            max_tokens=MAX_TOKENS,
                            **({"audio_path": audio_path} if audio_path else {}))
                    secs = round(time.time() - t0, 1)
                    if THINK_STRIP:
                        pred, pred_tier = parse_thinking(raw)
                        scored_text = strip_thinking(raw)
                    else:
                        pred, pred_tier, scored_text = parse_lenient(raw), "", raw
                except Exception as e:
                    pred, raw, scored_text = f"ERR:{str(e)[:40]}", "", ""
                    pred_tier, secs = "", None
                correct = pred == q["answer"]
                results[m]["total"] += 1
                results[m]["correct"] += int(correct)
                row = {"videoID": vid, "question_id": q["question_id"],
                       "method": m, "pred": pred, "answer": q["answer"],
                       "correct": correct, "raw": raw[:80], "raw_len": len(raw),
                       "secs": secs,
                       "pred_strict": parse_strict(scored_text)}
                if THINK_STRIP:
                    # raw[:80] is the head of the reasoning chain, so without the
                    # tail that was actually scored the parse is unauditable.
                    row["scored"] = scored_text[:80]
                    row["pred_tier"] = pred_tier
                details.append(row)
        try:
            import mlx.core as mx
            mx.metal.clear_cache()   # 防跨视频碎片累积（feed 跑 OOM 的教训）
        except Exception:
            pass
        acc = {m: (f"{results[m]['correct']}/{results[m]['total']}"
                   if results[m]["total"] else "-") for m in METHODS}
        print(f"[{vi+1}/{len(videos)}] {vid}: {acc}", flush=True)
        dump()

    print("\n=== FINAL ===", flush=True)
    for m in sorted(results):
        t = results[m]["total"]
        c = results[m]["correct"]
        note = ""
        # results keys can include methods from earlier runs of the same file
        # (resume-merge keeps their rows); no_frames/sel_* only track THIS
        # run's METHODS, so look them up defensively (2026-10-04 KeyError).
        if no_frames.get(m) or sel_noout.get(m):
            note = (f"  (无输出 {no_frames.get(m, 0)} 题 / "
                    f"select()抛错 {sel_noout.get(m, 0)} 题，"
                    f"视频级异常 {sel_errors.get(m, 0)} 个)")
        print((f"{m:16s} {c}/{t} = {c / t * 100:.1f}%" if t else f"{m:16s} n/a")
              + note, flush=True)
    print(f"DONE → {out_path}", flush=True)
    broken = [m for m in METHODS if results.get(m, {}).get("total", 0) == 0]
    if broken:
        # On 2026-09-29 three feeding-mode arms and two method arms ran for an
        # hour with every video failing at select() and still exited rc=0 —
        # the chains read rc, so a zero-row arm must be a non-zero exit.
        print(f"!! ARM(S) WITH ZERO ROWS: {broken} — "
              f"selection errors on { {m: sel_errors[m] for m in broken} } "
              f"of {len(videos)} videos", flush=True)
        sys.exit(2)
    bugged = {m: sel_noout[m] for m in METHODS if sel_noout[m]}
    if bugged:
        # select() raising is never a method property, so it must not be
        # book-kept as "answered with no frames" and counted as a plain 0.
        print(f"!! ARM(S) WITH select() EXCEPTIONS (rows counted wrong, "
              f"cause = harness/dispatch/env, not the method): {bugged} — "
              f"video-level errors: { {m: sel_errors[m] for m in bugged} }",
              flush=True)
        sys.exit(2)
    dead = [m for m in METHODS
            if results.get(m, {}).get("total", 0)
            and no_frames.get(m, 0) == results[m]["total"]]
    if dead:
        print(f"!! ARM(S) WHOSE SELECTOR RETURNED NO FRAMES ON EVERY VIDEO: {dead} — "
              f"legitimately 0, but check the selection source before citing it",
              flush=True)
        sys.exit(2)


if __name__ == "__main__":
    main()
