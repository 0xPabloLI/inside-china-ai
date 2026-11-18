#!/usr/bin/env python3
"""
CosyVoice3 CUDA batch TTS for Google Colab (T4).

Mirrors scripts/short-video/kaggle/cosyvoice3_cuda_kernel.py but without any
`/kaggle/input` mount: dependencies come from PyPI, the model from
HuggingFace, and the reference audio + manifest are embedded as base64 by the
Node adapter (`lib/tts/cosyvoice3-colab-cuda.mjs`).

Contract with the adapter:
  - stdout carries one `__COLAB_TTS_FILE__<sceneId>:<base64 wav>` line per
    successful segment;
  - one `__COLAB_TTS_SUMMARY__<base64 json>` line at the end;
  - any failed segment appears in the summary with an `error` field, and the
    process still exits 0 so partial batches are recoverable.

Colab teardown is automatic (`colab run`), so artifacts travel through stdout
instead of a downloaded output directory.

Cost note: this is the fallback after Kaggle, not a default. A cold run pays
pip + clone + ~2GB model download before inference.
"""

import base64
import json
import os
import subprocess
import sys
import time
import traceback

MANIFEST_B64 = "__MANIFEST_B64__"
REF_AUDIO_B64 = "__REF_AUDIO_B64__"
PINNED_COSYVOICE_COMMIT = "074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc"
HF_REPO = "FunAudioLLM/Fun-CosyVoice3-0.5B-2512"
MODEL_DIR = "/tmp/cosyvoice3-model"
WORK_DIR = "/tmp/cosyvoice3-colab"


def log(msg):
    print(msg, flush=True)


def run(cmd, **kwargs):
    log("$ " + " ".join(cmd))
    subprocess.run(cmd, check=True, **kwargs)


def pip_install(args, extra=None):
    cmd = [sys.executable, "-m", "pip", "install", "-q"] + list(extra or []) + list(args)
    subprocess.run(cmd, check=True)


def main():
    os.makedirs(WORK_DIR, exist_ok=True)
    log("=== Colab CosyVoice3 CUDA batch TTS ===")
    log(f"python {sys.version.split()[0]}")

    # ── deps (same set the Kaggle kernel froze, minus the wheelhouse) ──
    pip_install(["setuptools<81", "wheel", "Cython"])
    pip_install(
        ["torch==2.6.0", "torchaudio==2.6.0", "torchvision==0.21.0"],
        extra=["--index-url", "https://download.pytorch.org/whl/cu124"],
    )
    pip_install(
        [
            "conformer==0.3.2", "hydra-core==1.3.2", "HyperPyYAML==1.2.3",
            "inflect==7.3.1", "librosa==0.10.2", "modelscope==1.20.0",
            "omegaconf==2.3.0", "onnx==1.18.0", "soundfile==0.12.1",
            "wetext==0.0.4", "gdown==5.1.0", "wget==3.2",
            "transformers==4.51.3", "lightning==2.2.4", "x-transformers==2.11.24",
            "huggingface_hub==0.36.2",
        ]
    )
    pip_install(["--force-reinstall", "--no-deps", "huggingface_hub==0.36.2"])
    pip_install(["--no-deps", "diffusers==0.32.2"])
    log("deps OK")

    # ── CosyVoice source ──
    if not os.path.exists("/tmp/CosyVoice"):
        run(["git", "clone", "https://github.com/FunAudioLLM/CosyVoice.git", "/tmp/CosyVoice"])
        run(["git", "checkout", PINNED_COSYVOICE_COMMIT], cwd="/tmp/CosyVoice")
        run(["git", "submodule", "update", "--init", "--recursive"], cwd="/tmp/CosyVoice", timeout=180)
    sys.path.insert(0, "/tmp/CosyVoice")
    sys.path.insert(0, "/tmp/CosyVoice/third_party/Matcha-TTS")

    # ── model ──
    if not os.path.exists(os.path.join(MODEL_DIR, "cosyvoice3.yaml")):
        from huggingface_hub import snapshot_download
        log(f"downloading {HF_REPO} ...")
        snapshot_download(repo_id=HF_REPO, local_dir=MODEL_DIR)
    log("model OK")

    # ── wetext frontend seed (avoids a slow modelscope fetch on load) ──
    try:
        from modelscope import snapshot_download as ms_download
        ms_download("pengzhendong/wetext")
        log("wetext seeded")
    except Exception as e:
        log(f"wetext seed skipped: {e}")

    # ── inputs ──
    manifest = json.loads(base64.b64decode(MANIFEST_B64).decode("utf-8"))
    ref_path = os.path.join(WORK_DIR, "ref.wav")
    with open(ref_path, "wb") as f:
        f.write(base64.b64decode(REF_AUDIO_B64))
    log(f"manifest: {len(manifest)} segments, ref {os.path.getsize(ref_path)} bytes")

    # ── inference ──
    import torch
    import soundfile as sf
    from cosyvoice.cli.cosyvoice import CosyVoice3

    log(f"torch {torch.__version__}, cuda={torch.cuda.is_available()}")
    if torch.cuda.is_available():
        log(f"GPU: {torch.cuda.get_device_name(0)}")
    t0 = time.time()
    cosyvoice = CosyVoice3(model_dir=MODEL_DIR)
    log(f"loaded in {time.time() - t0:.1f}s, sr={cosyvoice.sample_rate}")

    summary = {"engine": "CosyVoice3-Colab-CUDA", "segments": []}
    for i, seg in enumerate(manifest):
        scene_id = seg["sceneId"]
        log(f"[{i + 1}/{len(manifest)}] scene-{scene_id}")
        try:
            started = time.time()
            chunks = []
            kwargs = {"stream": False}
            if seg.get("speed") is not None:
                kwargs["speed"] = seg["speed"]
            if seg.get("instruct_text"):
                for out in cosyvoice.inference_instruct2(
                    seg["text"], seg["instruct_text"], ref_path, **kwargs
                ):
                    chunks.append(out["tts_speech"])
            else:
                for out in cosyvoice.inference(seg["text"], ref_path, **kwargs):
                    chunks.append(out["tts_speech"])
            full = torch.cat(chunks, dim=-1)
            gen_time = time.time() - started
            audio = full[0].cpu().float().numpy()
            duration = len(audio) / cosyvoice.sample_rate
            out_path = os.path.join(WORK_DIR, seg["output"])
            sf.write(out_path, audio, cosyvoice.sample_rate)
            with open(out_path, "rb") as f:
                wav_b64 = base64.b64encode(f.read()).decode("ascii")
            print(f"__COLAB_TTS_FILE__{scene_id}:{wav_b64}", flush=True)
            summary["segments"].append(
                {
                    "sceneId": scene_id,
                    "output": seg["output"],
                    "audioDuration": round(duration, 2),
                    "genTime": round(gen_time, 1),
                }
            )
            log(f"  {duration:.2f}s in {gen_time:.1f}s")
            del full, chunks
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception as e:
            log(f"  ERROR: {e}")
            traceback.print_exc()
            summary["segments"].append({"sceneId": scene_id, "error": str(e)})

    payload = base64.b64encode(json.dumps(summary).encode("utf-8")).decode("ascii")
    print(f"__COLAB_TTS_SUMMARY__{payload}", flush=True)
    ok = len([s for s in summary["segments"] if "error" not in s])
    log(f"=== done {ok}/{len(manifest)} ===")


if __name__ == "__main__":
    main()
