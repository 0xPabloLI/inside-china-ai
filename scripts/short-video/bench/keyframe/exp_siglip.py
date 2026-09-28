#!/usr/bin/env python3
"""#391 Exp 4 — MaxInfo/KTV with REAL SigLIP embeddings (bench-only).

The proxy test (grayscale 32x32) showed diversity-maximization misaligns with
cut coverage. This re-test uses actual SigLIP-base image embeddings to check
whether the proxy conclusion was an artifact of weak embeddings (MaxInfo
paper reports +3.44% on MiniCPM-V 4.5 with SigLIP embeddings).

Run: ~/.video-tts-env/bin/python scripts/short-video/bench/keyframe/exp_siglip.py
"""

import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
SIGLIP_DIR = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "models", "siglip")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import methods_bench as mb  # noqa: E402

STEP, BUDGET = 1.0, 16


def decode_rgb(video, step=STEP):
    proc = subprocess.run(
        [bc.FFMPEG, "-nostdin", "-i", str(video),
         "-vf", f"fps={1 / step},scale=448:-2", "-an", "-sn", "-dn",
         "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"],
        capture_output=True, timeout=300)
    frames = bc._decode_mjpeg_bytes(proc.stdout)
    return [(round(i * step, 3), f) for i, f in enumerate(frames)]


_SIGLIP = None


def load_siglip():
    """SigLIP-base encoder + a torchvision-free image processor, cached.

    transformers 5 rewired SiglipImageProcessor onto TorchvisionBackend, and
    the mlx-vlm venv has no torchvision (NameError: tvF) — take the explicit
    PIL backend where it exists, else the 4.x SiglipImageProcessor, which is
    already PIL-based.
    """
    global _SIGLIP
    if _SIGLIP is None:
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        from transformers import SiglipModel
        try:
            from transformers.models.siglip.image_processing_pil_siglip \
                import SiglipImageProcessorPil as Proc
        except ModuleNotFoundError:
            from transformers.models.siglip.image_processing_siglip \
                import SiglipImageProcessor as Proc
        _SIGLIP = (SiglipModel.from_pretrained(SIGLIP_DIR).eval(),
                   Proc.from_pretrained(SIGLIP_DIR))
    return _SIGLIP


def embed_images(pil_images):
    """[(L2-normalized embedding, row per input image)]."""
    import torch
    model, processor = load_siglip()
    inputs = processor(images=list(pil_images), return_tensors="pt")
    with torch.no_grad():
        feats = model.get_image_features(**inputs)
    if not torch.is_tensor(feats):   # transformers 5: BaseModelOutputWithPooling
        feats = feats["pooler_output"]
    v = feats.float().numpy()
    return v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)


def maxinfo_pick(ts, vecs, budget=BUDGET):
    """Farthest-point greedy over embeddings: seed the first frame, then take
    the frame most different from the selected set until the budget is full."""
    if not len(ts):
        return []
    sel, min_d = [0], np.linalg.norm(vecs - vecs[0], axis=1)
    while len(sel) < min(budget, len(ts)):
        i = int(np.argmax(min_d))
        if min_d[i] <= 0:
            break
        sel.append(i)
        min_d = np.minimum(min_d, np.linalg.norm(vecs - vecs[i], axis=1))
    return sorted(ts[i] for i in set(sel))


def maxinfo_timestamps(video, budget=BUDGET):
    frames = decode_rgb(video)
    if not frames:
        return []
    return maxinfo_pick([t for t, _ in frames],
                        embed_images([f for _, f in frames]), budget)


def main():
    load_siglip()
    print("SigLIP loaded", flush=True)
    embed = embed_images

    def ktv_real(video):
        frames = decode_rgb(video)
        vecs = embed([f for _, f in frames])
        ts = [t for t, _ in frames]
        n, k = len(ts), min(BUDGET, len(ts))
        rng = np.random.RandomState(42)
        centers = [vecs[rng.randint(n)]]
        for _ in range(k - 1):
            d2 = np.min([np.sum((vecs - c) ** 2, axis=1) for c in centers], axis=0)
            centers.append(vecs[np.argmax(d2)])
        centers = np.stack(centers)
        for _ in range(20):
            assign = np.argmin(
                np.stack([np.sum((vecs - c) ** 2, axis=1) for c in centers]), axis=0)
            for j in range(k):
                if np.any(assign == j):
                    centers[j] = vecs[assign == j].mean(axis=0)
        picked = []
        for j in range(k):
            members = np.where(assign == j)[0]
            if len(members):
                medoid = members[np.argmin(
                    [np.sum((vecs[m] - centers[j]) ** 2) for m in members])]
                picked.append(ts[int(medoid)])
        return sorted(picked)

    rows = []
    for slug, video in bc.ASSETS.items():
        if not os.path.exists(video):
            continue
        duration = bc.asset_duration(video)
        intervals = bc.gt_scene_intervals(slug, duration)
        frames = decode_rgb(video)
        vecs = embed([f for _, f in frames])
        cand_ts = [t for t, _ in frames]
        print(f"\n===== {slug} ({duration:.2f}s, {len(frames)} emb frames) =====",
              flush=True)
        for name, ts in [("maxinfo_siglip", maxinfo_pick(cand_ts, vecs)),
                         ("ktv_siglip", ktv_real(video))]:
            r = mb.score(video, slug, name, ts, duration, intervals)
            rows.append(r)
            print(f"{name:16s} n={r['frames']:2d} recall={r['recall']} "
                  f"gap={r['maxGap']:5.2f} dup={r['nearDupPairs']:3d} "
                  f"cov={r['coverage']} info={r['informativeShare']}  "
                  f"{r['ts']}", flush=True)

    out = os.path.join(RESULTS, "exp_siglip.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    print(f"\nDONE → {out}", flush=True)


if __name__ == "__main__":
    main()