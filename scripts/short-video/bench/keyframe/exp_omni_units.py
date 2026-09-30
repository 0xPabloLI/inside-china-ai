#!/usr/bin/env python3
"""#391 B'' — MiniCPM-o 官方 omni 装载规格（帧+音频交织）的冒烟对照。

规格来源：官方包 `minicpmo` 0.1.2（PyPI，Apache-2.0）的
`get_video_frame_audio_segments()` / `get_audio_segments()`，逐行对齐：
  - `MAX_NUM_FRAMES = 64`（env 可覆盖）；`is_long_video = duration > MAX_NUM_FRAMES`
  - 短视频：1fps 抽帧；长视频：10fps 抽帧后 `uniform_sample(64)` 均匀采样，
    时间戳取 `round(idx/10, 1)`
  - 音频：16kHz 单声道（librosa）；**第 i 段 = 第 i 个时间戳到第 i+1 个时间戳之间**
    （最后一段到片尾，不足 1600 采样点补零）
  - 交织顺序：frame[0], audio[0], frame[1], audio[1], …
我们走官方代码里的 `use_ffmpeg=True` 分支（ffmpeg 抽帧 + librosa 读音频），因此不需要
它的 `decord` 依赖——decord 在本机没有可用 wheel，而该依赖只服务另一分支。

三路对照（同一视频、同一句 prompt）：
  A 纯帧 | B 帧 + 整段音频（我们之前那种非对齐喂法）| C 官方单元（帧+分段音频交织）

Run: ~/.venvs/mlx-vlm/bin/python scripts/short-video/bench/keyframe/exp_omni_units.py [videoID]
"""

import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
LIB = os.path.join(WT_ROOT, "scripts", "short-video", "lib")
VM = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "videomme")
MAX_NUM_FRAMES = int(os.getenv("MAX_NUM_FRAMES", "64"))
sys.path.insert(0, HERE)
sys.path.insert(0, LIB)
import bench_common as bc  # noqa: E402
PROMPT = ("Describe in one detailed English sentence what happens in this "
          "video: the people, the main action and the setting.")


def uniform_sample(seq, n):
    # 官方 `minicpmo.utils.uniform_sample`：np.linspace(0, len-1, n, dtype=int)。
    # 早期这里用的是 `int(i * len / n)`，长视频路径下逐帧漂移（实测 i=18 取到
    # idx 261 而官方是 265，约 0.4s），且会把之后每段音频都切错位置。
    return bc.official_uniform_sample(seq, n)


def omni_units(video, frames_dir):
    """官方规格的 (frames, audio_segments, timestamps)。"""
    import librosa
    import numpy as np
    from PIL import Image
    dur = bc.asset_duration(video)
    long_video = dur > MAX_NUM_FRAMES
    fps_to_extract = 10 if long_video else 1
    # The frames dir is persistent across runs; ffmpeg -y overwrites from
    # frame_000001 but leaves higher-numbered frames of an earlier run (e.g.
    # different fps / longer file), which sorted(listdir) would then mix into
    # the selection and shift every timestamp. Wipe before extracting.
    shutil.rmtree(frames_dir, ignore_errors=True)
    os.makedirs(frames_dir, exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-i", video, "-vf", f"fps={fps_to_extract}",
                    os.path.join(frames_dir, "frame_%06d.jpg")],
                   capture_output=True, check=True)
    files = sorted(f for f in os.listdir(frames_dir) if f.endswith(".jpg"))
    if long_video:
        idx = uniform_sample(list(range(len(files))), MAX_NUM_FRAMES)
        ts = [round(i / fps_to_extract, 1) for i in idx]
        frames = [Image.open(os.path.join(frames_dir, files[i])).convert("RGB")
                  for i in idx]
    else:
        ts = list(range(len(files)))
        frames = [Image.open(os.path.join(frames_dir, files[i])).convert("RGB")
                  for i in range(len(files))]
    # 官方 use_ffmpeg 分支：先用 ffmpeg 落一份 16k 单声道 wav 再读（soundfile 不认 mp4）
    wav = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "audio",
                       os.path.basename(video)[:-4] + ".wav")
    if not os.path.exists(wav):
        os.makedirs(os.path.dirname(wav), exist_ok=True)
        subprocess.run(["ffmpeg", "-nostdin", "-y", "-i", video, "-vn",
                        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav],
                       capture_output=True, check=True)
    audio, sr = librosa.load(wav, sr=16000, mono=True)
    segs = []
    for i, st in enumerate(ts):
        en = ts[i + 1] if i < len(ts) - 1 else dur
        seg = audio[int(st * sr):int(en * sr)]
        if i == len(ts) - 1 and len(seg) < 1600:
            seg = np.concatenate([seg, np.zeros(1600 - len(seg), seg.dtype)])
        segs.append(seg)
    return frames, segs, ts, dur


def main():
    import vlm_analyzer as vlm
    vid = sys.argv[1] if len(sys.argv) > 1 else "2QTiAmvygC4"
    video = os.path.join(VM, "videos", f"{vid}.mp4")
    fdir = f"/tmp/omni_units_{vid}"
    frames, segs, ts, dur = omni_units(video, fdir)
    print(f"{vid}: dur={dur:.1f}s → {len(frames)} frames, {len(segs)} audio segments "
          f"(dur>64 → long path: {dur > MAX_NUM_FRAMES})", flush=True)
    print(f"  timestamps head: {ts[:6]} ... tail: {ts[-3:]}", flush=True)
    model, processor = vlm.load_model(vlm.MODEL_ID)
    try:
        vlm._warmup(model, processor, vlm.DEFAULT_ENGINE)
    except Exception as e:
        print(f"warmup: {e}", flush=True)
    wav = os.path.join(WT_ROOT, ".scratch", "keyframe-bench", "audio", f"{vid}.wav")
    variants = [
        ("A 纯帧", dict(image_paths=[os.path.join(fdir, f) for f in
                                     sorted(os.listdir(fdir))][:len(frames)])),
        ("B 帧+整段音频", dict(image_paths=[os.path.join(fdir, f) for f in
                                            sorted(os.listdir(fdir))][:len(frames)],
                               audio_path=wav)),
        ("C 官方分段（帧+逐段音频）", "SEGMENTS"),
    ]
    for name, kw in variants:
        t0 = time.time()
        try:
            if kw == "SEGMENTS":
                from mlx_vlm import generate as mlx_generate
                from mlx_vlm.prompt_utils import apply_chat_template as act
                paths = [os.path.join(fdir, f) for f in sorted(os.listdir(fdir))][:len(frames)]
                pr = act(processor, model.config, PROMPT, add_generation_prompt=True,
                         num_images=len(paths), num_audios=len(segs))
                out = vlm.strip_control_tokens(vlm._extract_response_text(
                    mlx_generate(model, processor, prompt=pr, image=paths,
                                 audio=list(segs), temperature=0.0,
                                 max_tokens=200, verbose=False)))
            else:
                out = vlm.generate_response(model, processor, engine=vlm.DEFAULT_ENGINE,
                                            prompt_text=PROMPT, max_tokens=200, **kw)
            print(f"--- {name} ({time.time()-t0:.1f}s) ---\n{out[:400]}\n", flush=True)
        except Exception as e:
            print(f"--- {name} FAILED ({time.time()-t0:.1f}s): "
                  f"{type(e).__name__}: {str(e)[:160]}\n", flush=True)


if __name__ == "__main__":
    main()
