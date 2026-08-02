#!/usr/bin/env python3
"""Test F5-TTS-MLX with accurate ref-text from Whisper small model."""
import os
os.environ["HF_HUB_DISABLE_XET"] = "1"
from f5_tts_mlx.generate import generate

# Accurate ref-text from Whisper small transcription (corrected DeepSick→DeepSeek)
ref_text = "So in May 2026, DeepSeek founder Liang Wenfeng held a closed-door meeting with company in Beijing. He gave a lengthy presentation for the meeting."

audio = generate(
    generation_text="A leaked four hour investor meeting just paused DeepSeek funding round.",
    ref_audio_path="/tmp/multi_clip1_24k_8s.wav",
    ref_audio_text=ref_text,
    speed=1.0,
    steps=8,
    output_path="output/audio/f5-mlx-v3.wav",
)
print("Done")
