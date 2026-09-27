#!/usr/bin/env python3
"""#391 criteria research — shared bench-only library (NOT production code).

Provides the observation/criteria layer for the keyframe strategy research
(handoff §〇, 2026-09-27): asset/config registries, per-strategy frame
timestamp derivation, geometric metrics (Shot Recall / Max Temporal Gap /
pHash redundancy), and contact-sheet rendering.

Design notes:
  - uniform timestamps: run_bench.py artifacts store NOMINAL i/fps stamps,
    which are wrong whenever mlx_vlm subsample_evenly() dropped frames
    (idx = round(i*(N-1)/(K-1)) spread across the whole clip). Callers that
    need geometric truth must use true_uniform_timestamps().
  - I-frame baseline is bench-only: production vlm_analyzer has no iframe
    strategy and none is proposed here (对照信号, handoff §1.2 档位 0).
"""

import json
import math
import os
import re
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
RESULTS = os.path.join(REPO_ROOT, ".scratch", "keyframe-bench", "results")
SHEETS = os.path.join(REPO_ROOT, ".scratch", "keyframe-bench", "contact-sheets")
BENCH_ASSETS = os.path.join(REPO_ROOT, ".scratch", "keyframe-bench", "assets")

FFMPEG = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
FFPROBE = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe"
FONTFILE = "/System/Library/Fonts/Helvetica.ttc"

WORKTREE_361 = "/Users/pabloli/Documents/code/inside-china-ai-wt/20260925-361-omni-vlm-5c0413"

ASSETS = {
    "content_ABC_av": os.path.join(WORKTREE_361, ".scratch/len-compare/content_ABC_av.mp4"),
    "content_ABCx2_30s": os.path.join(WORKTREE_361, ".scratch/len-compare/content_ABCx2_30s.mp4"),
    "unitree-superman-demo-30s": os.path.join(
        REPO_ROOT, "scripts/short-video/content/unitree/assets/unitree-superman-demo.mp4"),
    # handoff §1.5.3 补齐素材 — built by make_assets.py into scratch
    "talkinghead-n10x6-30s": os.path.join(BENCH_ASSETS, "talkinghead_n10x6_30s.mp4"),
    "ui-demo-screencast-30s": os.path.join(BENCH_ASSETS, "ui_demo_30s.mp4"),
}

# Config matrix (handoff §〇.5): uniform baseline / scene 阈值阶梯 / I-frame 对照.
# fps=None → not applicable (scene/iframe decode whole clip).
CONFIGS = {
    "uniform_16fps2": {"strategy": "uniform", "max_frames": 16, "fps": 2.0},
    "scene_004_cap16": {"strategy": "scene", "max_frames": 16, "threshold": "0.04"},
    "scene_008_cap16": {"strategy": "scene", "max_frames": 16, "threshold": "0.08"},
    "scene_012_cap16": {"strategy": "scene", "max_frames": 16, "threshold": "0.12"},
    "iframe_first16": {"strategy": "iframe", "max_frames": 16, "mode": "first"},
    "iframe_even16": {"strategy": "iframe", "max_frames": 16, "mode": "even"},
}

# Legacy artifact slugs (PR #392/#395 bench, 18 runs) → canonical config slugs.
LEGACY_ALIASES = {
    "scene_cap16": "scene_008_cap16",
    "scene_cap32": "scene_008_cap16",  # differs in cap; kept only for artifact lookup
    "uniform_32fps2": "uniform_16fps2",
    "uniform_32fps1": "uniform_16fps2",
    "uniform_64fps1": "uniform_16fps2",
}

SCENE_FILTER = "select='gt(scene,{th})+eq(n,0)+not(mod(t,8))'"
IFRAME_FILTER = "select='eq(pict_type,I)'"
SHOWINFO_PTS_RE = re.compile(r"pts_time:([0-9.]+)")
JPEG_SOI = b"\xff\xd8\xff"  # SOI + first marker byte (mjpeg stream split marker)


# ─── registry helpers ────────────────────────────────────────────────────────

def asset_duration(video_path):
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(video_path)],
        capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0 or not out.stdout.strip():
        raise RuntimeError(f"ffprobe failed for {video_path}: {out.stderr.strip()}")
    return float(out.stdout.strip())


def artifact_path(config_slug, asset_slug):
    """Artifact JSON for a config×asset, resolving legacy slugs (18-run bench)."""
    candidates = [config_slug]
    if config_slug == "scene_008_cap16":
        candidates.append("scene_cap16")
    elif config_slug == "uniform_16fps2":
        # any historical uniform artifact shares scene-style truth? No —
        # uniform artifacts carry nominal stamps only, but outputText still valid.
        candidates.extend(["uniform_32fps2", "uniform_32fps1", "uniform_64fps1"])
    for slug in candidates:
        p = os.path.join(RESULTS, f"{slug}__{asset_slug}.json")
        if os.path.exists(p):
            return p
    return None


def load_artifact(config_slug, asset_slug):
    p = artifact_path(config_slug, asset_slug)
    if p is None:
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


# ─── timestamp derivation (per strategy) ─────────────────────────────────────

def _showinfo_timestamps(video_path, vf_filter, cap):
    cmd = [FFMPEG, "-nostdin", "-i", str(video_path),
           "-vf", vf_filter + ",showinfo",
           "-an", "-sn", "-dn"]
    if cap:
        cmd.extend(["-frames:v", str(cap)])
    cmd.extend(["-f", "null", "-"])
    proc = subprocess.run(cmd, capture_output=True, timeout=300)
    pts = [float(m) for m in SHOWINFO_PTS_RE.findall(
        proc.stderr.decode("utf-8", "replace"))]
    return pts


def derive_scene_timestamps(video_path, threshold, cap):
    """Scene strategy: real pts via showinfo (same recipe as production)."""
    return _showinfo_timestamps(video_path, SCENE_FILTER.format(th=threshold), cap)


def derive_iframe_timestamps(video_path, cap, mode):
    """I-frame baseline: all coded I-frames; 'first' keeps the first cap,
    'even' spreads cap picks across ALL I-frames (mlx_vlm round() formula)."""
    all_pts = _showinfo_timestamps(video_path, IFRAME_FILTER, None)
    if mode == "first":
        return all_pts[:cap]
    n = len(all_pts)
    if n <= cap:
        return all_pts
    idxs = [round(i * (n - 1) / (cap - 1)) for i in range(cap)]
    return sorted({all_pts[i] for i in idxs})


def count_frames_at_fps(video_path, fps):
    """Exact decoded-frame count for `ffmpeg -vf fps=fps` (the same filter
    mlx_vlm's load_video applies before subsample_evenly)."""
    proc = subprocess.run(
        [FFMPEG, "-nostdin", "-i", str(video_path), "-vf", f"fps={fps}",
         "-an", "-sn", "-dn", "-f", "null", "-"],
        capture_output=True, timeout=300,
    )
    m = re.search(r"frame=\s*(\d+)", proc.stderr.decode("utf-8", "replace"))
    if not m:
        raise RuntimeError(f"cannot count fps={fps} frames for {video_path}")
    return int(m.group(1))


def true_uniform_timestamps(video_path, fps, cap):
    """True uniform-strategy timestamps: subsample_evenly spreads K picks over
    N decoded frames — idx = round(i*(N-1)/(K-1)); ts = idx/fps."""
    n = count_frames_at_fps(video_path, fps)
    k = min(cap, n)
    if k == 0:
        return []
    if k == 1:
        return [0.0]
    idxs = [round(i * (n - 1) / (k - 1)) for i in range(k)]
    return [round(i / fps, 3) for i in idxs]


def timestamps_for(asset_slug, config_slug):
    """Canonical timestamp derivation for a config×asset."""
    video = ASSETS[asset_slug]
    cfg = CONFIGS[config_slug]
    if cfg["strategy"] == "uniform":
        return true_uniform_timestamps(video, cfg["fps"], cfg["max_frames"])
    if cfg["strategy"] == "scene":
        return derive_scene_timestamps(video, cfg["threshold"], cfg["max_frames"])
    if cfg["strategy"] == "iframe":
        return derive_iframe_timestamps(video, cfg["max_frames"], cfg["mode"])
    raise ValueError(f"unknown strategy in config {config_slug}")


def resolved_timestamps(asset_slug, config_slug):
    """Timestamps preferring model-run artifacts where they are geometrically
    trustworthy: scene artifacts carry real showinfo pts; uniform artifacts
    carry nominal stamps and are ALWAYS recomputed; iframe has no artifacts
    and is derived."""
    cfg = CONFIGS[config_slug]
    art = load_artifact(config_slug, asset_slug)
    if art and cfg["strategy"] == "scene" and art.get("frameTimestamps"):
        return list(art["frameTimestamps"]), art
    return timestamps_for(asset_slug, config_slug), art


# ─── geometric metrics (layer 1) ─────────────────────────────────────────────

def shot_recall(selected, gt_shots, tol=0.5):
    """Fraction of GT transitions with ≥1 selected frame within ±tol seconds.
    Returns (recall, hits, total, [(gt, sel), ...] matched pairs)."""
    if not gt_shots:
        return None, 0, 0, []
    hits, pairs = 0, []
    for gt in gt_shots:
        near = [s for s in selected if abs(s - gt) <= tol]
        if near:
            hits += 1
            pairs.append((gt, min(near, key=lambda s: abs(s - gt))))
    return hits / len(gt_shots), hits, len(gt_shots), pairs


def max_temporal_gap(selected, duration):
    """Largest blind spot with no selected frame, counting [0, first] and
    [last, duration] as candidate gaps (coverage boundary semantics)."""
    if not selected:
        return duration
    bounds = [0.0] + sorted(selected) + [duration]
    return max(b - a for a, b in zip(bounds, bounds[1:]))


# ─── KFS-Bench factors (WACV 2026, NEC) ──────────────────────────────────────
# KFS-Bench evaluates frame sampling DIRECTLY (multi-scene GT) instead of only
# via QA accuracy, on three factors: Precision / Coverage / Balance. Their
# definitions assume query-relevant scenes amid irrelevant background; our
# setting has NO query and treats every shot as relevant, so:
#   - Coverage maps 1:1 (fraction of GT scenes with >=1 selected frame).
#   - Balance maps 1:1 (evenness of frames across COVERED scenes; computed
#     conditional on coverage so the two factors stay separable).
#   - Precision is trivially 1.0 here (every frame lies in some scene), so we
#     report the query-free analogue instead: `informativeShare` = fraction of
#     selected frames that are NOT near-duplicates of another selected frame
#     (i.e. no budget wasted re-picking the same content).
# Adaptation is documented rather than silently claimed as KFS-Bench parity.

def gt_scene_intervals(asset_slug, duration):
    """GT scenes = intervals between annotated transition times (partition of
    the timeline). Returns None when the asset has no GT transitions."""
    gt = GT_SHOTS.get(asset_slug, {})
    times = sorted(gt.get("times", []))
    if not times:
        return None
    bounds = [0.0] + [t for t in times if 0 < t < duration] + [duration]
    return [(a, b) for a, b in zip(bounds, bounds[1:]) if b - a > 1e-6]


def kfs_factors(selected, intervals, hashes=None, boundary_tol=0.3):
    """KFS-Bench-style factors. intervals: GT scenes from gt_scene_intervals.

    `boundary_tol` widens each scene by ±tol when testing membership, because
    our GT boundaries are point annotations with ±0.1–0.25s precision: a frame
    placed 0.01s before an annotated cut sits inside the *previous* scene under
    strict counting yet visually represents the scene after the cut (observed
    on unitree 17.24 vs boundary 17.25). Documented rather than hidden — pass
    0.0 for strict interval membership.

    Returns dict with coverage, balance, informativeShare, counts. `hashes`
    (64-bit pHash ints, one per selected frame) drives informativeShare; pass
    None to leave it out."""
    if intervals is None or not selected:
        return {"coverage": None, "balance": None, "informativeShare": None,
                "scenesTotal": 0 if intervals is None else len(intervals),
                "scenesCovered": 0, "framesPerScene": []}

    counts = [sum(1 for t in selected if lo - boundary_tol <= t < hi + boundary_tol)
              for lo, hi in intervals]
    covered = [c for c in counts if c > 0]
    coverage = len(covered) / len(counts) if counts else None

    # Balance over COVERED scenes only (conditional), normalized entropy:
    # 1.0 = every covered scene got the same number of frames.
    balance = None
    if len(covered) >= 2:
        total = sum(covered)
        ps = [c / total for c in covered]
        import math as _math
        ent = -sum(p * _math.log(p) for p in ps if p > 0)
        balance = round(ent / _math.log(len(covered)), 4)
    elif len(covered) == 1:
        balance = 1.0

    informative = None
    if hashes and len(hashes) >= 2:
        near_dup = 0
        for i, a in enumerate(hashes):
            if any(hamming(a, b) <= 4 for j, b in enumerate(hashes) if j != i):
                near_dup += 1
        informative = round(1 - near_dup / len(hashes), 4)

    return {
        "coverage": None if coverage is None else round(coverage, 4),
        "balance": balance,
        "informativeShare": informative,
        "scenesTotal": len(intervals),
        "scenesCovered": len(covered),
        "framesPerScene": counts,
    }


def _dct2(a):
    """Orthonormal DCT-II along both axes, pure numpy (no scipy)."""
    import numpy as np
    n = a.shape[0]
    # DCT-II matrix: T[k, x] = cos(pi*(2x+1)*k/(2n)) * sqrt(2/n), k>0 ×1/√2 k=0
    x = np.arange(n)
    k = np.arange(n).reshape(-1, 1)
    t = np.cos(np.pi * (2 * x + 1) * k / (2 * n)) * math.sqrt(2.0 / n)
    t[0, :] = math.sqrt(1.0 / n)
    return t @ a @ t.T


def phash64(gray_img):
    """64-bit perceptual hash from a PIL Image / ndarray (32×32 gray DCT)."""
    import numpy as np
    from PIL import Image
    img = gray_img if isinstance(gray_img, Image.Image) else Image.fromarray(gray_img)
    small = np.asarray(img.convert("L").resize((32, 32), Image.LANCZOS), dtype=float)
    d = _dct2(small)[:8, :8]
    flat = d.flatten()[1:]  # drop DC
    med = np.median(flat)
    bits = flat > med
    return int.from_bytes(np.packbits(bits).tobytes(), "big")


def hamming(a, b):
    return bin(a ^ b).count("1")


def redundancy_stats(hashes):
    """Pairwise pHash Hamming stats over the selected set (higher = more
    diverse; near-duplicate pairs = distance ≤ 4)."""
    import itertools
    dists = [hamming(a, b) for a, b in itertools.combinations(hashes, 2)]
    if not dists:
        return {"pairs": 0, "meanDist": None, "minDist": None, "nearDupPairs": 0}
    return {
        "pairs": len(dists),
        "meanDist": round(sum(dists) / len(dists), 2),
        "minDist": min(dists),
        "nearDupPairs": sum(1 for d in dists if d <= 4),
    }


def luminance_boundary_signal(video_path, step_s=0.05, k_mad=6.0):
    """Mechanical-channel boundary candidates: decode at `step_s` cadence,
    grayscale downscale, L1 distance between consecutive frames; local maxima
    above k×MAD → candidate times. Independent of scene filter AND I-frame
    placement — third mechanism for the frozen consensus rule. No visual
    channel involved (2026-09-27 视觉通道受损，GT 仅认机械通道).

    Returns (candidates, series) where series is the full distance list
    [(t, dist), ...] for audit."""
    import numpy as np
    from PIL import Image

    fps_filter = 1.0 / step_s
    proc = subprocess.run(
        [FFMPEG, "-nostdin", "-i", str(video_path),
         "-vf", f"fps={fps_filter},scale=160:-2,format=gray",
         "-an", "-sn", "-dn", "-f", "image2pipe", "-vcodec", "mjpeg",
         "pipe:1"],
        capture_output=True, timeout=300)
    if proc.returncode != 0:
        raise RuntimeError(f"luminance probe decode failed: "
                           f"{proc.stderr.decode(errors='replace')[-200:]}")
    frames = _decode_mjpeg_bytes(proc.stdout)
    arrs = [np.asarray(f, dtype=np.float32) for f in frames]
    dists = []
    for i in range(1, len(arrs)):
        d = float(np.mean(np.abs(arrs[i] - arrs[i - 1])))
        dists.append((round(i * step_s, 3), d))
    vals = np.array([d for _, d in dists])
    med = float(np.median(vals))
    mad = float(np.median(np.abs(vals - med))) + 1e-9
    thr = med + k_mad * mad
    cands = []
    for i in range(1, len(dists) - 1):
        t, d = dists[i]
        if d > thr and d >= dists[i - 1][1] and d >= dists[i + 1][1]:
            cands.append({"t": t, "dist": round(d, 2), "thr": round(thr, 2)})
    return cands, dists


def _decode_mjpeg_bytes(data):
    """Split an mjpeg byte stream into temp JPEG files → PIL Images
    (bench-local; mirrors the SOI-scan approach, no vlm import)."""
    import io
    from PIL import Image
    frames = []
    idx = data.find(JPEG_SOI)
    while idx != -1:
        nxt = data.find(JPEG_SOI, idx + 2)
        chunk = data[idx:nxt if nxt != -1 else len(data)]
        try:
            frames.append(Image.open(io.BytesIO(chunk)).copy())
        except Exception:
            pass
        idx = nxt
    return frames


def consensus_candidates(asset_slug, tol=0.15):
    """Frozen rule (2026-09-27): a GT cut candidate requires ≥2 INDEPENDENT
    mechanisms firing within ±tol s. Mechanisms: scene-family (ffmpeg scene
    filter — 3 thresholds count as ONE mechanism), iframe pts, luminance-diff
    signal. Pure mechanical channel; visual reads excluded.
    tol + 1e-9 guards the inclusive boundary against float drift
    (|13.85 − 14.0| = 0.15000000000000036)."""
    tol = tol + 1e-9
    video = ASSETS[asset_slug]
    mech = {}
    mech["scene"] = sorted({t for th in ("0.04", "0.08", "0.12")
                            for t in derive_scene_timestamps(video, th, None)})
    mech["iframe"] = derive_iframe_timestamps(video, None, "even") \
        if False else _showinfo_timestamps(video, IFRAME_FILTER, None)
    lum, _series = luminance_boundary_signal(video)
    mech["luminance"] = [c["t"] for c in lum]

    times = sorted({t for ts in mech.values() for t in ts})
    out = []
    for t in times:
        supporting = [name for name, ts in mech.items()
                      if any(abs(t - u) <= tol for u in ts)]
        if len(supporting) >= 2:
            out.append({"t": t, "mechanisms": supporting})
    return out, mech


def grab_frame(video_path, ts, size_w=320, label=None):
    """Extract one frame at ts (accurate seek), optionally burned-in label."""
    import tempfile
    vf = f"scale={size_w}:-2"
    if label is not None:
        vf += (f",drawtext=fontfile={FONTFILE}:text='{label}':"
               f"fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6:"
               f"boxborderw=4:x=4:y=4")
    fd, out = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    proc = subprocess.run(
        [FFMPEG, "-nostdin", "-y", "-ss", f"{ts:.3f}", "-i", str(video_path),
         "-frames:v", "1", "-vf", vf, "-q:v", "3", out],
        capture_output=True, timeout=60,
    )
    if proc.returncode != 0 or os.path.getsize(out) == 0:
        os.unlink(out)
        return None
    return out


def render_sheet(video_path, timestamps, out_path, cols=6, size_w=320,
                 labeled=True):
    """Contact sheet: labeled frames → ffmpeg tile grid."""
    import tempfile
    if not timestamps:
        raise ValueError("no timestamps to render")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    tmpdir = tempfile.mkdtemp(prefix="sheet_cells_")
    try:
        cells = []
        for i, ts in enumerate(sorted(timestamps)):
            label = f"{ts:.2f}s" if labeled else None
            cell = grab_frame(video_path, ts, size_w=size_w, label=label)
            if cell is not None:
                dst = os.path.join(tmpdir, f"cell_{len(cells):03d}.jpg")
                os.replace(cell, dst)
                cells.append(dst)
        rows = math.ceil(len(cells) / cols)
        proc = subprocess.run(
            [FFMPEG, "-nostdin", "-y", "-framerate", "1",
             "-i", os.path.join(tmpdir, "cell_%03d.jpg"),
             "-vf", f"tile={cols}x{rows}", "-frames:v", "1",
             "-q:v", "4", out_path],
            capture_output=True, timeout=120,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"tile failed: {proc.stderr.decode()[-400:]}")
    finally:
        for f in os.listdir(tmpdir):
            os.unlink(os.path.join(tmpdir, f))
        os.rmdir(tmpdir)
    return out_path


def render_dense_grid(video_path, out_path, step=0.5, cols=8, size_w=240,
                      end_pad=0.0):
    """Dense labeled grid (every `step` seconds) for GT annotation —
    Phase 0 observation mode."""
    duration = asset_duration(video_path) + end_pad
    stamps = [round(t * step, 3) for t in range(int(duration / step))]
    return render_sheet(video_path, stamps, out_path, cols=cols, size_w=size_w)


# ─── GT shot registry ────────────────────────────────────────────────────────
# Provenance: construction-known for synthetic concats; visually annotated
# (contact-sheet dense grid) for real footage. `kind` distinguishes cinematic
# shots from "local change events" (UI demo lines) — both count for recall
# but are reported separately.

GT_SHOTS = {
    # v2 2026-09-27：0.25s 细网格复核（0.5s 初版的 4.75 / 8.8 / 13.3 / 19.3 / 24.3
    # / 27.3 均为网格错位误读，弃用；ABCx2 构造值获细网格确认）
    "content_ABC_av": {"kind": "shot", "times": [5.06],
                       "provenance": "fine grid (5.00 灯管 → 5.25 光束) + "
                                     "construction (n5=5.0625s，尾部截 0.125s)"},
    "content_ABCx2_30s": {"kind": "shot",
                          "times": [5.06, 10.13, 15.19, 20.25, 25.31],
                          "provenance": "construction (ABC=n5+n8+n10 15.125s ×2, "
                                        "duration 30.25s 精确吻合) + fine grid confirm"},
    # unitree：视觉 GT 标注作废（2026-09-27 图像读取通道受损，本 session 6 次
    # 工具返回异常，v1/v2 两版视觉标注均在复核中被推翻——视觉裁决不可靠）。
    # times = 冻结规则机械共识（任二独立机制 ±0.15s，scene ∩ iframe ∩
    # luminance 三机制，纯 ffmpeg/numpy 通道）：
    #   3/3 机制：8.76, 12.44, 17.25, 27.96
    #   2/3 机制：14.0(scene+iframe)、23.4(scene+luminance)、25.6(scene+iframe)
    # 26.4 = 甩镜事件（镜头内快速横摇，非切）不入 times；10.7/0.3 = 运动误报。
    # 视觉裁决权仍移交用户（HITL）复核 contact-sheets/_probe_*.jpg。
    "unitree-superman-demo-30s": {"kind": "shot",
                                  "times": [8.76, 12.44, 14.0, 17.25, 23.4,
                                            25.6, 27.96],
                                  "provenance": "mechanical 3-mechanism consensus "
                                                "(frozen rule ≥2 mech ±0.15s; "
                                                "visual channel voided; pending "
                                                "user HITL)"},
    "talkinghead-n10x6-30s": {"kind": "shot", "times": [],
                              "provenance": "single visual content (loop seams not shots)"},
    "ui-demo-screencast-30s": {"kind": "change_event",
                               "times": [2.0, 6.0, 10.0, 14.0, 18.0, 22.0, 26.0],
                               "provenance": "construction (make_assets.py)"},
}
