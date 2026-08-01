#!/usr/bin/env python3
"""
Kokoro TTS generator for the short video pipeline.
Uses Kokoro's neural TTS for high-quality, natural-sounding speech.

Usage:
    python3 kokoro_tts.py --text "Hello world" --output output.wav --voice am_michael

Voices (American English):
    am_michael  — Clear, authoritative male (recommended for briefings)
    am_adam     — Deep, calm male
    af_heart    — Warm, natural female
    af_bella    — Clear, bright female
    af_sky      — Young, energetic female
    bm_george   — British male, distinguished
    bf_emma     — British female, refined
"""

import sys
import os
import wave
import argparse
import warnings
warnings.filterwarnings("ignore")


def save_wav(audio_tensor, output_path, sample_rate=24000):
    """Save a 1D torch tensor as a 16-bit PCM WAV file."""
    import numpy as np
    audio_np = audio_tensor.cpu().numpy()
    # Clamp and convert to 16-bit PCM
    audio_np = np.clip(audio_np, -1.0, 1.0)
    audio_int16 = (audio_np * 32767).astype(np.int16)
    with wave.open(output_path, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(audio_int16.tobytes())


def generate_tts(text, output_path, voice="am_michael", speed=1.1):
    """Generate TTS audio using Kokoro and save as WAV."""
    from kokoro import KPipeline
    import torch

    # Initialize pipeline (downloads model on first run)
    pipeline = KPipeline(lang_code="a")

    # Generate audio
    audio_chunks = []
    for gs, ps, audio in pipeline(text, voice=voice, speed=speed):
        audio_chunks.append(audio)

    if not audio_chunks:
        raise RuntimeError("No audio generated")

    # Concatenate all chunks
    full_audio = torch.cat(audio_chunks)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    # Save as WAV (24kHz, 16-bit) using built-in wave module
    save_wav(full_audio, output_path, 24000)

    return output_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Kokoro TTS generator")
    parser.add_argument("--text", help="Text to synthesize")
    parser.add_argument("--file", help="Read text from file")
    parser.add_argument("--output", required=True, help="Output WAV file path")
    parser.add_argument("--voice", default="am_michael", help="Voice name")
    parser.add_argument("--speed", type=float, default=1.1, help="Speech speed (1.0=normal)")
    args = parser.parse_args()

    text = args.text
    if args.file:
        with open(args.file, "r", encoding="utf-8") as f:
            text = f.read().strip()
    if not text:
        print("TTS_ERROR: No text provided (use --text or --file)", file=sys.stderr)
        sys.exit(1)

    try:
        result = generate_tts(text, args.output, args.voice, args.speed)
        print(f"TTS_OK: {result}", file=sys.stderr)
    except Exception as e:
        print(f"TTS_ERROR: {e}", file=sys.stderr)
        sys.exit(1)
