#!/usr/bin/env python3
"""
wav2vec2 forced alignment — directly aligns KNOWN text to audio.
No Whisper recognition step — we already know the text from scene-data.mjs.

This avoids recognition errors (e.g., "DeepSeek" → "deep seeks") by using
the original text directly.

Usage:
  source ~/.whisperx-env/bin/activate
  python3 text-align.py --manifest <manifest.json> --output <timing.json>

Manifest: [{"sceneId": 1, "text": "...", "audioPath": "..."}]
Output:   [{"sceneId": 1, "segments": [{"text": "...", "start": 0.0, "end": 2.5, "words": [...]}]}]
"""
import argparse
import json
import os
import re
import sys
import warnings

warnings.filterwarnings("ignore")

import torch
import whisperx

DEVICE = "cpu"
PAD_MS = 0.015  # 15ms padding on word end times


def load_align_model():
    """Load only the wav2vec2 alignment model (no Whisper needed!)."""
    print("Loading wav2vec2 alignment model...", file=sys.stderr)
    align_model, align_meta = whisperx.load_align_model(language_code="en", device=DEVICE)
    print("Model loaded.", file=sys.stderr)
    return align_model, align_meta


def split_sentences(text):
    """Split text into sentences for alignment."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in sentences if s.strip()]


def align_text_to_audio(align_model, align_meta, audio_path, original_text):
    """Directly align KNOWN text to audio using wav2vec2 — no recognition."""
    # Split original text into sentences
    sentences = split_sentences(original_text)
    
    # Get audio duration via ffprobe (torchaudio can't read MP3 in some envs)
    import subprocess
    result = subprocess.run(
        ["ffprobe", "-i", audio_path, "-show_entries", "format=duration", "-v", "quiet", "-of", "csv=p=0"],
        capture_output=True, text=True
    )
    audio_duration = float(result.stdout.strip())
    
    # Create one segment with the full text (start=0, end=audio_duration)
    segments = [{"text": original_text, "start": 0, "end": audio_duration}]
    
    # wav2vec2 alignment — this is the key step!
    # Takes known text segments and finds their timestamps in the audio
    aligned = whisperx.align(
        segments,
        align_model,
        align_meta,
        audio_path,
        device=DEVICE,
        return_char_alignments=False,
    )
    
    # Extract word-level timestamps
    word_timestamps = []
    for seg in aligned.get("segments", []):
        for w in seg.get("words", []):
            if isinstance(w, dict) and "start" in w and "end" in w:
                word_timestamps.append({
                    "text": w["word"].strip(),
                    "start": round(w["start"], 3),
                    "end": round(w["end"] + PAD_MS, 3),
                })
    
    return word_timestamps


def group_chunks(word_ts, max_words=7, min_words=3):
    """Group words into 3-7 word subtitle chunks with word-level data."""
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
            chunks.append({
                "text": text,
                "start": round(start, 3),
                "end": round(end, 3),
                "words": list(current),
            })
            current = []

    if current:
        text = " ".join(w["text"] for w in current)
        text = re.sub(r"\s+([,.;:!?])", r"\1", text)
        start = current[0]["start"]
        end = max(current[-1]["end"], start + 0.5)
        chunks.append({
            "text": text,
            "start": round(start, 3),
            "end": round(end, 3),
            "words": list(current),
        })

    # Deduplicate
    seen_text = set()
    deduped = []
    for c in chunks:
        if deduped and c["start"] < deduped[-1]["end"]:
            continue
        key = c["text"].lower().strip()
        if key in seen_text:
            continue
        seen_text.add(key)
        deduped.append(c)

    return deduped


def main():
    parser = argparse.ArgumentParser(description="Direct text-to-audio alignment using wav2vec2")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with open(args.manifest) as f:
        scenes = json.load(f)

    align_model, align_meta = load_align_model()

    results = []
    for scene in scenes:
        sid = scene["sceneId"]
        audio = scene["audioPath"]
        text = scene["text"]

        if not os.path.exists(audio):
            print(f"  Scene {sid}: audio not found", file=sys.stderr)
            results.append({"sceneId": sid, "segments": []})
            continue

        print(f"  Scene {sid}: aligning original text ({len(text)} chars)...", file=sys.stderr)
        try:
            word_ts = align_text_to_audio(align_model, align_meta, audio, text)
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
