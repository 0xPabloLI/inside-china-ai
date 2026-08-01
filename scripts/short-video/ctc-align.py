#!/usr/bin/env python3
"""
CTC forced alignment using torchaudio + wav2vec2 (official PyTorch approach).
Aligns KNOWN text to KNOWN audio at word level — no recognition needed.

Usage:
  source ~/.xtts-env/bin/activate
  python3 ctc-align.py --manifest <manifest.json> --output <timing.json>

Manifest: [{"sceneId": 1, "text": "...", "audioPath": "..."}]
Output:   [{"sceneId": 1, "segments": [{"text": "...", "start": 0.0, "end": 2.5}]}]
"""
import argparse
import json
import os
import re
import sys

import torch
import torchaudio
import torchaudio.functional as F

DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"
BUNDLE = torchaudio.pipelines.MMS_FA


def load_model():
    print(f"Loading MMS_FA model on {DEVICE}...", file=sys.stderr)
    model = BUNDLE.get_model().to(DEVICE)
    model.eval()
    print("Model loaded.", file=sys.stderr)
    return model


def align_scene(model, audio_path, text):
    """Align known text to audio, return word-level timestamps."""
    waveform, sr = torchaudio.load(audio_path)
    # Resample to model's expected rate (16000)
    if sr != BUNDLE.sample_rate:
        waveform = torchaudio.transforms.Resample(sr, BUNDLE.sample_rate).to(DEVICE)(waveform.to(DEVICE))
    else:
        waveform = waveform.to(DEVICE)

    # Get emission probabilities
    with torch.no_grad():
        emissions, _ = model(waveform)
        log_probs = torch.log_softmax(emissions, dim=-1)

    # Tokenize text
    labels = list(BUNDLE.get_labels())
    token_map = {c: i for i, c in enumerate(labels)}
    # Build token sequence: word chars separated by blank/space
    words = text.strip().split()
    tokens = []
    for i, word in enumerate(words):
        upper = word.upper()
        for ch in upper:
            if ch in token_map:
                tokens.append(token_map[ch])
        # Add space (blank) between words
        if i < len(words) - 1:
            if "-" in labels:
                tokens.append(token_map["-"])
            else:
                tokens.append(0)  # blank index 0

    if not tokens:
        return []

    # Run forced alignment using torchaudio's built-in function
    alignment, scores = F.forced_align(
        log_probs[0].cpu(),  # (frames, num_classes)
        torch.tensor(tokens, dtype=torch.long),
        blank=0,
    )

    # Convert frame-level alignment to word-level timestamps
    hop_length = 320  # wav2vec2 stride at 16kHz = 20ms per frame
    frame_rate = BUNDLE.sample_rate / hop_length

    word_timestamps = []
    char_idx = 0

    for word_i, word in enumerate(words):
        word_chars = sum(1 for c in word.upper() if c in token_map)
        if word_i < len(words) - 1:
            word_chars += 1  # space token

        # Find start frame: first frame where alignment >= char_idx
        start_frame = 0
        end_frame = 0
        for f in range(len(alignment)):
            if alignment[f].item() >= char_idx:
                start_frame = f
                break

        # Find end frame: last frame where alignment is within this word's chars
        for f in range(len(alignment) - 1, -1, -1):
            if alignment[f].item() < char_idx + word_chars:
                end_frame = f
                break

        start_time = start_frame / frame_rate
        end_time = max((end_frame + 1) / frame_rate, start_time + 0.3)

        word_timestamps.append({
            "text": word,
            "start": round(start_time, 3),
            "end": round(end_time, 3),
        })

        char_idx += word_chars

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
            start = current[0]["start"]
            end = max(current[-1]["end"], start + 0.5)
            chunks.append({"text": text, "start": round(start, 3), "end": round(end, 3)})
            current = []

    if current:
        text = " ".join(w["text"] for w in current)
        start = current[0]["start"]
        end = max(current[-1]["end"], start + 0.5)
        chunks.append({"text": text, "start": round(start, 3), "end": round(end, 3)})

    return chunks


def main():
    parser = argparse.ArgumentParser(description="CTC forced alignment")
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
            results.append({"sceneId": sid, "segments": []})

    with open(args.output, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved: {args.output}", file=sys.stderr)
    print(json.dumps(results))


if __name__ == "__main__":
    main()
