#!/usr/bin/env python3
"""
CosyVoice3 CUDA Kaggle kernel template.

Placeholders (replaced by JS adapter before push):
  __MANIFEST_JSON__  — JSON array of {sceneId, text, instruct_text?, output}

Ref audio is loaded from Kaggle dataset: xPabloLI/tts-ref-audio

Output: /kaggle/working/output/<scene-N>.wav + summary.json
"""
import subprocess, sys, os, time, json, traceback, base64

_logfile = open("/kaggle/working/log.txt", "w")
def log(msg):
    print(msg, flush=True)
    _logfile.write(str(msg) + "\n"); _logfile.flush()

log("=== Kaggle CosyVoice3 CUDA Batch TTS ===")
log(f"Python: {sys.version.split()[0]}")

MANIFEST_JSON = r'''__MANIFEST_JSON__'''

try:
    import torch
    log(f"torch: {torch.__version__}, CUDA: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        log(f"GPU: {torch.cuda.get_device_name(0)}, CUDA: {torch.version.cuda}")
except Exception as e:
    log(f"ERROR torch: {e}"); traceback.print_exc(); sys.exit(1)

log("\n=== Installing deps ===")
try:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "setuptools<81", "wheel", "Cython"], check=True)
    subprocess.run([sys.executable, "-m", "pip", "install", "-q",
        "torch==2.4.0", "torchaudio==2.4.0", "torchvision==0.19.0",
        "--index-url", "https://download.pytorch.org/whl/cu121"], check=True)
    log("torch 2.4.0+cu121 installed")
    subprocess.run([sys.executable, "-m", "pip", "install", "-q",
        "conformer==0.3.2", "hydra-core==1.3.2", "HyperPyYAML==1.2.3",
        "inflect==7.3.1", "librosa==0.10.2", "modelscope==1.20.0", "omegaconf==2.3.0",
        "onnx==1.16.0", "pyworld==0.3.4", "soundfile==0.12.1",
        "wetext==0.0.4", "gdown==5.1.0", "wget==3.2",
        "transformers==4.51.3", "lightning==2.2.4", "x-transformers==2.11.24"], check=True)
    log("Core deps OK")
except Exception as e:
    log(f"ERROR deps: {e}"); traceback.print_exc(); sys.exit(1)

try:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "onnxruntime-gpu==1.20.1"], check=True)
    log("onnxruntime-gpu 1.20.1 OK")
except:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "onnxruntime==1.20.1"], check=True)
    log("onnxruntime CPU fallback OK")

try:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "openai-whisper", "--no-deps"], check=True)
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "tiktoken", "numba"], check=True)
    log("whisper (no-deps) + tiktoken + numba OK")
except Exception as e:
    log(f"ERROR whisper: {e}")

log("\n=== Cloning CosyVoice ===")
try:
    if not os.path.exists("/tmp/CosyVoice"):
        subprocess.run(["git", "clone", "https://github.com/FunAudioLLM/CosyVoice.git", "/tmp/CosyVoice"], check=True)
        os.chdir("/tmp/CosyVoice")
        subprocess.run(["git", "submodule", "update", "--init", "--recursive"], check=True, timeout=120)
    log("CosyVoice OK")
except Exception as e:
    log(f"ERROR clone: {e}"); traceback.print_exc(); sys.exit(1)

sys.path.insert(0, "/tmp/CosyVoice")
sys.path.insert(0, "/tmp/CosyVoice/third_party/Matcha-TTS")

log("\n=== Downloading model ===")
model_dir = "/tmp/cosyvoice3-model"
try:
    if not os.path.exists(model_dir) or not os.path.exists(os.path.join(model_dir, "cosyvoice3.yaml")):
        subprocess.run(["git", "lfs", "install"], check=True)
        subprocess.run(["git", "clone", "--depth", "1",
            "https://www.modelscope.cn/FunAudioLLM/Fun-CosyVoice3-0.5B-2512.git",
            model_dir], check=True, timeout=1200)
    log(f"Model OK: {os.listdir(model_dir)[:5]}...")
except Exception as e:
    log(f"ERROR model: {e}"); traceback.print_exc()
    try:
        from modelscope import snapshot_download
        path = snapshot_download("FunAudioLLM/Fun-CosyVoice3-0.5B-2512", local_dir=model_dir)
        log(f"Model OK (modelscope)")
    except Exception as e2:
        log(f"ERROR model fallback: {e2}"); traceback.print_exc(); sys.exit(1)

log("\n=== Preparing ref audio ===")
ref_path = "/kaggle/input/tts-ref-audio/voice-sample-24k.wav"
if not os.path.exists(ref_path):
    log(f"ERROR: ref audio not found at {ref_path}")
    sys.exit(1)
log(f"Ref audio: {os.path.getsize(ref_path)} bytes")

manifest = json.loads(MANIFEST_JSON)
log(f"Manifest: {len(manifest)} segments")

INFERENCE_CODE = r'''
import sys, os, time, json, traceback
sys.path.insert(0, "/tmp/CosyVoice")
sys.path.insert(0, "/tmp/CosyVoice/third_party/Matcha-TTS")
import torch, soundfile as sf
from cosyvoice.cli.cosyvoice import AutoModel

model_dir = "/tmp/cosyvoice3-model"
ref_path = "/kaggle/input/tts-ref-audio/voice-sample-24k.wav"
out_dir = "/kaggle/working/output"
os.makedirs(out_dir, exist_ok=True)

manifest = json.load(open("/tmp/manifest.json"))
print(f"torch: {torch.__version__}, CUDA: {torch.cuda.is_available()}", flush=True)
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}", flush=True)

print("Loading CosyVoice3...", flush=True)
t0 = time.time()
cosyvoice = AutoModel(model_dir=model_dir)
print(f"Loaded in {time.time()-t0:.1f}s, sr={cosyvoice.sample_rate}", flush=True)

summary = {"engine": "CosyVoice3-Kaggle-CUDA", "segments": []}
for i, t in enumerate(manifest):
    print(f"\n[{i+1}/{len(manifest)}] scene-{t['sceneId']}", flush=True)
    try:
        seg_start = time.time()
        chunks = []
        instruct = t.get("instruct_text")
        if instruct:
            for j in cosyvoice.inference_instruct2(t["text"], instruct, ref_path, stream=False):
                chunks.append(j['tts_speech'])
        else:
            for j in cosyvoice.inference(t["text"], ref_path, stream=False):
                chunks.append(j['tts_speech'])
        full = torch.cat(chunks, dim=-1)
        gen_time = time.time() - seg_start
        audio_np = full[0].cpu().float().numpy()
        dur = len(audio_np) / cosyvoice.sample_rate
        rtf = gen_time / max(dur, 0.01)
        out = f"{out_dir}/{t['output']}"
        sf.write(out, audio_np, cosyvoice.sample_rate)
        summary["segments"].append({"sceneId": t["sceneId"], "output": t["output"],
            "audioDuration": round(dur, 2), "genTime": round(gen_time, 1), "rtf": round(rtf, 2)})
        print(f"  {dur:.2f}s in {gen_time:.1f}s, RTF {rtf:.2f}x", flush=True)
        del full, chunks
        if torch.cuda.is_available(): torch.cuda.empty_cache()
    except Exception as e:
        print(f"  ERROR: {e}", flush=True); traceback.print_exc()
        summary["segments"].append({"sceneId": t["sceneId"], "error": str(e)})
json.dump(summary, open(f"{out_dir}/summary.json", "w"), indent=2, ensure_ascii=False)
n_ok = len([s for s in summary['segments'] if 'error' not in s])
print(f"\n=== Done! {n_ok}/{len(manifest)} ===", flush=True)
'''

json.dump(manifest, open("/tmp/manifest.json", "w"), ensure_ascii=False)
with open("/tmp/run_inference.py", "w") as f:
    f.write(INFERENCE_CODE)

log("\n=== Running inference ===")
result = subprocess.run([sys.executable, "/tmp/run_inference.py"], capture_output=True, text=True, timeout=1800)
log(result.stdout)
if result.stderr:
    log("STDERR:")
    log(result.stderr[-2000:])
if result.returncode != 0:
    log(f"ERROR: inference exited with {result.returncode}")
log("\n=== Kernel complete ===")