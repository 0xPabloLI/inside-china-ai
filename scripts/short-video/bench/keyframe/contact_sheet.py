#!/usr/bin/env python3
"""#391 Phase 0 observation tool — contact-sheet renderer (NOT production code).

Renders the frames a strategy actually selects into a labeled tile grid, so
the researcher can directly see 黑帧/模糊帧/重复帧/漏切段 (handoff §1.4).
This is the eye of the criteria research, not a post-hoc nicety.

Modes:
  sheet   <asset> <config>   — one contact sheet for a strategy config
  dense   <asset> [--step S] — dense labeled grid (default 0.5s) for GT
                               annotation of ground-truth shots/faces
  all-sheets                 — every CONFIGS × ASSETS combo (skips missing)

Timestamp source: model-run artifacts where geometrically trustworthy
(scene pts), else canonical derivation (bench_common.resolved_timestamps).

Run: ~/.video-tts-env/bin/python scripts/short-video/bench/keyframe/contact_sheet.py <mode> ...
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bench_common as bc  # noqa: E402


def sheet_for(asset_slug, config_slug):
    video = bc.ASSETS[asset_slug]
    if not os.path.exists(video):
        print(f"SKIP (missing asset): {asset_slug}")
        return None
    ts, art = bc.resolved_timestamps(asset_slug, config_slug)
    src = "artifact" if art else "derived"
    out = os.path.join(bc.SHEETS, f"{config_slug}__{asset_slug}.jpg")
    bc.render_sheet(video, ts, out)
    print(f"{config_slug}__{asset_slug}: {len(ts)} frames ({src}) -> {out}")
    return out


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "sheet" and len(sys.argv) == 4:
        sheet_for(sys.argv[2], sys.argv[3])
    elif mode == "dense" and len(sys.argv) >= 3:
        asset_slug = sys.argv[2]
        step = float(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[3] == "--step" else 0.5
        out = os.path.join(bc.SHEETS, f"_dense_{step}s__{asset_slug}.jpg")
        bc.render_dense_grid(bc.ASSETS[asset_slug], out, step=step)
        print(f"dense grid ({step}s) -> {out}")
    elif mode == "all-sheets":
        for asset_slug in bc.ASSETS:
            if not os.path.exists(bc.ASSETS[asset_slug]):
                print(f"SKIP (missing asset): {asset_slug}")
                continue
            for config_slug in bc.CONFIGS:
                sheet_for(asset_slug, config_slug)
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main()
