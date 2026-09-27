#!/usr/bin/env python3
"""#391 dual-layer criteria evaluator (bench-only, NOT production code).

Layer 1 (几何硬指标, zero-model): per config×asset —
  Shot Recall ±0.5s vs GT_SHOTS (kind shot / change_event reported apart),
  Max Temporal Gap (boundaries [0,first] and [last,duration] included),
  pHash redundancy (mean/min pairwise Hamming, near-dup pairs ≤4),
  extractionMs (artifact when present).

Layer 2 focus (#397 约束): 1fps probe frames → production focus_detector →
face-present intervals → per config 代表帧命中率 + 选中帧人脸占比.

Pass A runs under any venv with ffmpeg available; Pass B needs
~/.video-tts-env (cv2 + PIL + numpy, production focus_detector unmodified).

Run:
  ~/.video-tts-env/bin/python criteria_eval.py --pass a
  ~/.video-tts-env/bin/python criteria_eval.py --pass b
  ~/.video-tts-env/bin/python criteria_eval.py            # both

Output: .scratch/keyframe-bench/results/criteria_matrix.json + stdout tables.
"""

import argparse
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402

OUT_PATH = os.path.join(bc.RESULTS, "criteria_matrix.json")
PROBE_FPS = 1.0


# ─── Pass A: geometric criteria ──────────────────────────────────────────────

def pass_a(asset_slugs=None, config_slugs=None):
    rows = []
    for asset_slug in asset_slugs or bc.ASSETS:
        video = bc.ASSETS[asset_slug]
        if not os.path.exists(video):
            print(f"PASS A skip (missing): {asset_slug}")
            continue
        duration = bc.asset_duration(video)
        gt = bc.GT_SHOTS.get(asset_slug, {})
        gt_times = gt.get("times", [])
        gt_kind = gt.get("kind", "shot")
        for config_slug in config_slugs or bc.CONFIGS:
            ts, art = bc.resolved_timestamps(asset_slug, config_slug)
            ts = sorted(ts)
            recall, hits, total, pairs = bc.shot_recall(ts, gt_times, tol=0.5)
            gap = bc.max_temporal_gap(ts, duration)
            # pHash on the actual frames (accurate seek), 320px like the sheets
            hashes = []
            for t in ts:
                cell = bc.grab_frame(video, t, size_w=320)
                if cell is not None:
                    from PIL import Image
                    hashes.append(bc.phash64(Image.open(cell)))
                    os.unlink(cell)
            red = bc.redundancy_stats(hashes)
            rows.append({
                "asset": asset_slug, "config": config_slug,
                "durationS": round(duration, 2),
                "frameCount": len(ts),
                "timestampSource": (art or {}).get("timestampSource",
                                                   "derived_bench"),
                # uniform artifacts carry nominal stamps — criteria recompute;
                # mark provenance so nobody reuses artifact stamps for geometry
                "timestampsDerived": bc.CONFIGS[config_slug]["strategy"] != "scene"
                                     or not art,
                "shotRecall": None if recall is None else round(recall, 3),
                "shotHits": hits, "gtShots": total, "gtKind": gt_kind,
                "gtMissed": [g for g in gt_times
                             if all(abs(g - s) > 0.5 for s in ts)],
                "maxTemporalGapS": round(gap, 2),
                "gapCompliant8s": gap <= 8.0,
                "phashMeanDist": red["meanDist"],
                "phashMinDist": red["minDist"],
                "nearDupPairs": red["nearDupPairs"],
                "extractionMs": (art or {}).get("extractionMs"),
                "frameTimestamps": [round(t, 3) for t in ts],
            })
            r = rows[-1]
            print(f"[A] {config_slug}__{asset_slug}: n={r['frameCount']} "
                  f"recall={r['shotRecall']} ({hits}/{total}) "
                  f"gap={r['maxTemporalGapS']}s "
                  f"phash mean={r['phashMeanDist']} nearDup={r['nearDupPairs']}")
    return rows


# ─── Pass B: #397 focus constraint ───────────────────────────────────────────

def probe_face_intervals(video, focus_detector):
    """1fps probe → production focus_detector → face-present intervals.

    Returns (intervals, per_probe) where intervals are [start, end] spans
    (probe granularity 1s, reported honestly as such)."""
    duration = bc.asset_duration(video)
    n = int(duration // PROBE_FPS) + 1
    per_probe = []
    tmpdir = tempfile.mkdtemp(prefix="focus_probe_")
    try:
        for i in range(n):
            t = min(i * PROBE_FPS, max(duration - 0.05, 0))
            p = os.path.join(tmpdir, f"probe_{i:03d}.jpg")
            cell = bc.grab_frame(video, t, size_w=640)
            if cell is None:
                per_probe.append({"t": t, "face": None})
                continue
            os.replace(cell, p)
            result, err = focus_detector.handle_analyze(p)
            faces = [r for r in (result or {}).get("protectedRegions", [])
                     if r.get("kind") == "face"]
            per_probe.append({"t": round(t, 3), "face": len(faces) > 0,
                              "faceCount": len(faces)})
            os.unlink(p)
    finally:
        for f in os.listdir(tmpdir):
            os.unlink(os.path.join(tmpdir, f))
        os.rmdir(tmpdir)

    intervals = []
    run_start = None
    for i, pr in enumerate(per_probe):
        if pr["face"] and run_start is None:
            run_start = pr["t"]
        elif not pr["face"] and run_start is not None:
            intervals.append([round(run_start, 2),
                              round(per_probe[i - 1]["t"] + PROBE_FPS, 2)])
            run_start = None
    if run_start is not None:
        intervals.append([round(run_start, 2), round(duration, 2)])
    return intervals, per_probe


def pass_b(asset_slugs=None, config_slugs=None):
    import focus_detector  # production module, unmodified
    focus_detector.init_classifier()
    if not focus_detector._cascade_loaded:
        print("FATAL: production Haar cascade failed to load")
        sys.exit(1)

    face_gt = {}
    rows = []
    for asset_slug in asset_slugs or bc.ASSETS:
        video = bc.ASSETS[asset_slug]
        if not os.path.exists(video):
            continue
        intervals, per_probe = probe_face_intervals(video, focus_detector)
        face_gt[asset_slug] = {
            "intervals": intervals,
            "probeGranularityS": PROBE_FPS,
            "faceProbeCount": sum(1 for p in per_probe if p["face"]),
            "probeCount": len(per_probe),
        }
        print(f"[B] {asset_slug}: face intervals {intervals}")
        for config_slug in config_slugs or bc.CONFIGS:
            ts, _art = bc.resolved_timestamps(asset_slug, config_slug)
            ts = sorted(ts)
            if not intervals:
                hit_rate = None  # no face material — not applicable
                hit_intervals = []
            else:
                hit_intervals = [iv for iv in intervals
                                 if any(iv[0] <= t <= iv[1] for t in ts)]
                hit_rate = len(hit_intervals) / len(intervals)
            # share of selected frames landing inside a face interval
            in_face = sum(1 for t in ts
                          if any(iv[0] <= t <= iv[1] for iv in intervals))
            rows.append({
                "asset": asset_slug, "config": config_slug,
                "faceIntervalHitRate": None if hit_rate is None else round(hit_rate, 3),
                "faceIntervalsHit": len(hit_intervals),
                "faceIntervalsTotal": len(intervals),
                "missedIntervals": [iv for iv in intervals
                                    if iv not in hit_intervals],
                "selectedInFaceIntervals": in_face,
                "selectedTotal": len(ts),
                "selectedFaceShare": round(in_face / len(ts), 3) if ts else None,
            })
            r = rows[-1]
            print(f"    {config_slug}: hit={r['faceIntervalHitRate']} "
                  f"({r['faceIntervalsHit']}/{r['faceIntervalsTotal']}) "
                  f"faceShare={r['selectedFaceShare']}")
    return rows, face_gt


# ─── Pass C: downstream field stability (layer 2, from artifacts) ────────────

def _subjects_set(text):
    """Extract the ## Subjects comma list from an artifact's outputText."""
    import re
    if not text:
        return None
    m = re.search(r"##\s*Subjects\s*\n+([^\n#]+)", text)
    if not m:
        return None
    return {s.strip().lower() for s in m.group(1).split(",") if s.strip()}


def _content_kind(text):
    import re
    if not text:
        return None
    m = re.search(r"##\s*Content Kind\s*\n+([a-z_]+)", text, re.IGNORECASE)
    return m.group(1).strip().lower() if m else None


def _jaccard(a, b):
    if not a or not b:
        return None
    inter = len(a & b)
    union = len(a | b)
    return round(inter / union, 3) if union else None


def pass_c():
    """Cross-config downstream-field stability vs the uniform_16fps2 baseline:
    Subjects Jaccard, ContentKind agreement, and per-frame Fit distributions
    (frameFields where the fit pass ran)."""
    rows = []
    for asset_slug in bc.ASSETS:
        base_art = bc.load_artifact("uniform_16fps2", asset_slug)
        base_subj = _subjects_set((base_art or {}).get("outputText"))
        base_kind = _content_kind((base_art or {}).get("outputText"))
        for config_slug in bc.CONFIGS:
            art = bc.load_artifact(config_slug, asset_slug)
            if art is None:
                continue
            subj = _subjects_set(art.get("outputText"))
            kind = _content_kind(art.get("outputText"))
            fields = art.get("frameFields") or []
            fits = [f.get("fit") for f in fields if isinstance(f, dict)]
            fit_dist = {}
            for v in fits:
                fit_dist[v] = fit_dist.get(v, 0) + 1
            rows.append({
                "asset": asset_slug, "config": config_slug,
                "subjects": sorted(subj) if subj else None,
                "subjectsJaccardVsBaseline": _jaccard(subj, base_subj),
                "contentKind": kind,
                "kindAgreesVsBaseline": (kind == base_kind) if
                                         (kind and base_kind) else None,
                "fitDist": fit_dist,
                "fitCoverShare": round(fit_dist.get("cover", 0) / len(fits), 3)
                                 if fits else None,
                "genMs": art.get("genMs"),
                "frameCount": art.get("frameCount"),
            })
            r = rows[-1]
            print(f"[C] {config_slug}__{asset_slug}: "
                  f"jaccard={r['subjectsJaccardVsBaseline']} "
                  f"kind={r['contentKind']} (agree={r['kindAgreesVsBaseline']}) "
                  f"fit={r['fitDist'] or '-'}")
    return rows


# ─── Pass D: KFS-Bench factors (WACV 2026, NEC) ──────────────────────────────

def pass_d(config_slugs=None):
    """KFS-Bench-style factors for every strategy, including `tiered` (whose
    selections are read back from exp_tiered.json). See bench_common for the
    documented adaptation of Precision -> informativeShare in our query-free
    setting."""
    from PIL import Image

    tiered_sel = {}
    et_path = os.path.join(bc.RESULTS, "exp_tiered.json")
    if os.path.exists(et_path):
        with open(et_path, encoding="utf-8") as f:
            for r in json.load(f):
                if r.get("strategy") == "tiered" and r.get("ts"):
                    tiered_sel[r["asset"]] = r["ts"]

    rows = []
    for asset_slug in bc.ASSETS:
        video = bc.ASSETS[asset_slug]
        if not os.path.exists(video):
            continue
        duration = bc.asset_duration(video)
        intervals = bc.gt_scene_intervals(asset_slug, duration)
        if intervals is None:
            print(f"[D] {asset_slug}: no GT scenes (no annotated transitions) — skipped")
            continue
        variants = [("tiered", tiered_sel.get(asset_slug))]
        for cfg in (config_slugs or ["uniform_16fps2", "scene_008_cap16",
                                     "iframe_even16"]):
            ts, _art = bc.resolved_timestamps(asset_slug, cfg)
            variants.append((cfg, sorted(ts)))
        for name, ts in variants:
            if not ts:
                continue
            hashes = []
            for t in ts:
                cell = bc.grab_frame(video, t, size_w=160)
                if cell is not None:
                    hashes.append(bc.phash64(Image.open(cell)))
                    os.unlink(cell)
            f = bc.kfs_factors(ts, intervals, hashes)
            rows.append({
                "asset": asset_slug, "strategy": name, "frames": len(ts),
                "gtKind": bc.GT_SHOTS.get(asset_slug, {}).get("kind"),
                "gtScenes": intervals, **f,
            })
            print(f"[D] {asset_slug[:24]:24s} {name:16s} n={len(ts):2d} "
                  f"cov={f['coverage']} bal={f['balance']} "
                  f"info={f['informativeShare']} "
                  f"({f['scenesCovered']}/{f['scenesTotal']}) "
                  f"perScene={f['framesPerScene']}")
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--pass", dest="which", choices=["a", "b", "c", "d", "all"],
                    default="all")
    ap.add_argument("--asset", action="append", default=None)
    ap.add_argument("--config", action="append", default=None)
    args = ap.parse_args()

    os.makedirs(bc.RESULTS, exist_ok=True)
    out = {"generatedBy": "criteria_eval.py (#391 判据研究, bench-only)",
           "tolerances": {"shotRecallTolS": 0.5, "gapTargetS": 8.0,
                          "nearDupHamming": 4},
          }
    if args.which in ("a", "all"):
        out["layer1"] = pass_a(args.asset, args.config)
    if args.which in ("b", "all"):
        rows, face_gt = pass_b(args.asset, args.config)
        out["layer2Focus"] = rows
        out["faceGroundTruth"] = face_gt
    if args.which in ("c", "all"):
        out["layer2Fields"] = pass_c()
    if args.which in ("d", "all"):
        out["kfsBench"] = pass_d(args.config)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"written {OUT_PATH}")


if __name__ == "__main__":
    main()
