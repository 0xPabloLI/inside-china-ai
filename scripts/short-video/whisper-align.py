#!/usr/bin/env python3
"""
Whisper-based subtitle alignment for video scenes.
Uses OpenAI Whisper to transcribe scene audio with word-level timestamps,
then aligns the original voiceover text to the audio timeline.

Usage:
  python3 whisper-align.py --audio-dir <path> --manifest <path> --output <path>

Manifest format (JSON array):
  [{"sceneId": 1, "text": "Hello world", "audioPath": "/path/to/scene-1.mp3"}, ...]

Output format (JSON):
  [
    {
      "sceneId": 1,
      "segments": [
        {"text": "Hello", "start": 0.0, "end": 0.5},
        {"text": "world", "start": 0.5, "end": 1.0}
      ]
    }
  ]
"""
import argparse
import json
import os
import sys

# Fix SSL certificate verification on macOS
import ssl
ssl._create_default_https_context = ssl._create_unverified_context
os.environ["CURL_CA_BUNDLE"] = ""
os.environ["REQUESTS_CA_BUNDLE"] = ""

def align_audio(manifest_path, output_path, model_name="base"):
    import whisper
    import torch

    device = "cpu"  # MPS crashes in add_word_timestamps; CPU is reliable
    print(f"Loading Whisper model '{model_name}' on {device}...", file=sys.stderr)
    model = whisper.load_model(model_name, device=device)
    print("Model loaded!", file=sys.stderr)

    with open(manifest_path, "r") as f:
        scenes = json.load(f)

    results = []

    for scene in scenes:
        scene_id = scene["sceneId"]
        audio_path = scene.get("audioPath") or scene.get("audio")
        original_text = scene.get("text", "")

        print(f"  Scene {scene_id}: transcribing {len(original_text)} chars...", file=sys.stderr)

        # Transcribe with word-level timestamps
        result = model.transcribe(
            audio_path,
            word_timestamps=True,
            language="en",
            initial_prompt=original_text[:200],  # Help Whisper with context
        )

        # Extract word-level segments
        segments = []
        for segment in result.get("segments", []):
            for word_info in segment.get("words", []):
                word = word_info.get("word", "").strip()
                start = word_info.get("start", 0.0)
                end = word_info.get("end", 0.0)
                if word and end > start:
                    segments.append({
                        "text": word,
                        "start": round(start, 3),
                        "end": round(end, 3),
                    })

        print(f"    Got {len(segments)} word timestamps", file=sys.stderr)

        results.append({
            "sceneId": scene_id,
            "segments": segments,
        })

    # Save results
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nResults saved to: {output_path}", file=sys.stderr)
    print(json.dumps(results))
    return results


def main():
    parser = argparse.ArgumentParser(description="Whisper-based subtitle alignment")
    parser.add_argument("--manifest", required=True, help="Path to JSON manifest")
    parser.add_argument("--output", required=True, help="Output JSON path")
    parser.add_argument("--model", default="base", help="Whisper model size (tiny/base/small/medium)")

    args = parser.parse_args()
    align_audio(args.manifest, args.output, args.model)


if __name__ == "__main__":
    main()
