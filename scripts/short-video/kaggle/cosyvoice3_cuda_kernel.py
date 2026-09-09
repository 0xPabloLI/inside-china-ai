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
HF_REPO = "FunAudioLLM/Fun-CosyVoice3-0.5B-2512"
# Primary: pre-seeded Kaggle dataset (xPabloLI/cosyvoice3-model) mounted
# read-only at /kaggle/input/cosyvoice3-model — zero-minute cold start and
# immune to upstream network drift (2026-09-08 incident: modelscope.cn
# git clone timed out after 1200s). Online downloads stay as fallbacks.
# Foreign cloud (Kaggle): HuggingFace primary among fallbacks — curl -L
# per file is the Kaggle-verified way to pull LFS (hf_hub_download and
# `hf download` yield 0-byte files on Kaggle LFS, see
# kaggle/infinitetalk-test notes). modelscope.cn from Kaggle times out,
# so it drops to last resort.
DS_MODEL = "/kaggle/input/cosyvoice3-model"
def find_input_dir(slug):
    # Kaggle mount layout: older images use /kaggle/input/<slug>;
    # newer (2026-09) images namespace under /kaggle/input/datasets/<user>/<slug>.
    import glob
    for c in (f"/kaggle/input/{slug}", f"/kaggle/input/datasets/xpabloli/{slug}"):
        if os.path.exists(c):
            return c
    hits = glob.glob(f"/kaggle/input/**/{slug}", recursive=True)
    return hits[0] if hits else None
DS_MODEL = find_input_dir("cosyvoice3-model")
def hf_tree_download(repo, dst):
    import json as _json
    api = f"https://huggingface.co/api/models/{repo}/tree/main?recursive=true"
    r = subprocess.run(["curl", "-sL", api], capture_output=True, text=True,
                       timeout=60, check=True)
    for item in _json.loads(r.stdout):
        if item.get("type") != "file":
            continue
        target = os.path.join(dst, item["path"])
        os.makedirs(os.path.dirname(target) or dst, exist_ok=True)
        subprocess.run(["curl", "-sL", "-o", target,
            f"https://huggingface.co/{repo}/resolve/main/{item['path']}"],
            check=True)
    return dst

def assemble_model_from_mount(src, dst):
    # kaggle-cli >=2.2 uploads subdirectories only as .tar archives
    # (dir_mode=skip ignores them entirely), so the dataset carries
    # CosyVoice-BlankEN.tar / asset.tar alongside loose root weights.
    # Assemble dst: symlink loose files, extract tarballs into subdirs.
    import shutil
    os.makedirs(dst, exist_ok=True)
    for name in os.listdir(src):
        s = os.path.join(src, name)
        d = os.path.join(dst, name)
        if os.path.isfile(s) and name.endswith(".tar"):
            sub = os.path.join(dst, name[:-4])
            os.makedirs(sub, exist_ok=True)
            subprocess.run(["tar", "xf", s, "-C", sub], check=True)
        elif os.path.isfile(s):
            if not os.path.exists(d):
                os.symlink(s, d)
        elif os.path.isdir(s) and not os.path.exists(d):
            os.symlink(s, d)
    return dst

try:
    if DS_MODEL and os.path.exists(DS_MODEL):
        assemble_model_from_mount(DS_MODEL, model_dir)
        if os.path.exists(os.path.join(model_dir, "cosyvoice3.yaml")):
            log(f"Model OK (Kaggle dataset mount {DS_MODEL}): {os.listdir(model_dir)[:8]}...")
        else:
            raise RuntimeError(f"mount assembled but cosyvoice3.yaml missing: {os.listdir(model_dir)}")
    else:
        log(f"Dataset mount not found (DS_MODEL={DS_MODEL}); falling back to online download")
        if not os.path.exists(model_dir) or not os.path.exists(os.path.join(model_dir, "cosyvoice3.yaml")):
            hf_tree_download(HF_REPO, model_dir)
        log(f"Model OK (HF): {os.listdir(model_dir)[:5]}...")
except Exception as e:
    log(f"ERROR model primary: {e}"); traceback.print_exc()
    try:
        subprocess.run(["git", "lfs", "install"], check=True)
        subprocess.run(["git", "clone", "--depth", "1",
            "https://www.modelscope.cn/FunAudioLLM/Fun-CosyVoice3-0.5B-2512.git",
            model_dir], check=True, timeout=1200)
        log(f"Model OK (modelscope git)")
    except Exception as e2:
        log(f"ERROR model MS git: {e2}"); traceback.print_exc()
        try:
            from modelscope import snapshot_download
            snapshot_download("FunAudioLLM/Fun-CosyVoice3-0.5B-2512", local_dir=model_dir)
            log(f"Model OK (modelscope SDK)")
        except Exception as e3:
            log(f"ERROR model fallback: {e3}"); traceback.print_exc(); sys.exit(1)

log("\n=== Preparing ref audio ===")
_ref_dir = find_input_dir("tts-ref-audio")
ref_path = os.path.join(_ref_dir, "voice-sample-24k.wav") if _ref_dir else None
if not ref_path or not os.path.exists(ref_path):
    log(f"ERROR: ref audio not found (tts-ref-audio mount missing, _ref_dir={_ref_dir})")
    sys.exit(1)
log(f"Ref audio: {os.path.getsize(ref_path)} bytes at {ref_path}")

manifest = json.loads(MANIFEST_JSON)
log(f"Manifest: {len(manifest)} segments")

INFERENCE_CODE = r'''
import sys, os, time, json, traceback
sys.path.insert(0, "/tmp/CosyVoice")
sys.path.insert(0, "/tmp/CosyVoice/third_party/Matcha-TTS")
import torch, soundfile as sf
from cosyvoice.cli.cosyvoice import AutoModel

# Deterministic sampling: unfixed seeds let timbre/accent drift between runs
# (2026-09-09 hook accent regression). Seed pinned to the day the user
# approved the P100 emotion baseline; override via TTS_SEED env if needed.
_seed = int(os.environ.get("TTS_SEED", "20260907"))
torch.manual_seed(_seed)
import random as _random
_random.seed(_seed)
import numpy as _np
_np.random.seed(_seed)

model_dir = "/tmp/cosyvoice3-model"
import glob as _glob
_ref_hits = _glob.glob("/kaggle/input/**/tts-ref-audio", recursive=True)
ref_path = os.path.join(_ref_hits[0], "voice-sample-24k.wav") if _ref_hits else None
if not ref_path or not os.path.exists(ref_path):
    raise RuntimeError(f"ref audio mount not found (hits={_ref_hits})")
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
        speed = t.get("speed", 1.0)
        if instruct:
            for j in cosyvoice.inference_instruct2(t["text"], instruct, ref_path, stream=False, speed=speed):
                chunks.append(j['tts_speech'])
        else:
            for j in cosyvoice.inference_vc(t["text"], ref_path, stream=False, speed=speed):
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