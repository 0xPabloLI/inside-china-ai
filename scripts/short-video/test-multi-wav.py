#!/usr/bin/env python3
"""
Compare single-WAV vs multi-WAV voice cloning quality.
Tests: 1 clip (current default) vs 3 clips (multi-WAV conditioning).
"""
import os, sys, json, wave, time
import numpy as np
import torch
import torchaudio

os.environ["COQUI_TOS_AGREED"] = "1"
os.environ["CURL_CA_BUNDLE"] = ""
import ssl
ssl._create_default_https_context = ssl._create_unverified_context

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
SAMPLES_DIR = os.path.join(ASSETS, "voice-samples")
TEST_TEXT = "A leaked four hour investor meeting just paused DeepSeek funding round."
SINGLE_WAV = os.path.join(ASSETS, "voice-sample.wav")
MULTI_WAVS = [
    os.path.join(SAMPLES_DIR, "multi_clip1.wav"),
    os.path.join(SAMPLES_DIR, "multi_clip2.wav"),
    os.path.join(SAMPLES_DIR, "multi_clip3.wav"),
]

print("Loading XTTS v2 model...", file=sys.stderr)
from TTS.api import TTS
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("mps")
m = tts.synthesizer.tts_model
m.hifigan_decoder = m.hifigan_decoder.to("cpu")
print("Model ready (MPS hybrid)", file=sys.stderr)

import whisper
whisper_model = whisper.load_model("base", device="cpu")

def get_embedding(wav_path):
    audio, sr = torchaudio.load(wav_path)
    audio_16k = torchaudio.functional.resample(audio, sr, 16000)
    if audio_16k.shape[0] > 1:
        audio_16k = audio_16k[:1]
    with torch.inference_mode():
        emb = m.hifigan_decoder.speaker_encoder.forward(audio_16k.to("cpu"), l2_norm=True)
    return emb.squeeze()

def save_wav(samples, path, sr=24000):
    with wave.open(path, "w") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sr)
        for s in samples:
            clamped = max(-1.0, min(1.0, float(s)))
            f.writeframes(np.array([int(clamped * 32767)], dtype=np.int16).tobytes())

def calc_wer(orig, trans):
    ow = orig.lower().replace(".", "").replace(",", "").replace("'", "").replace("-", " ").replace("deep seek", "deepseek").split()
    tw = trans.lower().replace(".", "").replace(",", "").replace("'", "").replace("-", " ").replace("deep seek", "deepseek").split()
    def lev(s1, s2):
        if len(s1) < len(s2): return lev(s2, s1)
        if len(s2) == 0: return len(s1)
        pr = list(range(len(s2) + 1))
        for i, c1 in enumerate(s1):
            cr = [i + 1]
            for j, c2 in enumerate(s2):
                cr.append(min(pr[j+1]+1, cr[j]+1, pr[j]+(c1!=c2)))
            pr = cr
        return pr[-1]
    return lev(ow, tw) / len(ow) if ow else 1.0

# Original sample embedding (ground truth)
orig_emb = get_embedding(SINGLE_WAV)

tests = [
    ("Single-WAV (15s, current)", SINGLE_WAV),
    ("Multi-WAV (3x12s, new)", MULTI_WAVS),
]

results = []
for name, speaker_wav in tests:
    print(f"\n{'='*60}")
    print(f"Test: {name}")
    print(f"{'='*60}")

    t0 = time.time()
    cloned = tts.tts(
        text=TEST_TEXT,
        speaker_wav=speaker_wav,
        language="en",
        speed=1.15,
    )
    clone_time = time.time() - t0

    clone_path = f"/tmp/test-{name.split()[0].lower()}.wav"
    save_wav(cloned, clone_path)

    # Speaker similarity
    clone_emb = get_embedding(clone_path)
    cos_sim = torch.nn.functional.cosine_similarity(orig_emb, clone_emb, dim=0).item()

    # WER
    result = whisper_model.transcribe(clone_path, language="en")
    transcribed = result["text"].strip()
    wer = calc_wer(TEST_TEXT, transcribed)

    print(f"  Similarity: {cos_sim:.4f}")
    print(f"  WER:        {wer:.2%}")
    print(f"  Time:       {clone_time:.1f}s")
    print(f"  Transcribed: {transcribed}")

    results.append({"name": name, "similarity": cos_sim, "wer": wer, "time": clone_time})

# Summary
print(f"\n{'='*60}")
print("COMPARISON SUMMARY")
print(f"{'='*60}")
print(f"  {'Method':<35} {'Similarity':>10} {'WER':>8} {'Time':>6}")
print(f"  {'─'*35} {'─'*10} {'─'*8} {'─'*6}")
for r in results:
    print(f"  {r['name']:<35} {r['similarity']:>10.4f} {r['wer']:>7.2%} {r['time']:>5.1f}s")

# Delta
if len(results) == 2:
    delta_sim = results[1]["similarity"] - results[0]["similarity"]
    delta_wer = results[1]["wer"] - results[0]["wer"]
    print(f"\n  Delta (multi - single):")
    print(f"    Similarity: {delta_sim:+.4f} ({'↑ better' if delta_sim > 0 else '↓ worse' if delta_sim < 0 else '→ same'})")
    print(f"    WER:        {delta_wer:+.2%} ({'↓ better' if delta_wer < 0 else '↑ worse' if delta_wer > 0 else '→ same'})")
