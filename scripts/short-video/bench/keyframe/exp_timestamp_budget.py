#!/usr/bin/env python3
"""#391 Exp A/B — timestamp labeling A/B + frame-budget latency (NOT production code).

Exp A (NumPro-style temporal labeling): same uniform 16-frame selection, with vs
without burned timestamps — does temporal hinting improve MiniCPM-o's video
description without any temporal encoding?
Exp B (official-route budget): uniform 64@1fps vs 16@2fps — is the official
"more frames + 3D-Resampler" route affordable on M2 Pro?

Run: ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/exp_timestamp_budget.py
"""

import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
RESULTS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "results")
SHEETS = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "contact-sheets")

sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
import vlm_analyzer as vlm  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

ASSETS = ["unitree-superman-demo-30s", "content_ABCx2_30s", "ui-demo-screencast-30s"]
TS_HINT = ("\n\nNote: the red number in the bottom-right corner of each frame "
           "is its timestamp in the video (in seconds). Use it to describe "
           "when things happen and in what order.")
TEMPORAL_WORDS = ["first", "then", "next", "finally", "after", "later",
                  "beginning", "second", "seconds", "cuts to", "transition",
                  "order", "sequence", "throughout"]


def burn_timestamp(img, ts, label=None):
    label = label if label is not None else f"t={ts:.1f}s"
    out = img.copy()
    d = ImageDraw.Draw(out)
    fs = max(14, out.width // 16)
    try:
        font = ImageFont.truetype(bc.FONTFILE, fs)
    except Exception:
        font = ImageFont.load_default()
    bbox = d.textbbox((0, 0), label, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((out.width - tw - 8, out.height - th - 8), label, font=font,
           fill=(255, 40, 40), stroke_width=2, stroke_fill=(0, 0, 0))
    return out


def count_temporal(text):
    t = (text or "").lower()
    return sum(t.count(w) for w in TEMPORAL_WORDS)


def gen(model, processor, frames, prompt):
    t0 = time.perf_counter()
    text = vlm.generate_response(model, processor, engine=vlm.DEFAULT_ENGINE,
                                 image_paths=frames, prompt_text=prompt,
                                 max_tokens=1000)
    return text, round((time.perf_counter() - t0) * 1000, 1)


def main():
    print(f"Engine={vlm.DEFAULT_ENGINE} model={vlm.MODEL_ID}", flush=True)
    t0 = time.perf_counter()
    model, processor = vlm.load_model(vlm.MODEL_ID)
    print(f"Model loaded in {time.perf_counter() - t0:.1f}s", flush=True)
    try:
        vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)
        print("Warmup complete", flush=True)
    except Exception as e:
        print(f"Warmup failed (non-fatal): {e}", flush=True)

    out = {"expA": [], "expB": []}
    for slug in ASSETS:
        path = bc.ASSETS[slug]
        print(f"\n===== {slug} =====", flush=True)

        # ── Exp A: timestamp A/B (uniform 16@2fps both arms) ──
        frames, meta = vlm._extract_minicpm_frames(
            processor, path, fps=2.0, max_frames=16, frame_strategy="uniform")
        ts = bc.true_uniform_timestamps(path, 2.0, 16)
        text_a, gen_a = gen(model, processor, frames, vlm.SEMANTICS_PROMPT_VIDEO)
        labeled = [burn_timestamp(img, t) for img, t in zip(frames, ts)]
        text_b, gen_b = gen(model, processor, labeled,
                            vlm.SEMANTICS_PROMPT_VIDEO + TS_HINT)
        # save two labeled samples so the user can see the burn
        for idx in (0, min(8, len(labeled) - 1)):
            p = os.path.join(SHEETS, f"expA_labeled_{slug}_{idx:02d}.jpg")
            labeled[idx].save(p, quality=90)
        row = {
            "asset": slug,
            "plain": {"text": text_a, "genMs": gen_a,
                      "temporalWords": count_temporal(text_a)},
            "labeled": {"text": text_b, "genMs": gen_b,
                        "temporalWords": count_temporal(text_b)},
        }
        out["expA"].append(row)
        print(f"[A] plain: {gen_a}ms temporal-words={row['plain']['temporalWords']}")
        print(text_a, flush=True)
        print(f"[A] labeled: {gen_b}ms temporal-words={row['labeled']['temporalWords']}")
        print(text_b, flush=True)

        # ── Exp B: budget (uniform 64@1fps vs the 16@2fps run above) ──
        try:
            frames64, meta64 = vlm._extract_minicpm_frames(
                processor, path, fps=1.0, max_frames=64, frame_strategy="uniform")
            text_c, gen_c = gen(model, processor, frames64,
                                vlm.SEMANTICS_PROMPT_VIDEO)
            row_b = {"asset": slug, "frameCount": meta64["frameCount"],
                     "extractionMs": meta64["extractionMs"], "genMs": gen_c,
                     "text": text_c}
            print(f"[B] 64@1fps: frames={meta64['frameCount']} "
                  f"extract={meta64['extractionMs']}ms gen={gen_c}ms")
            print(text_c, flush=True)
        except Exception as e:
            row_b = {"asset": slug, "error": str(e)[:300]}
            print(f"[B] 64@1fps FAILED: {e}", flush=True)
        out["expB"].append(row_b)
        del frames, labeled

    os.makedirs(RESULTS, exist_ok=True)
    with open(os.path.join(RESULTS, "exp_timestamp_budget.json"), "w",
              encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"\nDONE → {os.path.join(RESULTS, 'exp_timestamp_budget.json')}",
          flush=True)


if __name__ == "__main__":
    main()
