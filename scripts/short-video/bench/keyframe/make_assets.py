#!/usr/bin/env python3
"""#391 bench material builder (handoff §〇.5) — NOT production code.

Builds the two missing high-frequency production material classes into
.scratch/keyframe-bench/assets/:

  talkinghead_n10x6_30s.mp4 — n10 (素材库真人 talking head, 5s) stream-looped
      ×6 → ~30s. Tests: static background + 微动作 (scene signal low, mod(t,8)
      fallback carries coverage) + face-interval coverage for the #397 metric.
      Loop seams are content-identical and NOT GT shots.

  ui_demo_30s.mp4 — synthetic IDE screencast (PIL-rendered 1280×720@24fps):
      dark editor, one code line appearing every 4s at t=2,6,10,...,26
      (GT change events, construction-known), 2Hz blinking cursor, progress
      counter. Reproduces failure mode ④ 固定背景局部演示漏抓: pixel deltas
      are tiny by design, so the scene signal is expected to stay low.

Run: ~/.video-tts-env/bin/python scripts/short-video/bench/keyframe/make_assets.py
"""

import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from bench_common import ASSETS, BENCH_ASSETS, FFMPEG, WORKTREE_361  # noqa: E402

N10 = os.path.join(WORKTREE_361, ".scratch/len-compare/n10.mp4")
W, H, FPS, DURATION = 1280, 720, 24, 30

BG = (30, 30, 46)
PANEL = (38, 38, 58)
TITLE_BG = (24, 24, 38)
FG = (206, 206, 220)
DIM = (110, 110, 140)
GREEN = (152, 195, 121)
YELLOW = (229, 192, 123)
BLUE = (97, 175, 239)
CURSOR = (220, 220, 230)

CODE_LINES = [
    ("import { useQuery } from '@tanstack/react-query';", FG),
    ("  const page = 1;", GREEN),
    ("export function useSources(page: number) {", BLUE),
    ("  return useQuery({", FG),
    ("    queryKey: ['sources', page],", YELLOW),
    ("    queryFn: () => fetchSources(page),", GREEN),
    ("  });", FG),
]
LINE_APPEAR_TIMES = [2.0, 6.0, 10.0, 14.0, 18.0, 22.0, 26.0]  # GT events


def build_talkinghead():
    out = ASSETS["talkinghead-n10x6-30s"]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    # -stream_loop 5 = 1 original + 5 repeats = 6 × 5s = 30s
    subprocess.run(
        [FFMPEG, "-nostdin", "-y", "-stream_loop", "5", "-i", N10,
         "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "20",
         "-pix_fmt", "yuv420p", out],
        capture_output=True, timeout=300, check=True,
    )
    print(f"built {out}")


def render_frame(t):
    """One screencast frame at time t (deterministic)."""
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # title bar
    d.rectangle([0, 0, W, 44], fill=TITLE_BG)
    d.text((20, 12), "editor — sources.ts", fill=DIM)
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse([W - 90 + i * 24, 15, W - 78 + i * 24, 27], fill=c)
    # sidebar
    d.rectangle([0, 44, 200, H - 32], fill=PANEL)
    for i, name in enumerate(["src", "lib", "content", "docs"]):
        d.text((20, 64 + i * 26), name, fill=FG if i == 1 else DIM)
    # status bar
    d.rectangle([0, H - 32, W, H], fill=TITLE_BG)
    pct = int(t / DURATION * 100)
    d.text((20, H - 24), f"main*  Ln {2 + int(t / 4)}, Col 1  |  indexed {pct}%",
           fill=DIM)

    # code lines appear at construction-known GT times
    visible = sum(1 for tt in LINE_APPEAR_TIMES if t >= tt)
    x0, y0, lh = 230, 70, 38
    for k in range(visible):
        text, color = CODE_LINES[k]
        d.text((x0 + 40, y0 + k * lh), f"{k + 1}", fill=DIM)
        if text:
            d.text((x0 + 90, y0 + k * lh), text, fill=color)
    # blinking cursor (2 Hz) on the line after the last visible one. It never
    # stops: 7 GT change events fill 7 lines, and the shipped fixture was built
    # while an unreachable 8th entry kept this branch always-true (PR #407 P3 —
    # generator self-consistency must not move the pixels under the matrix).
    if int(t * 2) % 2 == 0:
        cy = y0 + visible * lh
        d.rectangle([x0 + 90, cy + 2, x0 + 96, cy + 24], fill=CURSOR)
    return np.asarray(img)


def build_ui_demo():
    out = ASSETS["ui-demo-screencast-30s"]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    n_frames = FPS * DURATION
    proc = subprocess.Popen(
        [FFMPEG, "-nostdin", "-y",
         "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "fast", "-crf", "20",
         "-pix_fmt", "yuv420p", out],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for i in range(n_frames):
        proc.stdin.write(render_frame(i / FPS).tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("ffmpeg ui_demo encode failed")
    print(f"built {out} ({n_frames} frames)")


if __name__ == "__main__":
    build_talkinghead()
    build_ui_demo()
