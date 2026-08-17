# TTS Engine Selection: F5-TTS-MLX as Default

## Context

The short video pipeline needs voiceover generation for 9:16 vertical videos. The TTS engine must:
1. Clone a reference voice (brand consistency across all videos)
2. Control speaking duration (match scene timing)
3. Run locally on Apple Silicon (no per-call API cost, no latency for 10+ scenes per video)
4. Produce natural-sounding speech (not robotic)

Between 2026-07-30 and 2026-08-14, the project evaluated 6 TTS engines through A/B testing and production use. The selection went through three phases:
- **Phase 1 (Jul 2026):** F5-TTS-MLX + XTTS + Kokoro + edge-tts + macOS `say` (5 engines)
- **Phase 2 (Aug 5, 2026):** CosyVoice replaced F5 as default; F5/XTTS/Kokoro removed (commit `45d24a2`)
- **Phase 3 (Aug 14, 2026):** F5-TTS-MLX restored as default after A/B comparison; CosyVoice removed (commit `72c45e3`)

The engine swap in Phase 2 was driven by F5's duration control bug (generating 0.03s audio). The swap back in Phase 3 was driven by CosyVoice's inferior rhythm and the fix for F5's duration bug.

## Decision

**F5-TTS-MLX is the default TTS engine** (priority 1), with Qwen3-TTS as backup (priority 2), edge-tts as fallback (priority 3), and macOS `say` as last resort (priority 4).

F5-TTS-MLX runs at **Max Effort** configuration:
- `steps=32` (default 8, 4× quality increase — 16→32 is the non-linear quality jump)
- `cfg_strength=3.0` (default 2.0, 1.5× voice fidelity)
- `method='rk4'` (RK4 ODE solver — confirmed as library default in `F5TTS.sample()`, passed explicitly in `f5_mlx_batch_tts.py`)
- Duration: `estimate_target_seconds(text)` — CJK chars / 4.5 + Latin words / 2.8 + punctuation × 0.15s

Post-processing: **all FFmpeg audio filters disabled** for F5 — no silenceremove, no rubberband prosody, no highpass, no denoise. Only resample (24kHz → 44.1kHz) for assembly compatibility.

## Why not alternatives

### CosyVoice (evaluated, used, then dropped)
- **Pros:** Fast inference, good Mandarin quality, `speed` parameter.
- **Cons:** No duration control (could not target a specific scene length). Rhythm felt metronomic compared to F5. Python 3.12 compatibility issues. Only `speed` parameter — no pitch/emphasis/steps tuning.
- **Decision driver:** A/B comparison (2026-08-14) — F5 with `steps=32` produced noticeably more natural pacing and intonation. CosyVoice's flat rhythm was the deciding factor.
- **Cleanup:** CosyVoice adapter, batch script, and ~6GB model removed (commit `f449115`).

### XTTS / Kokoro (evaluated, dropped in Phase 1)
- **XTTS:** Coqui TTS, Python-only, slower than F5-MLX on Apple Silicon. No MLX port.
- **Kokoro:** Lightweight, but no voice cloning — could not maintain brand voice consistency.
- **CSM (Contextual Speech Model):** Fixed `temperature=0.6`/`topk=30`, no tunable parameters. 15GB of unused models cleaned up (commit `4d7cd16`).

### Cloud API TTS (not evaluated — excluded by design)
- **OpenAI TTS / ElevenLabs / Azure TTS:** Per-call cost for 10+ scenes × 20+ videos/month. Network latency. No local voice cloning control. Brand voice locked behind vendor.
- **Decision:** Local-first is a design principle for this pipeline (see ADR-0009 VLM selection for the same pattern).

### F5-TTS (PyTorch/CUDA original)
- The original F5-TTS from Shanghai Jiao Tong University (SJTU) is PyTorch + CUDA. It does not run on Apple Silicon without CUDA.
- **MLX port** by lucasnewman (MIT license, HF: `lucasnewman/f5-tts-mlx`, v0.2.6) provides Apple Silicon native inference via Metal Performance Shaders.
- The MLX port is inference-only — the model was trained on CUDA, not on MPS.

## Trade-offs

| Aspect | F5-TTS-MLX | Cost |
|--------|-----------|------|
| **Inference speed** | ~3-8s per scene (steps=32) | Slower than CosyVoice (~2s) or edge-tts (~1s) |
| **Model size** | ~1.5GB (F5-TTS-MLX) | Disk space |
| **Duration control** | `duration = ref_audio_length + estimate_target_seconds(text)` | Must calculate manually; `estimate_duration=True` over-estimates if ref audio is slow. CJK chars at 4.5 chars/sec, Latin words at 2.8 words/sec, punctuation adds 0.15s per mark. |
| **Ref text precision** | Must exactly match ref audio | Whisper-transcribed ref text causes audio leakage ("废话" artifacts) |
| **Silence threshold** | F5 amplitude < -35dB → silenceremove deletes entire audio | Must skip silenceremove for F5 |
| **Prosody post-processing** | rubberband introduces mechanical artifacts on F5's natural output | No per-scene pitch/tempo variation (relies on F5's internal prosody) |

## Key bugs fixed during adoption

1. **Duration parameter must be explicit** — F5's `generate()` `duration` is total (ref + target), not target-only. Without it, generates 0.03s audio. Formula: `duration = ref_audio_duration + estimate_target_seconds(text)`, where `estimate_target_seconds` counts CJK characters at 4.5 chars/sec and Latin words at 2.8 words/sec (see `f5_mlx_batch_tts.py`).
2. **Ref-text must match ref-audio exactly** — mismatched ref-text causes F5 to leak reference audio fragments into output.
3. **Silenceremove must be skipped** — F5's amplitude is below -35dB threshold; silenceremove treats the entire audio as silence and deletes it.
4. **rubberband prosody disabled** — post-hoc pitch/tempo shift on F5's already-natural output creates mechanical artifacts.

## Consequences

- TTS engine selection is via `registry.mjs` priority array: `["f5-mlx", "qwen-tts", "edge-tts", "say"]`. `TTS_ENGINE` env var overrides.
- F5-TTS-MLX requires `~/.video-tts-env` (Python 3.12) with `f5_tts_mlx` installed (see ADR-0011).
- Reference voice at `scripts/short-video/voice-samples/voice-sample-24k.wav` + matching ref-text file.
- Subtitle alignment uses `wav2vec2-large-960h-lv60-self` (316M params, ~1.2GB) via `text-align.py` — not Whisper (which mis-transcribes "DeepSeek's" as "deep seeks").
- Future engine swap requires: (1) new adapter in `lib/tts/`, (2) register in `ENGINE_FACTORIES` + `PRIORITY`, (3) verify post-processing compatibility.
