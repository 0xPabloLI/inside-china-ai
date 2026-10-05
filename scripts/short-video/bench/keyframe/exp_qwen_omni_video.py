#!/usr/bin/env python3
"""#391 — Qwen3-Omni 原生「看+听」交织臂（use_audio_in_video）。

对照设计：Omni 的**原生视频输入形态**——处理器把视频按 2s 块解码、帧组与音频
条按时间交错进 token 流（position_id_per_seconds=13 配 M-RoPE），音频条走音频塔。
与三个既有臂同题对比：Omni 听波形（33.3%≈乱猜）、Qwen3-VL 原生视频+转写（83.0）、
MiniCPM loader_block（83.0）。零转写注入——它「自己看自己听」。

mlx-vlm 通路：顶层 generate(video=..., audio=..., use_audio_in_video=True)，
kwargs 直达 qwen3_omni_moe 处理器（processing 第 92 行 pop 该键）。断点续传；
首题失败响亮退出（模板/通路问题当环境错误处理）。

Run: ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/exp_qwen_omni_video.py
"""

import json
import os
import re
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme")
AUDIO_DIR = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "audio")
sys.path.insert(0, HERE)

MODEL_ID = os.environ.get("OMNI_MODEL",
                          "mlx-community/Qwen3-Omni-30B-A3B-Instruct-4bit")
OUT_NAME = os.environ.get("OMNI_OUT",
                          "exp_videomme_qa_qwen_omni_video.json")
MAX_VIDEOS = int(os.environ.get("VM_MAX_VIDEOS", "100"))
SUBSET_NAME = os.environ.get("VM_SUBSET", "bench_subset_100.csv")


def parse_letter(out):
    m = re.search(r"[ABCD]", str(out).strip().upper())
    return m.group(0) if m else "?"


def main():
    import pandas as pd
    import pyarrow.parquet as pq

    df = pq.read_table(os.path.join(VM, "test.parquet")).to_pandas()
    subset = pd.read_csv(os.path.join(VM, SUBSET_NAME))
    videos = sorted(set(subset["videoID"]) & set(df["videoID"]))[:MAX_VIDEOS]
    qa = df[df["videoID"].isin(videos)]

    out_path = os.path.join(RESULTS, OUT_NAME)
    details = []
    if os.path.exists(out_path):
        details = json.load(open(out_path, encoding="utf-8")).get("details", [])
    done = {(r["videoID"], r["question_id"]) for r in details}
    correct = sum(r["correct"] for r in details)

    from mlx_vlm import load, generate
    from mlx_vlm.prompt_utils import apply_chat_template as act

    model, processor = load(MODEL_ID)

    first = not details   # 首题失败 = 环境问题，响亮退出而非静默 0 分
    for vid in videos:
        sub = qa[qa["videoID"] == vid]
        video = os.path.join(VM, "videos", f"{vid}.mp4")
        wav = os.path.join(AUDIO_DIR, f"{vid}.wav")
        if not os.path.exists(video) or not os.path.exists(wav):
            print(f"SKIP (no video/wav): {vid}", flush=True)
            continue
        for _, q in sub.iterrows():
            if (vid, q["question_id"]) in done:
                continue
            opts = list(q["options"]) if isinstance(q["options"], list) else \
                [o.strip() for o in str(q["options"]).split("|")]
            prompt = (f"{q['question']}\nOptions:\n"
                      + "\n".join(f"{'ABCD'[i]}. {o}" for i, o in enumerate(opts))
                      + "\n\nAnswer with the option letter only (A, B, C, or D).")
            try:
                t0 = time.time()
                p = act(processor, model.config, prompt,
                        add_generation_prompt=True, num_audios=1)
                raw = generate(model, processor, prompt=p,
                               video=[video], audio=[wav],
                               use_audio_in_video=True,
                               max_tokens=8, temperature=0.0, verbose=False)
                secs = round(time.time() - t0, 1)
                if first:
                    first = False
            except Exception:
                if first:
                    traceback.print_exc()
                    print("!! FIRST-QUESTION FAILURE — env/model/template "
                          "problem, not a method property", flush=True)
                    sys.exit(2)
                raw, secs = "ERR", None
            text = str(getattr(raw, "text", raw))
            pred = parse_letter(text)
            ok = pred == q["answer"]
            correct += int(ok)
            details.append({"videoID": vid, "question_id": q["question_id"],
                            "pred": pred, "answer": q["answer"],
                            "correct": ok, "secs": secs, "raw": text[:80]})
        json.dump({"model": MODEL_ID, "details": details,
                   "summary": {"correct": correct, "total": len(details)}},
                  open(out_path, "w", encoding="utf-8"), indent=2,
                  ensure_ascii=False)
        print(f"[{videos.index(vid)+1}/{len(videos)}] {vid}: "
              f"{correct}/{len(details)} ({100*correct/max(1,len(details)):.1f}%)",
              flush=True)

    print(f"\n=== FINAL ===\nqwen_omni_video {correct}/{len(details)} = "
          f"{100*correct/max(1,len(details)):.1f}%", flush=True)
    print(f"DONE → {out_path}", flush=True)


if __name__ == "__main__":
    main()
