#!/usr/bin/env python3
"""#391 — Qwen3-Omni 原生「看+听」交织臂（use_audio_in_video）+ 诊断变体。

v4（2026-10-06）：fps 元数据修复 + 三模式。
  修复：v3 直调处理器时未传 fps → 处理器缺省 1.0 → video_second_per_grid=2.0s，
  与实际采样率不符（Q35 定位：短档 2fps=1s/块被声明 2s；封顶后 0.73fps 被声明
  2s）。mlx-vlm 官方路径传真实采样率（utils.py:2513），v4 对齐：fps=meta.sampled_fps。
  OMNI_MODE=interleave（默认）| pure（无音频）| asr（无音频+我方转写文本，
  block 口径与 exp_videomme_qa.py 一致）。

对照设计：Omni 的原生视频输入形态——处理器把视频按 2s 块解码、帧组与音频条按
时间交错进 token 流（position_id_per_seconds=13 配 M-RoPE），音频条走音频塔。
与既有臂同题对比：Omni 听波形（33.3%≈乱猜）、Qwen3-VL 原生视频+转写（83.0）、
MiniCPM loader_block（83.0）。interleave 零转写注入——它「自己看自己听」。

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
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme")
AUDIO_DIR = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "audio")
sys.path.insert(0, HERE)
import bench_prompt as bq  # noqa: E402
import bench_provenance as bp  # noqa: E402

MODEL_ID = os.environ.get("OMNI_MODEL",
                          "mlx-community/Qwen3-Omni-30B-A3B-Instruct-4bit")
OUT_NAME = os.environ.get("OMNI_OUT",
                          "exp_videomme_qa_qwen_omni_video.json")
MAX_VIDEOS = int(os.environ.get("VM_MAX_VIDEOS", "100"))
SUBSET_NAME = os.environ.get("VM_SUBSET", "bench_subset_100.csv")
MAX_Q = int(os.environ.get("OMNI_MAX_Q", "0"))   # >0 = 冒烟测试：只跑前 N 题
MODE = os.environ.get("OMNI_MODE", "interleave").strip()  # interleave|pure|asr
# 像素预算覆盖（Q38④）：Omni 仓库自带 max_pixels=12,845,056，VL 是 25,165,824。
# 该值是**全视频总量**（qwen3_vl/processing_qwen3_vl._smart_resize_video：
# `t_bar*h_bar*w_bar > max_pixels` ⇒ 每帧像素 ≈ 预算/帧数），调它 = 调每帧清晰度。
# 0 = 用仓库原值。用途：分离「压缩率」与「训练差异」（Q37 的悬置问题）。
MAX_PIXELS = int(os.environ.get("OMNI_MAX_PIXELS", "0"))
ASR_MAX_CHARS = 2000
# 转写目录。默认 ctx-off（生产口径，#418）。此前按「subset 名里有没有 medium」
# 猜目录（medium→ctxoff，短档→ctx-on），是个脆弱启发式：换个 subset 文件名就会
# 静默换转写（2026-10-09 归正，Q41⑤）。要复现历史 ctx-on 结果必须显式传
# OMNI_ASR_DIR=.scratch/keyframe-bench/asr。
ASR_DIR = os.path.join(WT_ROOT, os.environ.get(
    "OMNI_ASR_DIR", ".scratch/keyframe-bench/asr_ctxoff"))


def transcript_text(vid):
    """与 VL 臂同款（ctx-off 转写，截断 2000 字符）——走共享模块。"""
    return bq.transcript_text(ASR_DIR, vid, "block", ASR_MAX_CHARS)


def check_asr_coverage(videos):
    """asr 模式的覆盖率门禁（实现已收敛到 bench_prompt，三处臂共用同一份）。

    本脚本原本会 `SKIP (no transcript)` 跳过缺转写的视频，结果是一个「安静地
    变小」的分母 —— 与 VL 臂静默用空转写同属「跑错目录无信号」。
    """
    bq.check_asr_coverage(ASR_DIR, videos, SUBSET_NAME, label="OMNI_ASR_DIR",
                          wt_root=WT_ROOT)


# 打分器与 VL 臂同款，否则「同题不同分」可能只是解析器不同。
parse_letter = bq.parse_lenient


def main():
    import pandas as pd
    import pyarrow.parquet as pq

    df = pq.read_table(os.path.join(VM, "test.parquet")).to_pandas()
    subset = pd.read_csv(os.path.join(VM, SUBSET_NAME))
    videos = sorted(set(subset["videoID"]) & set(df["videoID"]))[:MAX_VIDEOS]
    if MODE == "asr":
        check_asr_coverage(videos)
    qa = df[df["videoID"].isin(videos)]

    out_path = os.path.join(RESULTS, OUT_NAME)
    details = []
    if os.path.exists(out_path):
        details = json.load(open(out_path, encoding="utf-8")).get("details", [])
    done = {(r["videoID"], r["question_id"]) for r in details}
    correct = sum(r["correct"] for r in details)

    from mlx_vlm import load, generate

    model, processor = load(MODEL_ID)
    print(f"mode={MODE} subset={SUBSET_NAME} asr_dir={ASR_DIR}", flush=True)
    if MAX_PIXELS:
        # 两个子处理器都要改：视频走 video_processor，单图走 image_processor；
        # 只改一个会让同一次调用里的两条路径用不同预算。
        touched = []
        for owner in (processor, getattr(processor, "video_processor", None),
                      getattr(processor, "image_processor", None)):
            if owner is None or not hasattr(owner, "max_pixels"):
                continue
            before = getattr(owner, "max_pixels")
            if before == MAX_PIXELS:
                continue
            setattr(owner, "max_pixels", MAX_PIXELS)
            touched.append(f"{type(owner).__name__}:{before}->{MAX_PIXELS}")
        print(f"[max_pixels] {'; '.join(touched) or 'already set'}", flush=True)
        if not touched:
            raise SystemExit("OMNI_MAX_PIXELS 设了但没有任何处理器被改——"
                             "预算会静默用回原值，实验报废")

    first = not details   # 首题失败 = 环境问题，响亮退出而非静默 0 分
    # 溯源块只采集一次（处理器状态在跑之前就定了，逐视频重算是浪费）
    prov = bp.collect(processor, WT_ROOT, model=MODEL_ID, native_video=True,
                      asr_dir=ASR_DIR if MODE == "asr" else None,
                      asr_mode=MODE if MODE == "asr" else None,
                      max_tokens=8, temperature=0.0,
                      extra={"mode": MODE,
                             "max_pixels_override": MAX_PIXELS or None,
                             "subset": SUBSET_NAME})
    stop = False
    n_new = 0
    for vid in videos:
        sub = qa[qa["videoID"] == vid]
        video = os.path.join(VM, "videos", f"{vid}.mp4")
        wav = os.path.join(AUDIO_DIR, f"{vid}.wav")
        if not os.path.exists(video) or (MODE == "interleave"
                                         and not os.path.exists(wav)):
            print(f"SKIP (no video/wav): {vid}", flush=True)
            continue
        cache = {}   # 每视频解码缓存：帧数组 / 音频波形（3 题复用）
        if MODE == "asr":
            cache["tr"] = transcript_text(vid)
            if not cache["tr"]:
                print(f"SKIP (no transcript): {vid}", flush=True)
                continue
        for _, q in sub.iterrows():
            if (vid, q["question_id"]) in done:
                continue
            opts = list(q["options"]) if isinstance(q["options"], list) else \
                [o.strip() for o in str(q["options"]).split("|")]
            # prompt 拼装走共享模块 —— 与 VL 臂用同一份代码（mode: asr→block）
            prompt = bq.build_prompt(
                q["question"], opts,
                cache["tr"] if MODE == "asr" else "", "block")
            try:
                t0 = time.time()
                # v3 通路：mlx-vlm 的 process_inputs 只按签名转发 kwargs，而补丁版
                # 处理器签名是 (text, images, videos, audio, **kwargs) ⇒
                # use_audio_in_video 被静默丢弃（v2 音频占位符数=0，模型侧
                # audio_features 无处散播而崩）。改为直接调处理器拿展开后的
                # 交错占位序列，再用 input_ids 旁路把张量喂给 generate。
                if "frames" not in cache:
                    from mlx_vlm.utils import load_audio, load_video, \
                        resolve_video_sampling
                    sampling = resolve_video_sampling(processor, {})
                    comp = getattr(processor, "video_processor", None)
                    fs = (getattr(comp, "sample_frames", None)
                          if getattr(comp, "sample_frames_in_loader", False)
                          else None)
                    arr, meta = load_video(video, sampling, frame_sampler=fs)
                    cache["frames"] = arr
                    cache["meta"] = meta
                    if MODE == "interleave":
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
                # v4 修复：fps 必须传真实采样率（官方路径 utils.py:2513 同款），
                # 否则缺省 1.0 → video_second_per_grid=2.0s 与实际 2fps（或
                # 封顶后 0.73fps）不符——Q35 定位的时间轴错配。
                call = dict(text=[p], videos=[cache["frames"]],
                            fps=cache["meta"].sampled_fps,
                            return_tensors="mlx")
                if MODE == "interleave":
                    call.update(audio=[cache["wav"]], use_audio_in_video=True)
                inputs = processor(**call)
                gk = dict(inputs)
                ids = gk.pop("input_ids")
                amask = gk.pop("attention_mask", None)
                if first:
                    tid = processor.tokenizer.convert_tokens_to_ids(
                        "<|audio_pad|>")
                    print(f"[debug] mode={MODE} audio_pad tokens="
                          f"{int((ids == tid).sum())} "
                          f"fps={cache['meta'].sampled_fps:.2f}", flush=True)
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
                            "correct": ok, "secs": secs, "raw": text[:80],
                            # 原生视频输入由处理器自己采样，脚本侧拿不到逐视频帧数；
                            # 记 None 而不是省略键 —— 汇总见 provenance.frames_fed。
                            "n_frames": None})
            n_new += 1
            if MAX_Q and n_new >= MAX_Q:
                stop = True
                break
        json.dump({"model": MODEL_ID, "mode": MODE, "details": details,
                   # 输入侧事实（2026-10-09 补）：此前没有记录帧数/像素预算，
                   # 导致「Omni 又快又准度低」无法事后归因 —— 重跑探针才发现
                   # 两模型自带 max_pixels 相差 1.96×（VL 25,165,824 /
                   # Omni 12,845,056），视觉 token 数因此差 2 倍。
                   "provenance": prov,
                   "summary": {"correct": correct, "total": len(details)}},
                  open(out_path, "w", encoding="utf-8"), indent=2,
                  ensure_ascii=False)
        print(f"[{videos.index(vid)+1}/{len(videos)}] {vid}: "
              f"{correct}/{len(details)} ({100*correct/max(1,len(details)):.1f}%)",
              flush=True)
        if stop:
            break

    print(f"\n=== FINAL ({MODE}) ===\nqwen_omni_video {correct}/{len(details)} = "
          f"{100*correct/max(1,len(details)):.1f}%", flush=True)
    print(f"DONE → {out_path}", flush=True)


if __name__ == "__main__":
    main()
