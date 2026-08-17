#!/usr/bin/env python3
"""
F5-TTS-MLX batch TTS generator — loads model ONCE, processes ALL scenes.
Uses voice cloning via reference audio.

F5-TTS-MLX is a Flow Matching model that generates audio at a controlled
duration — no atempo post-processing needed for speed control.

Usage:
  python f5_mlx_batch_tts.py --manifest /path/to/manifest.json --output-dir /path/to/audio/

Environment:
  F5_REF_AUDIO — path to ref-audio WAV (24kHz)
  F5_REF_TEXT  — exact transcription of ref-audio
  F5_SPEED    — speech speed multiplier (default: 1.0)
"""
import argparse
import json
import re
import sys
import os
import time
import subprocess
import unicodedata

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

# ── Duration estimation constants ──
# Calibrated from reference voice at ~168 wpm / ~4.5 chars-per-sec for CJK.
CJK_CHARS_PER_SECOND = 4.5      # Chinese characters (each char ≈ one syllable)
LATIN_WORDS_PER_SECOND = 2.8    # English words (consistent with prior wps)
PUNCTUATION_PAUSE_SECONDS = 0.15  # comma/period/exclamation/question mark
MIN_TARGET_SECONDS = 0.5        # avoid degenerate durations for very short text


def is_cjk_char(ch):
    """Return True if ch is a CJK Unified Ideograph, Hiragana, Katakana, or CJK punctuation."""
    code = ord(ch)
    return (
        0x4E00 <= code <= 0x9FFF    # CJK Unified Ideographs
        or 0x3400 <= code <= 0x4DBF  # CJK Extension A
        or 0x3040 <= code <= 0x309F  # Hiragana
        or 0x30A0 <= code <= 0x30FF  # Katakana
        or 0x3000 <= code <= 0x303F  # CJK Symbols and Punctuation
        or 0xFF00 <= code <= 0xFFEF  # Fullwidth Forms (includes fullwidth Latin)
    )


def normalize_for_duration(text):
    """Normalize text for duration estimation without altering TTS input."""
    # Strip Markdown / HTML tags that should not be spoken
    cleaned = re.sub(r"\*\*|\*|__|_|##|#|`|\[|\]|\(|\)", "", text)
    # Replace common Markdown/URL artifacts
    cleaned = re.sub(r"https?://\S+", "", cleaned)
    # Collapse whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def count_cjk_characters(text):
    """Count CJK characters (ideographs) in text — each is roughly one syllable."""
    return sum(1 for ch in text if is_cjk_char(ch) and not unicodedata.category(ch).startswith("P"))


def count_latin_words(text):
    """Count space-separated Latin words, excluding pure-CJK segments."""
    words = text.split()
    count = 0
    for w in words:
        # Count a word only if it contains at least one non-CJK character
        if any(not is_cjk_char(c) for c in w):
            count += 1
    return count


def count_major_punctuation(text):
    """Count major punctuation that introduces a natural pause."""
    # Chinese: ，。！？；：、
    # Western: , . ! ? ; :
    pauses = 0
    for ch in text:
        if ch in "，。！？；：、,.!?;:":
            pauses += 1
    return pauses


def estimate_target_seconds(text):
    """
    Estimate target speaking duration in seconds for the given text.

    Uses separate rates for CJK characters and Latin words, plus a small
    pause for major punctuation. This replaces the prior len(text.split())/2.8
    formula which treated an entire Chinese sentence as a single word.

    The returned value is the TARGET duration only — callers must add
    ref_audio_duration to get F5's total `duration` parameter.
    """
    normalized = normalize_for_duration(text)
    cjk = count_cjk_characters(normalized)
    latin_words = count_latin_words(normalized)
    pauses = count_major_punctuation(normalized)

    estimated = max(
        MIN_TARGET_SECONDS,
        cjk / CJK_CHARS_PER_SECOND
        + latin_words / LATIN_WORDS_PER_SECOND
        + pauses * PUNCTUATION_PAUSE_SECONDS,
    )
    return estimated


def generate_batch(manifest_path, output_dir, ref_audio, ref_text, speed=1.0):
    from f5_tts_mlx.generate import generate as f5_generate

    # Read manifest
    with open(manifest_path, "r") as f:
        scenes = json.load(f)

    print(f"\nProcessing {len(scenes)} scenes with F5-TTS-MLX (speed={speed})...\n", file=sys.stderr)

    # Get ref audio duration (needed for F5's duration parameter)
    ref_dur_result = subprocess.run(
        ["ffprobe", "-i", ref_audio, "-show_entries", "format=duration", "-v", "quiet", "-of", "csv=p=0"],
        capture_output=True, text=True
    )
    ref_dur = float(ref_dur_result.stdout.strip()) if ref_dur_result.stdout.strip() else 10.0
    print(f"  Ref audio duration: {ref_dur:.2f}s", file=sys.stderr)

    results = []
    for scene in scenes:
        scene_id = scene["sceneId"]
        text = scene["text"]
        output_name = scene.get("output", f"scene-{scene_id}.wav").replace(".mp3", ".wav")
        output_path = os.path.join(output_dir, output_name)

        print(f"  Scene {scene_id}: generating {len(text)} chars...", file=sys.stderr)
        t2 = time.time()

        # F5 outputs WAV directly — no MP3 conversion (avoids double lossy encoding)

        # Calculate duration: F5 needs total = ref_duration + target_duration
        # Use estimate_target_seconds() which handles CJK and mixed text correctly.
        # The old len(text.split())/2.8 formula treated a whole Chinese sentence
        # as one word, producing near-zero durations.
        target_dur = estimate_target_seconds(text)
        total_dur = ref_dur + target_dur

        # F5 model parameters (MAX EFFORT):
        # - steps=32: maximum inference steps → best quality (default 8)
        # - cfg_strength=3.0: strongest ref-audio guidance → best voice cloning (default 2.0)
        # - method='rk4': RK4 ODE solver (confirmed as library default, passed explicitly)
        f5_generate(
            generation_text=text,
            duration=total_dur,
            ref_audio_path=ref_audio,
            ref_audio_text=ref_text,
            speed=speed,
            steps=32,
            cfg_strength=3.0,
            method="rk4",
            output_path=output_path,
        )
        t3 = time.time()

        # Get duration
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
    parser = argparse.ArgumentParser(description="F5-TTS-MLX batch TTS generator")
    parser.add_argument("--manifest", required=True, help="Path to JSON manifest file")
    parser.add_argument("--output-dir", required=True, help="Output directory for audio files")
    parser.add_argument("--ref-audio", help="Path to 24kHz ref-audio WAV")
    parser.add_argument("--ref-text", help="Exact transcription of ref-audio")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed multiplier")

    args = parser.parse_args()

    ref_audio = args.ref_audio or os.environ.get("F5_REF_AUDIO")
    ref_text = args.ref_text or os.environ.get("F5_REF_TEXT")
    speed = float(os.environ.get("F5_SPEED", args.speed))

    if not ref_audio or not ref_text:
        print("Error: --ref-audio and --ref-text (or F5_REF_AUDIO/F5_REF_TEXT env vars) are required", file=sys.stderr)
        sys.exit(1)

    generate_batch(args.manifest, args.output_dir, ref_audio, ref_text, speed)


if __name__ == "__main__":
    main()
