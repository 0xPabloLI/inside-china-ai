#!/usr/bin/env python3
"""VL / Omni 输入侧探针 —— 只解码 + 过处理器，**不跑推理**。

为什么需要它：2026-10-09 翻遍 27 个结果文件，**没有一个记录喂了几帧**。
于是「Omni 又快又准度低」到底是「模型弱」还是「喂得少」，事后查不出来。
配置对比又显示两个模型的视觉塔与文本塔**完全同构**（depth 27 / hidden 1152
/ 16 heads / patch 16 / merge 2，文本塔 48 层 128 专家 8 激活），差异只在
Omni 多挂音频塔和 TTS 头 —— 所以「看图那部分」的差异只能来自输入侧。

本脚本对**同一批视频、同一个 prompt**分别走两条真实路径，打印：

  · 采样决议 fps / min_frames / max_frames（谁覆盖了谁）
  · 实际帧数、解码耗时
  · 处理后的 prompt token 数、video_grid_thw（网格形状）
  · 每帧平均像素（budget 是否在压分辨率）

跑一次约几分钟（只解码，不生成），能直接判定：
  帧数相同 → 差异在推理路径或 prompt 模板，去查 mlx-vlm
  帧数不同 → 差异是输入量，先对齐帧数再谈模型强弱

用法：
    ~/.venvs/mlx-vlm/bin/python probe_vl_omni_inputs.py [--videos N] [--out PATH]
"""

import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme")

VL_MODEL = os.environ.get("VL_MODEL",
                          os.path.expanduser("~/models/Qwen3-VL-30B-A3B-Instruct-4bit"))
OMNI_MODEL = os.environ.get("OMNI_MODEL",
                            "mlx-community/Qwen3-Omni-30B-A3B-Instruct-4bit")

# 探针用的固定 prompt —— 与 bench 同款（VM_MME 风格四选一）。
# 刻意不接转写：转写只改文本长度，会污染「视觉 token 数」这个主指标。
PROBE_PROMPT = (
    "What is the main subject of this video?\nOptions:\n"
    "A. A person speaking\nB. A landscape\n"
    "C. A vehicle\nD. An animal\n\n"
    "Answer with the option letter only (A, B, C, or D)."
)


def sample_videos(n):
    """从 bench 视频目录挑 n 个（按时长分散，避免全是最短的）。"""
    vdir = os.path.join(VM, "videos")
    if not os.path.isdir(vdir):
        raise SystemExit(f"视频目录不存在：{vdir}")
    vids = sorted(f[:-4] for f in os.listdir(vdir) if f.endswith(".mp4"))
    if not vids:
        raise SystemExit(f"视频目录为空：{vdir}")
    if n >= len(vids):
        return vids
    # 等距抽样：短/中/长都覆盖到，而不是取排序后的前 n 个
    step = len(vids) / n
    return [vids[int(i * step)] for i in range(n)]


def apply_max_pixels(processor, value, tag):
    """把两侧处理器的 max_pixels 强制到同一个值。

    2026-10-09 首跑发现：帧数完全相同（648 / 768），但视觉 token 数差 2 倍
    （VL 41472 vs Omni 19440）。根因是两个模型**自带的 max_pixels 默认值不同**
    ——VL 视频侧 25,165,824，Omni 12,845,056，正好 1.96×。

    这不是「模型强弱」，是分辨率预算差异：预算小 → 处理器把每帧缩得更小 →
    视觉 token 少 → 又快又省但细节少。要判定模型本身强弱，必须先把这一维
    拉平。本函数即该拉平动作，并显式打印改了什么（改了却静默不生效会让整个
    实验作废——沿用 OMNI_MAX_PIXELS 的同一教训）。
    """
    touched = []
    for owner_name, owner in (("processor", processor),
                              ("video_processor",
                               getattr(processor, "video_processor", None)),
                              ("image_processor",
                               getattr(processor, "image_processor", None))):
        if owner is None or not hasattr(owner, "max_pixels"):
            continue
        before = getattr(owner, "max_pixels")
        if before == value:
            continue
        setattr(owner, "max_pixels", value)
        touched.append(f"{owner_name}:{before}->{value}")
    print(f"   [{tag}] max_pixels → {value}：{'; '.join(touched) or '无需改动'}",
          flush=True)
    return touched


def probe_one(processor, video_path, tag, load_video, resolve_video_sampling):
    """解码 + 过处理器，返回这一侧的输入统计。不生成。"""
    out = {"tag": tag}
    t0 = time.time()
    sampling = resolve_video_sampling(processor, {})
    out["sampling"] = {"fps": sampling.fps, "min_frames": sampling.min_frames,
                       "max_frames": sampling.max_frames}
    comp = getattr(processor, "video_processor", None)
    fs = (getattr(comp, "sample_frames", None)
          if getattr(comp, "sample_frames_in_loader", False) else None)
    arr, meta = load_video(video_path, sampling, frame_sampler=fs)
    out["decode_s"] = round(time.time() - t0, 2)
    out["n_frames"] = int(len(arr))
    out["sampled_fps"] = round(float(meta.sampled_fps), 4)
    out["duration_s"] = round(float(getattr(meta, "duration", 0.0)), 2)

    # 过处理器 —— 用与 bench 完全相同的 messages 形状
    messages = [{"role": "user", "content": [
        {"type": "video", "video": video_path},
        {"type": "text", "text": PROBE_PROMPT},
    ]}]
    p = processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True)
    t1 = time.time()
    call = dict(text=[p], videos=[arr], fps=out["sampled_fps"],
                return_tensors="mlx")
    inputs = processor(**call)
    out["process_s"] = round(time.time() - t1, 2)
    ids = inputs.get("input_ids")
    if ids is not None:
        out["prompt_tokens"] = int(ids.shape[-1] if hasattr(ids, "shape")
                                   else len(ids))
    grid = inputs.get("video_grid_thw")
    if grid is not None:
        try:
            g = [[int(x) for x in row] for row in grid.tolist()]
        except Exception:
            g = str(grid)
        out["video_grid_thw"] = g
        # 网格 = (T 时间块, H 空间块, W 空间块)。视觉 token 数 = T*H*W
        try:
            out["vision_tokens"] = sum(r[0] * r[1] * r[2] for r in g)
        except Exception:
            pass
    # 每帧平均像素 —— budget 若在压分辨率，这个数会明显小
    if out.get("vision_tokens") and out["n_frames"]:
        try:
            merge = 2   # spatial_merge_size，两模型相同
            px = (out["vision_tokens"] / max(out["n_frames"] // 2, 1)
                  * (16 * merge) ** 2)
            out["est_px_per_frame"] = int(px)
        except Exception:
            pass
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos", type=int, default=6,
                    help="探针视频数（默认 6，够看出量级差异）")
    ap.add_argument("--match-budget", type=int, default=None,
                    help="把两侧 max_pixels 都强制到这个值（拉平分辨率预算；"
                         "不给则各用模型自带默认，用来暴露差异）")
    ap.add_argument("--out", default=os.path.join(
        WT_ROOT, ".scratch", "keyframe-bench", "results",
        "probe_vl_omni_inputs.json"))
    args = ap.parse_args()

    from mlx_vlm.utils import load_video, resolve_video_sampling
    from mlx_vlm import load as load_model

    vids = sample_videos(args.videos)
    print(f"探针视频 {len(vids)} 个：{', '.join(v[:11] for v in vids)}\n",
          flush=True)

    rows = []
    # 两侧分别加载 —— 一次只驻留一个模型，M2 32GB 装不下两个 30B
    for label, model_id, need_gen in (("VL", VL_MODEL, True),
                                      ("Omni", OMNI_MODEL, True)):
        print(f"── 加载 {label}：{model_id}", flush=True)
        model, processor = load_model(model_id)
        # 处理器上声明的预算（max_pixels）—— 这是分辨率维度的直接读数
        budgets = {}
        for owner_name, owner in (("processor", processor),
                                  ("video_processor",
                                   getattr(processor, "video_processor", None)),
                                  ("image_processor",
                                   getattr(processor, "image_processor", None))):
            if owner is not None and hasattr(owner, "max_pixels"):
                budgets[owner_name] = getattr(owner, "max_pixels")
        print(f"   max_pixels 自带声明：{budgets}", flush=True)
        if args.match_budget:
            apply_max_pixels(processor, args.match_budget, label)

        for vid in vids:
            vpath = os.path.join(VM, "videos", f"{vid}.mp4")
            try:
                r = probe_one(processor, vpath, label, load_video,
                              resolve_video_sampling)
            except Exception as e:
                r = {"tag": label, "error": f"{type(e).__name__}: {e}"}
            r["videoID"] = vid
            r["max_pixels"] = budgets
            rows.append(r)
            if "error" in r:
                print(f"   {vid[:11]:12s} 失败：{r['error']}", flush=True)
            else:
                print(f"   {vid[:11]:12s} 帧={r['n_frames']:4d} "
                      f"tok={r.get('prompt_tokens','?'):6} "
                      f"视觉tok={r.get('vision_tokens','?'):6} "
                      f"解码={r['decode_s']}s 处理={r['process_s']}s",
                      flush=True)
        del model, processor

    # ── 配对对比表 ──
    by_vid = {}
    for r in rows:
        by_vid.setdefault(r["videoID"], {})[r["tag"]] = r
    print("\n══ 配对对比（同视频同 prompt）══")
    print(f"{'视频':13s} {'VL帧':>6s} {'Omni帧':>7s} {'Δ帧':>6s} "
          f"{'VL tok':>8s} {'Omni tok':>9s} {'VL视觉tok':>10s} {'Omni视觉tok':>12s}")
    diffs = []
    for vid, d in by_vid.items():
        a, b = d.get("VL", {}), d.get("Omni", {})
        if "error" in a or "error" in b:
            continue
        df = b["n_frames"] - a["n_frames"]
        diffs.append(df)
        print(f"{vid[:11]:13s} {a['n_frames']:6d} {b['n_frames']:7d} {df:+6d} "
              f"{a.get('prompt_tokens','?'):>8} {b.get('prompt_tokens','?'):>9} "
              f"{a.get('vision_tokens','?'):>10} {b.get('vision_tokens','?'):>12}")
    if diffs:
        same = sum(1 for d in diffs if d == 0)
        print(f"\n帧数相同的视频：{same}/{len(diffs)}")
        print("→ 全部相同 = 输入量不是差异来源，去查推理路径/prompt 模板"
              if same == len(diffs) else
              "→ 帧数有差异 = 差异是输入量，先对齐帧数再谈模型强弱")

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"videos": vids, "match_budget": args.match_budget,
                   "rows": rows}, f, ensure_ascii=False, indent=2)
    print(f"\nDONE → {args.out}")


if __name__ == "__main__":
    main()
