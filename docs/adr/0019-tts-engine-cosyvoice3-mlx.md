# TTS Engine Selection: CosyVoice3-Kaggle-CUDA as Default

Date: 2026-09-08

## Status

Accepted — supersedes [ADR-0008](./0008-tts-engine-f5-mlx.md)

## Context

ADR-0008 selected F5-TTS-MLX as the default TTS engine (2026-08-16). Since
then, Issue #179 conducted a comprehensive 8-engine comparison (48 samples,
6 emotion scenarios × 8 engines) with human listening evaluation.

User requirements (clarified 2026-09-07):

- **Commercial license** (not limited to Apache, but must be commercially usable)
- **Voice cloning** — zero-shot clone from reference audio
- **Emotion control** — instruct-based emotion/style control
- **Free** preferred but not required
- **Near-real-time NOT required** — RTF is not a selection criterion

### Evaluation Results (§8.8)

Engines meeting all three hard requirements (commercial + clone + emotion):

| Engine                | License       | Emotion        | Cloning           | Local RTF    | User Feedback             |
| --------------------- | ------------- | -------------- | ----------------- | ------------ | ------------------------- |
| **CosyVoice3 (CUDA)** | Apache-2.0 ✅ | instruct2 ✅   | ✅                | N/A (remote) | emotion matches A100      |
| CosyVoice3-MLX        | Apache-2.0 ✅ | instruct2 ✅   | ✅                | 0.64-0.87x   | emotion regression        |
| F5-TTS-MLX            | CC-BY-NC ❌   | ❌ none        | ✅                | 9-11x        | (former default)          |
| Zonos v1              | Apache-2.0 ✅ | 8D+pitch ✅    | ✅                | 11.6x        | "稳定合适" but v2 has电音 |
| VoxCPM2               | Apache-2.0 ✅ | clone+style ✅ | ✅                | 0.33x (A100) | "中规中矩"                |
| Qwen3-TTS             | Apache-2.0 ✅ | instruct ✅    | ⚠️ cannot coexist | 2x           | "拖音太夸张"              |

### MPS emotion regression investigation (2026-09-07)

CosyVoice3-MLX and CosyVoice3 PyTorch MPS both exhibit **emotion quality
regression** vs the CUDA version. Root causes identified:

1. **Metal kernel numerical precision** — MPS uses Metal shaders for float32
   computation; implementation differs slightly from CUDA
2. **ONNX CPU EP** — CosyVoice3's speech_tokenizer ONNX model can only use
   CPU EP on MPS (ONNX Runtime lacks MPS support); CUDA uses CUDA EP
3. **float64 unsupported** — hifigan generator uses float64 for f0 prediction
   precision; MPS doesn't support float64, forced to use float32

**MPS experiment results:**

- `torch.backends.mps.matmul.allow_tf32` — doesn't exist in torch 2.3.1
- `torch.set_float32_matmul_precision('highest')` — causes MPS float64 errors
- `CoreMLExecutionProvider` — 795/1367 ONNX nodes use CoreML, rest CPU
- `PYTORCH_ENABLE_MPS_FALLBACK=1` — needed for `torch.istft` (uses
  `aten::unfold_backward`, unsupported on MPS)
- **Result: 6/6 segments generated, RTF ~3x, but user confirmed emotion
  still clearly worse than CUDA baseline**

### NPU emotion assessment (2026-09-08)

CosyVoice3 was tested on AtomGit NPU (Ascend 910B4, 32GB HBM, free). NPU
requires `torch.istft` CPU fallback (NPU doesn't support `aclnnUnfoldGrad`)
and automatic float64→float32 casting (similar to MPS limitation).

**NPU test results:** 6/6 segments generated, RTF ~2.2x. User listening
confirmed emotion is "slightly flat, similar to MPS" — i.e. the same grade as
CosyVoice3-MLX, and not matching CUDA. That parity is why the NPU adapter is
not in the chain (see Decision → "Why no NPU engine").

### Why Kaggle P100 CUDA?

Kaggle P100 CUDA matches the Modal A100 emotion baseline exactly (verified
by user listening). Kaggle provides:

- **Free** GPU compute (30h/week, P100 16GB)
- **Full CUDA EP** for ONNX speech_tokenizer
- **float64 support** for hifigan f0 predictor
- **No local resource usage** — inference runs remotely

Trade-off: ~8-10 min per batch (5 min setup + 3 min inference), acceptable
since near-real-time is not required.

### Why not F5-TTS-MLX as default?

F5-TTS-MLX lacks emotion control entirely — it cannot vary tone/style per
scene. Its model weights are CC-BY-NC (non-commercial), which conflicts with
the commercial-use requirement. F5 remains a capable backup for rhythm-sensitive
content where emotion control is not needed.

### CosyVoice3 model size

CosyVoice3 is only available in 0.5B (the largest in the CosyVoice family).
From the official eval table, Fun-CosyVoice3-0.5B achieves SS 78.0 (top-tier),
comparable to or better than larger models (IndexTTS2 1.5B: 76.5, HiggsAudio
3B: 74.0). Larger does not mean better for TTS.

## Decision

**CosyVoice3-Kaggle-CUDA is the default TTS engine**, with CosyVoice3-Modal-CUDA
as paid CUDA fallback (same emotion quality, used when Kaggle quota exhausted),
CosyVoice3-MLX as local fallback, F5-TTS-MLX as backup, edge-tts as cloud
fallback, and macOS `say` as last resort.

Engine priority:

1. **CosyVoice3-Kaggle-CUDA** (DEFAULT — P100 GPU, full emotion fidelity, Apache-2.0, ~8-10min/batch)
2. **CosyVoice3-Modal-CUDA** (PAID FALLBACK — A100 GPU, same CUDA emotion as Kaggle, ~$0.20-0.50/batch, used when Kaggle 30h/week quota exhausted)
3. **CosyVoice3-MLX** (LOCAL FALLBACK — emotion regression, but fast RTF 0.64-0.87x)
4. **F5-TTS-MLX** (BACKUP — good rhythm, CC-BY-NC, no emotion control)
5. edge-tts (Microsoft neural TTS, no cloning — manual opt-in only)
6. macOS `say` (last resort, no cloning — manual opt-in only)

CUDA engines (Kaggle + Modal) are prioritized above MLX because emotion
fidelity is the primary selection criterion — MLX has emotion regression vs the
CUDA baseline (verified 2026-09-08). Kaggle is free (30h/week), Modal is paid
(~$30/mo) but has no weekly quota limit.

### Why no NPU engine

The Ascend 910B NPU matched CosyVoice3-MLX on the criterion that decides this
ranking (emotion: both "slightly flat" vs CUDA, 2026-09-08 listening) and lost
on every other axis: it needed a live session-scoped Jupyter endpoint and ran
at RTF ~2.2x against MLX's local 0.64-0.87x. A remote engine that is neither
better nor faster than the local one earns no slot, so the adapter and its
kernel template were deleted (2026-10-16) rather than kept as a dominated
fallback.

AtomGit itself stays in use as a platform (NPU core-hours, hosted models) —
only the CosyVoice3 NPU adapter is gone.

### Emotion mapping

CosyVoice3 uses `instruct_text` per scene, mapped from `visualType`/`refStyle`:

- `hook` → excited and shocked tone
- `narrative` → calm and measured tone
- `data` → clear and informative tone
- `cta` → energetic and persuasive tone
- (none) → plain voice clone without instruction

CUDA (PyTorch) version requires `<|endofprompt|>` suffix in instruct_text.
MLX version auto-appends it — do NOT include it in instruct_text for MLX.

## Consequences

- `lib/tts/cosyvoice3-kaggle-cuda.mjs` — new remote engine adapter (Kaggle CLI)
- `kaggle/cosyvoice3_cuda_kernel.py` — Kaggle kernel template (deps + inference)
- `lib/tts/cosyvoice3-modal-cuda.mjs` — Modal A100 remote engine adapter (Modal CLI)
- `modal/cosyvoice3_cuda_modal.py` — Modal script (deps + inference + volume cache)
- `lib/tts/cosyvoice3-mlx.mjs` — local fallback engine adapter
- `cosyvoice3_mlx_batch_tts.py` — local fallback Python batch script
- `registry.mjs` — PRIORITY updated, CosyVoice3 CUDA + MLX variants registered
- `tts-registry.test.mjs` — 7 test scenarios updated
- `.env.local.example` — CosyVoice3 env vars documented (Kaggle + Modal)
- Model (Kaggle): downloaded fresh per kernel run (~9GB, cached in kernel session)
- Model (Modal): cached in Modal volume `cosyvoice3-cuda` (first run ~10min, subsequent ~1min)
- Model (MLX fallback): `~/models/cosyvoice3-mlx` (1.7GB, mlx-audio format; legacy `~/.cosyvoice3-mlx-model` auto-detected when the new path is absent)
- Venv (MLX fallback): `~/.video-tts-env` (shared with F5, Python 3.12)
- Kaggle CLI: `~/.kaggle/kaggle.json` required
- Modal CLI: `modal token new` required (paid, ~$30/mo)
- ADR-0008 superseded

### Setup requirements

Kaggle CUDA (default):

- Kaggle CLI installed (`pip install kaggle`)
- `~/.kaggle/kaggle.json` with API credentials
- Internet + GPU enabled on kernel

Modal CUDA (paid fallback, same emotion quality):

- Modal CLI installed + authenticated (`modal token new`)
- A100 GPU access (included in Modal paid plan)
- First run downloads model to volume (~10min), cached after

MLX fallback (optional, for offline/fast iteration):

- `~/.video-tts-env` Python 3.12 venv with mlx-audio
- `~/models/cosyvoice3-mlx` model directory (legacy `~/.cosyvoice3-mlx-model` auto-detected when the new path is absent)

### Future engine swap

Requires: (1) new adapter in `lib/tts/`, (2) register in `ENGINE_FACTORIES`

- `PRIORITY`, (3) verify post-processing compatibility, (4) update tests.
