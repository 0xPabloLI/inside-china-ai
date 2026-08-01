#!/usr/bin/env python3
"""
XTTS v2 batch TTS generator — loads model ONCE, processes ALL scenes.
This avoids the 60+ minute model reload penalty of per-scene invocation.

Usage:
  python xtts_batch_tts.py --manifest /path/to/manifest.json --output-dir /path/to/audio/

Manifest format (JSON array):
  [
    {"sceneId": 1, "text": "Hello world", "output": "scene-1.mp3"},
    {"sceneId": 2, "text": "Second scene", "output": "scene-2.mp3"},
    ...
  ]

Environment:
  TTS_SPEAKER_WAV — optional path to speaker WAV for voice cloning
  COQUI_TOS_AGREED=1 — required to bypass TOS dialog

The model (~1.8GB) is loaded once at startup, then all scenes are processed sequentially.
"""
import argparse
import json
import sys
import os
import wave
import struct
import subprocess
import tempfile

# Bypass Coqui TTS TOS dialog
os.environ["COQUI_TOS_AGREED"] = "1"

def generate_batch(manifest_path, output_dir, speaker_wav=None, language="en", speed=1.0):
    import torch
    from TTS.api import TTS

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"Using device: {device} (GPT on {device}, HiFi-GAN on CPU)", file=sys.stderr)

    # Load model ONCE
    print("Loading XTTS v2 model (first run downloads ~1.8GB)...", file=sys.stderr)
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    print("Model loaded successfully!", file=sys.stderr)

    # Move HiFi-GAN decoder to CPU (avoids MPS crash)
    if device == "mps":
        model = tts.synthesizer.tts_model
        model.hifigan_decoder = model.hifigan_decoder.to("cpu")
        print("HiFi-GAN moved to CPU (MPS hybrid mode)", file=sys.stderr)

    # Read manifest
    with open(manifest_path, "r") as f:
        scenes = json.load(f)

    print(f"\nProcessing {len(scenes)} scenes...\n", file=sys.stderr)

    results = []
    for scene in scenes:
        scene_id = scene["sceneId"]
        text = scene["text"]
        output_name = scene.get("output", f"scene-{scene_id}.mp3")
        output_path = os.path.join(output_dir, output_name)

        print(f"  Scene {scene_id}: generating {len(text)} chars...", file=sys.stderr)

        if speaker_wav and os.path.exists(speaker_wav):
            wav = tts.tts(
                text=text,
                speaker_wav=speaker_wav,
                language=language,
                speed=speed,
            )
        else:
            wav = tts.tts(
                text=text,
                speaker=os.environ.get("XTTS_SPEAKER", "Craig Gutsy"),
                language=language,
                speed=speed,
            )

        # Save as WAV
        wav_path = output_path.replace(".mp3", ".wav")
        sample_rate = 24000

        with wave.open(wav_path, "w") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            for sample in wav:
                clamped = max(-1.0, min(1.0, float(sample)))
                wf.writeframes(struct.pack("<h", int(clamped * 32767)))

        # Convert to MP3 with ffmpeg
        subprocess.run(
            ["ffmpeg", "-y", "-i", wav_path, "-codec:a", "libmp3lame", "-b:a", "192k", output_path],
            capture_output=True,
            check=True,
        )
        os.remove(wav_path)

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
    # Output results as JSON to stdout
    print(json.dumps(results))
    return results


def main():
    parser = argparse.ArgumentParser(description="XTTS v2 batch TTS generator")
    parser.add_argument("--manifest", required=True, help="Path to JSON manifest file")
    parser.add_argument("--output-dir", required=True, help="Output directory for audio files")
    parser.add_argument("--speaker", help="Speaker WAV file for voice cloning")
    parser.add_argument("--language", default="en", help="Language code")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed multiplier")

    args = parser.parse_args()

    generate_batch(args.manifest, args.output_dir, args.speaker, args.language, args.speed)


if __name__ == "__main__":
    main()
