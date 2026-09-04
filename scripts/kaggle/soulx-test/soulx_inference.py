"""
SoulX-FlashHead 基座测试 (Kaggle T4)

目的: 验证 LeapTalk 否决根因是"1步桥蒸馏+TAEHV 结构性上限"还是基座本身。
     基座 SoulX-FlashHead 未蒸馏, 用官方 generate_video.py 跑 Model_Pro (WanVAE, FID 21)
     和 Model_Lite (TAEHV, FID 38). 若基座画质好 -> 差是蒸馏造成的; 若也差 -> SoulX 整条路线放弃.

信源 (official first):
- 仓库: https://github.com/Soul-AILab/SoulX-FlashHead
- 权重: https://huggingface.co/Soul-AILab/SoulX-FlashHead-1_3B
- License: Apache-2.0 (LICENSE, 可商用)
- Model_Pro: 10.8 FPS on RTX4090, 高质量 (README Highlights)
- Model_Lite: 96 FPS on RTX4090, 实时 (README Highlights)
- 推理脚本: generate_video.py (官方单 GPU 推理)
- 推理命令: inference_script_single_gpu_pro.sh
- 依赖: requirements.txt (torch==2.7.1+cu128 per README Quickstart)
- 与 LeapTalk 关系: LeapTalk 是 SoulX-FlashHead 的1步桥蒸馏版 (arXiv 2608.00079)
- LeapTalk 否决: v4-v8 五轮穷尽参数, 画质远不及基线 (2026-09-03)
- 测试素材: 复用 xpabloli/infinitetalk-input 数据集 (portrait.jpg + audio.wav), 与 LeapTalk 同素材 A/B
"""

import os
import sys
import subprocess
import time
import shutil
import traceback
import re
import glob as _glob
import atexit

os.environ["HF_HUB_DISABLE_XET"] = "1"
os.environ.pop("HF_HUB_ENABLE_HF_TRANSFER", None)
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

WORK_DIR = "/kaggle/working"
MODELS_DIR = "/tmp/models"
SOULX_DIR = "/tmp/SoulX-FlashHead"
CKPT_DIR = os.path.join(MODELS_DIR, "SoulX-FlashHead-1_3B")
WAV2VEC_DIR = os.path.join(MODELS_DIR, "wav2vec2-base-960h")
DEBUG_LOG = os.path.join(WORK_DIR, "debug_log.txt")
PREFLIGHT = "/tmp/preflight_check.py"

os.makedirs(WORK_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

with open(DEBUG_LOG, "w") as f:
    f.write("SOULX FLASHHEAD BASE TEST STARTED\n")
    f.flush()
    os.fsync(f.fileno())

_orig_print = print


def print(*args, **kwargs):
    _orig_print(*args, **kwargs)
    sys.stdout.flush()
    try:
        with open(DEBUG_LOG, "a") as f:
            _orig_print(*args, file=f, **kwargs)
            f.flush()
    except Exception:
        pass


TORCH_PINS = "torch==2.7.1 torchvision==0.22.1 torchaudio==2.7.1"

DEP_MAP = {
    "xfuser": "xfuser==0.4.5",
    "pyloudnorm": "pyloudnorm",
    "mediapipe": "mediapipe",
    "cv2": "opencv-python-headless",
    "diffusers": "diffusers==0.38.0",
    "einops": "einops==0.8.2",
    "accelerate": "accelerate==1.13.0",
    "omegaconf": "omegaconf==2.3.0",
    "transformers": "transformers==4.57.3",
    "peft": "peft==0.19.1",
    "librosa": "librosa==0.11.0",
    "loguru": "loguru==0.7.3",
    "imageio": "imageio imageio-ffmpeg",
    "PIL": "pillow",
    "skimage": "scikit-image",
    "yaml": "pyyaml",
    "safetensors": "safetensors",
    "scipy": "scipy",
    "tqdm": "tqdm",
    "easydict": "easydict",
    "ftfy": "ftfy",
    "decord": "decord",
    "tokenizers": "tokenizers",
}


def run(cmd, timeout=600, check=True):
    print(f"\n>>> {cmd[:300]}{'...' if len(cmd) > 300 else ''}")
    sys.stdout.flush()
    proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, bufsize=1, universal_newlines=True)
    out_lines = []
    try:
        for line in proc.stdout:
            line = line.rstrip()
            if not line:
                continue
            if 'it/s]' in line or 's/it]' in line:
                continue
            print(line)
            sys.stdout.flush()
            out_lines.append(line)
    finally:
        proc.wait(timeout=timeout)
    result = subprocess.CompletedProcess(cmd, proc.returncode, "\n".join(out_lines), "")
    if check and result.returncode != 0:
        print(f"Command failed with exit code {result.returncode}")
        sys.exit(1)
    return result


def pip_install(spec, timeout=1800, allow_fail=True):
    cmd = f"{sys.executable} -m pip install --no-cache-dir {spec} {TORCH_PINS}"
    r = run(cmd, timeout=timeout, check=False)
    if r.returncode == 0:
        return True
    print(f"  [FALLBACK] plain install failed for '{spec}', retrying with --no-deps")
    r2 = run(f"{sys.executable} -m pip install --no-cache-dir --no-deps {spec}",
             timeout=timeout, check=False)
    if r2.returncode == 0:
        return True
    if not allow_fail:
        print(f"[FATAL] could not install {spec}")
        sys.exit(1)
    return False


def neutralize_torchao():
    """Uninstall stale torchao so peft LoRA dispatchers fall through (if flash_head imports peft)."""
    probe = "/tmp/torchao_probe.py"
    src = r'''
import importlib.metadata as md, sys
try:
    ver = md.version("torchao")
except Exception:
    print("TORCHAO_STATUS=ABSENT")
    sys.exit(0)
def vt(v):
    parts = []
    for p in v.split(".")[:3]:
        d = "".join(ch for ch in p if ch.isdigit())
        parts.append(int(d) if d else 0)
    return tuple(parts)
print("TORCHAO_STATUS=PRESENT")
print("TORCHAO_VERSION=" + ver)
sys.exit(0 if vt(ver) >= (0, 16, 0) else 3)
'''
    with open(probe, "w") as f:
        f.write(src)
    r = run(f"{sys.executable} {probe}", timeout=120, check=False)
    if r.returncode == 0:
        print("  torchao: absent or >= 0.16.0 -- OK")
        return True
    print("  [HEAL] stale torchao detected (< 0.16.0) -- uninstalling")
    run(f"{sys.executable} -m pip uninstall -y torchao", timeout=300, check=False)
    r2 = run(f"{sys.executable} {probe}", timeout=120, check=False)
    if r2.returncode == 0:
        print("  torchao neutralized: OK")
        return True
    print("  [FATAL] torchao still present at incompatible version")
    return False


def self_healing_import(pyfile, label, max_rounds=8):
    for rnd in range(1, max_rounds + 1):
        r = run(f"{sys.executable} {pyfile}", timeout=900, check=False)
        if r.returncode == 0:
            print(f"  [OK] {label} passed (round {rnd})")
            return True
        m = re.search(r"No module named '([^']+)'", r.stdout)
        if not m:
            print(f"  [FATAL] {label} failed with a NON-import error (see log above)")
            return False
        mod = m.group(1).split(".")[0]
        spec = DEP_MAP.get(mod, mod)
        print(f"  [HEAL] round {rnd}: missing module '{mod}' -> pip install {spec}")
        if not pip_install(spec, timeout=1200, allow_fail=False):
            return False
    print(f"  [FATAL] {label} still failing after {max_rounds} healing rounds")
    return False


def hf_download(repo_id, dest):
    if os.path.isdir(dest) and any(os.scandir(dest)):
        print(f"  [SKIP] {dest} already present")
        return
    os.makedirs(dest, exist_ok=True)
    for attempt in range(1, 4):
        print(f"  [HF] attempt {attempt}: {repo_id} -> {dest}")
        r = run(
            f"HF_HUB_DISABLE_XET=1 {sys.executable} -m huggingface_hub.commands.huggingface_cli "
            f"download {repo_id} --local-dir {dest}",
            timeout=5400, check=False,
        )
        if r.returncode == 0 and any(os.scandir(dest)):
            n = sum(len(files) for _, _, files in os.walk(dest))
            print(f"  [OK] {repo_id} downloaded ({n} files)")
            return
        print(f"  [RETRY] {repo_id} attempt {attempt} failed, sleep 10s")
        time.sleep(10)
    print(f"[FATAL] could not download {repo_id}")
    sys.exit(1)


def show_tree(root, max_depth=2, limit=80):
    if not os.path.isdir(root):
        print(f"  [TREE] {root} MISSING")
        return
    root = root.rstrip("/")
    shown = 0
    for dirpath, dirnames, filenames in os.walk(root):
        depth = dirpath[len(root):].count(os.sep)
        if depth >= max_depth:
            dirnames[:] = []
        indent = "  " * (depth + 1)
        print(f"  [TREE] {indent}{os.path.basename(dirpath)}/")
        for fn in sorted(filenames)[:12]:
            if shown >= limit:
                print("  [TREE] ... (truncated)")
                return
            try:
                mb = os.path.getsize(os.path.join(dirpath, fn)) / 1024 / 1024
                print(f"  [TREE] {indent}  {fn}  ({mb:.1f} MB)")
            except OSError:
                print(f"  [TREE] {indent}  {fn}")
            shown += 1


@atexit.register
def _copy_debug_on_exit():
    try:
        shutil.copy(DEBUG_LOG, os.path.join(WORK_DIR, "soulx_debug_log.txt"))
    except Exception:
        pass


def resolve_input():
    for cand in ("/kaggle/input/infinitetalk-input", "/kaggle/input/xpabloli/infinitetalk-input"):
        if os.path.isdir(cand):
            return cand
    matches = _glob.glob("/kaggle/input/**/portrait.jpg", recursive=True)
    if matches:
        return os.path.dirname(matches[0])
    return None


PREFLIGHT_SRC = r'''
import sys, os, traceback
SOULX_DIR = "{SOULX_DIR}"
PORTRAIT = "{PORTRAIT}"
sys.path.insert(0, SOULX_DIR)
os.chdir(SOULX_DIR)

import torch
print("torch", torch.__version__, "| cuda avail:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("gpu:", torch.cuda.get_device_name(0))
    cap = torch.cuda.get_device_capability(0)
    print("gpu capability: sm_", cap[0], cap[1], sep="")
    if cap[0] < 80:
        print("WARN: T4/P100 (sm_", cap[0], ") does not natively support bfloat16; "
              "flash_head may auto-fallback to fp16 or run slowly", sep="")
assert torch.cuda.is_available(), "CUDA not available"

from flash_head.inference import get_pipeline, get_base_data, get_infer_params, get_audio_embedding, run_pipeline
print("FLASH_HEAD INFERENCE IMPORT OK")

import mediapipe as mp
print("mediapipe version:", getattr(mp, "__version__", "?"))
if not hasattr(mp, "solutions"):
    try:
        import mediapipe.python.solutions as _legacy
        mp.solutions = _legacy
        print("SHIM: aliased mp.solutions <- mediapipe.python.solutions")
    except Exception as e:
        print("SHIM FAILED (non-fatal):", repr(e))

print("PREFLIGHT ALL OK")
'''


def main():
    t_start = time.time()

    print("=== STEP 1/7: clone SoulX-FlashHead (depth 1) ===")
    if os.path.isfile(os.path.join(SOULX_DIR, "generate_video.py")):
        print("  [SKIP] SoulX-FlashHead already cloned")
    else:
        run(f"rm -rf {SOULX_DIR}")
        run(f"git clone --depth 1 https://github.com/Soul-AILab/SoulX-FlashHead {SOULX_DIR}", timeout=600)

    print("=== STEP 2/7: install inference deps (SoulX-FlashHead requirements.txt) ===")
    run(f"{sys.executable} -m pip install --no-cache-dir {TORCH_PINS}", timeout=1800)
    pip_install(
        "diffusers==0.38.0 transformers==4.57.3 accelerate==1.13.0 "
        "einops==0.8.2 safetensors imageio imageio-ffmpeg librosa==0.11.0 "
        "loguru==0.7.3 omegaconf==2.3.0 pyyaml opencv-python-headless pillow "
        "pyloudnorm mediapipe xformers==0.0.31 huggingface_hub scipy tqdm "
        "easydict ftfy decord scikit-image tokenizers peft==0.19.1",
        timeout=2400,
        allow_fail=False,
    )
    pip_install("xfuser==0.4.5", timeout=1200, allow_fail=True)

    if not neutralize_torchao():
        sys.exit(1)

    print("=== STEP 3/7: deep preflight (import + CUDA + GPU capability) ===")
    INPUT_DIR = resolve_input()
    if not INPUT_DIR:
        print("[FATAL] input dataset not found")
        sys.exit(1)
    print(f"  input dir: {INPUT_DIR}")
    src_portrait = os.path.join(INPUT_DIR, "portrait.jpg")
    with open(PREFLIGHT, "w") as f:
        f.write(PREFLIGHT_SRC.replace("{SOULX_DIR}", SOULX_DIR)
                              .replace("{PORTRAIT}", src_portrait))
    if not self_healing_import(PREFLIGHT, "deep preflight"):
        sys.exit(1)

    print("=== STEP 4/7: download 2 weight sets (base only, no LoRA) ===")
    hf_download("Soul-AILab/SoulX-FlashHead-1_3B", CKPT_DIR)
    hf_download("facebook/wav2vec2-base-960h", WAV2VEC_DIR)

    print("--- structure check ---")
    show_tree(CKPT_DIR, max_depth=1)
    if not os.path.isdir(os.path.join(CKPT_DIR, "Model_Pro")):
        print(f"[FATAL] Model_Pro/ not found under {CKPT_DIR}")
        sys.exit(1)
    if not os.path.isdir(os.path.join(CKPT_DIR, "Model_Lite")):
        print(f"[FATAL] Model_Lite/ not found under {CKPT_DIR}")
        sys.exit(1)
    print("  [OK] Model_Pro/ and Model_Lite/ both present")

    print("=== STEP 5/7: prepare inputs (reuse infinitetalk-input dataset) ===")
    cond_image = os.path.join(WORK_DIR, "portrait.jpg")
    audio_path = os.path.join(WORK_DIR, "audio.wav")
    shutil.copy(src_portrait, cond_image)
    shutil.copy(os.path.join(INPUT_DIR, "audio.wav"), audio_path)
    print(f"  inputs: {cond_image} | {audio_path}")

    print("=== STEP 6/7: run base inference (Pro + Lite, stream mode) ===")
    print("  Pro: Model_Pro + WanVAE, 10.8 FPS on RTX4090, high quality (README)")
    print("  Lite: Model_Lite + TAEHV, 96 FPS on RTX4090, real-time (README)")
    print("  audio_encode_mode=stream (official inference_script_single_gpu_pro.sh)")

    variants = [
        ("soulx_pro", "pro"),
        ("soulx_lite", "lite"),
    ]

    def remux_audio(src, dst):
        run(f'ffmpeg -y -i "{src}" -i "{audio_path}" -map 0:v:0 -map 1:a:0 '
            f'-c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "{dst}"',
            timeout=300, check=False)

    results = []
    for label, model_type in variants:
        out = os.path.join(WORK_DIR, f"{label}.mp4")
        out_aac = os.path.join(WORK_DIR, f"{label}_aac.mp4")
        t_var = time.time()
        print(f"\n--- variant {label} (model_type={model_type}) -> {out} ---")
        cmd = (
            f"cd {SOULX_DIR} && "
            f"CUDA_VISIBLE_DEVICES=0 python generate_video.py "
            f"--ckpt_dir {CKPT_DIR} "
            f"--wav2vec_dir {WAV2VEC_DIR} "
            f"--model_type {model_type} "
            f"--cond_image {cond_image} "
            f"--audio_path {audio_path} "
            f"--audio_encode_mode stream "
            f"--save_file {out}"
        )
        try:
            run(cmd, timeout=3600, check=False)
        except Exception as e:
            print(f"  [ERROR] {label} raised: {e!r}")
        dt = time.time() - t_var
        if os.path.exists(out):
            mb = os.path.getsize(out) / 1024 / 1024
            print(f"  [DONE] {label}: {mb:.1f} MB in {dt:.1f}s")
            remux_audio(out, out_aac)
            if os.path.exists(out_aac):
                print(f"  [AUDIO] re-muxed AAC -> {out_aac}")
                results.append((label, "OK", mb, dt))
            else:
                results.append((label, "OK(no-remux)", mb, dt))
        else:
            print(f"  [FAIL] {label}: no mp4 produced — see log above")
            results.append((label, "FAIL", 0.0, dt))

    print("\n=== VARIANT SUMMARY ===")
    for label, status, mb, dt in results:
        print(f"  {label:22s} {status:8s} {mb:7.1f} MB  {dt:7.1f}s")

    print("=== STEP 7/7: defensive entrypoints pin (Kaggle post-run nbconvert) ===")
    run(f"{sys.executable} -m pip install -q --no-cache-dir 'entrypoints<0.5'",
        timeout=600, check=False)

    print(f"[ALL DONE] total wall {time.time()-t_start:.1f}s")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        print(traceback.format_exc())