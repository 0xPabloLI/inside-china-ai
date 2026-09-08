# ============================================================
# CosyVoice3 on AMD ROCm — 安装 + 推理验证
# 在 JupyterLab 里逐 cell 执行
# ============================================================

# ── Cell 1: 检查 GPU 和 ROCm 版本 ──
import subprocess, sys, os
print("Python:", sys.version.split()[0])

# 检查 ROCm
try:
    r = subprocess.run(["rocm-smi", "--showproductname"], capture_output=True, text=True)
    print(r.stdout[:500])
except:
    print("rocm-smi not found, trying other methods")

import torch
print(f"torch: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"Device count: {torch.cuda.device_count()}")
    # ROCm 复用 torch.cuda 接口
    print(f"ROCm version: {torch.version.hip if hasattr(torch.version, 'hip') else 'unknown'}")

# ── Cell 2: 安装依赖 ──
# ROCm 版 PyTorch 应该已预装在 Hello ROCm 模板里
# 只需装 CosyVoice3 的其他依赖
import subprocess, sys
def pip(*args):
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", *args], check=True)

pip("conformer==0.3.2", "hydra-core==1.3.2", "HyperPyYAML==1.2.3",
    "inflect==7.3.1", "librosa==0.10.2", "modelscope==1.20.0", "omegaconf==2.3.0",
    "onnx==1.16.0", "pyworld==0.3.4", "soundfile==0.12.1",
    "wetext==0.0.4", "gdown==5.1.0",
    "transformers==4.51.3", "lightning==2.2.4", "x-transformers==2.11.24")

# ONNX Runtime — 关键：检查是否有 ROCm EP
try:
    pip("onnxruntime-gpu==1.20.1")
except:
    pip("onnxruntime==1.20.1")
    print("⚠️ onnxruntime-gpu 装不上，用 CPU 版 — emotion 可能回归")

import onnxruntime as ort
print("ONNX Runtime providers:", ort.get_available_providers())
# 如果看到 'CUDAExecutionProvider' → emotion 应该 OK
# 如果只有 'CPUExecutionProvider' → emotion 可能回归（和 NPU/MPS 一样）

# ── Cell 3: 克隆 CosyVoice + 下载模型 ──
import subprocess, os

if not os.path.exists("/tmp/CosyVoice"):
    subprocess.run(["git", "clone", "https://github.com/FunAudioLLM/CosyVoice.git", "/tmp/CosyVoice"], check=True)
    subprocess.run(["git", "submodule", "update", "--init", "--recursive"],
                   cwd="/tmp/CosyVoice", check=True, timeout=120)

sys.path.insert(0, "/tmp/CosyVoice")
sys.path.insert(0, "/tmp/CosyVoice/third_party/Matcha-TTS")

model_dir = "/tmp/cosyvoice3-model"
if not os.path.exists(model_dir) or not os.path.exists(os.path.join(model_dir, "cosyvoice3.yaml")):
    subprocess.run(["git", "lfs", "install"], check=True)
    try:
        subprocess.run(["git", "clone", "--depth", "1",
            "https://www.modelscope.cn/FunAudioLLM/Fun-CosyVoice3-0.5B-2512.git",
            model_dir], check=True, timeout=1200)
    except Exception:
        from modelscope import snapshot_download
        snapshot_download("FunAudioLLM/Fun-CosyVoice3-0.5B-2512", local_dir=model_dir)
print("Model OK:", os.listdir(model_dir)[:5])

# ── Cell 4: 加载模型 + 推理 ──
import sys, os, time, json
sys.path.insert(0, "/tmp/CosyVoice")
sys.path.insert(0, "/tmp/CosyVoice/third_party/Matcha-TTS")

import torch, soundfile as sf
from cosyvoice.cli.cosyvoice import AutoModel

print("Loading CosyVoice3...")
t0 = time.time()
cosyvoice = AutoModel(model_dir="/tmp/cosyvoice3-model")
print(f"Loaded in {time.time()-t0:.1f}s, sr={cosyvoice.sample_rate}")

# 需要一个 ref audio — 从 voice-samples 目录找或上传
# 如果没有 ref audio，先用 inference 不带 clone
ref_path = None
for p in ["/tmp/ref.wav", "voice-sample-24k.wav", "../voice-sample-24k.wav"]:
    if os.path.exists(p):
        ref_path = p
        break

if ref_path is None:
    print("⚠️ No ref audio found. Upload voice-sample-24k.wav to JupyterLab first.")
    print("   Or use inference without clone (plain TTS, no emotion).")
    # 不带 ref audio 的推理
    text = "这是一段测试文本，用于验证 AMD ROCm 上的 CosyVoice3 推理。"
    chunks = []
    for j in cosyvoice.inference(text, stream=False):
        chunks.append(j['tts_speech'])
    full = torch.cat(chunks, dim=-1)
    audio_np = full[0].cpu().float().numpy()
    sf.write("/tmp/test_amd_rocm.wav", audio_np, cosyvoice.sample_rate)
    dur = len(audio_np) / cosyvoice.sample_rate
    print(f"✅ Generated: {dur:.2f}s → /tmp/test_amd_rocm.wav")
else:
    print(f"Ref audio: {ref_path}")
    # 带 ref audio + emotion 的推理
    test_cases = [
        ("hook", "这是一条令人震惊的消息！", "You are a helpful assistant. Speak with an excited and shocked tone, as if breaking incredible news.<|endofprompt|>"),
        ("narrative", "这是一段叙述性文本，用于测试平稳的语调。", "You are a helpful assistant. Speak with a calm and measured tone, like a narrator.<|endofprompt|>"),
    ]
    for name, text, instruct in test_cases:
        t0 = time.time()
        chunks = []
        for j in cosyvoice.inference_instruct2(text, instruct, ref_path, stream=False):
            chunks.append(j['tts_speech'])
        full = torch.cat(chunks, dim=-1)
        gen_time = time.time() - t0
        audio_np = full[0].cpu().float().numpy()
        dur = len(audio_np) / cosyvoice.sample_rate
        rtf = gen_time / max(dur, 0.01)
        out = f"/tmp/test_amd_{name}.wav"
        sf.write(out, audio_np, cosyvoice.sample_rate)
        print(f"✅ {name}: {dur:.2f}s in {gen_time:.1f}s, RTF {rtf:.2f}x → {out}")
        del full, chunks
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

print("\n=== Done! Download the WAV files to compare with CUDA baseline ===")