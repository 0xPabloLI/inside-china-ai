"""
LeapTalk v8: WanVAE CFG sweep (Kaggle T4)

v8 rationale (2026-09-02 22:39 肉眼复核推翻 v5-v7 的 TAEHV 路线):
  v5 A/B (TAEHV) 额头出现油画/水彩色块; C/D (WanVAE) 视觉干净.
  => WanVAE 才是视觉正确路线, 之前 v6/v7 的 CFG 扫描全在 TAEHV 上做, 伪影
  阈值结论不能外推到 WanVAE. v8 在 WanVAE 上重做 CFG 扫描.

Paper anchors (arXiv 2608.00079):
  - Pro+WanVAE FID 21 (Table 1) vs Lite+TAEHV FID 38
  - α=1.6 paper default (§Parameter Sensitivity)
  - 1 step design goal (200 FPS on H200, Appendix F)
  - 512×512 main experiments (Appendix F)
  - WanVAE Dec 5.26s/10.1GB vs TAEHV 0.24s/0.4GB (Table 5) -> 3x slower but T4 15GB fits

v8 sweep: α ∈ {1.6, 2.0, 2.5, 3.0, 3.5} × WanVAE × 1 step × 512² × Pro
  - 1.6 = paper default (baseline)
  - 2.0-3.0 = v6 TAEHV sweet spot, untested on WanVAE
  - 3.5 = probe WanVAE artifact threshold (TAEHV destroys at α≥3, WanVAE unknown)

v1 result: FAILED at STEP 3 (smoke import) -- ModuleNotFoundError: xfuser.
  Caught BEFORE the multi-GB download, so no GPU quota wasted. Good.
v2 result: dependency problem SOLVED (FLASH_HEAD IMPORT OK, torch 2.7.1+cu126,
  Tesla T4 detected), but preflight then died on
  `AttributeError: module 'mediapipe' has no attribute 'solutions'`.
  Preflight again caught it BEFORE the multi-GB download.

v2 fixes:
- Dep closure computed by AST-parsing the repo (not guessed). v1 missed 4
  packages. See DEP_MAP for the module -> pip mapping.
- Self-healing import loop: on ModuleNotFoundError, pip-install the missing
  module and retry (max 8 rounds). Removes the push-per-missing-dep cycle.
- Post-download structure check: asserts Model_Pro/ exists and resolves the
  Lite TAE path, matching the code's own resolution order.

v3 fixes (mediapipe):
- Face crop is OPTIONAL and SAFE: --use_face_crop is store_true (default off,
  inf.sh never passes it), and flash_head_pipeline.py:69-73 wraps
  process_image() in try/except -> a broken mediapipe degrades to the plain
  PIL image instead of crashing. So the mediapipe probe is now NON-FATAL.
- Best-effort shim: alias mp.solutions <- mediapipe.python.solutions, since
  recent mediapipe dropped the legacy top-level namespace.
- Runs BOTH variants in one GPU session (weights already downloaded):
  A) official inf.sh defaults, B) --use_face_crop. Same download cost, twice
  the information, and A remains the faithful official-config baseline.
- Note: without face crop the portrait is still aspect-preserved, because
  flash_head_pipeline.py:246 uses resize_and_centercrop (not a naive stretch).

v3 result: BIG progress -- deps OK, all 3 weight sets downloaded, pipeline
  initialized (TAEHV resolved to /tmp/models/leaptalk/taew2_1.pth, model dtype
  pro). Died at `PeftModel.from_pretrained` ->
  ImportError: Found an incompatible version of torchao. Found version 0.10.0,
  but only versions above 0.16.0 are supported.

v4 fixes (torchao):
- is_torchao_available() (peft/import_utils.py:128-147) RAISES when torchao is
  installed at <0.16.0 instead of returning False, and dispatch_torchao
  (peft/tuners/lora/torchao.py:142) is in the dispatcher chain ahead of
  dispatch_default (peft/tuners/lora/model.py:409-418). So ANY stale torchao
  (the Kaggle image ships 0.10.0) breaks ALL LoRA loading, quantized or not.
- Fix = remove it, not upgrade it: torchao >=0.16 wants a newer torch than the
  repo's pinned 2.7.1. With torchao absent, find_spec() -> None -> False ->
  dispatch_default handles nn.Linear.
- neutralize_torchao() runs AFTER the pip installs (a transitive dep can pull
  torchao back in) and before downloads.
- Preflight now runs a real LoRA injection on a tiny nn.Linear, reproducing the
  exact v3 failure in ~1s without touching the multi-GB weights.

v4 result: END-TO-END SUCCESS. Both mp4s produced (512x512, 25fps, 77 frames,
  3.08s, h264+mp3). But the mouths barely move: inter-frame YAVG diff mean=3.19
  (a talking head is normally 10-30+), while the audio is real speech
  (mean -26.3dB). T4 measured 1.41 FPS vs the paper's 200 FPS.

v4 diagnosis (three separate root causes, all verified against source):
1. LIP SYNC = guidance_scale, NOT steps. inf.sh never passes --guidance_scale,
   and inference.py defaults it to 1.0, whose own help says "1.0 disables
   guidance". The PAPER (arXiv 2608.00079, "Parameter Sensitivity") says:
     "a moderate value around 1.6 achieves the best balance... We therefore
      use alpha=1.6"
   So the shipped script defaults to the one config that turns OFF the
   audio-CFG the paper itself recommends. Paper ablation: motion amplitude
   1.655 @ CFG 1.0 (lowest of all tested) -> 3.394 @ CFG 3.0.
2. BLURRINESS = the Lite TAEHV decoder. Paper, "Effect of different
   Autoencoders": TAEHV's "main degradation is slight blurriness in fine
   regions such as lips, which can be alleviated by increasing inference from
   1 to 2 steps". Table 1: Pro+WanVAE FID 21 vs Lite+TAEHV FID 38.
3. v4 ran a combination THE PAPER NEVER MEASURES: --model_type pro + --lite,
   i.e. Pro weights decoded through the Lite TAEHV. It gives up Pro's FID 21
   while also giving up Lite's 200 FPS. Worst-of-both.

v5 changes (the actual fix):
- --guidance_scale 1.6 (paper default alpha) instead of the script's 1.0.
- --no_lite to reach WanVAE (VAE_Wan/Wan2.1_VAE.pth, confirmed present in
  the SoulX-FlashHead-1_3B repo at 484.1 MB by the v4 run's tree dump).
- 4 variants in one GPU session, cheapest/most-informative first.
- Repairs `entrypoints` at the end: huggingface_hub[cli] downgrades it, which
  makes Kaggle's post-run nbconvert step crash with
  "ImportError: cannot import name 'EntryPoint' from 'entrypoints'". That is
  why v4 reported ERROR even though [ALL DONE] had been reached.

Sources (信源优先原则, official first):
- CFG alpha=1.6: arXiv 2608.00079 "Parameter Sensitivity" (paper default)
- CFG ablation (1.655 @ 1.0 -> 3.394 @ 3.0): arXiv 2608.00079 ablation
- TAEHV blur + "1 to 2 steps": arXiv 2608.00079 "Effect of different Autoencoders"
- FID 21 (Pro+WanVAE) vs 38 (Lite+TAEHV): arXiv 2608.00079 Table 1
- 200 FPS measured on H200: arXiv 2608.00079 Appendix F (so T4's 1.41 FPS
  is not a contradiction)
- "--guidance_scale ... 1.0 disables guidance": LeapTalk/inference.py argparse
- --lite is store_true default True; --no_lite selects WanVAE:
  LeapTalk/inference.py argparse
- WanVAE path <ckpt_dir>/VAE_Wan/Wan2.1_VAE.pth:
  flash_head/src/pipeline/flash_head_pipeline.py:141-164
- Args + defaults: LeapTalk/inference.py argparse (authoritative)
- Official run command: LeapTalk/inf.sh (CKPT/WAV2VEC/LORA dirs, torchrun 1 proc)
- ckpt layout: flash_head/src/pipeline/flash_head_pipeline.py:167-169
  (model_type "pro" -> <ckpt_dir>/Model_Pro; "lite" -> Model_Lite + VAE_LTX)
- Lite TAE resolution order: inference.py:_resolve_lite_tae_path
  (taew2_1.pth under --lora_dir, its parent, or <ckpt_dir>/VAE_Wan)
- Model_Pro / Model_Lite both exist: Soul-AILab/SoulX-FlashHead README
- Dep pins: LeapTalk/requirements.txt
- License: Apache-2.0 (LICENSE added 2026-08-11)
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

# ===== CRITICAL: disable Xet BEFORE any huggingface import (causes 0B LFS on Kaggle) =====
os.environ["HF_HUB_DISABLE_XET"] = "1"
os.environ.pop("HF_HUB_ENABLE_HF_TRANSFER", None)
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

WORK_DIR = "/kaggle/working"
MODELS_DIR = "/tmp/models"          # ~70GB, vs /kaggle/working ~20GB
LEAPTALK_DIR = "/tmp/LeapTalk"
CKPT_DIR = os.path.join(MODELS_DIR, "SoulX-FlashHead-1_3B")
WAV2VEC_DIR = os.path.join(MODELS_DIR, "wav2vec2-base-960h")
LORA_DIR = os.path.join(MODELS_DIR, "leaptalk")
DEBUG_LOG = os.path.join(WORK_DIR, "debug_log.txt")
PREFLIGHT = "/tmp/preflight_check.py"

os.makedirs(WORK_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

with open(DEBUG_LOG, "w") as f:
    f.write("LEAPTALK v8 SCRIPT STARTED\n")
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


# ---------------------------------------------------------------- pip helpers
# Pinned to the versions the repo itself ships (requirements.txt). Repeating the
# torch pins on EVERY pip call stops a transitive dep (esp. xfuser) from
# silently swapping the CUDA build out from under us.
TORCH_PINS = "torch==2.7.1 torchvision==0.22.1 torchaudio==2.7.1"

# module -> pip spec. Derived from AST-parsing flash_head/, vibt/, utils/,
# inference.py. Optional/try-guarded imports (flash_attn, sageattention,
# torch_xla, yunchang) are deliberately excluded -- they cost huge compile
# times and are not on the lite single-GPU path.
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
    "yunchang": "yunchang",
    "safetensors": "safetensors",
    "scipy": "scipy",
    "tqdm": "tqdm",
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
            if 'it/s]' in line or 's/it]' in line:   # filter tqdm spam
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
    """Install with torch pins re-asserted; falls back to --no-deps."""
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


# --- torchao neutralization -------------------------------------------------
# Root cause of the v3 failure (verified against peft v0.19.1 source):
#   * is_torchao_available()  (peft/import_utils.py:128-147)  RAISES ImportError
#     when torchao is installed with version < 0.16.0, instead of returning False.
#   * dispatch_torchao()      (peft/tuners/lora/torchao.py:142) calls it for every
#     target exposing `.weight`, and sits in the dispatcher chain ahead of
#     dispatch_default (peft/tuners/lora/model.py:409-418).
# => A stale torchao (the Kaggle image ships 0.10.0) breaks ALL LoRA creation,
#    whether or not the model uses quantization. Removing it makes
#    find_spec() -> None -> is_torchao_available() False -> dispatch_default.
# Upgrading torchao is NOT the fix: >=0.16 requires a newer torch than the
# repo's pinned 2.7.1 (requirements.txt:171).
TORCHAO_MIN = (0, 16, 0)
TORCHAO_PROBE = "/tmp/torchao_probe.py"
TORCHAO_PROBE_SRC = r'''
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


def neutralize_torchao():
    """Uninstall a stale torchao so peft's LoRA dispatchers can fall through."""
    with open(TORCHAO_PROBE, "w") as f:
        f.write(TORCHAO_PROBE_SRC)
    r = run(f"{sys.executable} {TORCHAO_PROBE}", timeout=120, check=False)
    if r.returncode == 0:
        print("  torchao: absent or >= 0.16.0 -- OK, leaving as is")
        return True
    print("  [HEAL] stale torchao detected (< 0.16.0) -- uninstalling "
          "(peft 0.19.1 raises instead of degrading)")
    run(f"{sys.executable} -m pip uninstall -y torchao", timeout=300, check=False)
    r2 = run(f"{sys.executable} {TORCHAO_PROBE}", timeout=120, check=False)
    if r2.returncode == 0:
        print("  torchao neutralized: OK")
        return True
    print("  [FATAL] torchao still present at an incompatible version")
    return False


def self_healing_import(pyfile, label, max_rounds=8):
    """Run a python file, auto-installing whatever module is missing, retrying.

    Turns 'missing dep -> fail -> re-push -> 4 min reinstall' into one run.
    """
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
    """Download a whole HF repo via huggingface-cli (Xet disabled). Retry x3."""
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
    print(f"  [FATAL] could not download {repo_id}")
    sys.exit(1)


def show_tree(root, max_depth=2, limit=80):
    """Print a shallow tree so a layout mismatch is diagnosable from the log."""
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
        shutil.copy(DEBUG_LOG, os.path.join(WORK_DIR, "leaptalk_debug_log.txt"))
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


# ------------------------------------------------------------------ preflight
# Deliberately deeper than a plain `import`: mp.solutions is MediaPipe's legacy
# API and constructing the detector also proves the bundled .tflite is present.
PREFLIGHT_SRC = r'''
import sys, os, traceback
LEAPTALK_DIR = "{LEAPTALK_DIR}"
PORTRAIT = "{PORTRAIT}"
sys.path.insert(0, LEAPTALK_DIR)

import torch
print("torch", torch.__version__, "| cuda avail:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("gpu:", torch.cuda.get_device_name(0))
assert torch.cuda.is_available(), "CUDA not available"

import flash_head.src.pipeline.flash_head_pipeline as fh
print("FLASH_HEAD IMPORT OK ->", fh.__name__)

from flash_head.utils.facecrop import process_image
print("FACECROP IMPORT OK (pulls mediapipe)")

# --- MediaPipe legacy-solutions probe (NON-FATAL) -------------------------
# Why non-fatal: process_image() is only reached when use_face_crop=True, and
# flash_head_pipeline.py:69-73 wraps it in try/except, so a broken mediapipe
# degrades to the plain PIL image instead of crashing inference.
# Newest mediapipe removed the legacy `mp.solutions` namespace; try to alias it
# back from `mediapipe.python.solutions` before giving up.
import mediapipe as mp
print("mediapipe version:", getattr(mp, "__version__", "?"))
status = "UNAVAILABLE"
if hasattr(mp, "solutions"):
    status = "NATIVE"
else:
    try:
        import mediapipe.python.solutions as _legacy
        mp.solutions = _legacy
        status = "SHIMMED"
        print("SHIM: aliased mp.solutions <- mediapipe.python.solutions")
    except Exception as e:
        print("SHIM FAILED:", repr(e))

if status != "UNAVAILABLE":
    try:
        from flash_head.utils.cpu_face_handler import CPUFaceHandler
        import numpy as np
        from PIL import Image
        img = Image.open(PORTRAIT).convert("RGB")
        print("portrait size:", img.size)
        h = CPUFaceHandler()
        nfaces, bbox = h.detect(np.array(img))
        print("MEDIAPIPE DETECT OK -> faces:", len(nfaces), "bbox:", bbox[:1])
        if len(nfaces) >= 1:
            status = status + "+FACE_OK"
        else:
            status = status + "+NO_FACE"
    except Exception as e:
        print("MEDIAPIPE RUNTIME FAILED (non-fatal):", repr(e))
        status = status + "+RUNTIME_FAIL"

print("MEDIAPIPE_STATUS=" + status)

# --- peft LoRA dispatch probe (reproduces the v3 failure, weights not needed) ---
# Exercises peft's full dispatcher chain (_create_new_module) on a tiny nn.Linear.
# If a stale torchao is present it raises here in ~1s instead of after downloads.
import torch.nn as _nn
from peft import LoraConfig, get_peft_model
try:
    _m = get_peft_model(_nn.Sequential(_nn.Linear(8, 8)),
                        LoraConfig(r=4, lora_alpha=4, target_modules=["0"]))
    print("PEFT LORA INJECT OK ->", type(_m.base_model.model[0]).__name__)
except Exception as e:
    print("PEFT LORA INJECT FAILED:", repr(e))
    raise

print("PREFLIGHT ALL OK")
'''


def main():
    t_start = time.time()
    print("=== STEP 1/7: clone LeapTalk (depth 1) ===")
    if os.path.isfile(os.path.join(LEAPTALK_DIR, "inference.py")):
        print("  [SKIP] LeapTalk already cloned")
    else:
        run(f"rm -rf {LEAPTALK_DIR}")
        run(f"git clone --depth 1 https://github.com/zhangrongxiang/LeapTalk {LEAPTALK_DIR}", timeout=600)

    print("=== STEP 2/7: install inference dep closure (repo-pinned) ===")
    # torch first (biggest, and pins the CUDA build for everything after)
    run(f"{sys.executable} -m pip install --no-cache-dir {TORCH_PINS}", timeout=1800)
    pip_install(
        "diffusers==0.38.0 transformers==4.57.3 peft==0.19.1 accelerate==1.13.0 "
        "einops==0.8.2 safetensors imageio imageio-ffmpeg librosa==0.11.0 "
        "loguru==0.7.3 omegaconf==2.3.0 pyyaml opencv-python-headless pillow "
        "pyloudnorm mediapipe xformers==0.0.31 huggingface_hub scipy tqdm",
        timeout=2400,
        allow_fail=False,
    )
    # NOTE: v4/v5 installed `huggingface_hub[cli]`, whose CLI extras transitively
    # pulled an `entrypoints` release that removed the `EntryPoint` top-level
    # class. That broke Kaggle's jupyter-nbconvert post-run export, surfacing
    # as KERNEL ERROR after our mp4s were already Saved. We use only the lib
    # (huggingface_hub.snapshot_download), so the [cli] extra is unnecessary.
    pip_install("xfuser==0.4.5", timeout=1200, allow_fail=True)

    # Must run AFTER the installs above: a transitive dep can pull torchao back
    # in, and a stale one breaks every peft LoRA injection (see neutralize_torchao).
    if not neutralize_torchao():
        sys.exit(1)

    print("=== STEP 3/7: deep preflight (import + CUDA + MediaPipe face detect) ===")
    INPUT_DIR = resolve_input()
    if not INPUT_DIR:
        print("[FATAL] input dataset not found")
        sys.exit(1)
    print(f"  input dir: {INPUT_DIR}")
    src_portrait = os.path.join(INPUT_DIR, "portrait.jpg")
    with open(PREFLIGHT, "w") as f:
        f.write(PREFLIGHT_SRC.replace("{LEAPTALK_DIR}", LEAPTALK_DIR)
                              .replace("{PORTRAIT}", src_portrait))
    if not self_healing_import(PREFLIGHT, "deep preflight"):
        sys.exit(1)

    print("=== STEP 4/7: download 3 weight sets ===")
    hf_download("Soul-AILab/SoulX-FlashHead-1_3B", CKPT_DIR)
    hf_download("facebook/wav2vec2-base-960h", WAV2VEC_DIR)
    hf_download("z-rx/leaptalk", LORA_DIR)

    print("--- structure check (ckpt_dir must contain Model_Pro for --model_type pro) ---")
    show_tree(CKPT_DIR, max_depth=1)
    show_tree(LORA_DIR, max_depth=1)
    if not os.path.isdir(os.path.join(CKPT_DIR, "Model_Pro")):
        print(f"[FATAL] Model_Pro/ not found under {CKPT_DIR}; cannot run --model_type pro")
        sys.exit(1)
    tae = None
    for name in ("taew2_1.pth", "taew2_1.safetensors", "taew2_2.pth", "taew2_2.safetensors"):
        for root in (LORA_DIR, os.path.dirname(LORA_DIR)):
            c = os.path.join(root, name)
            if os.path.isfile(c):
                tae = c
                break
        if tae:
            break
    if not tae:
        print("[FATAL] Lite mode needs taew2_1.pth under --lora_dir")
        sys.exit(1)

    # WanVAE is what the paper's FID-21 "Pro" numbers use (Table 1) and what
    # fixes the TAEHV lip blurriness. Present in the repo at 484.1 MB per the
    # v4 run's tree dump, but probe it: if it is ever missing, skip the
    # --no_lite variants instead of burning a GPU session on a guaranteed crash.
    wan_vae = os.path.join(CKPT_DIR, "VAE_Wan", "Wan2.1_VAE.pth")
    HAVE_WAN_VAE = os.path.isfile(wan_vae)
    print(f"  [OK] Model_Pro/ present | Lite TAE resolved: {tae}")
    print(f"  [{'OK' if HAVE_WAN_VAE else 'WARN'}] WanVAE {'found' if HAVE_WAN_VAE else 'MISSING'}: {wan_vae}")
    if not HAVE_WAN_VAE:
        print(f"[FATAL] WanVAE missing at {wan_vae} -- v8 is WanVAE-only, cannot proceed")
        sys.exit(1)

    print("=== STEP 5/7: prepare inputs (reuse infinitetalk-input dataset) ===")
    cond_image = os.path.join(WORK_DIR, "portrait.jpg")
    audio_path = os.path.join(WORK_DIR, "audio.wav")
    shutil.copy(src_portrait, cond_image)
    shutil.copy(os.path.join(INPUT_DIR, "audio.wav"), audio_path)
    print(f"  inputs: {cond_image} | {audio_path}")

    print("=== STEP 6/7: run v8 WanVAE CFG sweep ===")
    print("  v8: WanVAE (--no_lite) × CFG {1.6,2.0,2.5,3.0,3.5} × 1 step × 512² × Pro")
    print("  Why: v5 肉眼复核 22:39 发现 WanVAE 视觉明显优于 TAEHV (无色块伪影),")
    print("       但 v5 只在 WanVAE 上测了 α=1.6 单点 (唇同步 r=0.344 偏弱).")
    print("       v6 在 TAEHV 上证 α 1.6→3.0 把 r 从 0.409 拉到 0.677, 但 TAEHV α≥3 毁容.")
    print("       WanVAE 重建强 (FID 21 vs 38), 可能扛住高 CFG -> 找画质+唇同步双达标.")
    print("  3.5 探 WanVAE 伪影边界 (TAEHV 在 α≥3.5 已毁容, WanVAE 未知).")

    # (label, extra args, height, width). All WanVAE (Pro DiT --no_lite), 1 step, fps 25.
    variants = [
        ("v8_cfg1.6_wanvae", "--guidance_scale 1.6 --no_lite --num_inference_steps 1 ", 512, 512),
        ("v8_cfg2.0_wanvae", "--guidance_scale 2.0 --no_lite --num_inference_steps 1 ", 512, 512),
        ("v8_cfg2.5_wanvae", "--guidance_scale 2.5 --no_lite --num_inference_steps 1 ", 512, 512),
        ("v8_cfg3.0_wanvae", "--guidance_scale 3.0 --no_lite --num_inference_steps 1 ", 512, 512),
        ("v8_cfg3.5_wanvae", "--guidance_scale 3.5 --no_lite --num_inference_steps 1 ", 512, 512),
    ]

    def remux_audio(src, dst):
        # Guarantee a clean, broadly-playable AAC track at start=0 by replacing
        # whatever the model muxed (mp3 / possibly missing) with the source wav.
        run(f'ffmpeg -y -i "{src}" -i "{audio_path}" -map 0:v:0 -map 1:a:0 '
            f'-c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "{dst}"',
            timeout=300, check=False)

    results = []
    for label, extra, h, w in variants:
        out = os.path.join(WORK_DIR, f"leaptalk_{label}.mp4")
        out_aac = os.path.join(WORK_DIR, f"leaptalk_{label}_aac.mp4")
        t_var = time.time()
        print(f"\n--- variant {label} -> {out} ({h}x{w}) ---")
        cmd = (
            f"cd {LEAPTALK_DIR} && "
            f"CUDA_VISIBLE_DEVICES=0 torchrun --nproc_per_node=1 inference.py "
            f"--ckpt_dir {CKPT_DIR} "
            f"--wav2vec_dir {WAV2VEC_DIR} "
            f"--lora_dir {LORA_DIR} "
            f"--model_type pro "
            f"--compile off "
            f"--max_chunks 4 "
            f"{extra}"
            f"--cond_image {cond_image} "
            f"--audio_path {audio_path} "
            f"--out {out} "
            f"--height {h} --width {w} --fps 25"
        )
        # check=False: a 768 OOM must not cost us the 512 variant.
        try:
            run(cmd, timeout=3600, check=False)
        except Exception as e:
            print(f"  [ERROR] {label} raised: {e!r}")
        dt = time.time() - t_var
        if os.path.exists(out):
            mb = os.path.getsize(out) / 1024 / 1024
            print(f"  [DONE] {label}: {mb:.1f} MB in {dt:.1f}s")
            # re-mux audio to AAC (audio guarantee, the user-raised pain point)
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
    # Best-effort: pin entrypoints 0.4 to maximise the chance that nbconvert 7
    # can still `from entrypoints import EntryPoint` during the post-run export.
    # Not a hard gate: our mp4s are already Saved before this step runs, so a
    # KERNEL ERROR here is purely cosmetic and does not affect the artifacts.
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
        raise
