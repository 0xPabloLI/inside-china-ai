#!/usr/bin/env python3
"""#391 — 官方 omni 装载格式的 QA 臂（MiniCPM-o：帧 + 逐段音频交织）。

装载规格见 exp_omni_units.py（逐行对齐官方 minicpmo 0.1.2）：
1 帧 + 该帧到下一帧之间的音频段，逐对送入。这里是把它跑成可比较的 QA 臂：
同题库、同视频，与纯视觉臂配对比较（VM_MAX_VIDEOS 控制样本，官方格式单次生成
~90s，比纯视觉慢 5-10 倍，故默认只跑前 30 个视频）。

Run: ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/exp_omni_units_qa.py
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
import exp_omni_units as ou  # noqa: E402
import vlm_analyzer as vlm  # noqa: E402

MAX_VIDEOS = int(os.environ.get("OU_MAX_VIDEOS", "30"))
OUT = os.path.join(RESULTS, os.environ.get("OU_OUT", "exp_videomme_units.json"))


def main():
    import pandas as pd
    import pyarrow.parquet as pq
    df = pq.read_table(os.path.join(VM, "test.parquet")).to_pandas()
    subset = pd.read_csv(os.path.join(VM, "bench_subset_100.csv"))
    videos = sorted(set(subset["videoID"]) & set(df["videoID"]))[:MAX_VIDEOS]
    qa = df[df["videoID"].isin(videos)]
    prev = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {"details": [], "summary": {}}
    details = [r for r in prev["details"] if r["method"] != "tiered_v5_units"]
    results = {"tiered_v5_units": {"correct": 0, "total": 0}}
    for r in details:
        results.setdefault(r["method"], {"correct": 0, "total": 0})
        results[r["method"]]["total"] += 1
        results[r["method"]]["correct"] += int(r["correct"])
    from mlx_vlm import generate as mlx_generate
    from mlx_vlm.prompt_utils import apply_chat_template as act
    model, processor = vlm.load_model(vlm.MODEL_ID)
    try:
        vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)
    except Exception as e:
        print(f"warmup: {e}", flush=True)
    print(f"{len(videos)} videos | {len(qa)} QA pairs | 官方单元格式", flush=True)
    for vi, vid in enumerate(videos):
        video = os.path.join(VM, "videos", f"{vid}.mp4")
        if not os.path.exists(video):
            continue
        fdir = f"/tmp/ou_{vid}"
        frames, segs, ts, dur = ou.omni_units(video, fdir)
        paths = [os.path.join(fdir, f) for f in sorted(os.listdir(fdir))][:len(frames)]
        for _, q in qa[qa["videoID"] == vid].iterrows():
            opts = list(q["options"]) if isinstance(q["options"], list) else \
                [o.strip() for o in str(q["options"]).split("|")]
            prompt = (f"{q['question']}\nOptions:\n"
                      + "\n".join(f"{'ABCD'[i]}. {o}" for i, o in enumerate(opts))
                      + "\n\nAnswer with the option letter only (A, B, C, or D).")
            t0 = time.time()
            try:
                pr = act(processor, model.config, prompt, add_generation_prompt=True,
                         num_images=len(paths), num_audios=len(segs))
                out = vlm.strip_control_tokens(vlm._extract_response_text(
                    mlx_generate(model, processor, prompt=pr, image=paths,
                                 audio=list(segs), temperature=0.0,
                                 max_tokens=8, verbose=False)))
                m = re.search(r"[ABCD]", out.strip().upper())
                pred = m.group(0) if m else "?"
            except Exception as e:
                pred, out = f"ERR:{str(e)[:40]}", ""
            correct = pred == q["answer"]
            results["tiered_v5_units"]["total"] += 1
            results["tiered_v5_units"]["correct"] += int(correct)
            details.append({"videoID": vid, "question_id": q["question_id"],
                            "method": "tiered_v5_units", "pred": pred,
                            "answer": q["answer"], "correct": correct,
                            "raw": out[:80]})
        a = results["tiered_v5_units"]
        print(f"[{vi+1}/{len(videos)}] {vid}: {a['correct']}/{a['total']} "
              f"({time.time()-t0:.0f}s/次)", flush=True)
        json.dump({"arms_run": ["tiered_v5_units"], "summary": results,
                   "details": details}, open(OUT, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
    a = results["tiered_v5_units"]
    print(f"DONE {a['correct']}/{a['total']} = "
          f"{100*a['correct']/max(1,a['total']):.1f}% → {OUT}", flush=True)


if __name__ == "__main__":
    main()
