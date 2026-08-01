#!/usr/bin/env python3
"""Re-evaluate similarity using averaged embedding as ground truth."""
import os, torch, torchaudio
os.environ["COQUI_TOS_AGREED"] = "1"
from TTS.api import TTS

tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("mps")
m = tts.synthesizer.tts_model
m.hifigan_decoder = m.hifigan_decoder.to("cpu")

def get_emb(path):
    a, sr = torchaudio.load(path)
    a16 = torchaudio.functional.resample(a, sr, 16000)[:1]
    with torch.inference_mode():
        return m.hifigan_decoder.speaker_encoder.forward(a16.to("cpu"), l2_norm=True).squeeze()

e1 = get_emb("assets/voice-samples/multi_clip1.wav")
e2 = get_emb("assets/voice-samples/multi_clip2.wav")
e3 = get_emb("assets/voice-samples/multi_clip3.wav")
avg_orig = (e1 + e2 + e3) / 3

e_single = get_emb("/tmp/test-single-wav.wav")
e_multi = get_emb("/tmp/test-multi-wav.wav")
e_vs = get_emb("assets/voice-sample.wav")

sim_vs_single = torch.nn.functional.cosine_similarity(e_vs, e_single, dim=0).item()
sim_vs_multi = torch.nn.functional.cosine_similarity(e_vs, e_multi, dim=0).item()
sim_avg_single = torch.nn.functional.cosine_similarity(avg_orig, e_single, dim=0).item()
sim_avg_multi = torch.nn.functional.cosine_similarity(avg_orig, e_multi, dim=0).item()

print(f"Against voice-sample.wav (single clip as ground truth):")
print(f"  Single-WAV clone: {sim_vs_single:.4f}")
print(f"  Multi-WAV clone:  {sim_vs_multi:.4f}")
print()
print(f"Against 3-clip average (multi-WAV as ground truth):")
print(f"  Single-WAV clone: {sim_avg_single:.4f}")
print(f"  Multi-WAV clone:  {sim_avg_multi:.4f}")
