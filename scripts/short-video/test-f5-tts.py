#!/usr/bin/env python3
"""
Test F5-TTS voice cloning with the same sample and text used for XTTS comparison.
Generates audio for A/B comparison.
"""
import os, sys, time, wave
import numpy as np

os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
SAMPLE_WAV = os.path.join(ASSETS, "voice-sample.wav")
MULTI_WAVS = [
    os.path.join(ASSETS, "voice-samples", "multi_clip1.wav"),
    os.path.join(ASSETS, "voice-samples", "multi_clip2.wav"),
    os.path.join(ASSETS, "voice-samples", "multi_clip3.wav"),
]
TEST_TEXT = "A leaked four hour investor meeting just paused DeepSeek funding round."
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output", "audio")

print("Loading F5-TTS model (first run downloads ~1.6GB)...", file=sys.stderr)
from f5_tts.api import F5TTS

tts = F5TTS()
print("F5-TTS model ready!", file=sys.stderr)

tests = [
    ("f5-single-wav", SAMPLE_WAV),
    ("f5-multi-wav", MULTI_WAVS[0]),  # F5 takes single ref, use clip1
]

for name, ref_wav in tests:
    print(f"\nGenerating: {name}", file=sys.stderr)
    print(f"  Ref: {ref_wav}", file=sys.stderr)

    t0 = time.time()
    wav, sr, _ = tts.infer(
        ref_file=ref_wav,
        ref_text="",  # auto-transcribe
        gen_text=TEST_TEXT,
        file_wave=os.path.join(OUTPUT_DIR, f"{name}.wav"),
        speed=1.15,
    )
    elapsed = time.time() - t0
    print(f"  Time: {elapsed:.1f}s", file=sys.stderr)
    print(f"  Output: {OUTPUT_DIR}/{name}.wav", file=sys.stderr)

print("\nDone! Compare:", file=sys.stderr)
print(f"  XTTS single: {OUTPUT_DIR}/compare-single-wav.wav", file=sys.stderr)
print(f"  XTTS multi:  {OUTPUT_DIR}/compare-multi-wav.wav", file=sys.stderr)
print(f"  F5 single:   {OUTPUT_DIR}/f5-single-wav.wav", file=sys.stderr)
print(f"  F5 multi:    {OUTPUT_DIR}/f5-multi-wav.wav", file=sys.stderr)
