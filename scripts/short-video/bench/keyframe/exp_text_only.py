#!/usr/bin/env python3
"""#391 — 纯文本臂（转写进 prompt，零帧零音频）：模态消融矩阵的缺失格。

动机（用户 2026-10-04）：276 题里可能有些「只有图像就够」或「只有音频就够」
——转写增益（83.0 vs 76.4）是在混合题集上测的。本臂 + 已有的 vision-only 臂
（loader_vision 79.0）补出 2×2 消融：{仅文本, 仅视觉} → 与「文本+视觉」
（loader_block 83.0）对比，逐题归属每题需要哪种模态。

MiniCPM-o 4.5（主引擎）；断点续传；首题失败响亮退出。

Run: ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/exp_text_only.py
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
ASR_DIR = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "asr")
sys.path.insert(0, HERE)
# vlm_analyzer 在 scripts/short-video/lib（2026-10-05 补：缺这行曾 ModuleNotFoundError）
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..", "..", "lib")))

OUT_NAME = os.environ.get("VM_OUT", "exp_videomme_qa_text_only.json")
MAX_VIDEOS = int(os.environ.get("VM_MAX_VIDEOS", "100"))
SUBSET_NAME = os.environ.get("VM_SUBSET", "bench_subset_100.csv")


def transcript_of(vid):
    p = os.path.join(ASR_DIR, f"{vid}.json")
    if not os.path.exists(p):
        return ""
    d = json.load(open(p, encoding="utf-8"))
    if isinstance(d, dict) and "text" in d:
        return d["text"]
    if isinstance(d, list):   # 段列表：拼全文
        return " ".join(seg.get("text", "") for seg in d if isinstance(seg, dict))
    return str(d)


def parse_letter(out):
    m = re.search(r"[ABCD]", str(out).strip().upper())
    return m.group(0) if m else "?"


def main():
    import pandas as pd
    import pyarrow.parquet as pq
    import vlm_analyzer as vlm

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

    model, processor = vlm.load_model(vlm.MODEL_ID)
    vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)

    from mlx_vlm import generate
    from mlx_vlm.prompt_utils import apply_chat_template as act

    first = not details
    for vid in videos:
        sub = qa[qa["videoID"] == vid]
        transcript = transcript_of(vid)[:2000]
        for _, q in sub.iterrows():
            if (vid, q["question_id"]) in done:
                continue
            opts = list(q["options"]) if isinstance(q["options"], list) else \
                [o.strip() for o in str(q["options"]).split("|")]
            head = (f"视频的语音转写（可能不完整、可能有错）：\n{transcript}\n\n"
                    if transcript else "")
            prompt = (head + f"{q['question']}\nOptions:\n"
                      + "\n".join(f"{'ABCD'[i]}. {o}" for i, o in enumerate(opts))
                      + "\n\nAnswer with the option letter only (A, B, C, or D).")
            try:
                t0 = time.time()
                p = act(processor, model.config, prompt,
                        add_generation_prompt=True, num_images=0)
                raw = generate(model, processor, prompt=p, max_tokens=8,
                               temperature=0.0, verbose=False)
                secs = round(time.time() - t0, 1)
                if first:
                    first = False
            except Exception:
                if first:
                    traceback.print_exc()
                    print("!! FIRST-QUESTION FAILURE", flush=True)
                    sys.exit(2)
                raw, secs = "ERR", None
            text = str(getattr(raw, "text", raw))
            pred = parse_letter(text)
            ok = pred == q["answer"]
            correct += int(ok)
            details.append({"videoID": vid, "question_id": q["question_id"],
                            "pred": pred, "answer": q["answer"], "correct": ok,
                            "secs": secs, "raw": text[:80]})
        json.dump({"details": details,
                   "summary": {"correct": correct, "total": len(details)}},
                  open(out_path, "w", encoding="utf-8"), indent=2,
                  ensure_ascii=False)
        print(f"[{videos.index(vid)+1}/{len(videos)}] {vid}: "
              f"{correct}/{len(details)} ({100*correct/max(1,len(details)):.1f}%)",
              flush=True)

    print(f"\n=== FINAL ===\ntext_only {correct}/{len(details)} = "
          f"{100*correct/max(1,len(details)):.1f}%", flush=True)
    print(f"DONE → {out_path}", flush=True)


if __name__ == "__main__":
    main()
