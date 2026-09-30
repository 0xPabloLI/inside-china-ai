#!/usr/bin/env python3
"""#391 — Video-MME 子集音频转写（QA 臂「转写文本」的来源）。

默认 MLX whisper-large-v3-mlx + **关闭跨段上下文**（condition_on_previous_text=False）：
whisper 自回归解码默认把前文当上下文，低信噪/长静音片段会陷入重复幻觉——
92 份 ctx-on 转写里 18 份在前 2000 字符窗口内重复率 >20%、6 份 >50%；
ctx-off 抽查最长重复 27→1（见 .scratch/keyframe-bench/asr_ctxoff_spot.json）。
#418 已把「关上下文」定为生产调用口径，bench 复跑跟随（只翻这一个开关，
模型与其余参数与旧批一致，保证对照只差上下文）。

旧 ctx-on 转写在 asr/ 保留作对照；本脚本默认写 asr_ctxoff/。可断点续跑。

Run: ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/asr_batch.py [out_subdir]
"""

import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
BENCH = os.path.join(WT_ROOT, ".scratch", "keyframe-bench")
VM_VIDEOS = os.path.join(BENCH, "videomme", "videos")
AUD = os.path.join(BENCH, "audio")
OUT_DIR = os.path.join(BENCH, sys.argv[1] if len(sys.argv) > 1 else "asr_ctxoff")
FFMPEG = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
MODEL = "mlx-community/whisper-large-v3-mlx"


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    vids = sorted(f[:-4] for f in os.listdir(VM_VIDEOS) if f.endswith(".mp4"))
    todo = [v for v in vids
            if not os.path.exists(os.path.join(OUT_DIR, f"{v}.json"))]
    print(f"{len(vids)} videos, {len(todo)} to transcribe → {OUT_DIR}", flush=True)
    import mlx_whisper
    t0 = time.time()
    for i, v in enumerate(todo):
        wav = os.path.join(AUD, f"{v}.wav")
        if not os.path.exists(wav):
            subprocess.run([FFMPEG, "-nostdin", "-y", "-i",
                            os.path.join(VM_VIDEOS, f"{v}.mp4"), "-vn",
                            "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav],
                           capture_output=True)
        try:
            r = mlx_whisper.transcribe(wav, path_or_hf_repo=MODEL,
                                       condition_on_previous_text=False)
            json.dump({"videoID": v, "language": r.get("language"),
                       "text": r.get("text", "").strip(),
                       "segments": [{"start": round(s["start"], 2),
                                     "end": round(s["end"], 2),
                                     "text": s["text"].strip()}
                                    for s in r.get("segments", [])]},
                      open(os.path.join(OUT_DIR, f"{v}.json"), "w",
                           encoding="utf-8"),
                      ensure_ascii=False)
            print(f"[{i+1}/{len(todo)}] {v} lang={r.get('language')} "
                  f"chars={len(r.get('text', ''))}", flush=True)
        except Exception as e:
            print(f"[{i+1}/{len(todo)}] {v} FAILED "
                  f"{type(e).__name__}: {str(e)[:80]}", flush=True)
    print(f"ASR DONE in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
