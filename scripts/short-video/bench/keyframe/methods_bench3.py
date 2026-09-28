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
import subprocess
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


def m_slice(video, slug=None, budget=BUDGET):
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
    k = min(budget, n)
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
    # I-frames plus gap fills can exceed the budget on a long clip; honour the
    # method contract explicitly (behaviour-identical: score() subsamples with
    # the same helper).
    return sorted(mb.subsample(sorted(set(t for t in out if 0 <= t <= duration)),
                               budget))


def _decode_rgb224(video, step):
    """RGB 224x224 candidate stream + its luma, [(t, rgb, gray)]."""
    proc = subprocess.run(
        [bc.FFMPEG, "-nostdin", "-i", str(video),
         "-vf", f"fps={1 / step},scale=224:224", "-an", "-sn", "-dn",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
        capture_output=True, timeout=300)
    buf = np.frombuffer(proc.stdout, dtype=np.uint8)
    n = len(buf) // (224 * 224 * 3)
    rgb = buf[:n * 224 * 224 * 3].reshape(n, 224, 224, 3)
    gray = (rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587
            + rgb[..., 2] * 0.114).astype(np.uint8)
    return [(round(i * step, 3), rgb[i], gray[i]) for i in range(n)]


_MODELS = {}


def _resnet(name, pooled):
    """torchvision ResNet with ImageNet weights from the local cache (both
    files were fetched once into ~/.cache/torch/hub/checkpoints; ResNet-18's
    has the exact torchvision key set, verified 0 missing / 0 unexpected).
    pooled=False also strips avgpool → (N, C, 7, 7) maps for LVNet's TSC."""
    import torch
    import torchvision
    key = (name, pooled)
    if key not in _MODELS:
        w = {"resnet18": torchvision.models.ResNet18_Weights.IMAGENET1K_V1,
             "resnet50": torchvision.models.ResNet50_Weights.IMAGENET1K_V2}[name]
        m = getattr(torchvision.models, name)(weights=w)
        m.fc = torch.nn.Identity()
        if not pooled:
            m.avgpool = torch.nn.Identity()
        m.eval()
        _MODELS[key] = m
    return _MODELS[key]


def _resnet_forward(model, rgb_frames):
    import torch
    x = torch.from_numpy(np.stack(rgb_frames)).float().permute(0, 3, 1, 2) / 255.0
    x = (x - torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)) \
        / torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)
    with torch.no_grad():
        return model(x).numpy()


def _norm01(v):
    lo, hi = float(np.min(v)), float(np.max(v))
    return (v - lo) / (hi - lo + 1e-9)


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


_TAKSF_STEP = 0.2      # 5fps candidate stream, see m_taksf
_LVNET_STEP = 1.0


def m_taksf(video, slug=None, budget=BUDGET):
    """TAKSF — Task-Driven Dual-Path Keyframe Selection, IEEE Access
    14:83838-83851 (2026), DOI 10.1109/ACCESS.2026.3698553. No official code.

    Steps 1-7 implemented as published: grayscale motion
    D_i = ||f_i - f_{i-1}||_2 with the adaptive gate T = μ(D) + α·σ(D), α=1.0;
    S_vis = sigmoid(D̂_i + φ̂(f_i)) (φ = saliency, both min-maxed first);
    ResNet-50 2048-d features; k-means with C = max(min(⌈N/θ⌉, C_max), 1),
    θ=10, C_max=15; S_sem = sigmoid(cos(F_i, own centre) + 0.5·Ent(F_i));
    variance-weighted fusion λ_f = Var(D)/(Var(D)+Var(S_sem)); top-K.

    Three documented deviations:
    - Step 8 (TSM query alignment, Cosine(F_i, E_q)) is DROPPED: it is the only
      query-dependent step and #391 keeps questions out of extraction. The paper
      attributes its largest ablation gain to TSM, so this is a partial method.
    - K₁ / K₂ are never given values in the paper and Eq 8 is per-frame, so no
      pre-filter is applied; K = min(budget, max(1, round(0.10·N))) — the middle
      of the paper's 5-15% band, sized so that the 5fps stream lands near a
      16-frame budget (the paper's own N is 900-1800 frames).
    - Saliency via cv2.saliency (spectral residual): OpenCV ships no Itti-Koch
      implementation, and the paper's φ enters as a pooled scalar either way.
    """
    step = _TAKSF_STEP
    frames = _decode_rgb224(video, step)
    n = len(frames)
    if n == 0:
        return []
    ts = [t for t, _, _ in frames]
    grays = [g for _, _, g in frames]
    if n == 1:
        return [ts[0]]
    d = np.array([float(np.linalg.norm(grays[i].astype(np.float32)
                                       - grays[i - 1].astype(np.float32)))
                  for i in range(1, n)])
    d = np.concatenate([[0.0], d])
    gate = float(d.mean() + 1.0 * d.std())
    import cv2
    sal = cv2.saliency.StaticSaliencySpectralResidual_create()
    phi = []
    for g in grays:
        ok, smap = sal.computeSaliency(g)
        phi.append(float(smap.mean()) if ok else 0.0)
    phi = np.array(phi)
    def entropy(g):
        h = np.bincount(g.ravel(), minlength=256).astype(float)
        p = h / max(1.0, h.sum())
        p = p[p > 0]
        return float(-(p * np.log2(p)).sum())
    s_vis = _sigmoid(_norm01(d) + _norm01(phi))
    valid = d >= gate
    if not valid.any():
        valid = np.ones(n, dtype=bool)
    idx = np.where(valid)[0]
    feats = _resnet_forward(_resnet("resnet50", pooled=True),
                            [f[1] for f in frames])
    fn = feats / (np.linalg.norm(feats, axis=1, keepdims=True) + 1e-9)
    c = int(max(1, min(int(np.ceil(len(idx) / 10.0)), 15)))
    sub = fn[idx]
    rng = np.random.RandomState(42)
    centers = [sub[rng.randint(len(idx))]]
    for _ in range(c - 1):
        d2 = np.min([np.sum((sub - cc) ** 2, axis=1) for cc in centers], axis=0)
        centers.append(sub[int(np.argmax(d2))])
    centers = np.stack(centers)
    for _ in range(20):
        assign = np.argmin(np.stack([np.sum((sub - cc) ** 2, axis=1)
                                     for cc in centers]), axis=0)
        for j in range(c):
            if np.any(assign == j):
                centers[j] = sub[assign == j].mean(axis=0)
    ent = np.array([entropy(grays[i]) for i in idx])
    sim = np.array([float(np.dot(fn[i], centers[assign[k]]))
                    for k, i in enumerate(idx)])
    s_sem = _sigmoid(sim + 0.5 * _norm01(ent))
    var_d, var_s = float(d.var()), float(s_sem.var())
    lam = var_d / (var_d + var_s + 1e-9)
    score = np.full(n, -1e9)
    score[idx] = lam * s_vis[idx] + (1 - lam) * s_sem
    k = int(min(budget, max(1, round(0.10 * n))))
    top = np.argsort(-score)[:k]
    return sorted(float(ts[i]) for i in top)


def m_lvnet_tsc(video, slug=None, budget=BUDGET, tau=18, psi=5, divlam=12):
    """LVNet stage 1 only (TSC — temporal scene clustering), from
    Park et al., EACL 2026 (arXiv 2406.09396), code github.com/jongwoopark7978/
    LVNet. Algorithm taken from the authors' temporalSceneClustering.py, which
    is authoritative where the paper's Algorithm 1 differs (the threshold is
    `μ − σ·e^(1−i/λ)`, exponent evaluated per loop index; the paper's version
    prints a sum that the code does not compute).

    Only TSC fits this harness: stage 2 (CKD) needs question-derived keywords
    and stage 3 (FKD) calls GPT-4o, so both are excluded by #391's
    query-free/zero-cost rules. This is therefore the paper's stage-1 ablation
    (EgoSchema 62.6 → 64.5 in their Table 1), NOT the HKS pipeline (→ 68.2).

    Deviations: candidate stream is 1fps (the paper samples 900-1800 frames),
    and `random.sample(τ)` is replaced by the first τ so the run is
    deterministic. Distance is the code's mean element-wise |Δ| over the
    512x7x7 map, not a matrix norm.
    """
    frames = _decode_rgb224(video, _LVNET_STEP)
    n = len(frames)
    if n == 0:
        return []
    ts = [t for t, _, _ in frames]
    if n <= psi:
        return sorted(ts)
    maps = _resnet_forward(_resnet("resnet18", pooled=False),
                           [f[1] for f in frames])
    flat = maps.reshape(n, -1)
    keep = []
    idx_list = list(range(n))
    loop = 0
    while len(idx_list) > psi:
        pivot = idx_list.pop(0)
        rest = np.array(idx_list)
        dist = np.abs(flat[rest] - flat[pivot]).mean(axis=1)
        p = np.exp(dist - dist.max())
        p = p / p.sum()
        mu, sd = float(p.mean()), float(p.std())
        thr = mu - sd * np.exp(1.0 - loop / divlam)
        popped = [int(i) for i, pi in zip(rest, p) if pi < thr]
        group = [pivot] + popped
        idx_list = [i for i in idx_list if i not in set(popped)]
        keep.extend(sorted(group)[:tau])
        loop += 1
    if not keep:
        keep = list(range(n))
    # The paper's sampler emits one set per cluster group (τ-capped each), so the
    # union can exceed a budget-K contract; take the harness budget by even
    # spread. Same helper score() applies, so this is explicit rather than
    # implicit (PR #412 review).
    picked = mb.subsample(sorted(ts[i] for i in sorted(set(keep))), budget)
    return sorted(picked)


METHODS = [
    ("tiered", lambda v, s: et.tiered_timestamps(v)[0]),
    ("tiered_v2_hash", mb2.m_tiered_v2),
    ("tiered_v3", m_tiered_v3),
    ("tiered_v3_hash", m_tiered_v3_hash),
    ("tiered_v4", lambda v, s: et.tiered_timestamps(v, densify=True,
                                                    spread_guard=True)[0]),
    ("slice", m_slice),
    ("infoshot", m_infoshot),
    ("kframes", m_kframes),
    ("kffocus", m_kffocus),
    ("taksf", m_taksf),
    ("lvnet_tsc", m_lvnet_tsc),
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
