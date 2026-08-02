#!/usr/bin/env python3
"""Test F5-TTS-MLX with 6s ref-audio and exact ref-text."""
import os
os.environ["HF_HUB_DISABLE_XET"] = "1"
from f5_tts_mlx.generate import generate

audio = generate(
    generation_text="A leaked four hour investor meeting just paused DeepSeek funding round.",
    ref_audio_path="/tmp/voice-sample-24k-6s.wav",
    ref_audio_text="is around 4.7.4 billion and the target.",
    speed=1.0,
    steps=8,
    output_path="output/audio/f5-mlx-v2.wav",
)
print("Done")
