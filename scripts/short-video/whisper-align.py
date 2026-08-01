#!/usr/bin/env python3
"""
Whisper-based forced alignment using initial_prompt.
Passes the KNOWN text as Whisper's initial_prompt to bias recognition,
then uses word_timestamps=True for accurate word-level timing.

This is NOT recognition — it's guided alignment. Whisper "knows" what
text to expect, so it produces accurate word boundaries.

Usage:
  source ~/.xtts-env/bin/activate
  python3 whisper-align.py --manifest <manifest.json> --output <timing.json>

Models: base (145MB, cached at ~/.cache/whisper/base.pt)
"""
import argparse
import json
import os
import re
import sys
import warnings

warnings.filterwarnings("ignore")

import torch
import whisper

DEVICE = "cpu"  # word_timestamps crashes on MPS, CPU is reliable
MODEL_NAME = os.environ.get("WHISPER_MODEL", "base")


def load_model():
    print(f"Loading Whisper {MODEL_NAME} model on {DEVICE}...", file=sys.stderr)
    model = whisper.load_model(MODEL_NAME, device=DEVICE)
    print("Model loaded.", file=sys.stderr)
    return model


def align_scene(model, audio_path, text):
    """Transcribe audio with known text as initial_prompt, get word timestamps."""
    result = model.transcribe(
        audio_path,
        initial_prompt=text,  # Guide Whisper toward the known text
        word_timestamps=True,
        language="en",
        verbose=False,
    )

    # Extract word-level timestamps from segments
    word_timestamps = []
    for seg in result.get("segments", []):
        for w in seg.get("words", []):
            word_timestamps.append({
                "text": w["word"].strip(),
                "start": round(w["start"], 3),
                "end": round(w["end"], 3),
            })

    # If Whisper didn't produce word timestamps, fall back to segment-level
    if not word_timestamps:
        for seg in result.get("segments", []):
            word_timestamps.append({
                "text": seg["text"].strip(),
                "start": round(seg["start"], 3),
                "end": round(seg["end"], 3),
            })

    return word_timestamps


def group_chunks(word_ts, max_words=7, min_words=3):
    """Group words into 3-7 word subtitle chunks."""
    if not word_ts:
        return []

    chunks = []
    current = []

    for wt in word_ts:
        current.append(wt)
        count = len(current)
        ends_sentence = re.search(r"[.!?:;]$", wt["text"])
        is_comma = re.search(r",$", wt["text"])
        reached_max = count >= max_words
        reached_min = count >= min_words

        if ends_sentence or reached_max or (is_comma and reached_min):
            text = " ".join(w["text"] for w in current)
            text = re.sub(r"\s+([,.;:!?])", r"\1", text)
            start = current[0]["start"]
            end = max(current[-1]["end"], start + 0.5)
            chunks.append({"text": text, "start": round(start, 3), "end": round(end, 3)})
            current = []

    if current:
        text = " ".join(w["text"] for w in current)
        text = re.sub(r"\s+([,.;:!?])", r"\1", text)
        start = current[0]["start"]
        end = max(current[-1]["end"], start + 0.5)
        chunks.append({"text": text, "start": round(start, 3), "end": round(end, 3)})

    # Deduplicate: remove overlapping/repeated segments (Whisper hallucination)
    seen_text = set()
    deduped = []
    for c in chunks:
        # Skip if this segment starts before the previous one ends (overlap)
        if deduped and c["start"] < deduped[-1]["end"]:
            continue
        # Skip if we've seen this exact text before
        key = c["text"].lower().strip()
        if key in seen_text:
            continue
        seen_text.add(key)
        deduped.append(c)

    return deduped


def main():
    parser = argparse.ArgumentParser(description="Whisper initial_prompt alignment")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with open(args.manifest) as f:
        scenes = json.load(f)

    model = load_model()

    results = []
    for scene in scenes:
        sid = scene["sceneId"]
        audio = scene["audioPath"]
        text = scene["text"]

        if not os.path.exists(audio):
            print(f"  Scene {sid}: audio not found", file=sys.stderr)
            results.append({"sceneId": sid, "segments": []})
            continue

        print(f"  Scene {sid}: aligning {len(text)} chars...", file=sys.stderr)
        try:
            word_ts = align_scene(model, audio, text)
            chunks = group_chunks(word_ts)
            print(f"    {len(chunks)} chunks from {len(word_ts)} words", file=sys.stderr)
            results.append({"sceneId": sid, "segments": chunks})
        except Exception as e:
            print(f"    Error: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            results.append({"sceneId": sid, "segments": []})

    with open(args.output, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved: {args.output}", file=sys.stderr)
    print(json.dumps(results))


if __name__ == "__main__":
    main()
