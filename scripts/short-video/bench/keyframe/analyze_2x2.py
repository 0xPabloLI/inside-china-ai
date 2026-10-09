#!/usr/bin/env python3
"""2×2 因子分析：把「像素预算」和「模型」两个变量的效应分开（Q41②）。

表结构（行 = 模型，列 = 视觉像素预算）：

                       Omni 预算 12,845,056        VL 预算 25,165,824
  Qwen3-VL        VL@Omni  = exp_..._omnibudget   VL@VL    = exp_..._medium_qwen_native_asr
  Qwen3-Omni      Omni@Omni = exp_..._fpsfix      Omni@VL  = exp_..._maxpix

读法：**行内差 = 预算效应，列内差 = 模型效应，两者之差 = 交互**。单跑一个格子
只能得到「变好/没变」，分不清是「预算普遍重要」还是「Omni 特别吃预算」；
2×2 才能分辨，而两种结论指向完全不同的生产决策（调参数 vs 换模型）。

为什么用配对检验：四格测的是同一批题（medium 28v/84q），题与题难度差异远大于
方法差异，非配对比较会把题目难度混进方法效应。四格交集才是可比集合——本次四格
覆盖 28/29 视频，交集 n=84。

判据：Bonferroni α=0.05/4=0.0125（四个对比）。交互用逐题 DiD 的 bootstrap CI——
逐题 DiD 取值在 {-2..2}，均值即 DiD，配对且不假设分布。

Run: cd WT && python3 scripts/short-video/bench/keyframe/analyze_2x2.py [base|ext]

`base` = medium 原档 28v/84q；`ext` = 扩样 53v/159q（**包含** base 的视频）。
ext 表功效近一倍——base 上四个对比无一过 Bonferroni、DiD 的 CI 跨 0，故 ext 是
判定用的那张表；base 保留作分层一致性检查（若两张表方向不一致，说明是子集效应）。
"""
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")

# (行, 列) -> (文件名, method 过滤 | None)。method=None = 单臂文件，无 method 字段。
TABLES = {
    "base": {
        ("VL", "VL"): ("exp_videomme_qa_medium_qwen_native_asr.json", "native_asr_asr"),
        ("VL", "OMNI"): ("exp_videomme_qa_medium_qwen_native_asr_omnibudget.json",
                         "native_asr_asr"),
        ("OMNI", "OMNI"): ("exp_videomme_qa_qwen_omni_video_medium_fpsfix.json", None),
        ("OMNI", "VL"): ("exp_videomme_qa_qwen_omni_video_medium_maxpix.json", None),
    },
    "ext": {
        ("VL", "VL"): ("exp_videomme_qa_medium_ext_qwen_native_asr.json",
                       "native_asr_asr"),
        ("VL", "OMNI"): ("exp_videomme_qa_medium_ext_qwen_native_asr_omnibudget.json",
                         "native_asr_asr"),
        ("OMNI", "OMNI"): ("exp_videomme_qa_qwen_omni_video_medium_ext_fpsfix.json",
                           None),
        ("OMNI", "VL"): ("exp_videomme_qa_qwen_omni_video_medium_ext_maxpix.json",
                         None),
    },
}

# 四个对比：(标签, A 格, B 格)；Δ = A − B
CONTRASTS = [
    ("VL   预算效应 (VL@VL − VL@Omni)", ("VL", "VL"), ("VL", "OMNI")),
    ("OMNI 预算效应 (Omni@VL − Omni@Omni)", ("OMNI", "VL"), ("OMNI", "OMNI")),
    ("VL预算下 模型效应 (VL@VL − Omni@VL)", ("VL", "VL"), ("OMNI", "VL")),
    ("Omni预算下 模型效应 (VL@Omni − Omni@Omni)", ("VL", "OMNI"), ("OMNI", "OMNI")),
]


def mcnemar_exact(b, c):
    """两尾精确 McNemar：只在不一致对上检验（b/c 是两种不一致方向的计数）。"""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    tail = sum(math.comb(n, i) for i in range(0, k + 1)) / (2 ** n)
    return min(1.0, 2 * tail)


def load_cell(fname, method):
    """→ {(videoID, question_id): correct}；文件缺失返回 None。"""
    path = os.path.join(RESULTS, fname)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    out = {}
    for row in data.get("details", []):
        if method is not None and row.get("method") != method:
            continue
        # 选帧失败/无帧的行是结果不是缺失：correct=False 已在行里，照收。
        out[(row["videoID"], row["question_id"])] = bool(row.get("correct"))
    return out


def paired(a, b):
    """→ (n, a_only, b_only) 在同一批题上。"""
    keys = sorted(set(a) & set(b))
    x = sum(1 for k in keys if a[k] and not b[k])
    y = sum(1 for k in keys if b[k] and not a[k])
    return len(keys), x, y


def boot_ci(vals, iters=10000, seed=20261008):
    """DiD 的 bootstrap 95% CI（重采样题目）。"""
    if not vals:
        return (float("nan"), float("nan"))
    rnd = random.Random(seed)
    n = len(vals)
    means = []
    for _ in range(iters):
        means.append(sum(vals[rnd.randrange(n)] for _ in range(n)) / n)
    means.sort()
    return means[int(0.025 * iters)], means[int(0.975 * iters)]


def main():
    table = sys.argv[1] if len(sys.argv) > 1 else "base"
    if table not in TABLES:
        raise SystemExit(f"unknown table {table!r}; expected one of {sorted(TABLES)}")
    cells, missing = {}, []
    for key, (fname, method) in TABLES[table].items():
        got = load_cell(fname, method)
        if got is None:
            missing.append((key, fname))
        else:
            cells[key] = got

    print(f"=== 表：{table} ===")
    if missing:
        print("=== 缺格子（还没跑完）===")
        for key, fname in missing:
            print(f"  {key[0]:5s} @ {key[1]:5s}  {fname}")
        print()

    rows_, cols_ = ["VL", "OMNI"], ["OMNI", "VL"]
    print("=== 2×2 正确率表 ===")
    print(f"{'':8s}" + "".join(
        f'{("Omni预算" if c == "OMNI" else "VL预算"):>18s}' for c in cols_))
    for r in rows_:
        line = f"{r:8s}"
        for c in cols_:
            if (r, c) in cells:
                d = cells[(r, c)]
                acc = sum(d.values()) / len(d) if d else 0
                line += f"{acc * 100:11.1f}% ({len(d):3d})"
            else:
                line += f"{'—':>18s}"
        print(line)
    print()

    print("=== 配对 McNemar（Bonferroni α=0.05/4=0.0125）===")
    for label, ka, kb in CONTRASTS:
        if ka not in cells or kb not in cells:
            print(f"  {label:46s}  SKIP（缺格子）")
            continue
        a, b = cells[ka], cells[kb]
        n, x, y = paired(a, b)
        keys = set(a) & set(b)
        aa = sum(v for k, v in a.items() if k in keys)
        bb = sum(v for k, v in b.items() if k in keys)
        p = mcnemar_exact(x, y)
        print(f"  {label:46s} n={n:3d}  Δ={(aa - bb) / n * 100:+5.1f}pp  "
              f"b={x:3d} c={y:3d}  p={p:.4f}  "
              f"{'显著' if p < 0.0125 else '不显著'}")
    print()

    print("=== 交互（DiD）===")
    ka, kb, kc, kd = (("VL", "VL"), ("VL", "OMNI"),
                      ("OMNI", "VL"), ("OMNI", "OMNI"))
    if all(k in cells for k in (ka, kb, kc, kd)):
        keys = sorted(set(cells[ka]) & set(cells[kb])
                      & set(cells[kc]) & set(cells[kd]))
        vals = [int(cells[ka][k]) - int(cells[kb][k])
                - int(cells[kc][k]) + int(cells[kd][k]) for k in keys]
        did = sum(vals) / len(vals) if vals else 0
        lo, hi = boot_ci(vals)
        print(f"  DiD = (VL@VL − VL@Omni) − (Omni@VL − Omni@Omni) = {did * 100:+.1f}pp")
        print(f"  逐题 bootstrap 95% CI = [{lo * 100:+.1f}, {hi * 100:+.1f}]pp   n={len(vals)}")
        if lo <= 0 <= hi:
            print("  ⇒ CI 跨 0：两模型的预算敏感度无显著差异。此时看行内差——"
                  "若两边都随预算变化 → 预算是主导变量，Omni 的短板是压缩率而非训练。")
        else:
            more = "Omni" if did > 0 else "VL"
            print(f"  ⇒ CI 不跨 0：{more} 对预算更敏感，"
                  "即模型效应与预算存在交互，不能只报单变量结论。")
    else:
        print("  SKIP（四个格子不齐）")
    print("\n注：n 为四格交集题数；小于单格题数说明各格覆盖的视频不同，"
          "差异部分不参与配对。")


if __name__ == "__main__":
    main()
