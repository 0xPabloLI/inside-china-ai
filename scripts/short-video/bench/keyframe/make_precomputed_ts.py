#!/usr/bin/env python3
"""#391 — 生成 VM_PRECOMPUTED 均匀时刻表（{videoID: {method: [ts,...]}}）。

背景（2026-10-05 事故）：medium 档时间表由临时命令生成，只写了 uniform_64/96
两个键、漏了 uniform_16；harness 当时对缺键静默 fallback（拿了 uniform_96 的
输入），臂报废。修复后（缺键 raise），本脚本把「生成」也变成可复现的入库
脚本——不再用丢失的 inline 命令。

时刻表公式 = bench_common.true_uniform_timestamps(video, 1.0, K)：
1fps 解码网格上 idx = round(i*(N-1)/(K-1))，ts = idx 秒（含端点）。

Run:
  ~/.venvs/mlx-vlm/bin/python make_precomputed_ts.py \
      [out=medium_budget_ts.json] [budgets=16,64,96] [subset=bench_subset_medium.csv]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bench_common as bc  # noqa: E402

WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
BENCH = os.path.join(WT_ROOT, ".scratch", "keyframe-bench")
VM = os.path.join(BENCH, "videomme")


def main():
    out_name = sys.argv[1] if len(sys.argv) > 1 else "medium_budget_ts.json"
    budgets = [int(b) for b in (sys.argv[2] if len(sys.argv) > 2
                                else "16,64,96").split(",")]
    subset = sys.argv[3] if len(sys.argv) > 3 else "bench_subset_medium.csv"
    out_path = os.path.join(BENCH, out_name)

    import csv
    with open(os.path.join(VM, subset), encoding="utf-8") as f:
        vids = sorted({r["videoID"] for r in csv.DictReader(f)})

    tt = {}
    if os.path.exists(out_path):
        tt.update(json.load(open(out_path, encoding="utf-8")))
        # 已有键一律保留不覆盖——已跑完的臂必须能对上它当时真实使用的时刻表
        # （历史 generator 语义可能与现公式有 ±1s 出入，重算校验会重复 ffmpeg
        # 计数，不做；需要核对时用 bc.true_uniform_timestamps 单独验证）。

    missing_disk = []
    for vid in vids:
        video = os.path.join(VM, "videos", f"{vid}.mp4")
        if not os.path.exists(video):
            missing_disk.append(vid)
            continue
        # 1fps 帧数 N 与档位无关，每个视频只数一次（28×3 档重复数曾超时 5 分钟）
        n = bc.count_frames_at_fps(video, 1.0)
        for K in budgets:
            k = min(K, n)
            if k <= 1:
                ts = [0.0] if k == 1 else []
            else:
                idxs = [round(i * (n - 1) / (k - 1)) for i in range(k)]
                ts = [round(i / 1.0, 3) for i in idxs]
            tt.setdefault(vid, {})[f"uniform_{K}"] = ts

    json.dump(tt, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    keys = sorted({k for m in tt.values() for k in m})
    print(f"{out_name}: {len(vids)} subset videos → {len(tt)} entries, "
          f"keys {keys}, missing-on-disk {missing_disk}")


if __name__ == "__main__":
    main()
