#!/usr/bin/env python3
"""
F5-TTS-MLX batch TTS generator — loads model ONCE, processes ALL scenes.
Uses MLX framework for native Apple Silicon support.

Usage:
  python f5_mlx_batch_tts.py --manifest /path/to/manifest.json --output-dir /path/to/audio/

Manifest format (JSON array):
  [
    {"sceneId": 1, "text": "Hello world", "output": "scene-1.wav"},
    ...
  ]

Environment:
  HF_HUB_DISABLE_XET=1 — avoid xet download errors
  F5_REF_AUDIO — path to 24kHz mono ref-audio WAV
  F5_REF_TEXT — exact transcription of ref-audio
  F5_SPEED — speech speed multiplier (default 1.0)
"""
import argparse
import json
import sys
import os
import subprocess
import tempfile

os.environ["HF_HUB_DISABLE_XET"] = "1"
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

def generate_batch(manifest_path, output_dir, ref_audio=None, ref_text=None, speed=1.0):
    from f5_tts_mlx.generate import generate as f5_generate
    import soundfile as sf
    import numpy as np

    # Read manifest
    with open(manifest_path, "r") as f:
        scenes = json.load(f)

    print(f"\nProcessing {len(scenes)} scenes with F5-TTS-MLX...\n", file=sys.stderr)

    results = []
    for scene in scenes:
        scene_id = scene["sceneId"]
        text = scene["text"]
        output_name = scene.get("output", f"scene-{scene_id}.wav")
        output_path = os.path.join(output_dir, output_name)

        print(f"  Scene {scene_id}: generating {len(text)} chars...", file=sys.stderr)

        # F5 generates WAV directly — no MP3 conversion (avoids double lossy encoding).
        # The post-processing step (post-process.mjs) handles final MP3 encoding.
        wav_path = output_path if output_path.endswith(".wav") else output_path.replace(".mp3", ".wav")

        # Calculate duration: F5 needs total = ref_duration + target_duration
        # Target: ~2.5 words/sec speaking rate
        word_count = len(text.split())
        target_dur = word_count / 2.5
        # Get ref audio duration
        ref_dur_result = subprocess.run(
            ["ffprobe", "-i", ref_audio, "-show_entries", "format=duration", "-v", "quiet", "-of", "csv=p=0"],
            capture_output=True, text=True
        )
        ref_dur = float(ref_dur_result.stdout.strip()) if ref_dur_result.stdout.strip() else 10.0
        total_dur = ref_dur + target_dur

        audio = f5_generate(
            generation_text=text,
            duration=total_dur,
            ref_audio_path=ref_audio,
            ref_audio_text=ref_text,
            speed=speed,
            steps=8,
            output_path=wav_path,
        )

        # F5 outputs WAV directly — no MP3 conversion here.
        # Post-processing (post-process.mjs) will encode to MP3@320k.
        # Just clean up the temporary WAV if output was specified as .mp3
        if output_path.endswith(".mp3") and wav_path != output_path:
            # If manifest specified .mp3 output, rename .wav to .mp3 path
            # (post-process.mjs will handle actual MP3 encoding)
            os.rename(wav_path, output_path)
        elif wav_path != output_path:
            os.rename(wav_path, output_path)

        # Get duration
        dur_result = subprocess.run(
            ["ffprobe", "-i", output_path, "-show_entries", "format=duration", "-v", "quiet", "-of", "csv=p=0"],
            capture_output=True, text=True
        )
        duration = float(dur_result.stdout.strip()) if dur_result.stdout.strip() else 0.0

        print(f"    Duration: {duration:.2f}s", file=sys.stderr)

        results.append({
            "sceneId": scene_id,
            "audioPath": os.path.abspath(output_path),
            "duration": duration,
        })

    print(f"\nAll {len(scenes)} scenes processed!", file=sys.stderr)
    print(json.dumps(results))
    return results


def main():
    parser = argparse.ArgumentParser(description="F5-TTS-MLX batch TTS generator")
    parser.add_argument("--manifest", required=True, help="Path to JSON manifest file")
    parser.add_argument("--output-dir", required=True, help="Output directory for audio files")
    parser.add_argument("--ref-audio", help="Path to 24kHz ref-audio WAV")
    parser.add_argument("--ref-text", help="Exact transcription of ref-audio")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed multiplier")

    args = parser.parse_args()

    # Fall back to env vars
    ref_audio = args.ref_audio or os.environ.get("F5_REF_AUDIO")
    ref_text = args.ref_text or os.environ.get("F5_REF_TEXT")
    speed = float(os.environ.get("F5_SPEED", args.speed))

    if not ref_audio or not ref_text:
        print("Error: --ref-audio and --ref-text (or F5_REF_AUDIO/F5_REF_TEXT env vars) are required", file=sys.stderr)
        sys.exit(1)

    generate_batch(args.manifest, args.output_dir, ref_audio, ref_text, speed)


if __name__ == "__main__":
    main()
