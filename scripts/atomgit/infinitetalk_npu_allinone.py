"""
InfiniteTalk-Ascend (rockie fork) on AtomGit NPU 910B 64GB — all-in-one smoke test (#221).

All-in-one: deps + clone + download + input prep + inference (--device npu).
Assets uploaded separately via Notebook UI:
    /opt/atomgit/infinitetalk-up/ref-image.jpg   (768x1024 portrait)
    /opt/atomgit/infinitetalk-up/scene-10.wav    (6.04s CosyVoice3 TTS output)

Progress: /opt/atomgit/progress.log (tail -f friendly).

Deltas vs the Wan2.2-S2V precedent (wan22_s2v_allinone.py):
    - The fork ships its own NPU adapter (wan/_npu_adapter/, --device npu flag)
      — NO cuda->npu source patching needed; we only supply inputs/weights.
    - Container torch (2.9 + torch_npu 2.9) kept as-is; the fork pins 2.7.1
      but we test adapter compatibility on the preinstalled stack first.
    - decord is NOT installable on aarch64 NPU hosts (fork README-NPU) — same
      cv2-based stub as the Wan2.2 run.
    - ffmpeg missing in container (known 09-07 issue) — imageio-ffmpeg binary
      prepended to PATH before the video/audio merge step.
"""

import json
import os
import subprocess
import sys
import time

start = time.time()
PROGRESS = "/opt/atomgit/progress.log"
with open(PROGRESS, "w") as f:
    f.write("")


def log(msg):
    line = f"[{int(time.time() - start)}s] {msg}"
    print(line, flush=True)
    try:
        with open(PROGRESS, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


def sh(cmd, timeout=1800, env=None):
    e = dict(os.environ)
    if env:
        e.update(env)
    r = subprocess.run(
        cmd, shell=True, capture_output=True, text=True, timeout=timeout, env=e
    )
    if r.returncode != 0:
        log(f"  !! cmd failed: {cmd}\n  stdout[-800:]: {r.stdout[-800:]}\n  stderr[-800:]: {r.stderr[-800:]}")
    return r


MIRROR = "-i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn"
HF_MIRROR = "https://hf-mirror.com"

log("=== Step 1: deps (skip preinstalled torch/torch_npu) ===")
deps = [
    "modelscope", "imageio-ffmpeg", "opencv-python-headless", "diffusers",
    "transformers", "tokenizers", "accelerate", "imageio", "easydict", "ftfy",
    "scikit-image", "loguru", "einops", "librosa", "soundfile", "safetensors",
    "scipy", "pyloudnorm", "scenedetect", "moviepy==1.0.3", "peft", "omegaconf",
    "huggingface-hub<1.0",
]
for pkg in deps:
    mod = pkg.replace("-", "_").split("<")[0].split("==")[0].split("[")[0]
    try:
        __import__(mod)
    except ImportError:
        sh(f"pip install --user -q {pkg} {MIRROR}", timeout=600)
log(f"  deps done ({int(time.time() - start)}s)")

# imageio-ffmpeg binary onto PATH (container has no ffmpeg — 09-07 lesson)
try:
    import imageio_ffmpeg

    os.environ["PATH"] = os.path.dirname(imageio_ffmpeg.get_ffmpeg_exe()) + os.pathsep + os.environ["PATH"]
    log(f"  ffmpeg from imageio: {imageio_ffmpeg.get_ffmpeg_exe()}")
except Exception as e:
    log(f"  !! imageio-ffmpeg unavailable: {e}")

log("=== Step 2: decord stub (cv2-backed, aarch64 source-build workaround) ===")
import site

us = site.getusersitepackages()
if us not in sys.path:
    sys.path.insert(0, us)
stub = os.path.join(us, "decord")
os.makedirs(stub, exist_ok=True)
with open(os.path.join(stub, "__init__.py"), "w") as f:
    f.write(
        "import cv2\nimport numpy as np\n"
        "class VideoReader:\n"
        "    def __init__(self, path, **kw):\n"
        "        self.cap = cv2.VideoCapture(path)\n"
        "        self._len = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))\n"
        "    def __len__(self): return self._len\n"
        "    def __getitem__(self, idx):\n"
        "        self.cap.set(cv2.CAP_PROP_POS_FRAMES, idx)\n"
        "        ret, frame = self.cap.read()\n"
        "        return np.array(frame)\n"
        "    def get_batch(self, indices): return np.array([self[i] for i in indices])\n"
        "    def get_avg_fps(self): return self.cap.get(cv2.CAP_PROP_FPS)\n"
    )
log("  stub written")

log("=== Step 3: clone fork ===")
os.chdir("/opt/atomgit")
if not os.path.exists("InfiniteTalk-Ascend"):
    sh("git clone https://github.com/rockie/InfiniteTalk-Ascend.git", timeout=600)
os.chdir("/opt/atomgit/InfiniteTalk-Ascend")
log(f"  fork ready ({int(time.time() - start)}s)")

log("=== Step 4: weights — Wan2.1-I2V-14B-480P via ModelScope ===")
from modelscope import snapshot_download

ckpt_dir = "/opt/atomgit/weights/Wan2.1-I2V-14B-480P"
if not os.path.exists(os.path.join(ckpt_dir, "diffusion_model.safetensors")):
    snapshot_download("Wan-AI/Wan2.1-I2V-14B-480P", local_dir=ckpt_dir)
log(f"  wan ckpt ready ({int(time.time() - start)}s)")

log("=== Step 5: weights — wav2vec2 + InfiniteTalk adapter via hf-mirror ===")
wav2vec_dir = "/opt/atomgit/weights/chinese-wav2vec2-base"
os.makedirs(wav2vec_dir, exist_ok=True)
for fn in ["config.json", "preprocessor_config.json", "pytorch_model.bin"]:
    dst = os.path.join(wav2vec_dir, fn)
    if not os.path.exists(dst) or os.path.getsize(dst) < 1000:
        sh(f"curl -sL --retry 3 -o {dst} {HF_MIRROR}/TencentGameMate/chinese-wav2vec2-base/resolve/main/{fn}", timeout=900)
inf_dir = "/opt/atomgit/weights/InfiniteTalk/single"
os.makedirs(inf_dir, exist_ok=True)
inf_dst = os.path.join(inf_dir, "infinitetalk.safetensors")
if not os.path.exists(inf_dst) or os.path.getsize(inf_dst) < 1_000_000:
    sh(f"curl -sL --retry 3 -o {inf_dst} {HF_MIRROR}/MeiGen-AI/InfiniteTalk/resolve/main/single/infinitetalk.safetensors", timeout=1800)
log(f"  small weights ready ({int(time.time() - start)}s)")
log(f"  sizes: wav2vec={os.path.getsize(os.path.join(wav2vec_dir, 'pytorch_model.bin'))}, adapter={os.path.getsize(inf_dst)}")

log("=== Step 6: inputs ===")
UP = "/opt/atomgit/infinitetalk-up"
input_json = {
    "prompt": (
        "A professional news presenter speaks directly to the camera with a calm, "
        "engaged expression, making natural hand gestures while reporting. Clean "
        "studio background, even lighting."
    ),
    "cond_video": os.path.join(UP, "ref-image.jpg"),
    "cond_audio": {"person1": os.path.join(UP, "scene-10.wav")},
}
with open("/opt/atomgit/InfiniteTalk-Ascend/input_npu.json", "w") as f:
    json.dump(input_json, f, indent=2)
log(f"  input_npu.json written: {input_json}")

log("=== Step 7: inference (--device npu, bf16 + DiT offload, 40 steps, streaming) ===")
t0 = time.time()
r = sh(
    "python generate_infinitetalk.py "
    "--device npu "
    f"--ckpt_dir {ckpt_dir} "
    f"--infinitetalk_dir {inf_dst} "
    f"--wav2vec_dir {wav2vec_dir} "
    "--input_json input_npu.json "
    "--size infinitetalk-480 "
    "--sample_steps 40 "
    "--mode streaming "
    "--motion_frame 9 "
    "--num_persistent_param_in_dit 0 "
    "--save_file /opt/atomgit/infinitetalk_npu_out.mp4",
    timeout=5400,
)
log(f"=== inference exit={r.returncode} in {int(time.time() - t0)}s ===")
tail = (r.stdout + r.stderr)[-3000:]
log(f"--- tail ---\n{tail}")

if os.path.exists("/opt/atomgit/infinitetalk_npu_out.mp4"):
    size = os.path.getsize("/opt/atomgit/infinitetalk_npu_out.mp4")
    log(f"### OUTPUT READY: /opt/atomgit/infinitetalk_npu_out.mp4 ({size} bytes, {size / 1e6:.1f} MB) ###")
else:
    log("### NO OUTPUT — see tail above ###")
log(f"=== total {int(time.time() - start)}s ===")
