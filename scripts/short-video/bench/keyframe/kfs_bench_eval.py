#!/usr/bin/env python3
"""#391 — KFS-Bench (NEC-VID/KFS-Bench) adapter for the bench harness.

Runs the strategies from this harness over the KFS-Bench Video-MME subset and
scores them with the benchmark's OWN eval.py (not a re-derivation), so the
numbers are directly comparable with the authors' reference results.

Two facts about the benchmark shape the adapter:
  - Its ground truth is QUERY-CONDITIONED: every row is a (video, question)
    pair carrying the scenes needed to answer that question (id = question_id
    in the Video-MME subset). Our selectors are query-free by #391's ruling, so
    one selection per VIDEO is emitted for all of that video's question ids and
    the result must be read as a query-AGNOSTIC baseline. eval.py only consumes
    {id, frame_timestamps}, so this is a labelling choice, not a format hack.
  - K (frames per selection) is free; the paper's reference results use 64.

Setup (licence: NEC "research purposes only", so these files are NOT committed;
they live in gitignored scratch):
    cd .scratch/keyframe-bench/kfs
    for f in lvb_anno.csv vidmme_anno.csv eval.py; do
      curl -sL -o $f https://raw.githubusercontent.com/NEC-VID/KFS-Bench/main/$f
    done

Run: ~/.video-tts-env/bin/python scripts/short-video/bench/keyframe/kfs_bench_eval.py
"""

import csv
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
KFS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "kfs")
VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import methods_bench as mb  # noqa: E402
import exp_tiered as et  # noqa: E402
import methods_bench3 as mb3  # noqa: E402

K = int(os.environ.get("KFS_K", "64"))
STRATEGIES = [s.strip() for s in os.environ.get(
    "KFS_STRATEGIES", "uniform,tiered,tiered_v5,slice").split(",") if s.strip()]


def select(video, duration, name, k):
    if name == "uniform":
        return bc.true_uniform_timestamps(video, 1.0, k)
    if name == "tiered":
        return et.tiered_timestamps(video, budget=k)[0]
    if name == "tiered_v5":
        return et.tiered_timestamps(video, budget=k, densify=True,
                                    enforce_floor=True)[0]
    if name == "slice":
        return mb3.m_slice(video, budget=k)
    if name in ("maxinfo_siglip", "ktv_siglip"):
        import exp_siglip as es
        if name == "maxinfo_siglip":
            return es.maxinfo_timestamps(video, k)
        return []  # ktv needs its own pass; see exp_siglip.main
    # The rest of the reconciliation matrix, so the "did we miss a required
    # scene" column is filled for every method we have (not just four).
    if name == "taksf":
        return mb3.m_taksf(video, budget=k)
    if name == "lvnet_tsc":
        return mb3.m_lvnet_tsc(video, budget=k)
    if name == "kffocus":
        return mb3.m_kffocus(video, budget=k)
    if name == "kframes":
        return mb3.m_kframes(video)
    if name == "infoshot":
        return mb3.m_infoshot(video)
    if name == "blockslide":
        return mb.m_blockslide(video)
    if name == "sd_content":
        return mb.m_sd_content(video)
    if name == "sd_hash":
        return mb.m_sd_hash(video)
    if name == "sd_adaptive":
        return mb.m_sd_adaptive(video)
    if name == "sd_histogram":
        return mb.m_sd_histogram(video)
    if name == "sd_threshold":
        return mb.m_sd_threshold(video)
    if name == "iframe_even16":
        return bc.resolved_timestamps("unitree-superman-demo-30s", "iframe_even16")[0] \
            if False else bc.derive_iframe_timestamps(video, k, "even")
    if name == "scene_008_cap16":
        return bc.derive_scene_timestamps(video, "0.08", k)
    raise ValueError(name)


def main():
    import pandas as pd
    anno_path = os.path.join(KFS, "vidmme_anno.csv")
    eval_py = os.path.join(KFS, "eval.py")
    for p in (anno_path, eval_py):
        if not os.path.exists(p):
            raise SystemExit(f"missing {p} — see the setup note in this docstring")
    with open(anno_path, newline="") as f:
        pairs = list(csv.DictReader(f))
    meta = pd.read_parquet(os.path.join(VM, "test.parquet"))
    q2v = dict(zip(meta["question_id"].astype(str), meta["videoID"].astype(str)))
    have = {f[:-4] for f in os.listdir(os.path.join(VM, "videos"))
            if f.endswith(".mp4")}
    by_video = {}
    for r in pairs:
        vid = q2v.get(r["id"])
        if vid and vid in have:
            ids = by_video.setdefault(vid, [])
            if r["id"] not in ids:
                ids.append(r["id"])
    print(f"K={K} | covered pairs={sum(len(v) for v in by_video.values())} "
          f"over {len(by_video)} downloaded videos", flush=True)

    out = {}
    for name in STRATEGIES:
        rows = []
        for i, (vid, ids) in enumerate(sorted(by_video.items())):
            video = os.path.join(VM, "videos", vid + ".mp4")
            duration = bc.asset_duration(video)
            ts = sorted(t for t in select(video, duration, name, K)
                        if 0 <= t <= duration)
            for qid in ids:
                rows.append({"id": qid, "frame_timestamps": [round(t, 2) for t in ts]})
            if (i + 1) % 10 == 0:
                print(f"  {name}: {i + 1}/{len(by_video)} videos", flush=True)
        res_path = os.path.join(RESULTS, f"kfs_vidmme_{name}_k{K}.json")
        with open(res_path, "w", encoding="utf-8") as f:
            json.dump(rows, f)
        p = subprocess.run([sys.executable, eval_py, "--anno_file", anno_path,
                            "--result_file", res_path],
                           capture_output=True, text=True)
        print(f"\n== {name} (K={K}, {len(rows)} pairs) ==", flush=True)
        if p.returncode != 0:
            print(f"  eval.py FAILED rc={p.returncode}\n{p.stderr.strip()[:400]}",
                  flush=True)
            out[name] = {"rows": len(rows), "returncode": p.returncode,
                         "error": p.stderr.strip()[:500], "result_file": res_path}
            continue
        print(p.stdout.strip(), flush=True)
        out[name] = {"rows": len(rows), "returncode": 0,
                     "report": p.stdout.strip(), "result_file": res_path}
    with open(os.path.join(RESULTS, f"kfs_summary_k{K}.json"), "w",
              encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"\nDONE → {os.path.join(RESULTS, f'kfs_summary_k{K}.json')}")


if __name__ == "__main__":
    main()
