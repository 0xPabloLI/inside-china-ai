#!/usr/bin/env python3
"""
CosyVoice3 CUDA Kaggle kernel template.

Placeholders (replaced by JS adapter before push):
  __MANIFEST_JSON__  — JSON array of {sceneId, text, instruct_text?, output}
  __REQUEST_ID__     — per-run identity echoed into summary.json (#420)
  __EXPECTED_WHEELHOUSE__ — kaggle/wheelhouse-manifest.json, checked against
                        the mount before installing anything (#521)

Ref audio is loaded from Kaggle dataset: xPabloLI/tts-ref-audio

Output: /kaggle/working/output/<scene-N>.wav + summary.json
"""
import subprocess, sys, os, time, json, traceback, base64, re, platform

_logfile = open("/kaggle/working/log.txt", "w")
def log(msg):
    print(msg, flush=True)
    _logfile.write(str(msg) + "\n"); _logfile.flush()

log("=== Kaggle CosyVoice3 CUDA Batch TTS ===")
log(f"Python: {sys.version.split()[0]}")

MANIFEST_JSON = r'''__MANIFEST_JSON__'''
REQUEST_ID = r'''__REQUEST_ID__'''
EXPECTED_WHEELHOUSE = json.loads(r'''__EXPECTED_WHEELHOUSE__''')

try:
    import torch
    log(f"torch: {torch.__version__}, CUDA: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        log(f"GPU: {torch.cuda.get_device_name(0)}, CUDA: {torch.version.cuda}")
except Exception as e:
    log(f"ERROR torch: {e}"); traceback.print_exc(); sys.exit(1)

log("\n=== Installing deps ===")

# #231: pre-frozen wheels dataset (xpabloli/cosyvoice3-wheels) makes the
# dependency install offline and drift-immune — pip resolves strictly from
# the mounted wheels with --no-index. Build the dataset once with
# scripts/short-video/kaggle/build-wheels-dataset.sh; attach it in the
# kernel metadata. No mount → the historical online path runs unchanged.
_WHEELS_DIRS = [
    c for c in ("/kaggle/input/cosyvoice3-wheels", "/kaggle/input/datasets/xpabloli/cosyvoice3-wheels")
    if os.path.isdir(c)
]
if not _WHEELS_DIRS:
    import glob as _wheels_glob
    _WHEELS_DIRS = _wheels_glob.glob("/kaggle/input/**/cosyvoice3-wheels", recursive=True)
_WHEELS_MOUNT = _WHEELS_DIRS[0] if _WHEELS_DIRS else None


# --- BEGIN wheelhouse verification ---
# Extracted and executed for real by
# scripts/short-video/__tests__/tts-kaggle-wheelhouse-manifest.test.mjs.
def _wheelhouse_problems(mount, expected, python=None, platform_tag=None):
    """Reasons the mounted wheelhouse is not the set this repo froze (#521).

    `dataset_sources` cannot pin a version: the CLI accepts `owner/slug/3` but
    Kaggle stores it back as `owner/slug` and mounts the LATEST version —
    probed 2026-10-09 with a two-version dataset, where a kernel asking for
    `/1` mounted version 2's content. A re-upload therefore changes what every
    run installs with nothing in git recording it. The expected set is
    injected from kaggle/wheelhouse-manifest.json at push time and compared
    here, before the first pip install, so that change fails loudly in seconds
    instead of silently installing a different environment.

    Names plus sizes, not hashes: `torch-2.6.0+cu124-…` is served back as
    `torch-2.6.0cu124-…` (Kaggle strips the local-version separator when it
    stores a dataset), so both sides are put into built form first. Sizes ride
    along because the common rebuild keeps every filename identical while the
    bytes change — a name-only comparison waves that through. Hashing would
    catch the rest, at the cost of reading all 3.7GB on every run.
    """
    problems = []
    want_py = expected.get("python")
    if want_py:
        actual_py = python or f"{sys.version_info.major}.{sys.version_info.minor}"
        if actual_py != want_py:
            problems.append(
                f"this image runs Python {actual_py}, but the frozen wheelhouse was built "
                f"for {want_py} (cp{want_py.replace('.', '')}) — none of its wheels install here"
            )
    want_platform = expected.get("platform")
    if want_platform:
        actual_platform = platform_tag or f"{sys.platform}_{platform.machine()}"
        if actual_platform != want_platform:
            problems.append(
                f"this image is {actual_platform}, but the frozen wheelhouse was built "
                f"for {want_platform}"
            )

    def built_form(name):
        return re.sub(r"(\d)cu(\d+)-", r"\1+cu\2-", name)

    # name → size, in built form, so the mount can be compared against the
    # record without caring which spelling Kaggle stored.
    mounted = {
        built_form(n): os.path.getsize(os.path.join(mount, n))
        for n in os.listdir(mount)
        if n.endswith(".whl")
    }
    want = expected.get("wheels") or {}
    # Scan everything, cap only the reporting: slicing the scan itself hides
    # any difference that sorts past the cap, so one rebuilt wheel late in the
    # alphabet would pass unnoticed (found by the size test on 2026-10-09).
    missing = sorted(set(want) - set(mounted))
    extra = sorted(set(mounted) - set(want))
    resized = sorted(n for n in set(want) & set(mounted) if mounted[n] != want[n])
    for name in missing[:5]:
        problems.append(f"missing from the mount: {name}")
    for name in extra[:5]:
        problems.append(f"not in the frozen set: {name}")
    for name in resized[:5]:
        problems.append(
            f"different bytes on the mount: {name} is {mounted[name]} bytes, "
            f"the frozen set records {want[name]}"
        )
    if len(missing) + len(extra) + len(resized) > 5:
        problems.append(f"…and more (mount {len(mounted)} wheels, frozen set {len(want)})")
    return problems
# --- END wheelhouse verification ---


if _WHEELS_MOUNT:
    _wheelhouse_issues = _wheelhouse_problems(_WHEELS_MOUNT, EXPECTED_WHEELHOUSE)
    if _wheelhouse_issues:
        log("FAIL: the mounted wheelhouse is not the set this repo froze (#521):")
        for _issue in _wheelhouse_issues:
            log(f"  {_issue}")
        log("  Kaggle mounts a dataset at its LATEST version — the version segment of")
        log("  dataset_sources is dropped at push time — so a re-upload changes what")
        log("  every run installs, with nothing in git recording it.")
        log("  Rebuild and re-record: scripts/short-video/kaggle/build-wheels-dataset.sh")
        log("  prints the new set to paste into kaggle/wheelhouse-manifest.json.")
        sys.exit(1)
    log(f"wheelhouse matches the frozen set ({len(EXPECTED_WHEELHOUSE.get('wheels') or [])} wheels)")


def _restore_local_versions(src):
    """Symlink the wheelhouse into a writable dir, putting `+` back.

    Kaggle strips the local-version separator when it stores a dataset:
    `torch-2.6.0+cu124-cp313-cp313-linux_x86_64.whl` is served back as
    `torch-2.6.0cu124-...`. pip reads the version out of the filename, so it
    sees `2.6.0cu124` — not a PEP 440 version — and drops the file entirely
    ("Could not find a version that satisfies the requirement torch==2.6.0
    (from versions: none)"). Symlinks, not copies: the mount is read-only and
    the wheelhouse is ~3.7GB. Staged under /tmp, not /kaggle/working — the
    latter is this kernel's output directory, and a symlink farm into a 3.7GB
    mount has no business being captured as the run's artifact.
    """
    staging = "/tmp/wheelhouse"
    os.makedirs(staging, exist_ok=True)
    renamed = []
    for name in os.listdir(src):
        # Only the `2.6.0cu124` shape: a plain `cu12` in a package name (e.g.
        # nvidia_cuda_runtime_cu12-12.4.127) must not be touched.
        fixed = re.sub(r"(\d)cu(\d+)-", r"\1+cu\2-", name)
        dst = os.path.join(staging, fixed)
        if not os.path.exists(dst):
            os.symlink(os.path.join(src, name), dst)
        if fixed != name:
            renamed.append(fixed)
    if renamed:
        log(f"restored local versions in {len(renamed)} filenames: {sorted(renamed)[:4]}")
    return staging


if _WHEELS_MOUNT:
    _WHEELS_DIR = _restore_local_versions(_WHEELS_MOUNT)
else:
    _WHEELS_DIR = None


def _pip_install(args, online_extra=None):
    """pip install via the frozen wheels mount when present, else online.

    The mount holds wheels only — build-wheels-dataset.sh also compiles the
    sdist-only packages (pyworld, wget, antlr4-python3-runtime, openai-whisper)
    into wheels first, because Kaggle unpacks archives inside a dataset and a
    mounted sdist would arrive as a directory that --find-links cannot see.
    """
    if _WHEELS_DIR:
        cmd = [
            sys.executable, "-m", "pip", "install", "-q",
            "--no-index", "--find-links", _WHEELS_DIR,
        ] + list(args)
    else:
        cmd = [sys.executable, "-m", "pip", "install", "-q"] + list(online_extra or []) + list(args)
    subprocess.run(cmd, check=True)


if _WHEELS_DIR:
    log(f"wheels dataset mount found: {_WHEELS_MOUNT} — offline install mode")
else:
    log("no cosyvoice3-wheels mount — online install (build the wheels dataset to freeze the deps)")

try:
    _pip_install(["setuptools<81", "wheel", "Cython"])
    # #231 (2026-10-09): the Kaggle image moved to Python 3.13, where the old
    # torch==2.4.0/cu121 pin has no wheel at all (0 cp313 files on PyPI, none on
    # the cu121 index for the trio) and the install died before inference.
    # 2.6.0+cu124 is the lowest coherent cp313 set (torchaudio/torchvision only
    # exist for cp313 at 2.6.0/0.21.0) and stays on the CUDA 12.x ABI the image
    # ships.
    _pip_install(
        ["torch==2.6.0", "torchaudio==2.6.0", "torchvision==0.21.0"],
        online_extra=["--index-url", "https://download.pytorch.org/whl/cu124"],
    )
    log("torch 2.6.0+cu124 installed")
    _pip_install(
        [
            "conformer==0.3.2", "hydra-core==1.3.2", "HyperPyYAML==1.2.3",
            "inflect==7.3.1", "librosa==0.10.2", "modelscope==1.20.0", "omegaconf==2.3.0",
            "onnx==1.18.0", "soundfile==0.12.1",
            "wetext==0.0.4", "gdown==5.1.0", "wget==3.2",
            "transformers==4.51.3", "lightning==2.2.4", "x-transformers==2.11.24",
        ]
    )
    log("Core deps OK")
    # pyworld has no Linux wheel on PyPI; the released cosyvoice3.yaml imports
    # cosyvoice.dataset.processor through !name:, so it must be present. The
    # wheelhouse carries a wheel built on this same image (#231).
    _pip_install(["pyworld==0.3.4"])
    log("pyworld OK")
except Exception as e:
    log(f"ERROR deps: {e}"); traceback.print_exc(); sys.exit(1)

# Pinned dependencies for reproducible execution
# onnxruntime-gpu 1.20.0 is officially released on PyPI for CUDA 12.x
# NEVER silently fall back to CPU onnxruntime!
try:
    _pip_install(["onnxruntime-gpu==1.20.0"])
    import onnxruntime as ort
    providers = ort.get_available_providers()
    log(f"onnxruntime-gpu 1.20.0 OK (providers: {providers})")
    if "CUDAExecutionProvider" not in providers:
        raise RuntimeError(f"FATAL: CUDAExecutionProvider not available in onnxruntime! Found: {providers}")
except Exception as e:
    log(f"FATAL deps onnxruntime-gpu: {e}")
    traceback.print_exc()
    sys.exit(1)

try:
    _pip_install(["openai-whisper", "--no-deps"])
    _pip_install(["tiktoken", "numba"])
    log("whisper (no-deps) + tiktoken + numba OK")
except Exception as e:
    log(f"ERROR whisper: {e}")

log("\n=== Setting up CosyVoice source ===")
# Pin to known good commit (2026-09 baseline) to prevent upstream drift
PINNED_COSYVOICE_COMMIT = "074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc"
try:
    if not os.path.exists("/tmp/CosyVoice"):
        # Check if pre-frozen dataset mount exists (e.g. cosyvoice-code or cosyvoice-src)
        ds_code_dir = None
        for cand in ("/kaggle/input/cosyvoice-code", "/kaggle/input/cosyvoice-src"):
            if os.path.exists(cand):
                ds_code_dir = cand
                break
        if not ds_code_dir:
            import glob
            hits = glob.glob("/kaggle/input/**/cosyvoice-code", recursive=True) + glob.glob("/kaggle/input/**/cosyvoice-src", recursive=True)
            if hits:
                ds_code_dir = hits[0]

        if ds_code_dir and os.path.exists(os.path.join(ds_code_dir, "cosyvoice")):
            log(f"Found pre-frozen CosyVoice in dataset mount: {ds_code_dir}")
            import shutil
            shutil.copytree(ds_code_dir, "/tmp/CosyVoice", dirs_exist_ok=True)
        else:
            log(f"Cloning CosyVoice and locking to commit {PINNED_COSYVOICE_COMMIT[:10]}...")
            subprocess.run(["git", "clone", "https://github.com/FunAudioLLM/CosyVoice.git", "/tmp/CosyVoice"], check=True)
            os.chdir("/tmp/CosyVoice")
            subprocess.run(["git", "checkout", PINNED_COSYVOICE_COMMIT], check=True)
            subprocess.run(["git", "submodule", "update", "--init", "--recursive"], check=True, timeout=120)
    log("CosyVoice source OK")
except Exception as e:
    log(f"ERROR CosyVoice setup: {e}"); traceback.print_exc(); sys.exit(1)

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
log(f"Manifest: {len(manifest)} segments (requestId={REQUEST_ID})")

INFERENCE_CODE = r'''
import sys, os, time, json, traceback
sys.path.insert(0, "/tmp/CosyVoice")
sys.path.insert(0, "/tmp/CosyVoice/third_party/Matcha-TTS")
import torch, soundfile as sf
from cosyvoice.cli.cosyvoice import AutoModel

if "TTS_SEED" in os.environ:
    _seed = int(os.environ["TTS_SEED"])
    torch.manual_seed(_seed)
    import random as _random
    _random.seed(_seed)
    import numpy as _np
    _np.random.seed(_seed)
    print(f"Using fixed TTS_SEED={_seed}", flush=True)
else:
    print("Using natural random seed", flush=True)

model_dir = "/tmp/cosyvoice3-model"
import glob as _glob
_ref_hits = _glob.glob("/kaggle/input/**/tts-ref-audio", recursive=True)
ref_path = os.path.join(_ref_hits[0], "voice-sample-24k.wav") if _ref_hits else None
if not ref_path or not os.path.exists(ref_path):
    raise RuntimeError(f"ref audio mount not found (hits={_ref_hits})")
out_dir = "/kaggle/working/output"
os.makedirs(out_dir, exist_ok=True)

payload = json.load(open("/tmp/manifest.json"))
manifest = payload["scenes"]
request_id = payload["requestId"]
print(f"torch: {torch.__version__}, CUDA: {torch.cuda.is_available()}", flush=True)
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}", flush=True)

print("Loading CosyVoice3...", flush=True)
t0 = time.time()
cosyvoice = AutoModel(model_dir=model_dir)
print(f"Loaded in {time.time()-t0:.1f}s, sr={cosyvoice.sample_rate}", flush=True)

summary = {"engine": "CosyVoice3-Kaggle-CUDA", "requestId": request_id, "segments": []}
for i, t in enumerate(manifest):
    print(f"\n[{i+1}/{len(manifest)}] scene-{t['sceneId']}", flush=True)
    try:
        seg_start = time.time()
        chunks = []
        instruct = t.get("instruct_text")
        kwargs = {"stream": False}
        if "speed" in t and t["speed"] is not None:
            kwargs["speed"] = t["speed"]

        if instruct:
            for j in cosyvoice.inference_instruct2(t["text"], instruct, ref_path, **kwargs):
                chunks.append(j['tts_speech'])
        else:
            for j in cosyvoice.inference(t["text"], ref_path, **kwargs):
                chunks.append(j['tts_speech'])
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

json.dump({"requestId": REQUEST_ID, "scenes": manifest}, open("/tmp/manifest.json", "w"), ensure_ascii=False)
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