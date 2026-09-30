#!/usr/bin/env python3
"""#391 — 用**官方代码**产出 MiniCPM-o 单元（帧 + 逐段音频），落盘供 MLX 侧读取。

为什么存在：先前我用「按官方规格复现」的 loader 跑官方单元臂。用户质疑「为什么不直接
跑官方代码」——查证后官方确实可跑（两个 workaround）：
  1. 官方 loader 硬依赖 `decord`，本平台 PyPI 无 wheel → 用维护分支 **`decord2`**
     （它提供同名 `decord` 模块）；
  2. 官方包 `__init__` 会拉起 `cosyvoice/stepaudio2`（进而 `import torch`，我们不用
     TTS）→ **直接按文件路径加载 `minicpmo/utils.py`**，绕开包初始化。
环境：独立 venv `~/.venvs/omni-official`（不污染模型环境）。
产物：`official_units/<videoID>/{frame_XXX.jpg, audio_XXX.npy, manifest.json}`。

Run: ~/.venvs/omni-official/bin/python scripts/short-video/bench/keyframe/precompute_official_units.py
"""

import importlib.util as iu
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme", "videos")
OUT = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "official_units")
PKG = os.path.expanduser(
    "~/.venvs/omni-official/lib/python3.14/site-packages/minicpmo/utils.py")
LIMIT = int(os.environ.get("OU_LIMIT", "12"))


def load_official():
    spec = iu.spec_from_file_location("official_minicpmo_utils", PKG)
    mod = iu.module_from_spec(spec)
    sys.modules["official_minicpmo_utils"] = mod
    spec.loader.exec_module(mod)
    return mod


def main():
    import numpy as np
    m = load_official()
    os.makedirs(OUT, exist_ok=True)
    vids = sorted(f[:-4] for f in os.listdir(VM) if f.endswith(".mp4"))[:LIMIT]
    for v in vids:
        d = os.path.join(OUT, v)
        if os.path.exists(os.path.join(d, "manifest.json")):
            print(f"{v} cached", flush=True)
            continue
        os.makedirs(d, exist_ok=True)
        t0 = time.time()
        frames, segs, _stacked = m.get_video_frame_audio_segments(
            os.path.join(VM, f"{v}.mp4"), use_ffmpeg=True)
        for i, f in enumerate(frames):
            f.save(os.path.join(d, f"frame_{i:03d}.jpg"), quality=88)
        for i, s in enumerate(segs):
            np.save(os.path.join(d, f"audio_{i:03d}.npy"), s)
        json.dump({"videoID": v, "frames": len(frames), "audios": len(segs),
                   "sr": 16000,
                   "audio_secs": [round(len(s) / 16000, 3) for s in segs]},
                  open(os.path.join(d, "manifest.json"), "w"))
        print(f"{v}: {len(frames)} 帧 + {len(segs)} 段音频，{time.time()-t0:.1f}s",
              flush=True)
    print("DONE")


if __name__ == "__main__":
    main()
