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

| Engine | License | Emotion | Cloning | Local RTF | User Feedback |
|--------|---------|---------|---------|-----------|---------------|
| **CosyVoice3 (CUDA)** | Apache-2.0 ✅ | instruct2 ✅ | ✅ | N/A (remote) | emotion matches A100 |
| CosyVoice3-MLX | Apache-2.0 ✅ | instruct2 ✅ | ✅ | 0.64-0.87x | emotion regression |
| F5-TTS-MLX | CC-BY-NC ❌ | ❌ none | ✅ | 9-11x | (former default) |
| Zonos v1 | Apache-2.0 ✅ | 8D+pitch ✅ | ✅ | 11.6x | "稳定合适" but v2 has电音 |
| VoxCPM2 | Apache-2.0 ✅ | clone+style ✅ | ✅ | 0.33x (A100) | "中规中矩" |
| Qwen3-TTS | Apache-2.0 ✅ | instruct ✅ | ⚠️ cannot coexist | 2x | "拖音太夸张" |

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
confirmed emotion is "slightly flat, similar to MPS" — better than nothing
but not matching CUDA. NPU is valuable as a free, in-China fallback that
doesn't consume Kaggle quota.

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
CosyVoice3-NPU as free fallback, CosyVoice3-MLX as local fallback, F5-TTS-MLX as
backup, Qwen3-TTS as secondary fallback, edge-tts as cloud fallback, and macOS
`say` as last resort.

Engine priority:
1. **CosyVoice3-Kaggle-CUDA** (DEFAULT — P100 GPU, full emotion fidelity, Apache-2.0, ~8-10min/batch)
2. **CosyVoice3-Modal-CUDA** (PAID FALLBACK — A100 GPU, same CUDA emotion as Kaggle, ~$0.20-0.50/batch, used when Kaggle 30h/week quota exhausted)
3. **CosyVoice3-NPU** (FREE FALLBACK — Ascend 910B, emotion slightly flat vs CUDA, RTF ~2.2x, no Kaggle/Modal quota)
4. **CosyVoice3-MLX** (LOCAL FALLBACK — emotion regression, but fast RTF 0.64-0.87x)
5. **F5-TTS-MLX** (BACKUP — good rhythm, CC-BY-NC, no emotion control)
6. Qwen3-TTS (good emphasis, clone+emotion cannot coexist)
7. edge-tts (Microsoft neural TTS, no cloning)
8. macOS `say` (last resort, no cloning)

CUDA engines (Kaggle + Modal) are prioritized above NPU/MLX because emotion
fidelity is the primary selection criterion — NPU and MLX both have emotion
regression vs CUDA baseline (verified 2026-09-08). Kaggle is free (30h/week),
Modal is paid (~$30/mo) but has no weekly quota limit.

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
- `lib/tts/cosyvoice3-npu.mjs` — NPU remote engine adapter (AtomGit Jupyter)
- `npu/cosyvoice3_npu_kernel.py` — NPU kernel template (deps + inference + istft CPU fallback)
- `lib/tts/cosyvoice3-mlx.mjs` — local fallback engine adapter
- `cosyvoice3_mlx_batch_tts.py` — local fallback Python batch script
- `registry.mjs` — PRIORITY updated, all CosyVoice3 variants registered
- `tts-registry.test.mjs` — 7 test scenarios updated
- `.env.local.example` — CosyVoice3 env vars documented (Kaggle + Modal + NPU)
- Model (Kaggle): downloaded fresh per kernel run (~9GB, cached in kernel session)
- Model (Modal): cached in Modal volume `cosyvoice3-cuda` (first run ~10min, subsequent ~1min)
- Model (NPU): cached at `/tmp/cosyvoice3-model` in Notebook session
- Model (MLX fallback): `~/.cosyvoice3-mlx-model` (1.7GB, mlx-audio format)
- Venv (MLX fallback): `~/.video-tts-env` (shared with F5 + Qwen, Python 3.12)
- Kaggle CLI: `~/.kaggle/kaggle.json` required
- Modal CLI: `modal token new` required (paid, ~$30/mo)
- AtomGit Notebook: NPU 910B + 32GB CPU tier required
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

NPU fallback (free, in-China):
- AtomGit Notebook with NPU 910B + 32GB CPU tier
- `COSYVOICE3_NPU_JUPYTER_URL` env var set to Jupyter API base URL
- torch_npu pre-installed in Notebook environment

MLX fallback (optional, for offline/fast iteration):
- `~/.video-tts-env` Python 3.12 venv with mlx-audio
- `~/.cosyvoice3-mlx-model` model directory

### Future engine swap

Requires: (1) new adapter in `lib/tts/`, (2) register in `ENGINE_FACTORIES`
+ `PRIORITY`, (3) verify post-processing compatibility, (4) update tests.
