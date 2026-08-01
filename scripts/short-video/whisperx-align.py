#!/usr/bin/env python3
"""
WhisperX forced alignment — uses wav2vec2 for word-level timestamps.
This is fundamentally different from vanilla Whisper's word_timestamps
(which uses cross-attention + DTW). WhisperX uses wav2vec2's acoustic
model for precise phoneme-level alignment.

Workflow: text → XTTS → audio → WhisperX (wav2vec2 alignment) → word timestamps

Usage:
  source ~/.xtts-env/bin/activate
  python3 whisperx-align.py --manifest <manifest.json> --output <timing.json>
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

DEVICE = "cpu"  # wav2vec2 alignment runs on CPU
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "large-v3")
PAD_MS = 0.015  # 15ms padding on word end times (Google recommended 10-20ms)


def load_models():
    """Load Whisper model + wav2vec2 alignment model."""
    print(f"Loading Whisper {WHISPER_MODEL} on {DEVICE}...", file=sys.stderr)
    model = whisperx.load_model(WHISPER_MODEL, DEVICE, compute_type="int8")
    print(f"Loading wav2vec2 alignment model...", file=sys.stderr)
    align_model, align_meta = whisperx.load_align_model(language_code="en", device=DEVICE)
    print("Models loaded.", file=sys.stderr)
    return model, align_model, align_meta


def align_scene(model, align_model, align_meta, audio_path, text):
    """Transcribe with Whisper, then align with wav2vec2 for precise word timestamps."""
    # Step 1: Whisper transcription (WhisperX wraps faster-whisper, minimal params)
    result = model.transcribe(audio_path, language="en")

    # Step 2: wav2vec2 alignment — this is the key step!
    # Uses acoustic features (not cross-attention) for precise word boundaries
    result = whisperx.align(
        result["segments"],
        align_model,
        align_meta,
        audio_path,
        device=DEVICE,
        return_char_alignments=False,
    )

    # Extract word-level timestamps
    word_timestamps = []
    for seg in result.get("segments", []):
        for w in seg.get("words", []):
            if isinstance(w, dict) and "start" in w and "end" in w:
                word_timestamps.append({
                    "text": w["word"].strip(),
                    "start": round(w["start"], 3),
                    "end": round(w["end"] + PAD_MS, 3),  # Pad end by 15ms
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

    # Deduplicate: remove overlapping/repeated segments (hallucination)
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
    parser = argparse.ArgumentParser(description="WhisperX wav2vec2 alignment")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with open(args.manifest) as f:
        scenes = json.load(f)

    model, align_model, align_meta = load_models()

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
            word_ts = align_scene(model, align_model, align_meta, audio, text)
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
