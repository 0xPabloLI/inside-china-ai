#!/usr/bin/env python3
"""
CosyVoice3-MLX batch TTS generator — loads model ONCE, processes ALL scenes.
Uses voice cloning via reference audio + instruct_text for emotion control.

CosyVoice3-MLX supports simultaneous ref_audio + instruct_text + speed control.
MLX version auto-appends <|endofprompt|> — do NOT include it in instruct_text.

Usage:
  python cosyvoice3_mlx_batch_tts.py --manifest /path/to/manifest.json --output-dir /path/to/audio/

Environment:
  COSYVOICE3_REF_AUDIO — path to ref-audio WAV (24kHz)
  COSYVOICE3_REF_TEXT  — exact transcription of ref-audio
  COSYVOICE3_SPEED     — speech speed multiplier (default: 1.0)
  COSYVOICE3_MLX_MODEL_DIR — model directory (default: ~/.cosyvoice3-mlx-model)
"""
import argparse
import json
import sys
import os
import time
import subprocess

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")


def generate_batch(manifest_path, output_dir, ref_audio, ref_text, speed=1.0, model_dir=None):
    from mlx_audio.tts.generate import load_model, generate_audio

    with open(manifest_path, "r") as f:
        scenes = json.load(f)

    if model_dir is None:
        model_dir = os.path.join(os.path.expanduser("~"), ".cosyvoice3-mlx-model")

    print(f"\nLoading CosyVoice3-MLX model from {model_dir}...", file=sys.stderr)
    t0 = time.time()
    model = load_model(model_path=model_dir)
    print(f"Model loaded in {time.time()-t0:.1f}s", file=sys.stderr)
    print(f"Processing {len(scenes)} scenes (speed={speed})...\n", file=sys.stderr)

    results = []
    for scene in scenes:
        scene_id = scene["sceneId"]
        text = scene["text"]
        output_name = scene.get("output", f"scene-{scene_id}.wav").replace(".mp3", ".wav")
        output_path = os.path.join(output_dir, output_name)
        file_prefix = output_path.replace(".wav", "")
        item_ref_audio = scene.get("ref_audio") or ref_audio
        item_ref_text = scene.get("ref_text") or ref_text
        instruct_text = scene.get("instruct_text")

        print(f"  Scene {scene_id}: generating {len(text)} chars...", file=sys.stderr)
        if instruct_text:
            print(f"    instruct: {instruct_text[:60]}...", file=sys.stderr)
        t2 = time.time()

        gen_kwargs = dict(
            text=text,
            model=model,
            ref_audio=item_ref_audio,
            ref_text=item_ref_text,
            speed=speed,
            file_prefix=file_prefix,
            audio_format="wav",
            verbose=False,
        )
        if instruct_text:
            gen_kwargs["instruct_text"] = instruct_text

        generate_audio(**gen_kwargs)
        t3 = time.time()

        dur_result = subprocess.run(
            ["ffprobe", "-i", output_path, "-show_entries", "format=duration", "-v", "quiet", "-of", "csv=p=0"],
            capture_output=True, text=True
        )
        duration = float(dur_result.stdout.strip()) if dur_result.stdout.strip() else 0.0

        print(f"    Duration: {duration:.2f}s, RTF: {(t3 - t2) / max(duration, 0.01):.2f}x", file=sys.stderr)

        results.append({
            "sceneId": scene_id,
            "audioPath": os.path.abspath(output_path),
            "duration": duration,
        })

    print(f"\nAll {len(scenes)} scenes processed!", file=sys.stderr)
    print(json.dumps(results))
    return results


def main():
    parser = argparse.ArgumentParser(description="CosyVoice3-MLX batch TTS generator")
    parser.add_argument("--manifest", required=True, help="Path to JSON manifest file")
    parser.add_argument("--output-dir", required=True, help="Output directory for audio files")
    parser.add_argument("--ref-audio", help="Path to 24kHz ref-audio WAV")
    parser.add_argument("--ref-text", help="Exact transcription of ref-audio")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed multiplier")
    parser.add_argument("--model-dir", help="CosyVoice3-MLX model directory")

    args = parser.parse_args()

    ref_audio = args.ref_audio or os.environ.get("COSYVOICE3_REF_AUDIO")
    ref_text = args.ref_text or os.environ.get("COSYVOICE3_REF_TEXT")
    speed = float(os.environ.get("COSYVOICE3_SPEED", args.speed))
    model_dir = args.model_dir or os.environ.get("COSYVOICE3_MLX_MODEL_DIR")

    if not ref_audio or not ref_text:
        print("Error: --ref-audio and --ref-text (or COSYVOICE3_REF_AUDIO/COSYVOICE3_REF_TEXT env vars) are required", file=sys.stderr)
        sys.exit(1)

    generate_batch(args.manifest, args.output_dir, ref_audio, ref_text, speed, model_dir)


if __name__ == "__main__":
    main()