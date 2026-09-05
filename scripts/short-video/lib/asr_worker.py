#!/usr/bin/env python3
"""Resident local ASR worker (#98, P5).

NDJSON IPC on stdin/stdout — same convention as vlm_analyzer.py:
  request:  {"requestId": "...", "action": "transcribe", "audioPath": "...",
             "languageHint": "zh" | null}
  response: {"requestId": "...", "segments": [{"startMs", "endMs", "text"}],
             "language": "zh", "meta": {"backend": "whisperx/faster-whisper",
                                        "model": "base"}}
  failure:  {"requestId": "...", "error": "..."}

Timestamps are relative to the extracted audio window; the Node gateway
offsets them back onto the media timeline.

Backend: WhisperX transcription via faster-whisper (already installed in
~/.video-tts-env and used by text-align.py for forced alignment). Model is
configurable via ASR_MODEL (default "base" — present in the local HF cache;
larger models download on first use when HF_HUB_OFFLINE=0).

No word/char-level forced alignment here (#98 non-goal — that is the
text-align.py enhancement path).
"""

import json
import os
import sys
import warnings

warnings.filterwarnings("ignore")

MODEL_NAME = os.environ.get("ASR_MODEL", "base")
DEVICE = "cpu"
COMPUTE_TYPE = "int8"

_model = None
_model_error = None


def load_model():
    """Lazy-load the WhisperX model; remembers a load failure so every
    request after a failed load degrades fast instead of re-downloading."""
    global _model, _model_error
    if _model is not None or _model_error is not None:
        return _model
    try:
        import whisperx

        sys.stderr.write(f"[asr_worker] Loading model: {MODEL_NAME}\n")
        sys.stderr.flush()
        _model = whisperx.load_model(MODEL_NAME, DEVICE, compute_type=COMPUTE_TYPE)
        sys.stderr.write("[asr_worker] Model loaded.\n")
        sys.stderr.flush()
    except Exception as exc:  # noqa: BLE001 — degrade, never crash the loop
        _model_error = f"model_load_failed: {exc}"
        sys.stderr.write(f"[asr_worker] {_model_error}\n")
        sys.stderr.flush()
    return _model


def transcribe(audio_path, language_hint):
    model = load_model()
    if model is None:
        return None, _model_error

    import whisperx

    audio = whisperx.load_audio(audio_path)
    result = model.transcribe(audio, language=language_hint)
    segments = [
        {
            "startMs": int(round(seg["start"] * 1000)),
            "endMs": int(round(seg["end"] * 1000)),
            "text": (seg.get("text") or "").strip(),
        }
        for seg in result.get("segments", [])
    ]
    return {
        "segments": segments,
        "language": result.get("language"),
        "meta": {"backend": "whisperx/faster-whisper", "model": MODEL_NAME},
    }, None


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            sys.stdout.write(json.dumps({"error": f"bad_request: {exc}"}) + "\n")
            sys.stdout.flush()
            continue

        request_id = req.get("requestId", "")
        action = req.get("action", "")
        if action == "exit":
            sys.exit(0)
        if action != "transcribe":
            sys.stdout.write(
                json.dumps({"requestId": request_id, "error": f"unknown_action: {action}"})
                + "\n"
            )
            sys.stdout.flush()
            continue

        audio_path = req.get("audioPath", "")
        if not audio_path or not os.path.isfile(audio_path):
            sys.stdout.write(
                json.dumps({"requestId": request_id, "error": "audio_not_found"}) + "\n"
            )
            sys.stdout.flush()
            continue

        try:
            result, error = transcribe(audio_path, req.get("languageHint"))
            if error:
                sys.stdout.write(
                    json.dumps({"requestId": request_id, "error": error}) + "\n"
                )
            else:
                result["requestId"] = request_id
                result["error"] = None
                sys.stdout.write(json.dumps(result) + "\n")
        except Exception as exc:  # noqa: BLE001 — structured error envelope
            sys.stdout.write(
                json.dumps({"requestId": request_id, "error": f"transcribe_failed: {exc}"})
                + "\n"
            )
        sys.stdout.flush()


if __name__ == "__main__":
    main()
