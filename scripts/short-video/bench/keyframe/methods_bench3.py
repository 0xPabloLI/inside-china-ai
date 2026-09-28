#!/usr/bin/env python3
"""#391 methods bench batch 3 — tiered v3 flat-segment density floor + the four
community methods that were still untested in the reconciliation matrix
(bench-only, CPU-only, BUDGET=16, scored exactly like batch 1/2 via
methods_bench.score).

tiered family:
  tiered            v2 base (scene cuts + block-diff locals + 8s coverage floor)
  tiered_v2_hash    v2 + PySceneDetect HashDetector as second cut signal
  tiered_v3         v2 + L6 flat-segment density floor (handoff 2026-09-28:
                    the QA arm lost 59.4% vs uniform 66.7% while single-shot
                    clips ended at 4 frames of the 16-frame budget)
  tiered_v3_hash    v3 on the hash-augmented cut base

community methods (papers read in full before coding; deviations are stated in
each docstring rather than silently absorbed into "parity"):
  slice             SLICE, Han/Vu/Kim, IEEE Access 14:51576-51588 (2026),
                    DOI 10.1109/ACCESS.2026.3680314 — σ=ln(N) smoothing of a
                    per-frame score, rectified + energy-floor density, then
                    inverse-CDF chunk boundaries and one argmax per chunk
  infoshot          InfoShot, arXiv:2603.17374 — greedy balanced split of the
                    affinity graph into M=⌊K/2⌋ shots, then per shot a typical
                    (λ=0.7) and a unique (α=0.5) frame
  kframes           K-frames, arXiv:2510.13891 Appendix D.2 allocator with the
                    query-dependent priority weights dropped (w≡1), i.e. the
                    degenerate form — kept as the measurement of that
                    degeneracy, see uniform_16fps1_grid next to it
  kffocus           KFFocus, arXiv:2508.08989 — coded I-frames plus ⌊T_k/(δT)⌋
                    evenly spaced compensation frames per GoP gap, δ=5%
  uniform_16fps1_grid  plain linspace baseline (16 over the duration)

Run: ~/.video-tts-env/bin/python scripts/short-video/bench/keyframe/methods_bench3.py
"""

import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import exp_tiered as et  # noqa: E402
import methods_bench as mb  # noqa: E402
import methods_bench2 as mb2  # noqa: E402

BUDGET = 16
KFFOCUS_DELTA = 0.05          # KFFocus coverage ratio δ (paper Table: δ=5%)
INFOSHOT_LAMBDA = 0.7         # typical-frame blend weights, paper defaults
INFOSHOT_ALPHA = 0.5
INFOSHOT_STEP = 0.2           # candidate stream for the split objective (5fps)


def m_tiered_v3(video, slug=None):
    return et.tiered_timestamps(video, densify=True)[0]


def m_tiered_v3_hash(video, slug=None):
    import scenedetect as sd
    hash_cuts = [round(start.get_seconds(), 3)
                 for start, _e in sd.detect(str(video), sd.HashDetector())]
    scene = [round(t, 2)
             for t in bc.derive_scene_timestamps(video, "0.08", None)]
    scene_set = set(scene)
    merged, cluster = [], []
    for t in sorted(set(scene) | set(hash_cuts)):
        if cluster and t - cluster[-1] <= 0.6:
            cluster.append(t)
        else:
            if cluster:
                in_scene = [c for c in cluster if c in scene_set]
                merged.append(round(min(in_scene) if in_scene
                                    else min(cluster), 2))
            cluster = [t]
    if cluster:
        in_scene = [c for c in cluster if c in scene_set]
        merged.append(round(min(in_scene) if in_scene else min(cluster), 2))
    return et.tiered_timestamps(
        video, densify=True,
        extra_cuts=[t for t in merged if t not in scene_set])[0]


def _embed_stream(video):
    frames = mb2.decode_embeddings(video)
    if not frames:
        return [], np.zeros((0, mb2.EMB_SIZE ** 2), dtype=np.float32)
    return [t for t, _ in frames], np.stack([v for _, v in frames])


def _pair_sum(a, idx):
    """Sum of the affinity over unordered pairs inside `idx`."""
    sub = a[np.ix_(idx, idx)]
    return float((sub.sum() - np.trace(sub)) / 2.0)


def m_slice(video, slug=None):
    """SLICE (IEEE Access 2026) steps 3-8 verbatim; step 2 substituted.

    The paper's raw score S_t is a BLIP ITM relevance against the question, and
    #391 keeps query out of the extraction layer, so S_t becomes per-frame
    novelty 1-cos(emb_t, emb_{t-1}) on this harness' 1fps grayscale embedding.
    What is under test is therefore SLICE's allocator (σ=ln(N) smoothing, the
    +μ energy floor, inverse-CDF chunks, one argmax per chunk) — not its
    relevance model, and the numbers must be read that way.
    """
    ts, vecs = _embed_stream(video)
    n = len(ts)
    if n == 0:
        return []
    if n == 1:
        return [ts[0]]
    s = np.concatenate([[0.0], 1.0 - np.sum(vecs[1:] * vecs[:-1], axis=1)])
    sigma = math.log(n)
    r = max(1, int(math.ceil(3 * sigma)))
    x = np.arange(-r, r + 1, dtype=float)
    kern = np.exp(-0.5 * (x / sigma) ** 2)
    kern /= kern.sum()
    sm = np.convolve(np.pad(s, r, mode="edge"), kern, mode="valid")
    rect = np.maximum(sm, 0.0)
    p = rect + rect.sum() / n          # p_robust = rectified + energy floor μ
    cdf = np.cumsum(p)
    k = min(BUDGET, n)
    inner = [int(np.searchsorted(cdf, (j / k) * cdf[-1])) for j in range(1, k)]
    edges = [0] + [c for c in inner if 0 < c < n] + [n]
    picks = [int(i + np.argmax(s[i:j])) for i, j in zip(edges, edges[1:])
             if j > i]
    return sorted(ts[i] for i in set(picks))


def m_infoshot(video, slug=None):
    """InfoShot (arXiv 2603.17374) — balanced-split shot segmentation, then a
    typical + a unique frame per shot.

    Stated deviations: the paper scores ResNet-50 features at 10fps; we reuse
    this harness' zero-model-cost grayscale embedding at 5fps (INFOSHOT_STEP),
    which is the candidate resolution the split objective actually needs — at
    1fps a 30s clip has 30 candidates and cannot host M=⌊K/2⌋=8 shots at all.
    The window k is scaled per segment (the paper scales 3-15 frames by segment
    length at 10fps ⇒ ~0.3-1.5s of content), and λ=0.7 / α=0.5 / neighbourhood
    k=1 are the paper defaults. The author repo mengyu02/InfoShot is a
    README-only stub, so every constant comes from the paper text.
    """
    frames = mb2.decode_embeddings(video, step=INFOSHOT_STEP)
    if not frames:
        return []
    ts = [t for t, _ in frames]
    vecs = np.stack([v for _, v in frames])
    n = len(ts)
    if n <= 2:
        return sorted(ts)
    a = vecs @ vecs.T                  # embeddings are L2-normalized → cosine
    m = max(1, min(BUDGET // 2, n // 4))
    segs = [(0, n)]
    while len(segs) < m:
        best = None
        for lo, hi in segs:
            k = max(1, min(15, round((hi - lo) / 10)))
            for t in range(lo + k, hi - k + 1):
                minus = list(range(t - k, t))
                plus = list(range(t, t + k))
                b = 0.5 * (_pair_sum(a, minus) + _pair_sum(a, plus)) \
                    - float(a[np.ix_(plus, minus)].sum())
                if best is None or b > best[0]:
                    best = (b, lo, hi, t)
        if best is None:
            break
        _b, lo, hi, t = best
        segs.remove((lo, hi))
        segs += [(lo, t), (t, hi)]
    picks = []
    for lo, hi in sorted(segs):
        idx = list(range(lo, hi))
        if not idx:
            continue
        if len(idx) == 1:
            picks.append(idx[0])
            continue
        sub = a[np.ix_(idx, idx)]
        g = (sub.sum(axis=1) - np.diag(sub)) / max(len(idx) - 1, 1)  # mean_{j≠i}
        v = []                                          # volatility, k=1
        for i in idx:
            nb = [j for j in (i - 1, i + 1) if lo <= j < hi]
            v.append(1.0 - float(a[i, nb].mean()) if nb else 0.0)
        v = np.array(v)
        nm = lambda q: (q - q.min()) / (q.max() - q.min() + 1e-9)
        gh, vh = nm(g), nm(v)
        com = int(np.argmax(INFOSHOT_LAMBDA * gh - (1 - INFOSHOT_LAMBDA) * vh))
        picks.append(idx[com])
        rest = [i for i in range(len(idx)) if i != com]
        if rest:
            sc = INFOSHOT_ALPHA * (1 - gh) + (1 - INFOSHOT_ALPHA) * vh
            picks.append(idx[max(rest, key=lambda i: sc[i])])
    return sorted(ts[i] for i in sorted(set(picks)))


def m_kframes(video, slug=None):
    """K-frames (arXiv 2510.13891) Appendix D.2 allocator, query-free by
    deletion: the P1/P2 clip priorities come from Gemini captions plus LLM
    relevance scoring, so w≡1 and k_j ∝ ℓ_j with equal spacing inside each clip.
    That is the degenerate form the paper itself flags for global questions —
    it is kept in the matrix to MEASURE the identity against
    uniform_16fps1_grid, not to claim a distinct selector.
    """
    duration = bc.asset_duration(video)
    cuts = [t for t in sorted({round(t, 2) for t in
                               bc.derive_scene_timestamps(video, "0.08", None)})
            if 0 < t < duration]
    edges = [0.0] + cuts + [duration]
    segs = [(x, y) for x, y in zip(edges, edges[1:]) if y - x > 1e-6]
    if not segs:
        return [0.0]
    lens = np.array([y - x for x, y in segs])
    k = min(BUDGET, len(lens) * BUDGET)
    raw = lens / lens.sum() * k
    alloc = np.floor(raw).astype(int)
    for i in np.argsort(-(raw - alloc))[:k - alloc.sum()]:  # largest remainder
        alloc[i] += 1
    picks = []
    for (x, y), c in zip(segs, alloc):
        picks += [float(round(x + (y - x) * (j + 0.5) / c, 2)) for j in range(c)]
    return sorted(picks)


def m_kffocus(video, slug=None):
    """KFFocus (arXiv 2508.08989) frame layer: coded I-frames plus ⌊T_k/(δT)⌋
    evenly spaced compensation frames inside every gap (δ=5% of the duration),
    with the head and tail gaps counted too — the paper lists only adjacent
    I-frames, which would leave the run up to the first I-frame uncovered.
    Its other half (CLIP top-α token condensation, d1=2/d2=4) is token-budget
    work, not frame choice, so it is out of scope for this harness.
    """
    duration = bc.asset_duration(video)
    iframe = sorted({round(t, 2) for t in
                     bc.derive_iframe_timestamps(video, None, "first")
                     if 0 <= t <= duration})
    if not iframe:
        return [0.0]
    if iframe[0] > 0.05:
        iframe.insert(0, 0.0)
    out = list(iframe)
    step = KFFOCUS_DELTA * duration
    for a, b in zip(iframe, iframe[1:] + [duration]):
        g = b - a
        if g <= step:
            continue
        n = int(g // step)
        out += [round(a + g * (j + 1) / (n + 1), 2) for j in range(n)]
    return sorted(set(t for t in out if 0 <= t <= duration))


METHODS = [
    ("tiered", lambda v, s: et.tiered_timestamps(v)[0]),
    ("tiered_v2_hash", mb2.m_tiered_v2),
    ("tiered_v3", m_tiered_v3),
    ("tiered_v3_hash", m_tiered_v3_hash),
    ("slice", m_slice),
    ("infoshot", m_infoshot),
    ("kframes", m_kframes),
    ("kffocus", m_kffocus),
    ("uniform_16fps1_grid", lambda v, s: [
        round(i * (bc.asset_duration(v) - 0.05) / (BUDGET - 1), 2)
        for i in range(BUDGET)]),
]


def main():
    import warnings
    warnings.filterwarnings("ignore")
    only = [m.strip() for m in os.environ.get("MB3_METHODS", "").split(",")
            if m.strip()]
    assets_only = [a.strip() for a in os.environ.get("MB3_ASSETS", "").split(",")
                   if a.strip()]
    methods = [mv for mv in METHODS if not only or mv[0] in only]
    rows = []
    for slug, video in bc.ASSETS.items():
        if assets_only and slug not in assets_only:
            continue
        if not os.path.exists(video):
            print(f"SKIP (missing asset): {slug}")
            continue
        duration = bc.asset_duration(video)
        intervals = bc.gt_scene_intervals(slug, duration)
        print(f"\n===== {slug} ({duration:.2f}s) =====", flush=True)
        print(f"{'method':16s} {'n':>3s} {'recall':>7s} {'gap':>6s} "
              f"{'dup':>4s} {'cov':>6s} {'bal':>6s} {'info':>6s}  ts")
        for name, fn in methods:
            try:
                ts = fn(video, slug)
            except Exception as e:
                print(f"{name:16s}  FAILED: {type(e).__name__}: {str(e)[:80]}")
                rows.append({"asset": slug, "method": name,
                             "error": f"{type(e).__name__}: {str(e)[:200]}"})
                continue
            r = mb.score(video, slug, name, ts, duration, intervals)
            rows.append(r)
            print(f"{name:16s} {r['frames']:3d} {str(r['recall']):>7s} "
                  f"{r['maxGap']:6.2f} {r['nearDupPairs']:4d} "
                  f"{str(r['coverage']):>6s} {str(r['balance']):>6s} "
                  f"{str(r['informativeShare']):>6s}  {r['ts']}", flush=True)

    out = os.path.join(RESULTS, os.environ.get("MB3_OUT", "methods_bench3.json"))
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    print(f"\nDONE → {out}")


if __name__ == "__main__":
    main()
