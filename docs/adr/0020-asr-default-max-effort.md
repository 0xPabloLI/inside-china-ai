# ADR-0020: ASR defaults to max-effort models

- **Status**: Accepted
- **Date**: 2026-09-11

## Context

Issue #98 introduced a resident local WhisperX ASR worker (`asr_worker.py` /
`asr-analyzer.mjs`) with a default model of `base`, chosen so the model would
be present in the local HF cache and work offline without download. The
commit message itself flagged this as a "base model quality caveat".

This worker was later wired into the TTS Quality Gate
(`tts/quality-gate.mjs`, #225/#230), which back-transcribes every generated
TTS scene to verify completeness. The `base` default propagated into the
video pipeline's quality verification, reducing ASR accuracy for
numbers/dates/proper-nouns — the exact tokens the quality gate guards.

A separate ASR path (`video-understand.mjs`) already uses
`ggml-large-v3-turbo` via whisper.cpp (Metal-accelerated), which
`docs/research/model-sources-reference.md` rates 4.7/5 (首选) vs whisperx
2.7/5 (仅 alignment).

## Decision

1. **All ASR paths default to max-effort models** (`large-v3` for WhisperX,
   `large-v3-turbo` for whisper.cpp). No module may hardcode a sub-max
   default (`base`/`tiny`/`small`/`medium`).
2. **whisper.cpp is the preferred ASR backend** for transcription (Metal
   acceleration, highest accuracy). WhisperX is retained only for forced
   alignment (`text-align.py`).
3. **Single source of truth**: `scripts/short-video/lib/asr-defaults.mjs`
   exports the default model constants; all JS ASR paths import from there.
   `asr_worker.py` mirrors the same default with a pointer to this ADR.
4. **CI guard**: `scripts/lint-asr-model-defaults.mjs` fails if any ASR
   default resolves to a sub-max model, preventing regressions.

## Consequences

- TTS Quality Gate back-transcription uses whisper.cpp `large-v3-turbo`
  (Metal) instead of WhisperX `base` (CPU): higher accuracy, faster on
  Apple Silicon.
- WhisperX `large-v3` on CPU is slower than `base`; consumers that cannot
  use whisper.cpp should set `ASR_MODEL` explicitly and document the
  trade-off.
- `asr-analyzer.mjs` default changes from `base` to `large-v3`; existing
  cache keys (which include the model name) will miss, causing one-time
  re-transcription — acceptable.