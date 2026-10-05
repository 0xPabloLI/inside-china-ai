#!/usr/bin/env python3
"""#391 — Qwen3-Omni 原生「看+听」交织臂（use_audio_in_video）。

对照设计：Omni 的**原生视频输入形态**——处理器把视频按 2s 块解码、帧组与音频
条按时间交错进 token 流（position_id_per_seconds=13 配 M-RoPE），音频条走音频塔。
与三个既有臂同题对比：Omni 听波形（33.3%≈乱猜）、Qwen3-VL 原生视频+转写（83.0）、
MiniCPM loader_block（83.0）。零转写注入——它「自己看自己听」。

通路（2026-10-05 修）：必须走 HF 风格 messages（视频作为 content 项），chat
template 才会渲染 <|vision_start|><|video_pad|><|vision_end|>；处理器在
use_audio_in_video=True 时把 video_pad 展开成 2s 块级「视+音」交错占位
（processing_qwen3_omni_moe.replace_multimodal_special_tokens）。
v1 用 mlx-vlm act() 的 num_audios 模板（不含视频占位符）→ 首题即
ValueError: Video features and video tokens do not match: tokens 0 / features 5580。

断点续传；首题失败响亮退出（模板/通路问题当环境错误处理）。
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
MAX_Q = int(os.environ.get("OMNI_MAX_Q", "0"))   # >0 = 冒烟测试：只跑前 N 题


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

    model, processor = load(MODEL_ID)

    first = not details   # 首题失败 = 环境问题，响亮退出而非静默 0 分
    stop = False
    n_new = 0
    for vid in videos:
        sub = qa[qa["videoID"] == vid]
        video = os.path.join(VM, "videos", f"{vid}.mp4")
        wav = os.path.join(AUDIO_DIR, f"{vid}.wav")
        if not os.path.exists(video) or not os.path.exists(wav):
            print(f"SKIP (no video/wav): {vid}", flush=True)
            continue
        cache = {}   # 每视频解码缓存：帧数组 / 音频波形（3 题复用）
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
                # v3 通路：mlx-vlm 的 process_inputs 只按签名转发 kwargs，而补丁版
                # 处理器签名是 (text, images, videos, audio, **kwargs) ⇒
                # use_audio_in_video 被静默丢弃（v2 音频占位符数=0，模型侧
                # audio_features 无处散播而崩）。改为直接调处理器拿展开后的
                # 交错占位序列，再用 input_ids 旁路把张量喂给 generate。
                if not cache:
                    from mlx_vlm.utils import load_audio, load_video, \
                        resolve_video_sampling
                    sampling = resolve_video_sampling(processor, {})
                    comp = getattr(processor, "video_processor", None)
                    fs = (getattr(comp, "sample_frames", None)
                          if getattr(comp, "sample_frames_in_loader", False)
                          else None)
                    arr, _meta = load_video(video, sampling, frame_sampler=fs)
                    cache["frames"] = arr
                    cache["wav"] = load_audio(wav, sr=16000)
                # 视频占位符由 chat template 渲染；use_audio_in_video 时处理器
                # 把 <|vision_start|><|video_pad|><|vision_end|> 展开成 2s 块级
                # 「视+音」交错占位（v1 的 act() 路径不含视频占位符，已废）。
                messages = [{"role": "user", "content": [
                    {"type": "video", "video": video},
                    {"type": "text", "text": prompt},
                ]}]
                p = processor.apply_chat_template(
                    messages, tokenize=False, add_generation_prompt=True)
                inputs = processor(text=[p], videos=[cache["frames"]],
                                   audio=[cache["wav"]],
                                   use_audio_in_video=True,
                                   return_tensors="mlx")
                gk = dict(inputs)
                ids = gk.pop("input_ids")
                amask = gk.pop("attention_mask", None)
                if first:
                    tid = processor.tokenizer.convert_tokens_to_ids(
                        "<|audio_pad|>")
                    print(f"[debug] audio_pad tokens="
                          f"{int((ids == tid).sum())}", flush=True)
                raw = generate(model, processor, prompt=p, input_ids=ids,
                               mask=amask, **gk,
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
            n_new += 1
            if MAX_Q and n_new >= MAX_Q:
                stop = True
                break
        json.dump({"model": MODEL_ID, "details": details,
                   "summary": {"correct": correct, "total": len(details)}},
                  open(out_path, "w", encoding="utf-8"), indent=2,
                  ensure_ascii=False)
        print(f"[{videos.index(vid)+1}/{len(videos)}] {vid}: "
              f"{correct}/{len(details)} ({100*correct/max(1,len(details)):.1f}%)",
              flush=True)
        if stop:
            break

    print(f"\n=== FINAL ===\nqwen_omni_video {correct}/{len(details)} = "
          f"{100*correct/max(1,len(details)):.1f}%", flush=True)
    print(f"DONE → {out_path}", flush=True)


if __name__ == "__main__":
    main()
