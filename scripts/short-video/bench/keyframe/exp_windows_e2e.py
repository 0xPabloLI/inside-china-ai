#!/usr/bin/env python3
"""#414 E2E — real-model latency + token cost: legacy plan vs cut-aligned 32.

Feeds (through the real minicpm call shape: mlx_vlm generate with
temperature 0.0 / max_tokens 1000 / SEMANTICS_PROMPT_VIDEO, the same
apply_chat_template + generate pair vlm_analyzer.generate_response uses):

  legacy    plan_windows_legacy + fps grids → one VLM call per window
            (<=30 s: 1 call; >30 s: 3 calls, today's production feed)
  cut32_u   plan_windows(32) + even in-window grids
  cut32_v5  plan_windows(32) + tiered_v5 per window (densify + floor guard 8 s)

Per call: frames, wall ms, and the GenerationResult stats (prompt_tokens /
generation_tokens / prompt_tps / peak_memory). Aggregates per asset-variant:
calls / frames / wall / tokens. Writes results/exp_windows_e2e.json.

Caveats recorded with the artifact: first call per frame-count shape pays the
Metal kernel compile; variants run in a fixed order and this is a quiet-machine
single-shot measurement (not a repeated benchmark).

VLM is serial — run only when no other exp_*/chain job holds the model.

Run: ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/exp_windows_e2e.py
Env: E2E_ASSETS=slug1,slug2  E2E_VARIANTS=legacy,cut32_u,cut32_v5
"""

import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import exp_windows as ew  # noqa: E402
import window_plan as wp  # noqa: E402
import vlm_analyzer as vlm  # noqa: E402


def grab_full(video, ts):
    """Full-resolution single frame (production extract_frames adds no scale)."""
    import tempfile
    fd, out = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    proc = subprocess.run(
        [bc.FFMPEG, "-nostdin", "-y", "-ss", f"{ts:.3f}", "-i", str(video),
         "-frames:v", "1", "-q:v", "2", out],
        capture_output=True, timeout=60)
    if proc.returncode != 0 or os.path.getsize(out) == 0:
        os.unlink(out)
        return None
    return out


def default_assets():
    out = []
    unitree = bc.ASSETS["unitree-superman-demo-30s"]
    if os.path.exists(unitree):
        out.append(("unitree-superman-demo-30s", unitree))
    picked = 0
    for f in sorted(os.listdir(os.path.join(VM, "videos"))):
        if not f.endswith(".mp4"):
            continue
        p = os.path.join(VM, "videos", f)
        try:
            d = bc.asset_duration(p)
        except Exception:
            continue
        if 45.0 <= d <= 180.0:
            out.append((f"videomme/{f[:-4]}", p))
            picked += 1
        if picked >= 2:
            break
    return out


def windows_for(video, duration, variant):
    if variant == "legacy":
        plan = wp.plan_windows_legacy(duration)
        return [{"start": w["start"], "end": w["end"],
                 "ts": wp.legacy_frame_timestamps([w])} for w in plan]
    cuts = ew.pure_scene_cuts(video)
    plan = wp.plan_windows(duration, cuts)
    out = []
    for w in plan:
        if variant == "cut32_u":
            ts = wp.even_grid_timestamps(w["start"], w["end"], w["budget"])
        else:  # cut32_v5
            ts = ew.select_v5(video, [w])
        out.append({"start": w["start"], "end": w["end"], "ts": ts})
    return out


def main():
    from mlx_vlm import generate as mlx_generate
    from mlx_vlm.prompt_utils import apply_chat_template as act

    want = [s.strip() for s in os.environ.get("E2E_ASSETS", "").split(",") if s.strip()]
    assets = default_assets()
    if want:
        assets = [(s, p) for s, p in assets if s in want]
    variants = [s.strip() for s in os.environ.get(
        "E2E_VARIANTS", "legacy,cut32_u,cut32_v5").split(",") if s.strip()]

    model, processor = vlm.load_model(vlm.MODEL_ID)
    try:
        vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)
    except Exception as e:
        print(f"warmup: {e}", flush=True)

    rows = []
    for slug, video in assets:
        duration = bc.asset_duration(video)
        for variant in variants:
            wins = windows_for(video, duration, variant)
            calls = []
            for w in wins:
                paths = []
                for t in w["ts"]:
                    p = grab_full(video, t)
                    if p:
                        paths.append(p)
                err = None
                t0 = time.perf_counter()
                try:
                    pr = act(processor, model.config, vlm.SEMANTICS_PROMPT_VIDEO,
                             add_generation_prompt=True, num_images=len(paths))
                    res = mlx_generate(model, processor, prompt=pr, image=paths,
                                       temperature=0.0, max_tokens=1000,
                                       verbose=False)
                    wall_ms = round((time.perf_counter() - t0) * 1000, 1)
                    text = vlm.strip_control_tokens(vlm._extract_response_text(res))
                    stats = {k: getattr(res, k, None) for k in
                             ("prompt_tokens", "generation_tokens", "total_tokens",
                              "prompt_tps", "generation_tps", "peak_memory",
                              "finish_reason")}
                except Exception as e:
                    wall_ms = round((time.perf_counter() - t0) * 1000, 1)
                    text, stats, err = "", {}, f"{type(e).__name__}: {str(e)[:120]}"
                finally:
                    for p in paths:
                        try:
                            os.unlink(p)
                        except OSError:
                            pass
                call = {"start": w["start"], "end": w["end"], "frames": len(paths),
                        "wallMs": wall_ms, "text": text[:160], **stats}
                if err:
                    call["error"] = err
                calls.append(call)
                print(f"  {slug[:30]:30s} {variant:9s} win[{w['start']:.1f}-"
                      f"{w['end']:.1f}] n={len(paths):2d} wall={wall_ms:8.0f}ms "
                      f"ptok={call.get('prompt_tokens')} "
                      f"gtok={call.get('generation_tokens')}", flush=True)
            row = {"asset": slug, "variant": variant,
                   "durationS": round(duration, 2), "calls": calls,
                   "totalFrames": sum(c["frames"] for c in calls),
                   "totalWallMs": round(sum(c["wallMs"] for c in calls), 1),
                   "totalPromptTokens": sum(c.get("prompt_tokens") or 0 for c in calls),
                   "totalGenerationTokens": sum(c.get("generation_tokens") or 0
                                                for c in calls)}
            rows.append(row)
            print(f"{slug[:30]:30s} {variant:9s} calls={len(calls)} "
                  f"frames={row['totalFrames']} wall={row['totalWallMs']/1000:.1f}s "
                  f"ptok={row['totalPromptTokens']}", flush=True)
        out = os.path.join(RESULTS, "exp_windows_e2e.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(rows, f, indent=2, ensure_ascii=False)
    print(f"DONE {len(rows)} rows → {os.path.join(RESULTS, 'exp_windows_e2e.json')}",
          flush=True)


if __name__ == "__main__":
    main()
