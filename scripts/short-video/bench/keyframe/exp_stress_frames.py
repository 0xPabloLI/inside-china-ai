#!/usr/bin/env python3
"""#391 — MiniCPM-o 4.5 8B（MLX 4-bit）单次推理帧数压测。

背景：喂法五臂在 64 帧上稳定运行（每题清 Metal 缓存后零 OOM）；"多少帧是本机
单次推理的上限"理论上不好算（KV/激活随图像 tile 数走），改为实测爬坡。

方法：取基准集最长视频（131s）按均匀 N 点抽帧，N 从低到高（96 → 128 → 160），
每档独立进程跑一次推理——OOM 在 C++ 层 terminate、进程内不可捕获，靠
"每档新进程 + 失败即停" 实现爬坡。产物按档追加 JSON 行。

Run: ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/exp_stress_frames.py <N>
"""

import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(WT_ROOT, "scripts", "short-video", "lib"))

VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme", "videos")
OUT = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results",
                   "stress_frames.jsonl")


def pick_longest_video():
    durs = json.load(open(os.path.join(WT_ROOT, ".scratch", "keyframe-bench",
                                       "video_durations.json")))
    v = max(durs, key=durs.get)
    return os.path.join(VM, f"{v}.mp4"), durs[v]


def extract_frames(video, n):
    import video_loader as vl
    dur = vl.probe_media(video)["duration_s"]
    step = dur / n
    ts = [round(step * (i + 0.5), 2) for i in range(n)]
    res = vl.load_video(video, {"frame_times": ts, "want_audio": False,
                                "cache_dir": os.path.join(
                                    WT_ROOT, ".scratch", "keyframe-bench",
                                    "loader_cache")})
    # res["frames"] = [{"t": ..., "path": ...}, ...]
    return [f["path"] for f in res["frames"]]


def main(n):
    import mlx.core as mx
    import vlm_analyzer as vlm

    video, dur = pick_longest_video()
    paths = extract_frames(video, n)
    assert len(paths) == n, f"expected {n} frames, got {len(paths)}"

    model, processor = vlm.load_model(vlm.MODEL_ID)
    vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)

    prompt = "<image>" * n + " 用一句话概括这个视频的内容。"
    t0 = time.time()
    text = vlm.generate_response(model, processor, engine=vlm.DEFAULT_ENGINE,
                                 image_paths=paths, prompt_text=prompt,
                                 max_tokens=128)
    wall = time.time() - t0
    try:
        peak = mx.metal.get_peak_memory() / 2**30
        active = mx.metal.get_active_memory() / 2**30
    except Exception:
        peak = active = float("nan")
    row = {"n_frames": n, "video_dur_s": round(dur, 1), "wall_s": round(wall, 1),
           "peak_mem_gb": round(peak, 2), "active_mem_gb": round(active, 2),
           "answer_head": text.strip().replace("\n", " ")[:60]}
    with open(OUT, "a") as f:
        f.write(json.dumps(row) + "\n")
    print(json.dumps(row), flush=True)


if __name__ == "__main__":
    main(int(sys.argv[1]))
