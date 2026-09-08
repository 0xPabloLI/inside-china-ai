#!/usr/bin/env python3
"""
CosyVoice3 CUDA Modal engine script.

Runs CosyVoice3 on Modal A100 GPU (paid, ~$30/mo) with full CUDA emotion fidelity.
Used as fallback when Kaggle P100 quota exhausted — same CUDA EP, same emotion quality.

Usage:
  modal run cosyvoice3_cuda_modal.py --manifest-file /tmp/manifest.json --ref-audio path/to/ref.wav --output-file /tmp/output.json

Output JSON format:
  {"engine": "CosyVoice3-Modal-CUDA", "segments": [
    {"sceneId": 1, "wav_b64": "...", "output": "scene-1.wav", "audioDuration": 3.5, "genTime": 4.2, "rtf": 1.2},
    {"sceneId": 2, "error": "..."}
  ]}

Model + CosyVoice source cached in Modal volume `cosyvoice3-cuda` to avoid re-download.
"""
import sys, os, json, time, traceback, base64, subprocess

import modal

APP_NAME = "cosyvoice3-modal-cuda"
VOLUME_NAME = "cosyvoice3-cuda"
MODEL_DIR = "/vol/cosyvoice3-model"
COSYVOICE_SRC = "/vol/CosyVoice"
MATCHA_SRC = "/vol/CosyVoice/third_party/Matcha-TTS"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "git-lfs", "wget", "ffmpeg")
    .pip_install("setuptools<81", "wheel", "Cython")
    .pip_install(
        "torch==2.4.0", "torchaudio==2.4.0", "torchvision==0.19.0",
        index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "conformer==0.3.2", "hydra-core==1.3.2", "HyperPyYAML==1.2.3",
        "inflect==7.3.1", "librosa==0.10.2", "modelscope==1.20.0", "omegaconf==2.3.0",
        "onnx==1.16.0", "pyworld==0.3.4", "soundfile==0.12.1",
        "wetext==0.0.4", "gdown==5.1.0",
        "transformers==4.51.3", "lightning==2.2.4", "x-transformers==2.11.24",
        "numpy<2.0",
    )
    .pip_install("onnxruntime-gpu==1.20.1")
    .pip_install("openai-whisper", "--no-deps")
    .pip_install("tiktoken", "numba")
)

volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)

stub = modal.Stub(APP_NAME, image=image)


@stub.function(gpu="A100", timeout=1800, volumes={VOLUME_NAME: volume})
def infer(manifest: list, ref_audio_b64: str) -> dict:
    """Run CosyVoice3 inference on A100 GPU.

    Args:
        manifest: [{sceneId, text, instruct_text?, output}]
        ref_audio_b64: base64-encoded WAV ref audio

    Returns:
        {engine, segments: [{sceneId, wav_b64, output, audioDuration, genTime, rtf} | {sceneId, error}]}
    """
    import sys, os, time, json, traceback, base64, tempfile

    os.environ.setdefault("CUDA_HOME", "/usr/local/cuda")

    volume.reload()

    if not os.path.exists(COSYVOICE_SRC):
        print("Cloning CosyVoice...", flush=True)
        subprocess.run(["git", "clone", "https://github.com/FunAudioLLM/CosyVoice.git", COSYVOICE_SRC], check=True)
        subprocess.run(["git", "submodule", "update", "--init", "--recursive"],
                       cwd=COSYVOICE_SRC, check=True, timeout=120)
        volume.commit()

    sys.path.insert(0, COSYVOICE_SRC)
    sys.path.insert(0, MATCHA_SRC)

    if not os.path.exists(MODEL_DIR) or not os.path.exists(os.path.join(MODEL_DIR, "cosyvoice3.yaml")):
        print("Downloading model...", flush=True)
        subprocess.run(["git", "lfs", "install"], check=True)
        try:
            subprocess.run(["git", "clone", "--depth", "1",
                "https://www.modelscope.cn/FunAudioLLM/Fun-CosyVoice3-0.5B-2512.git",
                MODEL_DIR], check=True, timeout=1200)
        except Exception:
            from modelscope import snapshot_download
            snapshot_download("FunAudioLLM/Fun-CosyVoice3-0.5B-2512", local_dir=MODEL_DIR)
        volume.commit()

    ref_path = "/tmp/ref_audio.wav"
    with open(ref_path, "wb") as f:
        f.write(base64.b64decode(ref_audio_b64))
    print(f"Ref audio: {os.path.getsize(ref_path)} bytes", flush=True)

    import torch
    import soundfile as sf
    from cosyvoice.cli.cosyvoice import AutoModel

    print(f"torch: {torch.__version__}, CUDA: {torch.cuda.is_available()}", flush=True)
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}", flush=True)

    print("Loading CosyVoice3...", flush=True)
    t0 = time.time()
    cosyvoice = AutoModel(model_dir=MODEL_DIR)
    print(f"Loaded in {time.time()-t0:.1f}s, sr={cosyvoice.sample_rate}", flush=True)

    summary = {"engine": "CosyVoice3-Modal-CUDA", "segments": []}
    for i, t in enumerate(manifest):
        print(f"\n[{i+1}/{len(manifest)}] scene-{t['sceneId']}", flush=True)
        try:
            seg_start = time.time()
            chunks = []
            instruct = t.get("instruct_text")
            if instruct:
                for j in cosyvoice.inference_instruct2(t["text"], instruct, ref_path, stream=False):
                    chunks.append(j["tts_speech"])
            else:
                for j in cosyvoice.inference(t["text"], ref_path, stream=False):
                    chunks.append(j["tts_speech"])
            full = torch.cat(chunks, dim=-1)
            gen_time = time.time() - seg_start
            audio_np = full[0].cpu().float().numpy()
            dur = len(audio_np) / cosyvoice.sample_rate
            rtf = gen_time / max(dur, 0.01)

            import io
            buf = io.BytesIO()
            sf.write(buf, audio_np, cosyvoice.sample_rate, format="WAV")
            wav_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

            summary["segments"].append({
                "sceneId": t["sceneId"], "wav_b64": wav_b64, "output": t["output"],
                "audioDuration": round(dur, 2), "genTime": round(gen_time, 1), "rtf": round(rtf, 2),
            })
            print(f"  {dur:.2f}s in {gen_time:.1f}s, RTF {rtf:.2f}x", flush=True)
            del full, chunks, audio_np
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception as e:
            print(f"  ERROR: {e}", flush=True)
            traceback.print_exc()
            summary["segments"].append({"sceneId": t["sceneId"], "error": str(e)})

    n_ok = len([s for s in summary["segments"] if "error" not in s])
    print(f"\n=== Done! {n_ok}/{len(manifest)} ===", flush=True)
    return summary


@stub.local_entrypoint()
def main(
    manifest_file: str,
    ref_audio: str,
    output_file: str,
):
    """Local entrypoint: read manifest + ref audio, call remote infer, write output JSON."""
    manifest = json.load(open(manifest_file, "r"))
    ref_audio_b64 = base64.b64encode(open(ref_audio, "rb").read()).decode("ascii")
    print(f"Manifest: {len(manifest)} segments, ref audio: {len(ref_audio_b64)} b64 chars", flush=True)

    result = infer.remote(manifest, ref_audio_b64)

    json.dump(result, open(output_file, "w"), indent=2, ensure_ascii=False)
    n_ok = len([s for s in result["segments"] if "error" not in s])
    print(f"Output written to {output_file}: {n_ok}/{len(manifest)} OK", flush=True)