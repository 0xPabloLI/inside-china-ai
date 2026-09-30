#!/usr/bin/env python3
"""#391 — 用标准实现给 ActivityNet 描述打分（pycocoevalcap）。

指标按标准套件报：CIDEr（主）、BLEU-4、METEOR、ROUGE-L。SPICE 需要 Java 且视频
描述领域几乎不报，默认不算（--with-spice 可开）。

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
    for name, sc in [("CIDEr", Cider()), ("BLEU-4", Bleu(4)),
                     ("METEOR", Meteor()), ("ROUGE-L", Rouge())]:
        score, _ = sc.compute_score(gts, res)
        val = score[3] if isinstance(score, list) else score   # BLEU-4 取 n=4
        print(f"{name:8s} {val:.4f}")


if __name__ == "__main__":
    main()
