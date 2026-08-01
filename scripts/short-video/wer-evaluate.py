#!/usr/bin/env python3
"""
WER (Word Error Rate) evaluation for TTS voices.
Measures how intelligible each voice is by running Whisper recognition
WITHOUT initial_prompt (pure recognition) and comparing to the original text.

Lower WER = more intelligible voice (words pronounced correctly).

Usage:
  source ~/.xtts-env/bin/activate
  python3 wer-evaluate.py --manifest <manifest.json> --output <wer-report.txt>

Output: Per-scene and overall WER for each voice.
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

DEVICE = "cpu"  # word_timestamps crashes on MPS
MODEL_NAME = os.environ.get("WHISPER_MODEL", "large-v3")


def normalize_text(text):
    """Normalize text for WER comparison: lowercase, strip punctuation."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)  # Remove punctuation
    text = re.sub(r"\s+", " ", text)    # Collapse whitespace
    return text


def calculate_wer(reference, hypothesis):
    """Calculate WER using Levenshtein distance at word level."""
    ref_words = reference.split()
    hyp_words = hypothesis.split()

    if not ref_words:
        return 0.0, 0, 0, 0, 0

    # Levenshtein distance at word level
    dp = [[0] * (len(hyp_words) + 1) for _ in range(len(ref_words) + 1)]
    for i in range(len(ref_words) + 1):
        dp[i][0] = i
    for j in range(len(hyp_words) + 1):
        dp[0][j] = j

    for i in range(1, len(ref_words) + 1):
        for j in range(1, len(hyp_words) + 1):
            if ref_words[i - 1] == hyp_words[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = min(
                    dp[i - 1][j] + 1,      # deletion
                    dp[i][j - 1] + 1,       # insertion
                    dp[i - 1][j - 1] + 1,   # substitution
                )

    total_words = len(ref_words)
    errors = dp[len(ref_words)][len(hyp_words)]
    wer = errors / total_words

    return wer, total_words, errors, 0, 0


def evaluate_voice(model, scenes):
    """Run Whisper recognition (no initial_prompt) and calculate WER per scene."""
    results = []
    total_words = 0
    total_errors = 0

    for scene in scenes:
        sid = scene["sceneId"]
        audio = scene["audioPath"]
        text = scene["text"]

        if not os.path.exists(audio):
            continue

        print(f"  Scene {sid}...", file=sys.stderr)

        # Pure recognition — NO initial_prompt (this is what measures intelligibility)
        result = model.transcribe(audio, language="en", verbose=False)

        recognized = result.get("text", "").strip()
        ref = normalize_text(text)
        hyp = normalize_text(recognized)

        wer, words, errors, _, _ = calculate_wer(ref, hyp)
        total_words += words
        total_errors += errors

        results.append({
            "sceneId": sid,
            "original": text[:80],
            "recognized": recognized[:80],
            "wer": round(wer * 100, 1),
            "words": words,
            "errors": errors,
        })

    overall_wer = (total_errors / total_words * 100) if total_words > 0 else 0
    return results, overall_wer


def main():
    parser = argparse.ArgumentParser(description="WER evaluation for TTS voices")
    parser.add_argument("--manifest", required=True, help="Path to whisper-manifest.json")
    parser.add_argument("--output", required=True, help="Path to output WER report")
    parser.add_argument("--label", default="Voice", help="Label for this voice")
    args = parser.parse_args()

    with open(args.manifest) as f:
        scenes = json.load(f)

    print(f"Loading Whisper {MODEL_NAME} on {DEVICE}...", file=sys.stderr)
    model = whisper.load_model(MODEL_NAME, device=DEVICE)
    print("Model loaded.", file=sys.stderr)

    print(f"\nEvaluating WER for {args.label}...", file=sys.stderr)
    results, overall_wer = evaluate_voice(model, scenes)

    # Write report
    with open(args.output, "w") as f:
        f.write(f"WER Report: {args.label}\n")
        f.write(f"Model: Whisper {MODEL_NAME}\n")
        f.write(f"{'='*60}\n\n")
        for r in results:
            f.write(f"Scene {r['sceneId']}: WER={r['wer']}% ({r['errors']}/{r['words']} errors)\n")
            f.write(f"  Original:   {r['original']}...\n")
            f.write(f"  Recognized: {r['recognized']}...\n\n")
        f.write(f"{'='*60}\n")
        f.write(f"Overall WER: {overall_wer:.1f}%\n")
        f.write(f"Total words: {sum(r['words'] for r in results)}\n")
        f.write(f"Total errors: {sum(r['errors'] for r in results)}\n")

    print(f"\n{'='*60}", file=sys.stderr)
    print(f"Overall WER: {overall_wer:.1f}%", file=sys.stderr)
    print(f"Report saved: {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
