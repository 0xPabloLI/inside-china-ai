#!/usr/bin/env python3
"""
CosyVoice3 CUDA Kaggle kernel template.

Placeholders (replaced by JS adapter before push):
  __MANIFEST_JSON__  — JSON array of {sceneId, text, instruct_text?, output}
  __REQUEST_ID__     — per-run identity echoed into summary.json (#420)
  __EXPECTED_WHEELHOUSE__ — kaggle/wheelhouse-manifest.json, checked against
                        the mount before installing anything (#521)
  __KERNEL_WALL_CLOCK_BUDGET_SEC__ / __KERNEL_HEARTBEAT_SEC__ — watchdog
                        values baked in by the JS adapter (#1354)

Ref audio is loaded from Kaggle dataset: xPabloLI/tts-ref-audio

Output: /kaggle/working/output/<scene-N>.wav + summary.json
                       (+ summary_<batch>.json and per-take .flac in live mode)
"""
import subprocess, sys, os, time, json, traceback, base64, re, platform, threading

_logfile = open("/kaggle/working/log.txt", "w")
def log(msg):
    print(msg, flush=True)
    _logfile.write(str(msg) + "\n"); _logfile.flush()

log("=== Kaggle CosyVoice3 CUDA Batch TTS ===")
log(f"Python: {sys.version.split()[0]}")

MANIFEST_JSON = r'''__MANIFEST_JSON__'''
REQUEST_ID = r'''__REQUEST_ID__'''
# #1515 live session: empty control URL means classic one-shot mode. The host
# creates a secret gist before push and patches it with retry commands; the
# kernel polls the raw URL (the only host->kernel channel that works mid-run).
LIVE_MODE = r'''__LIVE_MODE__'''.strip() == "1"
CONTROL_URL = r'''__CONTROL_URL__'''
LIVE_IDLE_TIMEOUT_SEC = int(r'''__LIVE_IDLE_TIMEOUT_SEC__''')
LIVE_CONTROL_POLL_SEC = int(r'''__LIVE_CONTROL_POLL_SEC__''')
EXPECTED_WHEELHOUSE = json.loads(r'''__EXPECTED_WHEELHOUSE__''')
# #1520: preinstalled site-packages dataset. Empty manifest means the repo has
# not published one yet — the kernel then stays on the wheelhouse install.
EXPECTED_SITE_PACKAGES = json.loads(r'''__EXPECTED_SITE_PACKAGES__''')
# Build mode: install into this directory and exit before model load. The
# dataset builder sets it; production never does.
BUILD_SITE_PACKAGES_TARGET = os.environ.get("COSYVOICE3_SITE_PACKAGES_TARGET", "").strip()
# Build mode installs through the builder's venv pip, not the kernel
# interpreter: a venv is the only way pip sees the packages it has already
# installed and can downgrade a conflicting transitive pin (numba 0.61.2 vs the
# 0.68 that librosa pulled). `--target` silently skips those replacements.
BUILD_SITE_PACKAGES_PYTHON = os.environ.get("COSYVOICE3_BUILD_PYTHON", "").strip()

# ── Whole-kernel wall-clock self-termination (#1354) ──────────────────────
# The inference child already has load/synthesis budgets, but a hang *before*
# it (pip install, CosyVoice clone, model mount/assembly, wetext seed) used to
# keep Kaggle's single free-tier GPU session until the 9-12h session cap. This
# watchdog covers the whole script and emits a heartbeat the host can read
# back through `kaggle kernels logs`: it proves the kernel is alive and names
# the phase it is in, instead of leaving one silent gap from push to cap.
# (A live watchdog does not prove the main thread is making progress; it is
# liveness evidence, not a progress measurement.)
#
# Budget: 3h. The documented legitimate worst case is ~2.2h: model load 1800s,
# model-download fallback 1200s, wetext-download fallback 1265s, inference
# 1800s + 300s + 60s/scene (~45min for 10 scenes), plus pip/clone. The old
# 90min value was below that path and could os._exit(1) mid-inference after a
# legitimate setup; 3h still self-heals long before the 9-12h session cap.
# Override on the host with KERNEL_WALL_CLOCK_BUDGET_SEC / KERNEL_HEARTBEAT_SEC;
# the JS adapter bakes them into these placeholders because `kaggle kernels
# push` has no env-var channel.
KERNEL_WALL_CLOCK_BUDGET_SEC = int(r'''__KERNEL_WALL_CLOCK_BUDGET_SEC__''')
KERNEL_HEARTBEAT_SEC = int(r'''__KERNEL_HEARTBEAT_SEC__''')
_KERNEL_STARTED_AT = time.time()
_KERNEL_PHASE = {"name": "startup"}

def _set_phase(name):
    _KERNEL_PHASE["name"] = name
    log(f"KERNEL_PHASE {name}")

def _log_safe(msg):
    # The watchdog must never die on a full/broken log file: print first (the
    # stream is what `kaggle kernels logs` reads), then try the file. If the
    # file write raises and kills this thread, the kernel would never reach
    # the budget check below — the exact silent session-cap hang this guards.
    print(msg, flush=True)
    try:
        _logfile.write(str(msg) + "\n"); _logfile.flush()
    except Exception:
        pass

def _heartbeat_loop():
    while True:
        time.sleep(KERNEL_HEARTBEAT_SEC)
        elapsed = time.time() - _KERNEL_STARTED_AT
        _log_safe(f"KERNEL_HEARTBEAT phase={_KERNEL_PHASE['name']} elapsed={int(elapsed)}s")
        if elapsed > KERNEL_WALL_CLOCK_BUDGET_SEC:
            _log_safe(
                f"ERROR: kernel wall-clock budget {KERNEL_WALL_CLOCK_BUDGET_SEC}s "
                f"exceeded in phase {_KERNEL_PHASE['name']} — exiting so the GPU "
                "session stops holding the slot and burning quota"
            )
            # os._exit, not sys.exit: the watchdog is a daemon thread and the
            # main thread may be blocked in a C call; sys.exit only raises in
            # this thread. 1 marks the kernel ERROR so the host stops polling.
            os._exit(1)

if os.path.isdir("/kaggle/working"):
    threading.Thread(target=_heartbeat_loop, daemon=True).start()
log(
    f"Wall-clock budget: {KERNEL_WALL_CLOCK_BUDGET_SEC}s "
    f"(heartbeat every {KERNEL_HEARTBEAT_SEC}s)"
)

# ── #1520: mounted site-packages fast path ────────────────────────────────
# The wheelhouse install re-extracts ~3.7GB of torch + nvidia wheels into the
# container on every cold run (211–309s of the kernel's 405s). The dataset
# carries one preinstalled tree instead; this block mounts it before the first
# `import torch`, so the install is skipped entirely. A missing mount, a
# manifest that does not match git, or an import that resolves outside the
# mount all fall back to the historical wheelhouse install — the fast path
# must never be able to break a run.
SITE_PACKAGES_ACTIVE = False


def _find_dataset_mount(slug):
    """Kaggle mount layout differs by image; mirror the kernel's other lookups."""
    import glob

    for c in (f"/kaggle/input/{slug}", f"/kaggle/input/datasets/xpabloli/{slug}"):
        if os.path.isdir(c):
            return c
    hits = glob.glob(f"/kaggle/input/**/{slug}", recursive=True)
    return hits[0] if hits else None


def _site_packages_problems(mount, expected):
    """Reasons the mounted tree is not the set this repo froze (#1520).

    The dataset version cannot be pinned (#521), so `site-packages-manifest.json`
    is the record git keeps: exact distribution names/versions plus the archive
    size. Names and versions catch a rebuilt environment; the size catches the
    common re-upload where every dist-info string survives but the bytes change.
    """
    problems = []
    if not expected.get("dists"):
        return ["the committed site-packages manifest lists no distributions"]
    manifest_path = os.path.join(mount, "manifest.json")
    if not os.path.exists(manifest_path):
        return ["manifest.json missing from the mount"]
    try:
        with open(manifest_path) as f:
            mounted = json.load(f)
    except Exception as exc:
        return [f"manifest.json unreadable: {exc}"]

    want = expected.get("dists") or {}
    have = mounted.get("dists") or {}
    missing = sorted(set(want) - set(have))
    extra = sorted(set(have) - set(want))
    changed = sorted(n for n in set(want) & set(have) if want[n] != have[n])
    if missing:
        problems.append(f"missing distributions: {missing[:5]}")
    if extra:
        problems.append(f"unexpected distributions: {extra[:5]}")
    if changed:
        problems.append(f"different versions: {[(n, have[n], want[n]) for n in changed[:5]]}")

    unpacked = os.path.join(mount, "site-packages")
    archives = [
        ("site-packages.tar.zst", os.path.join(mount, "site-packages.tar.zst")),
        ("site-packages.tar", os.path.join(mount, "site-packages.tar")),
    ]
    # Kaggle expands plain archives on upload: a flat tar lands its contents
    # directly in the mount, so the mount itself is the tree.
    flattened = os.path.isdir(os.path.join(mount, "torch"))
    if os.path.isdir(unpacked) or flattened:
        # Kaggle unpacked the archive on mount; the manifest still guards the set.
        pass
    else:
        archive = next((entry for entry in archives if os.path.exists(entry[1])), None)
        if not archive:
            problems.append(
                "neither site-packages/ nor site-packages.tar(.zst) is mounted"
            )
        else:
            name, path = archive
            want_bytes = expected.get("tarBytes")
            if want_bytes and os.path.getsize(path) != want_bytes:
                problems.append(
                    f"{name} is {os.path.getsize(path)} bytes, "
                    f"the manifest records {want_bytes}"
                )
    return problems


def _activate_site_packages():
    """Return a verified site-packages path, or None to keep the install path."""
    mount = _find_dataset_mount("cosyvoice3-site-packages")
    if not mount:
        log("site-packages mount missing — falling back to wheelhouse install")
        return None
    problems = _site_packages_problems(mount, EXPECTED_SITE_PACKAGES)
    if problems:
        log("site-packages mount rejected:")
        for p in problems[:6]:
            log(f"  {p}")
        return None

    unpacked = os.path.join(mount, "site-packages")
    if os.path.isdir(unpacked):
        target = unpacked
        log(f"site-packages mount found (unpacked): {mount}")
    elif os.path.isdir(os.path.join(mount, "torch")):
        target = mount
        log(f"site-packages mount found (flattened): {mount}")
    else:
        target = "/tmp/cosyvoice3-site-packages"
        if not (os.path.isdir(target) and os.listdir(target)):
            os.makedirs(target, exist_ok=True)
            t0 = time.time()
            zst = os.path.join(mount, "site-packages.tar.zst")
            tar_path = os.path.join(mount, "site-packages.tar")
            try:
                if os.path.exists(zst):
                    # The dataset keeps one .tar.zst file so Kaggle never
                    # expands 112 dists into tens of thousands of files. The
                    # image ships `zstandard` (probed 2026-11-23); a plain tar
                    # stays supported for an older dataset version.
                    import tarfile, zstandard

                    with open(zst, "rb") as raw:
                        with zstandard.ZstdDecompressor().stream_reader(raw) as reader:
                            with tarfile.open(fileobj=reader, mode="r|") as archive:
                                # filter="data" rejects absolute paths and
                                # links; extract one member at a time so the
                                # static analyzer does not have to trust the
                                # archive wholesale.
                                for member in archive:
                                    archive.extract(member, target, filter="data")
                else:
                    subprocess.run(
                        ["tar", "-xf", tar_path, "-C", target],
                        check=True,
                        timeout=900,
                    )
            except Exception as exc:
                log(f"site-packages archive unpack failed: {exc}")
                return None
            # The archive carries one top-level `site-packages/` directory so
            # the dataset stays tidy; unwrap it before probing.
            wrapped = os.path.join(target, "site-packages")
            if os.path.isdir(wrapped):
                target = wrapped
            log(f"site-packages archive unpacked in {time.time() - t0:.1f}s -> {target}")
        else:
            log("site-packages already unpacked in this container")

    # Prove the tree is self-sufficient before touching the main process. The
    # main interpreter already has the Kaggle image's site-packages on
    # sys.path, so only a `-S` child can tell a working mount from a partial
    # import that merely borrowed the image's torch.
    probe = (
        "import sys; "
        f"sys.path.insert(0, {target!r}); "
        "import torch; print(torch.__file__)"
    )
    try:
        r = subprocess.run(
            [sys.executable, "-S", "-c", probe],
            capture_output=True,
            text=True,
            timeout=300,
        )
    except Exception as exc:
        log(f"site-packages probe failed: {exc}")
        return None
    if r.returncode != 0:
        log("site-packages probe failed — the mount cannot import torch on its own:")
        log((r.stderr or r.stdout or "")[-500:])
        return None
    resolved = (r.stdout or "").strip().splitlines()[-1] if r.stdout.strip() else ""
    if not os.path.realpath(resolved).startswith(os.path.realpath(target) + os.sep):
        log(f"site-packages probe resolved torch outside the mount: {resolved}")
        return None

    sys.path.insert(0, target)
    log(f"site-packages fast path active: torch from {resolved}")
    return target


_SITE_PACKAGES_TARGET = None if BUILD_SITE_PACKAGES_TARGET else _activate_site_packages()

try:
    import torch
    if _SITE_PACKAGES_TARGET and not os.path.realpath(torch.__file__).startswith(
        os.path.realpath(_SITE_PACKAGES_TARGET) + os.sep
    ):
        raise RuntimeError(f"torch resolved outside the site-packages mount: {torch.__file__}")
    SITE_PACKAGES_ACTIVE = _SITE_PACKAGES_TARGET is not None
    log(f"torch: {torch.__version__}, CUDA: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        log(f"GPU: {torch.cuda.get_device_name(0)}, CUDA: {torch.version.cuda}")
except Exception as e:
    log(f"ERROR torch: {e}"); traceback.print_exc(); sys.exit(1)

_set_phase("deps")
if not SITE_PACKAGES_ACTIVE:
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
    log(f"wheelhouse matches the frozen set ({len(EXPECTED_WHEELHOUSE.get('wheels') or {})} wheels)")


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

    Three modes:
      - site-packages mount active: every install is already in the tree, so
        this is a no-op and the subsequent import checks do the verification;
      - build mode: install into BUILD_SITE_PACKAGES_TARGET (#1520 dataset build);
      - default: install into the container (historical path).
    """
    if SITE_PACKAGES_ACTIVE:
        return
    exe = BUILD_SITE_PACKAGES_PYTHON or sys.executable
    if _WHEELS_DIR:
        cmd = [
            exe, "-m", "pip", "install", "-q",
            "--no-index", "--find-links", _WHEELS_DIR,
        ] + list(args)
    else:
        cmd = [exe, "-m", "pip", "install", "-q"] + list(online_extra or []) + list(args)
    subprocess.run(cmd, check=True)


if SITE_PACKAGES_ACTIVE:
    log("site-packages mount active — skipping pip install entirely")
elif BUILD_SITE_PACKAGES_TARGET:
    log(f"site-packages build mode — installing into {BUILD_SITE_PACKAGES_TARGET}")
elif _WHEELS_DIR:
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
            # 2026-11-09: the image now preinstalls huggingface_hub 1.x, which
            # dropped `resolve_revision`; diffusers (pulled transitively by
            # Matcha/CosyVoice) imports it and the kernel died at model load.
            # The frozen wheelhouse carries 0.36.2, but nothing pinned the name,
            # so pip saw the preinstalled 1.x as satisfying the transitive range
            # and never downgraded. Pin it to the wheel that is already frozen.
            "huggingface_hub==0.36.2",
        ]
    )
    log("Core deps OK")
    # Build mode installs into a target directory, so the verification imports
    # below must resolve from there instead of the image's site-packages.
    if BUILD_SITE_PACKAGES_TARGET:
        sys.path.insert(0, BUILD_SITE_PACKAGES_TARGET)
    # 2026-11-09: the plain pin above did not change the active version on the
    # current image (pip reported success, `diffusers` still imported a 1.x
    # huggingface_hub without `resolve_revision`). Force the wheel from the
    # frozen set and log the version so the next failure is self-describing.
    _pip_install(["--force-reinstall", "--no-deps", "huggingface_hub==0.36.2"])
    import huggingface_hub as _hf
    log(f"huggingface_hub {_hf.__version__} ({_hf.__file__})")
    if not _hf.__version__.startswith("0.36."):
        raise RuntimeError(
            f"huggingface_hub {_hf.__version__} is still active after the forced reinstall "
            f"({_hf.__file__}) — a shadowing copy will break diffusers at model load"
        )
    # 2026-11-09: the image now ships a diffusers that imports
    # `resolve_revision` from huggingface_hub 1.x, but the frozen
    # transformers 4.51.3 pins hub <1.0, so the image's diffusers cannot import
    # (Matcha -> decoder -> diffusers). diffusers is not in the frozen
    # wheelhouse, so install a same-era release from PyPI without touching its
    # deps (all of which are present already).
    if not SITE_PACKAGES_ACTIVE:
        diffusers_cmd = [
            BUILD_SITE_PACKAGES_PYTHON or sys.executable,
            "-m", "pip", "install", "-q", "--no-deps",
        ]
        diffusers_cmd += ["diffusers==0.32.2"]
        subprocess.run(diffusers_cmd, check=True)
    import diffusers as _diff
    log(f"diffusers {_diff.__version__}")
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
    if "CUDAExecutionProvider" not in providers and not BUILD_SITE_PACKAGES_TARGET:
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

if BUILD_SITE_PACKAGES_TARGET:
    # #1520 build mode: the dataset builder needs the exact environment the
    # kernel would have installed, not a model. Record every distribution so
    # the committed manifest can pin the mounted set, then stop before the
    # CosyVoice clone and model load.
    import importlib.metadata as _metadata

    dists = {}
    for dist in _metadata.distributions(path=[BUILD_SITE_PACKAGES_TARGET]):
        name = (dist.metadata or {}).get("Name")
        if not name:
            continue
        # pip is the venv's installer, not a runtime dependency of CosyVoice;
        # its version would otherwise churn every rebuild for no benefit.
        if name.strip().lower() == "pip":
            continue
        dists[name.strip().lower().replace("_", "-")] = dist.version
    payload = {
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "platform": f"{sys.platform}_{platform.machine()}",
        "dists": {name: dists[name] for name in sorted(dists)},
    }
    with open("/kaggle/working/site-packages-dists.json", "w") as f:
        json.dump(payload, f, indent=2)
    log(f"SITE_PACKAGES_BUILD_OK distributions={len(dists)}")
    sys.exit(0)

_set_phase("cosyvoice-source")
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

_set_phase("model")
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
            if _holds_safetensors(s):
                _copy_weights_locally(s, d)
            else:
                os.symlink(s, d)
    return dst

def _holds_safetensors(path):
    for _root, _dirs, files in os.walk(path):
        if any(f.endswith(".safetensors") for f in files):
            return True
    return False

def _copy_weights_locally(src_dir, dst_dir):
    # `CosyVoice3.__init__` starts with `load_hyperpyyaml`, which builds
    # `Qwen2ForCausalLM` from `CosyVoice-BlankEN/`; transformers reads
    # `model.safetensors` through mmap. A symlink leaves that mmap pointing at
    # the read-only dataset mount, where random page faults measured **0.6MB/s
    # — 988MB took 1658s of a 1800s load budget** (2026-10-20, T4). Sequential
    # reads on the same mount are fine (~34-47MB/s, measured on flow.pt), so
    # only the mmapped tree is materialised. Later weights (`llm.pt` 2.0GB,
    # `flow.pt` 1.3GB) go through `torch.load`, i.e. sequential, and stay
    # symlinked to avoid copying 5GB of disk.
    import shutil
    t0 = time.time()
    shutil.copytree(src_dir, dst_dir, dirs_exist_ok=True)
    total = sum(
        os.path.getsize(os.path.join(_r, f))
        for _r, _d, fs in os.walk(dst_dir) for f in fs
    )
    dt = max(time.time() - t0, 1e-6)
    log(f"localised {os.path.basename(dst_dir)}/ ({total/1e6:.0f}MB in "
        f"{dt:.1f}s, {total/1e6/dt:.1f}MB/s) — mmap needs real local pages")

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

_set_phase("ref-audio")
log("\n=== Preparing ref audio ===")
_ref_dir = find_input_dir("tts-ref-audio")
ref_path = os.path.join(_ref_dir, "voice-sample-24k.wav") if _ref_dir else None
if not ref_path or not os.path.exists(ref_path):
    log(f"ERROR: ref audio not found (tts-ref-audio mount missing, _ref_dir={_ref_dir})")
    sys.exit(1)
log(f"Ref audio: {os.path.getsize(ref_path)} bytes at {ref_path}")

manifest = json.loads(MANIFEST_JSON)
log(f"Manifest: {len(manifest)} segments (requestId={REQUEST_ID})")

# ── Live session protocol (#1515) ───────────────────────────────────────────
# The model load is the 5-6 minute tax. In live mode the child loads it ONCE
# and then serves batch after batch: batch 1 is the pushed manifest, later
# batches arrive through the host's control gist (scene ids + speed overrides)
# and are answered by streaming each take back over stdout as lossless FLAC
# (base64 chunks). `kaggle kernels logs -f` is the only mid-run host<-kernel
# channel that actually works (mid-run `kernels output` returns zero files).
# Classic mode (no control URL) keeps the historical one-shot behaviour.
SESSION_DIR = "/tmp/tts_session"
LIVE = bool(LIVE_MODE and CONTROL_URL.strip())
IDLE_TIMEOUT_SEC = LIVE_IDLE_TIMEOUT_SEC
CONTROL_POLL_SEC = LIVE_CONTROL_POLL_SEC

log(
    f"Live mode: {'ON' if LIVE else 'OFF'} "
    f"(idle timeout {IDLE_TIMEOUT_SEC}s, control poll {CONTROL_POLL_SEC}s)"
)

INFERENCE_CODE = r'''
import sys, os, time, json, traceback, hashlib
sys.path.insert(0, "/tmp/CosyVoice")
sys.path.insert(0, "/tmp/CosyVoice/third_party/Matcha-TTS")
import torch, soundfile as sf
# Explicit class, not AutoModel (#804): AutoModel dispatches on which
# yaml it finds and checks cosyvoice.yaml (v1) first, so a polluted model_dir
# would silently hand us the v1 class and only fail later on a missing
# speech_tokenizer_v1.onnx. CosyVoice3 asserts the model type up front.
from cosyvoice.cli.cosyvoice import CosyVoice3

SESSION_DIR = "/tmp/tts_session"
CONFIG = json.load(open(os.path.join(SESSION_DIR, "config.json")))
LIVE = bool(CONFIG.get("live"))
REQUEST_ID = CONFIG["requestId"]
IDLE_TIMEOUT_SEC = int(CONFIG.get("idleTimeoutSec") or 0)

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

print(f"torch: {torch.__version__}, CUDA: {torch.cuda.is_available()}", flush=True)
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}", flush=True)

print("Loading CosyVoice3...", flush=True)
# wetext 0.0.4 resolves its fsts with snapshot_download("pengzhendong/wetext")
# inside Normalizer.__init__, and this snapshot is already on disk when the
# kernel seeded it. Answer that one call from the cache so the network is not
# on the load path at all (#804). The patch has to land before CosyVoice3()
# runs, because `from wetext import Normalizer` binds the name at import time.
_WETEXT_CACHE = os.path.expanduser("~/.cache/modelscope/hub/pengzhendong/wetext")
if os.path.exists(os.path.join(_WETEXT_CACHE, "configuration.json")):
    try:
        import modelscope
        _real_snapshot_download = modelscope.snapshot_download
        def _snapshot_from_seed(repo, *args, **kwargs):
            if repo == "pengzhendong/wetext":
                return _WETEXT_CACHE
            return _real_snapshot_download(repo, *args, **kwargs)
        modelscope.snapshot_download = _snapshot_from_seed
        print("wetext snapshot: serving from the seeded cache", flush=True)
    except Exception as e:
        print(f"wetext snapshot: cache patch skipped ({e})", flush=True)
t0 = time.time()
cosyvoice = CosyVoice3(model_dir=model_dir)
print(f"Loaded in {time.time()-t0:.1f}s, sr={cosyvoice.sample_rate}", flush=True)

def synthesize_batch(batch_no, batch_manifest):
    summary = {
        "engine": "CosyVoice3-Kaggle-CUDA",
        "requestId": REQUEST_ID,
        "batch": batch_no,
        "segments": [],
    }
    for i, t in enumerate(batch_manifest):
        print(f"\n[batch {batch_no} {i+1}/{len(batch_manifest)}] scene-{t['sceneId']}", flush=True)
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
                default_instruct = (
                    "You are a helpful assistant. You are a tech documentary narrator. "
                    "Speak in standard American English with a calm, engaging, and professional "
                    "tone at a steady pace.<|endofprompt|>"
                )
                for j in cosyvoice.inference_instruct2(
                    t["text"], default_instruct, ref_path, **kwargs
                ):
                    chunks.append(j['tts_speech'])
            full = torch.cat(chunks, dim=-1)
            gen_time = time.time() - seg_start
            audio_np = full[0].cpu().float().numpy()
            dur = len(audio_np) / cosyvoice.sample_rate
            rtf = gen_time / max(dur, 0.01)
            out = os.path.join(out_dir, t['output'])
            sf.write(out, audio_np, cosyvoice.sample_rate)
            # FLAC must carry the WAV's INTEGER samples, not the float array:
            # libsndfile's float->PCM16 conversion rounds differently per
            # container (measured 2026-11-23: first live take failed the PCM
            # hash while both files decoded "correctly" on their own). Reading
            # the just-written wav back and encoding THAT makes the live take
            # byte-identical to the classic download by construction.
            flac_name = t['output'].rsplit('.', 1)[0] + ".flac"
            flac_path = os.path.join(out_dir, flac_name)
            pcm, _sr = sf.read(out, dtype="int16")
            sf.write(flac_path, pcm, cosyvoice.sample_rate, format="FLAC", subtype="PCM_16")
            flac_bytes = open(flac_path, "rb").read()
            summary["segments"].append({
                "sceneId": t["sceneId"],
                "output": t["output"],
                "flac": flac_name,
                "audioDuration": round(dur, 2),
                "genTime": round(gen_time, 1),
                "rtf": round(rtf, 2),
                "sampleRate": int(cosyvoice.sample_rate),
                "flacBytes": len(flac_bytes),
                "pcmSha256": hashlib.sha256(pcm.tobytes()).hexdigest(),
            })
            print(f"  {dur:.2f}s in {gen_time:.1f}s, RTF {rtf:.2f}x", flush=True)
            del full, chunks
            if torch.cuda.is_available(): torch.cuda.empty_cache()
        except Exception as e:
            print(f"  ERROR: {e}", flush=True); traceback.print_exc()
            summary["segments"].append({"sceneId": t["sceneId"], "error": str(e)})
    # Atomic writes: the parent polls these files from another thread, and a
    # half-written summary would be read as a corrupt batch.
    def _atomic_dump(obj, path):
        tmp = path + ".tmp"
        json.dump(obj, open(tmp, "w"), indent=2, ensure_ascii=False)
        os.replace(tmp, path)
    _atomic_dump(summary, os.path.join(out_dir, f"summary_{batch_no}.json"))
    # Last completed batch also lands at the historical summary.json path so
    # a live run that dies can still be collected by `kaggle kernels output`.
    _atomic_dump(summary, os.path.join(out_dir, "summary.json"))
    n_ok = len([s for s in summary['segments'] if 'error' not in s])
    print(f"BATCH_READY {batch_no} ({n_ok}/{len(batch_manifest)} ok)", flush=True)

def read_request(n):
    path = os.path.join(SESSION_DIR, f"request_{n}.json")
    return json.load(open(path))

batch_no = 1
last_activity = time.time()
while True:
    try:
        payload = read_request(batch_no)
    except FileNotFoundError:
        if not LIVE:
            raise RuntimeError(f"missing request_{batch_no}.json in classic mode")
        if os.path.exists(os.path.join(SESSION_DIR, "stop")):
            print("WORKER_STOP", flush=True)
            break
        if time.time() - last_activity > IDLE_TIMEOUT_SEC:
            print("WORKER_IDLE_TIMEOUT", flush=True)
            break
        time.sleep(2)
        continue
    synthesize_batch(batch_no, payload["scenes"])
    last_activity = time.time()
    if not LIVE:
        break
    batch_no += 1
print("WORKER_EXIT", flush=True)
'''

# ── Session config + first request ────────────────────────────────────────
import shutil, hashlib, glob, urllib.request

shutil.rmtree(SESSION_DIR, ignore_errors=True)
os.makedirs(SESSION_DIR, exist_ok=True)
json.dump(
    {"live": LIVE, "requestId": REQUEST_ID, "idleTimeoutSec": LIVE_IDLE_TIMEOUT_SEC},
    open(os.path.join(SESSION_DIR, "config.json"), "w"),
)
json.dump({"scenes": manifest}, open(os.path.join(SESSION_DIR, "request_1.json"), "w"), ensure_ascii=False)
with open("/tmp/run_inference.py", "w") as f:
    f.write(INFERENCE_CODE)

# ── Seed the text frontend cache (wetext) ────────────────────────────────
# CosyVoiceFrontEnd() builds `wetext.Normalizer`, and wetext 0.0.4 calls
# `snapshot_download("pengzhendong/wetext")` in its constructor. Measured
# 2026-10-20 on the production 10-scene job: that download alone took
# 1265.2s of a 1800s inner budget — unauthenticated and rate-limited — which
# left 154s of headroom and killed the run. Pre-seeding removes the download
# instead of widening the timeout (widening only pushes the cliff out and
# keeps burning GPU minutes on every run).
WETEXT_CACHE = os.path.expanduser("~/.cache/modelscope/hub/pengzhendong/wetext")
def _copy_tree_into_cache(src_root, dst):
    import shutil
    os.makedirs(dst, exist_ok=True)
    for name in os.listdir(src_root):
        s = os.path.join(src_root, name)
        d = os.path.join(dst, name)
        if name.startswith("._"):
            continue  # macOS AppleDouble from an xattr-carrying tar
        if os.path.isfile(s) and name.endswith(".tar"):
            os.makedirs(d[:-4], exist_ok=True)
            subprocess.run(["tar", "xf", s, "-C", d[:-4]], check=True)
        elif os.path.isfile(s):
            shutil.copy2(s, d)
        elif os.path.isdir(s):
            shutil.copytree(s, d, dirs_exist_ok=True)

def seed_wetext_cache():
    if os.path.exists(os.path.join(WETEXT_CACHE, "configuration.json")):
        log(f"wetext cache already present ({WETEXT_CACHE})")
        return True
    src = find_input_dir("cosyvoice3-wetext")
    if not src:
        log("WARNING: cosyvoice3-wetext mount missing — the frontend will "
            "download ~41MB from modelscope (measured 1265s on 2026-10-20)")
        return False
    import shutil
    t0 = time.time()
    parent = os.path.dirname(WETEXT_CACHE)  # .../modelscope/hub/pengzhendong
    os.makedirs(parent, exist_ok=True)
    sealed_tar = os.path.join(src, "wetext-snapshot.tar")
    sealed_zip = os.path.join(src, "wetext-snapshot.zip")
    try:
        if os.path.isfile(sealed_tar):
            subprocess.run(["tar", "xf", sealed_tar, "-C", parent], check=True)
        elif os.path.isfile(sealed_zip):
            import zipfile
            with zipfile.ZipFile(sealed_zip) as z:
                z.extractall(parent)
        elif os.path.isfile(os.path.join(src, "wetext", "configuration.json")):
            # Kaggle unpacks archives at upload time, so the mount usually
            # carries the snapshot one directory down instead of sealed.
            _copy_tree_into_cache(os.path.join(src, "wetext"), WETEXT_CACHE)
        else:
            _copy_tree_into_cache(src, WETEXT_CACHE)
    except Exception as exc:
        # A truncated or corrupt archive in the mount (partial upload, an
        # AppleDouble sidecar) raises CalledProcessError / BadZipFile, and an
        # unguarded raise here kills the GPU run before inference starts —
        # the exact cold-start fatality this seed exists to remove. Clear
        # whatever landed and let the download fallback run instead.
        log(f"WARNING: seeding from {src} failed ({type(exc).__name__}: {exc}) "
            f"— clearing the partial cache and falling back to the download")
        shutil.rmtree(WETEXT_CACHE, ignore_errors=True)
        return False
    if not os.path.exists(os.path.join(WETEXT_CACHE, "configuration.json")):
        log(f"WARNING: seed from {src} produced no configuration.json in "
            f"{WETEXT_CACHE} — clearing it and falling back to the download")
        shutil.rmtree(WETEXT_CACHE, ignore_errors=True)
        return False
    log(f"wetext cache seeded in {time.time()-t0:.1f}s from {src}")
    return True

_set_phase("wetext-seed")
log("\n=== Seeding text frontend cache ===")
seed_wetext_cache()

_set_phase("inference")
log("\n=== Running inference ===")
# Two budgets instead of one blanket timer: cold start and synthesis fail for
# different reasons at different rates. Loading is network-bound and can
# legitimately take 20+ minutes on a cold cache; synthesis runs at ~1-2x RTF.
# The child prints "Loaded in Ns", which is the fork point between them.
LOAD_BUDGET_SEC = 1800
SYNTH_BASE_SEC = 300
SYNTH_PER_SEGMENT_SEC = 60
deadline = [time.time() + LOAD_BUDGET_SEC]
loaded = [False]

# The inference worker is a fresh interpreter: sys.path changes in this
# process do not cross the exec boundary. On the fast path the packages were
# never installed into the image, so PYTHONPATH must carry the mounted tree or
# the child dies at `from hyperpyyaml import ...` (2026-11-23 P100 run).
_child_env = os.environ.copy()
if _SITE_PACKAGES_TARGET:
    prior = _child_env.get("PYTHONPATH")
    _child_env["PYTHONPATH"] = (
        _SITE_PACKAGES_TARGET + (":" + prior if prior else "")
    )

# capture_output=True discarded everything the child had already printed when
# the timeout fired, so a 30-minute GPU run left one exception and no evidence
# of which phase died (2026-10-20, twice). Stream it instead.
proc = subprocess.Popen(
    [sys.executable, "/tmp/run_inference.py"],
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
    env=_child_env,
)
def _pump_output():
    for line in proc.stdout:
        log(line.rstrip("\n"))
        if line.startswith("Loaded in"):
            loaded[0] = True
            deadline[0] = (
                time.time() + SYNTH_BASE_SEC + SYNTH_PER_SEGMENT_SEC * len(manifest)
            )
pump = threading.Thread(target=_pump_output, daemon=True)
pump.start()

def wait_for_summary(batch_no):
    path = os.path.join("/kaggle/working/output", f"summary_{batch_no}.json")
    while not os.path.exists(path):
        if proc.poll() is not None:
            raise RuntimeError(f"inference worker exited before batch {batch_no} (see log)")
        if time.time() > deadline[0]:
            proc.kill()
            raise TimeoutError(
                f"inference exceeded its budget (batch {batch_no}: {LOAD_BUDGET_SEC}s loading, "
                f"then {SYNTH_BASE_SEC}s + {SYNTH_PER_SEGMENT_SEC}s/segment synthesising)"
            )
        time.sleep(1)
    return json.load(open(path))

def stream_batch(batch_no, summary):
    """Emit every take as FLAC over stdout, then the summary line.

    `kaggle kernels logs -f` is the only channel that delivers mid-run bytes
    (mid-run `kernels output` returns zero files, probed 2026-11-23). Base64
    chunks are plain print(), not log(): the 10MB-ish payload has no business
    in log.txt, and the CLI reads stdout.
    """
    for seg in summary.get("segments", []):
        if seg.get("error"):
            continue
        flac_path = os.path.join("/kaggle/working/output", seg["flac"])
        data = open(flac_path, "rb").read()
        meta = {
            "batch": batch_no,
            "sceneId": seg["sceneId"],
            "name": seg["output"],
            "flac": seg["flac"],
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "pcmSha256": seg.get("pcmSha256"),
            "sampleRate": seg.get("sampleRate"),
            "audioDuration": seg.get("audioDuration"),
        }
        print("__TTS_FILE_BEGIN__ " + json.dumps(meta), flush=True)
        for i in range(0, len(data), 32768):
            print("__TTS_FILE_CHUNK__" + base64.b64encode(data[i:i+32768]).decode(), flush=True)
        print("__TTS_FILE_END__ " + json.dumps({"sha256": meta["sha256"]}), flush=True)
    print("__TTS_BATCH_END__ " + json.dumps(summary), flush=True)

def _fetch_control():
    sep = "&" if "?" in CONTROL_URL else "?"
    url = CONTROL_URL + sep + "cb=" + str(int(time.time() * 1000))
    req = urllib.request.Request(url, headers={"User-Agent": "cosyvoice3-live/1"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

def _lookup(scene_id):
    for entry in manifest:
        if str(entry["sceneId"]) == str(scene_id):
            return dict(entry)
    raise RuntimeError(f"control asked for scene {scene_id} not in the pushed manifest")

def _table(scene_ids, speeds, texts=None, instructs=None):
    overrides = {str(k): v for k, v in (speeds or {}).items()}
    # #1528: a batch from a *different* pack is not in batch 1's manifest, so
    # the host may carry that scene's text/instruct directly. Copy the entry
    # instead of mutating the manifest table — a later batch for the original
    # pack must still see its own row.
    text_overrides = {str(k): v for k, v in (texts or {}).items()}
    instruct_overrides = {str(k): v for k, v in (instructs or {}).items()}
    batch = []
    for sid in scene_ids:
        try:
            entry = dict(_lookup(sid))
        except RuntimeError:
            # A cross-pack batch may carry scene ids the pushed manifest never
            # saw (e.g. the second video has more scenes than the first).
            if str(sid) not in text_overrides:
                raise
            entry = {"sceneId": sid}
        # Always override when the host sent a value: pacing compensation may
        # need 1.0 where the pushed manifest carried 1.2, so "absent means
        # unchanged" is not good enough.
        if str(sid) in overrides:
            entry["speed"] = overrides[str(sid)]
        if str(sid) in text_overrides:
            entry["text"] = text_overrides[str(sid)]
            entry["output"] = "scene-%s.wav" % sid
            # Never inherit the other pack's instruct for an overridden text.
            entry["instruct_text"] = instruct_overrides.get(str(sid))
        elif str(sid) in instruct_overrides:
            entry["instruct_text"] = instruct_overrides[str(sid)]
        batch.append(entry)
    return batch

# ── Batch 1: the pushed manifest ─────────────────────────────────────────
summary = wait_for_summary(1)
if LIVE:
    stream_batch(1, summary)
    _set_phase("live-idle")
    log(f"Live: batch 1 streamed; waiting up to {IDLE_TIMEOUT_SEC}s for a retry command")

next_batch = 2
idle_started = time.time()
stop_after = None
try:
    # Classic mode has nothing to wait for: the child exits after batch 1.
    while LIVE and proc.poll() is None:
        if time.time() - idle_started > IDLE_TIMEOUT_SEC:
            log(f"Live: no control command for {IDLE_TIMEOUT_SEC}s — exiting to release the GPU")
            open(os.path.join(SESSION_DIR, "stop"), "w").close()
            break
        try:
            msg = _fetch_control()
        except Exception as exc:
            log(f"Live: control read failed ({type(exc).__name__}: {exc}) — retrying")
            time.sleep(CONTROL_POLL_SEC)
            continue
        if not isinstance(msg, dict) or msg.get("requestId") != REQUEST_ID:
            time.sleep(CONTROL_POLL_SEC)
            continue
        action = msg.get("action")
        if action == "stop":
            log("Live: host sent stop")
            open(os.path.join(SESSION_DIR, "stop"), "w").close()
            break
        if action == "retry" and int(msg.get("batch") or 0) == next_batch - 1:
            scene_ids = msg.get("sceneIds") or []
            if not scene_ids:
                log("Live: retry command carried no scene ids — ignoring")
                time.sleep(CONTROL_POLL_SEC)
                continue
            log(f"Live: retry batch {next_batch} for scene(s) {scene_ids}")
            batch_scenes = _table(
                scene_ids,
                msg.get("speeds"),
                msg.get("texts"),
                msg.get("instructs"),
            )
            deadline[0] = time.time() + SYNTH_BASE_SEC + SYNTH_PER_SEGMENT_SEC * len(batch_scenes)
            _req_path = os.path.join(SESSION_DIR, f"request_{next_batch}.json")
            json.dump({"scenes": batch_scenes}, open(_req_path + ".tmp", "w"),
                      ensure_ascii=False)
            os.replace(_req_path + ".tmp", _req_path)
            summary = wait_for_summary(next_batch)
            stream_batch(next_batch, summary)
            next_batch += 1
            idle_started = time.time()
            continue
        time.sleep(CONTROL_POLL_SEC)
except Exception as exc:
    log(f"ERROR: live session failed ({type(exc).__name__}: {exc})")
    traceback.print_exc()
    proc.kill()
    sys.exit(1)

try:
    proc.wait(timeout=120)
except subprocess.TimeoutExpired:
    proc.kill()
    proc.wait()
pump.join(timeout=60)
if proc.returncode not in (0, None):
    log(f"ERROR: inference exited with {proc.returncode}")
    sys.exit(1)
_set_phase("complete")
log("\n=== Session complete ===")
