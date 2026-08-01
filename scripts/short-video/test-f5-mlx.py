#!/usr/bin/env python3
"""Test F5-TTS-MLX voice cloning."""
import os
os.environ["HF_HUB_DISABLE_XET"] = "1"

from f5_tts_mlx.generate import generate

# Use the 24kHz 8s clip
ref_audio = "/tmp/voice-sample-24k-8s.wav"
ref_text = "So I think the first thing that I want to do is I want to really understand what is DeepSeek and what is high flier as a company."
gen_text = "A leaked four hour investor meeting just paused DeepSeek funding round."

output = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/output/audio/f5-mlx-test.wav"

print(f"Ref audio: {ref_audio}")
print(f"Ref text: {ref_text[:60]}...")
print(f"Gen text: {gen_text}")
print(f"Output: {output}")
print()

audio = generate(
    generation_text=gen_text,
    ref_audio_path=ref_audio,
    ref_audio_text=ref_text,
    speed=1.0,
    steps=8,
    output_path=output,
)

print(f"\nDone! Output: {output}")
print(f"Audio shape: {audio.shape if hasattr(audio, 'shape') else 'N/A'}")
