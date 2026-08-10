#!/usr/bin/env python3
"""
Qwen3-TTS batch TTS generator — loads model ONCE, processes ALL scenes.
Uses zero-shot voice cloning via reference audio (3-second rapid clone).

Usage:
  python qwen_tts_batch.py --manifest /path/to/manifest.json --output-dir /path/to/audio/

Manifest format (JSON array):
  [
    {"sceneId": 1, "text": "Hello world", "output": "scene-1.wav"},
    ...
  ]

Environment:
  QWEN_TTS_MODEL_DIR — path to model (default: /tmp/qwen-tts-model)
  QWEN_TTS_REF_AUDIO — path to ref-audio WAV
  QWEN_TTS_REF_TEXT  — exact transcription of ref-audio
  QWEN_TTS_LANGUAGE  — language (default: English)
"""
import argparse
import json
import sys
import os
import time
import subprocess

os.environ.setdefault("SSL_CERT_FILE", "/opt/homebrew/etc/openssl@3/cert.pem")
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")


def generate_batch(manifest_path, output_dir, ref_audio, ref_text, language="English"):
    import torch
    import soundfile as sf
    from qwen_tts import Qwen3TTSModel

    model_path = os.environ.get("QWEN_TTS_MODEL_DIR", "/tmp/qwen-tts-model")

    # Read manifest
    with open(manifest_path, "r") as f:
        scenes = json.load(f)

    print(f"\nLoading Qwen3-TTS model from {model_path}...", file=sys.stderr)
    t0 = time.time()

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"  Device: {device}", file=sys.stderr)

    model = Qwen3TTSModel.from_pretrained(
        model_path,
        device_map=device,
        dtype=torch.float32,
    )
    t1 = time.time()
    print(f"  Model loaded in {t1 - t0:.1f}s", file=sys.stderr)
    print(f"\nProcessing {len(scenes)} scenes with Qwen3-TTS...\n", file=sys.stderr)

    results = []
    for scene in scenes:
        scene_id = scene["sceneId"]
        text = scene["text"]
        output_name = scene.get("output", f"scene-{scene_id}.wav")
        output_path = os.path.join(output_dir, output_name)

        print(f"  Scene {scene_id}: generating {len(text)} chars...", file=sys.stderr)
        t2 = time.time()

        wavs, sr = model.generate_voice_clone(
            text=text,
            language=language,
            ref_audio=ref_audio,
            ref_text=ref_text,
        )
        t3 = time.time()

        if wavs and len(wavs) > 0:
            sf.write(output_path, wavs[0], sr)

            # Get exact duration
            dur_result = subprocess.run(
                ["ffprobe", "-i", output_path, "-show_entries", "format=duration",
                 "-v", "quiet", "-of", "csv=p=0"],
                capture_output=True, text=True
            )
            duration = float(dur_result.stdout.strip()) if dur_result.stdout.strip() else 0.0

            print(f"    Duration: {duration:.2f}s, RTF: {(t3 - t2) / max(duration, 0.01):.2f}x", file=sys.stderr)

            results.append({
                "sceneId": scene_id,
                "audioPath": os.path.abspath(output_path),
                "duration": duration,
            })
        else:
            print(f"    ERROR: No output generated!", file=sys.stderr)
            results.append({
                "sceneId": scene_id,
                "audioPath": "",
                "duration": 0.0,
            })

    print(f"\nAll {len(scenes)} scenes processed!", file=sys.stderr)
    print(json.dumps(results))
    return results


def main():
    parser = argparse.ArgumentParser(description="Qwen3-TTS batch TTS generator")
    parser.add_argument("--manifest", required=True, help="Path to JSON manifest file")
    parser.add_argument("--output-dir", required=True, help="Output directory for audio files")
    parser.add_argument("--ref-audio", help="Path to ref-audio WAV")
    parser.add_argument("--ref-text", help="Exact transcription of ref-audio")
    parser.add_argument("--language", default="English", help="Language (default: English)")

    args = parser.parse_args()

    ref_audio = args.ref_audio or os.environ.get("QWEN_TTS_REF_AUDIO")
    ref_text = args.ref_text or os.environ.get("QWEN_TTS_REF_TEXT")
    language = os.environ.get("QWEN_TTS_LANGUAGE", args.language)

    if not ref_audio or not ref_text:
        print("Error: --ref-audio and --ref-text (or QWEN_TTS_REF_AUDIO/QWEN_TTS_REF_TEXT env vars) are required", file=sys.stderr)
        sys.exit(1)

    generate_batch(args.manifest, args.output_dir, ref_audio, ref_text, language)


if __name__ == "__main__":
    main()
