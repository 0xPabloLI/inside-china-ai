#!/usr/bin/env python3
"""
CosyVoice 3 batch TTS generator — loads model ONCE, processes ALL scenes.
Uses zero-shot voice cloning via reference audio.

Usage:
  python cosyvoice_batch_tts.py --manifest /path/to/manifest.json --output-dir /path/to/audio/

Manifest format (JSON array):
  [
    {"sceneId": 1, "text": "Hello world", "output": "scene-1.wav"},
    ...
  ]

Environment:
  COSYVOICE_SOURCE_DIR — path to CosyVoice source (default: /tmp/CosyVoice)
  COSYVOICE_MODEL_DIR  — path to model dir (default: $SOURCE/pretrained_models/Fun-CosyVoice3-0.5B)
  COSYVOICE_REF_AUDIO  — path to ref-audio WAV
  COSYVOICE_REF_TEXT   — exact transcription of ref-audio
  COSYVOICE_SPEED      — speech speed multiplier (default 1.0)
"""
import argparse
import json
import sys
import os
import types
import subprocess
import time

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

# Mock modelscope to avoid hanging import (model is local)
_modelscope_mock = types.ModuleType("modelscope")
_modelscope_mock.snapshot_download = lambda *a, **kw: a[0] if a else kw.get("model_id", "")
sys.modules["modelscope"] = _modelscope_mock

# Add CosyVoice source to path
SOURCE_DIR = os.environ.get("COSYVOICE_SOURCE_DIR", "/tmp/CosyVoice")
sys.path.insert(0, SOURCE_DIR)
sys.path.insert(0, os.path.join(SOURCE_DIR, "third_party", "Matcha-TTS"))


def generate_batch(manifest_path, output_dir, ref_audio, ref_text, speed=1.0):
    import torch
    import torchaudio

    from cosyvoice.cli.cosyvoice import AutoModel

    model_dir = os.environ.get(
        "COSYVOICE_MODEL_DIR",
        os.path.join(SOURCE_DIR, "pretrained_models", "Fun-CosyVoice3-0.5B"),
    )

    # Read manifest
    with open(manifest_path, "r") as f:
        scenes = json.load(f)

    print(f"\nLoading CosyVoice 3 model from {model_dir}...", file=sys.stderr)
    t0 = time.time()
    cosyvoice = AutoModel(model_dir=model_dir)
    t1 = time.time()
    print(f"  Model loaded in {t1 - t0:.1f}s", file=sys.stderr)
    print(f"  Sample rate: {cosyvoice.sample_rate}Hz", file=sys.stderr)
    print(f"\nProcessing {len(scenes)} scenes with CosyVoice 3...\n", file=sys.stderr)

    results = []
    for scene in scenes:
        scene_id = scene["sceneId"]
        text = scene["text"]
        output_name = scene.get("output", f"scene-{scene_id}.wav")
        output_path = os.path.join(output_dir, output_name)

        print(f"  Scene {scene_id}: generating {len(text)} chars...", file=sys.stderr)
        t2 = time.time()

        gen_results = list(
            cosyvoice.inference_zero_shot(
                text, ref_text, ref_audio, stream=False, speed=speed
            )
        )
        t3 = time.time()

        if gen_results:
            tts_speech = gen_results[0]["tts_speech"]
            sr = cosyvoice.sample_rate
            if tts_speech.dim() > 1:
                tts_speech = tts_speech.squeeze()
            torchaudio.save(
                output_path, tts_speech.unsqueeze(0).cpu(), sr
            )

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
    parser = argparse.ArgumentParser(description="CosyVoice 3 batch TTS generator")
    parser.add_argument("--manifest", required=True, help="Path to JSON manifest file")
    parser.add_argument("--output-dir", required=True, help="Output directory for audio files")
    parser.add_argument("--ref-audio", help="Path to ref-audio WAV")
    parser.add_argument("--ref-text", help="Exact transcription of ref-audio")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed multiplier")

    args = parser.parse_args()

    ref_audio = args.ref_audio or os.environ.get("COSYVOICE_REF_AUDIO")
    ref_text = args.ref_text or os.environ.get("COSYVOICE_REF_TEXT")
    speed = float(os.environ.get("COSYVOICE_SPEED", args.speed))

    if not ref_audio or not ref_text:
        print("Error: --ref-audio and --ref-text (or COSYVOICE_REF_AUDIO/COSYVOICE_REF_TEXT env vars) are required", file=sys.stderr)
        sys.exit(1)

    generate_batch(args.manifest, args.output_dir, ref_audio, ref_text, speed)


if __name__ == "__main__":
    main()
