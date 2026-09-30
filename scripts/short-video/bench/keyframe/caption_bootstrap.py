#!/usr/bin/env python3
"""#391 — 两个描述臂的**配对** bootstrap（同 462 事件，重采样事件做差）。

为什么需要：§17.4 的控制组（限 ≤20 词）与无限制臂只差长度口径，四个指标里
METEOR 降、ROUGE-L/CIDEr 升——点估计看不出这是真差还是重采样噪声。按本仓
「先配对检验再声称增益」的惯例，这里对同一批事件做配对 bootstrap（重采样
事件索引，两臂用同一索引集），报 Δ 的 95% 分位区间与双侧 p。

口径说明：
  - METEOR：pycocoevalcap 的语料分就是逐事件分的均值（jar 一次调用返回每段
    分数），故重采样时直接对逐事件分求均值；每次重采样重开 jar 不可行
    （462 段 ≈ 6s × B）。
  - ROUGE-L：语料分同样是逐事件分均值，等价。
  - CIDEr（σ=6 与 no-pend）与 BLEU-4：语料分不是逐事件分均值（语料级 df /
    n-gram 计数聚合），故每个重采样**重算语料分**（单次 ~0.01s，可负担）。

Run: ~/.venvs/caption-metrics/bin/python scripts/short-video/bench/keyframe/caption_bootstrap.py \
       results/caption_anetc_v2.json results/caption_anetc_v2_short.json
"""

import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
B = int(os.environ.get("BOOT_N", "2000"))
SEED = int(os.environ.get("BOOT_SEED", "20260930"))


def load(path):
    with open(path, encoding="utf-8") as fh:
        rows = [r for r in json.load(fh) if r.get("pred")]
    return {f"{r['videoID']}#{r['eventIdx']}": r for r in rows}


class MeteorJar:
    """Persistent `meteor-1.5.jar -stdio` driver, stats-level.

    Why not `pycocoevalcap.meteor.Meteor.compute_score` per replicate: that
    re-sends every hypothesis through the jar's SCORE parser (~14 s per 462
    segments), so a 400-replicate bootstrap would take ~1.5 h. The jar's EVAL
    step aggregates *stat vectors*, so scoring each pair once and resampling
    the vectors reproduces the corpus score at ~1 s per replicate.

    Measured protocol (2026-09-30): `SCORE ||| ref ||| hyp` → one stat line;
    `EVAL ||| stat ||| …` → one score per segment, then the corpus score.
    Verified equal to `compute_score`'s corpus value on the same pairs.
    """

    JAR_DIR = os.path.dirname(__import__("pycocoevalcap.meteor.meteor",
                                         fromlist=["meteor"]).__file__)

    def __init__(self):
        import subprocess
        self.proc = subprocess.Popen(
            ["java", "-jar", "-Xmx2G", "meteor-1.5.jar", "-", "-", "-stdio",
             "-l", "en", "-norm"],
            cwd=self.JAR_DIR, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE)

    def _write(self, line):
        self.proc.stdin.write((line + "\n").encode())
        self.proc.stdin.flush()

    def _read(self):
        return self.proc.stdout.readline().decode().strip()

    def stats(self, pairs):
        out = []
        for hyp, ref in pairs:
            hyp = hyp.replace("|||", "").replace("  ", " ")
            self._write(" ||| ".join(("SCORE", ref, hyp)))
            out.append(self._read())
        return out

    def corpus(self, stats_list):
        self._write("EVAL" + "".join(" ||| " + s for s in stats_list))
        for _ in range(len(stats_list)):
            self._read()
        return float(self._read())

    def close(self):
        try:
            self.proc.kill()
        except Exception:
            pass


def corpus_scores(rows_by_key, keys):
    """Corpus CIDEr (both calibers), BLEU-4 and ROUGE-L over a key multiset.

    METEOR is not here: it needs the Java jar (see `MeteorJar`). ROUGE-L's
    corpus score is the mean of per-pair scores, but it is recomputed rather
    than averaged so every metric in the table is read the same way.
    """
    from pycocoevalcap.bleu.bleu import Bleu
    from pycocoevalcap.cider.cider import Cider
    from pycocoevalcap.rouge.rouge import Rouge
    gts, res = {}, {}
    for i, k in enumerate(keys):
        r = rows_by_key[k]
        gts[str(i)] = [r["ref"]]
        res[str(i)] = [r["pred"]]
    out = {}
    for name, sc in (("cider_sigma6", Cider()), ("cider_no_pend", Cider(n=4, sigma=1e9)),
                     ("rouge_l", Rouge())):
        val, _ = sc.compute_score(gts, res)
        out[name] = float(val)
    val, _ = Bleu(4).compute_score(gts, res)
    out["bleu4"] = float(val[3])
    return out


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    base_path, capped_path = sys.argv[1], sys.argv[2]
    for name, p in (("base", base_path), ("capped", capped_path)):
        if not os.path.isabs(p):
            rel = p[len("results/"):] if p.startswith("results/") else p
            if name == "base":
                base_path = os.path.join(RESULTS, rel)
            else:
                capped_path = os.path.join(RESULTS, rel)
    base, capped = load(base_path), load(capped_path)
    keys = sorted(set(base) & set(capped))
    print(f"事件配对 n={len(keys)}（{os.path.basename(base_path)} vs "
          f"{os.path.basename(capped_path)}）")

    jar = MeteorJar()
    base_stats = jar.stats([(base[k]["pred"], base[k]["ref"]) for k in keys])
    capped_stats = jar.stats([(capped[k]["pred"], capped[k]["ref"]) for k in keys])
    base_cs = corpus_scores(base, keys)
    capped_cs = corpus_scores(capped, keys)
    base_cs["meteor"] = jar.corpus(base_stats)
    capped_cs["meteor"] = jar.corpus(capped_stats)
    print("语料分：", " | ".join(f"{k}={v:.4f}" for k, v in base_cs.items()),
          "||", " | ".join(f"{k}={v:.4f}" for k, v in capped_cs.items()))

    rng = np.random.default_rng(SEED)
    idx = rng.integers(0, len(keys), size=(B, len(keys)))
    deltas = {k: [] for k in ("cider_sigma6", "cider_no_pend", "bleu4",
                              "meteor", "rouge_l")}
    for b in range(B):
        sel = [keys[i] for i in idx[b]]
        cs_b = corpus_scores(base, sel)
        cs_c = corpus_scores(capped, sel)
        for k in ("cider_sigma6", "cider_no_pend", "bleu4", "rouge_l"):
            deltas[k].append(cs_c[k] - cs_b[k])
        sb = [base_stats[i] for i in idx[b]]
        sc_ = [capped_stats[i] for i in idx[b]]
        deltas["meteor"].append(jar.corpus(sc_) - jar.corpus(sb))
    jar.close()

    out = {"artifact_base": os.path.basename(base_path),
           "artifact_capped": os.path.basename(capped_path),
           "events": len(keys), "bootstrap_n": B, "seed": SEED,
           "note": ("配对 bootstrap：同一事件索引集重采样，Δ = 限≤20词臂 − 无限制臂。"
                    "五个指标全部按语料分口径重算（METEOR 走 jar 的 EVAL 聚合，"
                    "不重发 SCORE；CIDEr/BLEU 每次重采样重算语料分；ROUGE-L 语料分"
                    "定义即逐事件分均值）。"),
           "metrics": {}}
    print(f"\n{'指标':14s} {'无限制':>8s} {'≤20词':>8s} {'Δ':>9s} "
          f"{'95% CI':>20s} {'p':>7s}")
    for k in ("cider_sigma6", "cider_no_pend", "bleu4", "meteor", "rouge_l"):
        d = np.asarray(deltas[k])
        lo, hi = np.percentile(d, [2.5, 97.5])
        p = 2 * min(float((d <= 0).mean()), float((d >= 0).mean()))
        p = min(1.0, p)
        base_v = base_cs.get(k)
        capped_v = capped_cs.get(k)
        out["metrics"][k] = {"base": round(base_v, 4), "capped": round(capped_v, 4),
                             "delta": round(capped_v - base_v, 4),
                             "ci95": [round(float(lo), 4), round(float(hi), 4)],
                             "p_two_sided": round(p, 4),
                             "boot_mean_delta": round(float(d.mean()), 4)}
        print(f"{k:14s} {base_v:8.4f} {capped_v:8.4f} {capped_v - base_v:+9.4f} "
              f"[{lo:+.4f}, {hi:+.4f}] {p:7.4f}")
    dst = os.path.join(RESULTS, "caption_bootstrap.json")
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(f"\n→ {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
