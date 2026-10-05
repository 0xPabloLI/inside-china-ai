#!/usr/bin/env python3
"""#391 — medium 档「选帧方法」时刻表预计算（喂给 QA 臂的 VM_PRECOMPUTED）。

动机（用户 2026-10-05 联评）：短档（16 帧）横评里非均匀选帧全部噪声，但
medium（4–17 min）从未测过非均匀方法——「长内容上一帧代表更长时间、选哪帧
更有讲究」的直觉需要一个 direct 检验。本脚本把选帧计算（1fps 解码 / 场景
检测 / SigLIP 嵌入）一次性做完；GPU 臂只负责推理，读预计算表。

产物（每文件一套方法键，K 即全局预算）：
  .scratch/keyframe-bench/medium_select_ts_k64.json
    {videoID: {"slice": [...], "maxinfo_siglip": [...], "kframes": [...]}}

QA 臂用法：
  VM_METHODS=slice,maxinfo_siglip,kframes VM_BUDGET=64 \\
  VM_PRECOMPUTED=.scratch/keyframe-bench/medium_select_ts_k64.json \\
  VM_SUBSET=bench_subset_medium.csv VM_OUT=exp_videomme_qa_medium_select_k64.json \\
  ~/.venvs/mlx-vlm/bin/python exp_videomme_qa.py

断点续传（逐视频落盘）；单方法异常打印 traceback 后该键留空——QA 侧
_precomputed 缺键 fail-fast，不会出现串臂（2026-10-05 u16 事故防线）。

Run: ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/make_selection_ts.py
"""

import json
import os
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
BENCH = os.path.join(WT_ROOT, ".scratch", "keyframe-bench")
VM = os.path.join(BENCH, "videomme")
sys.path.insert(0, HERE)

SUBSET = os.environ.get("SEL_SUBSET", "bench_subset_medium.csv")
BUDGET = int(os.environ.get("SEL_BUDGET", "64"))
METHODS = [m.strip() for m in os.environ.get(
    "SEL_METHODS", "slice,maxinfo_siglip,kframes").split(",") if m.strip()]


def select(name, video, budget):
    if name == "slice":
        import methods_bench3 as mb3
        return mb3.m_slice(video, budget=budget)
    if name == "kframes":
        import methods_bench3 as mb3
        return mb3.m_kframes(video, budget=budget)
    if name == "maxinfo_siglip":
        import exp_siglip as es
        return es.maxinfo_timestamps(video, budget)
    raise ValueError(name)


def main():
    import csv
    with open(os.path.join(VM, SUBSET), encoding="utf-8") as f:
        vids = sorted({r["videoID"] for r in csv.DictReader(f)})

    out_path = os.path.join(BENCH, f"medium_select_ts_k{BUDGET}.json")
    data = {}
    if os.path.exists(out_path):
        data = json.load(open(out_path, encoding="utf-8"))

    print(f"{len(vids)} subset videos, K={BUDGET}, methods={METHODS}",
          flush=True)
    for i, vid in enumerate(vids):
        video = os.path.join(VM, "videos", f"{vid}.mp4")
        if not os.path.exists(video):
            print(f"SKIP (not on disk): {vid}", flush=True)
            continue
        row = data.setdefault(vid, {})
        todo = [m for m in METHODS if m not in row]
        if not todo:
            continue
        for m in todo:
            t0 = time.time()
            try:
                ts = select(m, video, BUDGET)
                row[m] = sorted(round(float(t), 2) for t in ts)
            except Exception:
                traceback.print_exc()
                print(f"!! {vid} {m} FAILED — key left empty, QA side will "
                      f"fail-fast on it", flush=True)
            print(f"[{i + 1}/{len(vids)}] {vid} {m}: "
                  f"{len(row.get(m, []))} frames in {time.time() - t0:.1f}s",
                  flush=True)
        json.dump(data, open(out_path, "w", encoding="utf-8"),
                  ensure_ascii=False)

    json.dump(data, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    done = sum(1 for v in data.values() if all(m in v for m in METHODS))
    print(f"\n=== DONE === {done}/{len(vids)} videos have all {METHODS}\n"
          f"→ {out_path}", flush=True)


if __name__ == "__main__":
    main()
