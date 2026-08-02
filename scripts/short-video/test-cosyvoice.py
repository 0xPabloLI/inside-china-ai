#!/usr/bin/env python3
"""
Test CosyVoice 2 voice cloning on macOS.
Downloads CosyVoice2-0.5B model from HuggingFace and generates speech.
"""
import os, sys, time
os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"

sys.path.insert(0, "/tmp/CosyVoice")

ASSETS = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/assets"
SAMPLE_WAV = os.path.join(ASSETS, "voice-sample.wav")
TEST_TEXT = "A leaked four hour investor meeting just paused DeepSeek funding round."
OUTPUT = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/output/audio/cosyvoice-test.wav"

MODEL_ID = "iic/CosyVoice2-0.5B"
MODEL_DIR = os.path.expanduser("~/Library/Application Support/cosyvoice2-0.5B")

print("Loading CosyVoice 2 model (first run downloads ~3GB)...", file=sys.stderr)
from cosyvoice.cli.cosyvoice import CosyVoice2

t0 = time.time()
cosyvoice = CosyVoice2(MODEL_ID)
load_time = time.time() - t0
print(f"Model loaded in {load_time:.1f}s", file=sys.stderr)

# Generate with voice cloning
print(f"\nGenerating speech...", file=sys.stderr)
print(f"  Text: {TEST_TEXT}", file=sys.stderr)
print(f"  Ref audio: {SAMPLE_WAV}", file=sys.stderr)

t0 = time.time()
results = cosyvoice.inference_cross_lingual(
    TEST_TEXT,
    SAMPLE_WAV,
)
gen_time = time.time() - t0

# Save output
import numpy as np
import soundfile as sf

for i, result in enumerate(results):
    audio = result["tts_speech"]
    sr = result["sample_rate"]
    output_path = OUTPUT.replace(".wav", f"_{i}.wav") if i > 0 else OUTPUT
    sf.write(output_path, audio, sr)
    duration = len(audio) / sr
    print(f"  Output: {output_path} ({duration:.1f}s)", file=sys.stderr)
    print(f"  Generation time: {gen_time:.1f}s", file=sys.stderr)
    print(f"  RTF: {gen_time/duration:.2f}x", file=sys.stderr)

print(f"\nDone! Compare:", file=sys.stderr)
print(f"  XTTS multi:  output/audio/compare-multi-wav.wav", file=sys.stderr)
print(f"  F5-MLX:      output/audio/f5-mlx-test.wav", file=sys.stderr)
print(f"  CosyVoice 2: output/audio/cosyvoice-test.wav", file=sys.stderr)
