#!/usr/bin/env python3
"""Resident local ASR worker (#98, P5).

NDJSON IPC on stdin/stdout — same convention as vlm_analyzer.py:
  request:  {"requestId": "...", "action": "transcribe", "audioPath": "...",
             "languageHint": "zh" | null}
  response: {"requestId": "...", "segments": [{"startMs", "endMs", "text"}],
             "language": "zh", "meta": {"backend": "whisperx/faster-whisper",
                                        "model": "large-v3"}}
  failure:  {"requestId": "...", "error": "..."}

Timestamps are relative to the extracted audio window; the Node gateway
offsets them back onto the media timeline.

Backend: WhisperX transcription via faster-whisper (already installed in
~/.video-tts-env and used by text-align.py for forced alignment). Model is
configurable via ASR_MODEL (default "large-v3" per ADR-0020 max-effort;
override only with documented performance justification).

No word/char-level forced alignment here (#98 non-goal — that is the
text-align.py enhancement path).
"""

import json
import os
import sys
import warnings

warnings.filterwarnings("ignore")

MODEL_NAME = os.environ.get("ASR_MODEL", "large-v3")  # ADR-0020: max-effort default
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
    # ctx-off + 重复守卫，全部显式传参（不依赖上游默认值）。
    #
    # 为什么必须显式：whisperx/faster-whisper 的默认是
    # `condition_on_previous_text=True`，把上一段输出当下一段上下文。低信噪 /
    # 长静音 / 音乐段上这个反馈回路会让解码陷入重复幻觉——不是模型太小的问题，
    # large-v3 一样会（ADR-0020 只保证模型档位，管不到这个开关）。
    # 2026-10-09 实测 bench 语料：ctx-on 有 18/92 份在前 2000 字符内重复率 >20%、
    # 6 份 >50%；即便 ctx-off 仍有 11/145 份出现 ≥20 词连续重复（EFD9BLgMVK8
    # 连续 73 次 "Norge"、MQEcUPeAdFs 连续 58 次 "go"）。
    #
    # 生产口径依据：#418 实测「关上下文」把最长重复 27→1；
    # docs/video-production-runbook.md「转写一律 ctx-off」；
    # docs/specs/spec-video-loader-417.md §4「转写口径唯一」。
    # 本 worker 此前只传 language，等于按上游默认走了 ctx-on —— 与上述口径相反。
    #
    # 其余守卫含义：
    #   repetition_penalty>1  直接压制连续重复 token；
    #   no_speech_threshold   静音段判为无语音，不进解码；
    #   compression_ratio_threshold / log_prob_threshold  触发回退温度重采样；
    #   condition_on_previous_text=False 是主开关，其余为纵深防御。
    result = model.transcribe(
        audio,
        language=language_hint,
        condition_on_previous_text=False,
        repetition_penalty=1.15,
        no_speech_threshold=0.6,
        compression_ratio_threshold=2.4,
        log_prob_threshold=-1.0,
        temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
    )
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
