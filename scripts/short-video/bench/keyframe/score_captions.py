#!/usr/bin/env python3
"""#391 — 用标准实现给 ActivityNet 描述打分（pycocoevalcap）。

指标按标准套件报：CIDEr、BLEU-4、METEOR、ROUGE-L。SPICE 需要 Java 且视频
描述领域几乎不报，默认不算（--with-spice 可开）。

**口径裁决（用户 2026-09-30）**：主报 **METEOR / ROUGE-L**（对输出长度较不敏感）。
CIDEr 的标准 σ=6 高斯长度惩罚在本管线上会把分数压到去惩罚值的 ~4%（预测 mean
41.9 词 vs 参考 13.8 词，比值 3.04×），所以标准 CIDEr **只作脚注**，另报同一套
算法关掉惩罚（σ→∞，即官方 no-pend 口径）的 CIDEr 作「内容重叠」诊断。
不为了对齐参考长度去压缩生成——「把内容描述清楚」要的是信息量。

结果同时写成 JSON（caption_metrics_<输入名>.json），结论只认落盘产物、不认终端输出。

跑在**独立 venv**（~/.venvs/caption-metrics）里，避免把评分依赖装进模型环境。

Run: ~/.venvs/caption-metrics/bin/python scripts/short-video/bench/keyframe/score_captions.py
"""

import json
import os
import sys

ROWS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..",
                    "..", ".scratch", "keyframe-bench", "results",
                    "caption_anetc.json")
ROWS = os.path.abspath(ROWS)


def main():
    from pycocoevalcap.cider.cider import Cider
    from pycocoevalcap.bleu.bleu import Bleu
    from pycocoevalcap.meteor.meteor import Meteor
    from pycocoevalcap.rouge.rouge import Rouge
    path = ROWS if len(sys.argv) < 2 else sys.argv[1]
    all_rows = json.load(open(path, encoding="utf-8"))
    rows = [r for r in all_rows if r.get("pred")]
    empty = len(all_rows) - len(rows)
    gts, res = {}, {}
    for r in rows:
        k = f"{r['videoID']}#{r['eventIdx']}"
        gts[k] = [r["ref"]]
        res[k] = [r["pred"]]
    print(f"事件数 {len(rows)}（空输出跳过 {empty}）；参考/预测各 1 条（per-event 协议）")
    pw = [len(r["pred"].split()) for r in rows]
    rw = [len(r["ref"].split()) for r in rows]
    len_ratio = sum(pw) / sum(rw)
    print(f"长度：预测 mean {sum(pw)/len(pw):.1f} 词 ｜ 参考 mean {sum(rw)/len(rw):.1f} 词"
          f" ｜ 总长比 {len_ratio:.2f}×")
    out = {"artifact": os.path.basename(path), "events": len(rows),
           "skipped_empty": empty,
           "pred_words_mean": round(sum(pw) / len(pw), 1),
           "ref_words_mean": round(sum(rw) / len(rw), 1),
           "length_ratio": round(len_ratio, 2),
           "primary": ["meteor", "rouge_l"],
           "note": ("用户裁决 2026-09-30：主报 METEOR/ROUGE-L；cider_sigma6 只作脚注"
                    "（长度惩罚把分数压到 cider_no_pend 的个位数百分比），cider_no_pend 作"
                    "内容重叠诊断。不为对齐参考长度而压缩生成。")}
    for name, key, sc in [("CIDEr(σ=6 脚注)", "cider_sigma6", Cider()),
                          ("CIDEr(no-pend)", "cider_no_pend", Cider(n=4, sigma=1e9)),
                          ("BLEU-4", "bleu4", Bleu(4)),
                          ("METEOR", "meteor", Meteor()),
                          ("ROUGE-L", "rouge_l", Rouge())]:
        score, _ = sc.compute_score(gts, res)
        val = score[3] if isinstance(score, list) else score   # BLEU-4 取 n=4
        out[key] = round(float(val), 4)
        print(f"{name:18s} {val:.4f}")
    dst = os.path.join(os.path.dirname(os.path.abspath(path)),
                       f"caption_metrics_{os.path.splitext(os.path.basename(path))[0]}.json")
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    print(f"→ {dst}", flush=True)


if __name__ == "__main__":
    main()
