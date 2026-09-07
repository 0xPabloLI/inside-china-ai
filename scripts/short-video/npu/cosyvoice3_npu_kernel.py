#!/usr/bin/env python3
"""
CosyVoice3 NPU (Ascend 910B) kernel template for AtomGit Notebook.

Placeholders (replaced by JS adapter before upload):
  __MANIFEST_JSON__  — JSON array of {sceneId, text, instruct_text?, output}
  __REF_AUDIO_B64__  — base64-encoded reference WAV audio

Output: cosyvoice3-<scene-N>.wav + summary.json in working directory
"""
import sys, types, importlib.util, os, subprocess, time, json, traceback, base64

MANIFEST_JSON = r'''__MANIFEST_JSON__'''
REF_AUDIO_B64 = "__REF_AUDIO_B64__"

# --- Fake soundfile (transformers forces import) ---
fake_sf = types.ModuleType('soundfile')
fake_sf.read = lambda *a, **k: None
fake_sf.write = lambda *a, **k: None
fake_sf.info = lambda *a, **k: None
fake_sf.__spec__ = importlib.util.spec_from_loader('soundfile', loader=None)
fake_sf.__path__ = []
sys.modules['soundfile'] = fake_sf

PY = sys.executable
TSINGHUA = '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple'
def pip(*pkgs):
    r = subprocess.run([PY, '-m', 'pip', 'install', '-q', '--timeout', '120', *TSINGHUA, *pkgs],
                       capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        print(f"  pip failed {pkgs}: {r.stderr[:200]}", flush=True)
    return r.returncode

print("=== CosyVoice3 NPU Kernel ===", flush=True)
print(f"Python: {sys.version.split()[0]}", flush=True)

# --- Step 1: Install missing packages ---
print("=== Step 1: Installing packages ===", flush=True)
try:
    import onnxruntime; print(f"  onnxruntime {onnxruntime.__version__} OK")
except ImportError:
    print("  installing onnxruntime...", flush=True)
    pip('onnxruntime==1.29.0')
try:
    import whisper; print("  whisper OK")
except ImportError:
    print("  installing openai-whisper...", flush=True)
    pip('openai-whisper==20240930')
try:
    import torchaudio; print(f"  torchaudio {torchaudio.__version__} OK")
except ImportError:
    print("  installing torchaudio...", flush=True)
    pip('torchaudio==2.9.0', '--index-url', 'https://download.pytorch.org/whl/cpu')
try:
    import matcha; print(f"  matcha-tts OK")
except ImportError:
    print("  installing matcha-tts...", flush=True)
    pip('matcha-tts')
try:
    import pyarrow; print(f"  pyarrow {pyarrow.__version__} OK")
except ImportError:
    print("  installing pyarrow...", flush=True)
    pip('pyarrow')

# --- Step 2: Clone CosyVoice ---
CV_ROOT = '/tmp/CosyVoice'
print("\n=== Step 2: Cloning CosyVoice ===", flush=True)
if not os.path.exists(f'{CV_ROOT}/cosyvoice'):
    subprocess.run(['git', 'clone', '--depth', '1', 'https://github.com/FunAudioLLM/CosyVoice.git', CV_ROOT],
                   capture_output=True, text=True, timeout=120)
    print("  cloned")
else:
    print("  already exists")

# --- Step 3: Download model ---
MODEL_DIR = '/tmp/cosyvoice3-model'
print("\n=== Step 3: Downloading CosyVoice3 model ===", flush=True)
if not os.path.exists(f'{MODEL_DIR}/cosyvoice3.yaml'):
    import subprocess as _sp
    _sp.run(['git', 'lfs', 'install'], capture_output=True)
    r = _sp.run(['git', 'clone', '--depth', '1',
        'https://www.modelscope.cn/FunAudioLLM/Fun-CosyVoice3-0.5B-2512.git',
        MODEL_DIR], capture_output=True, text=True, timeout=1200)
    if r.returncode != 0:
        print(f"  git clone failed, trying modelscope SDK...", flush=True)
        from modelscope import snapshot_download
        snapshot_download("FunAudioLLM/Fun-CosyVoice3-0.5B-2512", local_dir=MODEL_DIR)
    print("  downloaded")
else:
    print("  already exists")

# --- Step 4: Patch source files for NPU ---
print("\n=== Step 4: Patching source files for NPU ===", flush=True)

def patch_file(path, replacements):
    with open(path, 'r') as f:
        content = f.read()
    for old, new in replacements:
        if old not in content:
            print(f"  WARN: not found in {os.path.basename(path)}: {old[:50]}...")
            continue
        content = content.replace(old, new)
    with open(path, 'w') as f:
        f.write(content)

patch_file(f'{CV_ROOT}/cosyvoice/cli/model.py', [
    ("torch.device('cuda' if torch.cuda.is_available() else 'cpu')", "torch.device('npu')"),
    ("torch.cuda.stream(torch.cuda.Stream(self.device)) if torch.cuda.is_available() else nullcontext()", "nullcontext()"),
    ("torch.cuda.amp.autocast(self.fp16 is True and hasattr(self.llm, 'vllm') is False)", "nullcontext()"),
    ("torch.cuda.amp.autocast(self.fp16)", "nullcontext()"),
    ("if torch.cuda.is_available():", "if torch.npu.is_available():"),
    ("torch.cuda.empty_cache()", "torch.npu.empty_cache()"),
    ("torch.cuda.current_stream().synchronize()", "torch.npu.current_stream().synchronize()"),
])
print("  model.py patched")

patch_file(f'{CV_ROOT}/cosyvoice/cli/frontend.py', [
    ("torch.device('cuda' if torch.cuda.is_available() else 'cpu')", "torch.device('npu')"),
    ('"CUDAExecutionProvider" if torch.cuda.is_available() else\n                                                                                 "CPUExecutionProvider"', '"CPUExecutionProvider"'),
])
print("  frontend.py patched")

patch_file(f'{CV_ROOT}/cosyvoice/cli/cosyvoice.py', [
    ("torch.cuda.is_available()", "torch.npu.is_available()"),
])
print("  cosyvoice.py patched")

# file_utils.py — replace load_wav with wave module
with open(f'{CV_ROOT}/cosyvoice/utils/file_utils.py', 'r') as f:
    fu = f.read()
old_lw = '''def load_wav(wav, target_sr, min_sr=16000):
    speech, sample_rate = torchaudio.load(wav, backend='soundfile')
    speech = speech.mean(dim=0, keepdim=True)
    if sample_rate != target_sr:
        assert sample_rate >= min_sr, 'wav sample rate {} must be greater than {}'.format(sample_rate, target_sr)
        speech = torchaudio.transforms.Resample(orig_freq=sample_rate, new_freq=target_sr)(speech)
    return speech'''
new_lw = '''def load_wav(wav, target_sr, min_sr=16000):
    import wave as _wave, numpy as _np
    with _wave.open(wav, 'rb') as wf:
        sr = wf.getframerate(); nch = wf.getnchannels(); sw = wf.getsampwidth()
        frames = wf.readframes(wf.getnframes())
    if sw == 2: audio = _np.frombuffer(frames, dtype='<i2').astype(_np.float32) / 32768.0
    elif sw == 4: audio = _np.frombuffer(frames, dtype='<i4').astype(_np.float32) / 2147483648.0
    else: raise ValueError('unsupported sampwidth {}'.format(sw))
    if nch > 1: audio = audio.reshape(-1, nch).mean(axis=1)
    speech = torch.from_numpy(audio).unsqueeze(0)
    if sr != target_sr:
        assert sr >= min_sr
        speech = torchaudio.transforms.Resample(orig_freq=sr, new_freq=target_sr)(speech)
    return speech'''
if old_lw in fu:
    fu = fu.replace(old_lw, new_lw)
    with open(f'{CV_ROOT}/cosyvoice/utils/file_utils.py', 'w') as f:
        f.write(fu)
    print("  file_utils.py patched")
else:
    print("  WARN: load_wav not found (maybe already patched)")

# --- Step 5: Prepare ref audio ---
ref_path = '/tmp/ref.wav'
with open(ref_path, 'wb') as f:
    f.write(base64.b64decode(REF_AUDIO_B64))
print(f"\nRef audio: {os.path.getsize(ref_path)} bytes")

manifest = json.loads(MANIFEST_JSON)
print(f"Manifest: {len(manifest)} segments")

# --- Step 6: Load model + inference ---
print("\n=== Step 5: Loading CosyVoice3 ===", flush=True)
import torch_npu
import torch

# Monkey-patch torch.istft to fall back to CPU (NPU doesn't support aclnnUnfoldGrad)
_orig_istft = torch.istft
def _istft_cpu_fallback(*args, **kwargs):
    spec = args[0] if args else kwargs.get('input')
    if spec.device.type == 'npu':
        orig_device = spec.device
        cpu_args = list(args)
        cpu_args[0] = spec.cpu()
        result = _orig_istft(*cpu_args, **{k: (v.cpu() if isinstance(v, torch.Tensor) and v.device.type == 'npu' else v) for k, v in kwargs.items()})
        return result.to(orig_device)
    return _orig_istft(*args, **kwargs)
torch.istft = _istft_cpu_fallback
print("  torch.istft patched for CPU fallback on NPU", flush=True)

sys.path.insert(0, CV_ROOT)
sys.path.insert(0, f'{CV_ROOT}/third_party/Matcha-TTS')

print(f"torch: {torch.__version__}, NPU: {torch.npu.is_available()}, {torch.npu.get_device_name(0)}", flush=True)

from cosyvoice.cli.cosyvoice import AutoModel
t0 = time.time()
cosyvoice = AutoModel(model_dir=MODEL_DIR)
print(f"Loaded in {time.time()-t0:.1f}s, sr={cosyvoice.sample_rate}", flush=True)

summary = {"engine": "CosyVoice3-NPU-Ascend910B4", "segments": []}
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
        out = t['output']
        import wave
        audio_int16 = (audio_np * 32767).clip(-32768, 32767).astype('<i2')
        with wave.open(out, 'w') as wf:
            wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(cosyvoice.sample_rate)
            wf.writeframes(audio_int16.tobytes())
        summary["segments"].append({"sceneId": t["sceneId"], "output": t["output"],
            "audioDuration": round(dur, 2), "genTime": round(gen_time, 1), "rtf": round(rtf, 2)})
        print(f"  {dur:.2f}s in {gen_time:.1f}s, RTF {rtf:.2f}x", flush=True)
        del full, chunks
        torch.npu.empty_cache()
    except Exception as e:
        print(f"  ERROR: {e}", flush=True); traceback.print_exc()
        summary["segments"].append({"sceneId": t["sceneId"], "error": str(e)})

json.dump(summary, open("summary.json", "w"), indent=2, ensure_ascii=False)
n_ok = len([s for s in summary['segments'] if 'error' not in s])
print(f"\n=== Done! {n_ok}/{len(manifest)} ===", flush=True)