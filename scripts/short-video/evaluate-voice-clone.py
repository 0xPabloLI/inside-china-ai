"""
Objective evaluation of XTTS voice cloning quality:
1. WER (Word Error Rate) — transcribe cloned audio with Whisper, compare to original text
2. Speaker Similarity — cosine similarity of speaker embeddings (original vs cloned)
"""
import os, sys, json, wave, time
import numpy as np

# Fix SSL
import ssl
ssl._create_default_https_context = ssl._create_unverified_context
os.environ["CURL_CA_BUNDLE"] = ""
os.environ["REQUESTS_CA_BUNDLE"] = ""

SAMPLE_WAV = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/assets/voice-sample.wav"
CLONED_WAV = "/tmp/voice-clone-test.wav"
TEST_TEXT = "A leaked four hour investor meeting just paused DeepSeek funding round."

# ── 1. Speaker Similarity ──
print("=" * 60)
print("1. SPEAKER SIMILARITY (cosine similarity of embeddings)")
print("=" * 60)

import torch
os.environ["COQUI_TOS_AGREED"] = "1"
from TTS.api import TTS

tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("mps")
m = tts.synthesizer.tts_model
m.hifigan_decoder = m.hifigan_decoder.to("cpu")

# Get speaker embedding for original sample
import torchaudio
def get_embedding(wav_path):
    audio, sr = torchaudio.load(wav_path)
    audio_16k = torchaudio.functional.resample(audio, sr, 16000)
    if audio_16k.shape[0] > 1:
        audio_16k = audio_16k[:1]
    with torch.inference_mode():
        emb = m.hifigan_decoder.speaker_encoder.forward(audio_16k.to("cpu"), l2_norm=True)
    return emb.squeeze()

emb_orig = get_embedding(SAMPLE_WAV)
emb_clone = get_embedding(CLONED_WAV)

# Cosine similarity
cos_sim = torch.nn.functional.cosine_similarity(emb_orig, emb_clone, dim=0).item()
print(f"  Original sample embedding shape: {emb_orig.shape}")
print(f"  Cloned audio embedding shape:    {emb_clone.shape}")
print(f"  Cosine similarity: {cos_sim:.4f}")
print(f"  Interpretation: {'Excellent (>0.8)' if cos_sim > 0.8 else 'Good (>0.6)' if cos_sim > 0.6 else 'Poor (<0.6)'}")

# ── 2. WER (Word Error Rate) ──
print()
print("=" * 60)
print("2. WER (Word Error Rate)")
print("=" * 60)

import whisper
whisper_model = whisper.load_model("base", device="cpu")

# Transcribe cloned audio
result = whisper_model.transcribe(CLONED_WAV, language="en", word_timestamps=False)
transcribed = result["text"].strip()
print(f"  Original text:  {TEST_TEXT}")
print(f"  Transcribed:    {transcribed}")

# Calculate WER
orig_words = TEST_TEXT.lower().replace(",", "").replace(".", "").replace("'", "").split()
trans_words = transcribed.lower().replace(",", "").replace(".", "").replace("'", "").split()

# Simple WER: edit distance / original word count
def levenshtein(s1, s2):
    if len(s1) < len(s2):
        return levenshtein(s2, s1)
    if len(s2) == 0:
        return len(s1)
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]

distance = levenshtein(orig_words, trans_words)
wer = distance / len(orig_words) if orig_words else 1.0
accuracy = 1.0 - wer

print(f"  Original words:  {len(orig_words)}")
print(f"  Transcribed words: {len(trans_words)}")
print(f"  Edit distance: {distance}")
print(f"  WER: {wer:.2%}")
print(f"  Accuracy: {accuracy:.2%}")
print(f"  Interpretation: {'Excellent (<10%)' if wer < 0.1 else 'Good (<20%)' if wer < 0.2 else 'Acceptable (<30%)' if wer < 0.3 else 'Poor (>30%)'}")

# ── 3. Audio quality metrics ──
print()
print("=" * 60)
print("3. AUDIO QUALITY METRICS")
print("=" * 60)

def get_audio_stats(wav_path):
    with wave.open(wav_path, "r") as f:
        n = f.getnframes()
        sr = f.getframerate()
        data = f.readframes(n)
    samples = np.frombuffer(data, dtype=np.int16).astype(float)
    return {
        "duration": n / sr,
        "sample_rate": sr,
        "samples": n,
        "rms": np.sqrt(np.mean(samples**2)),
        "peak": np.max(np.abs(samples)),
        "snr_estimate": 20 * np.log10(np.max(np.abs(samples)) / (np.std(samples) + 1e-10)),
    }

orig_stats = get_audio_stats(SAMPLE_WAV)
clone_stats = get_audio_stats(CLONED_WAV)

print(f"  {'Metric':<20} {'Original':>12} {'Cloned':>12}")
print(f"  {'─'*20} {'─'*12} {'─'*12}")
for k in ["duration", "sample_rate", "rms", "peak", "snr_estimate"]:
    print(f"  {k:<20} {orig_stats[k]:>12.2f} {clone_stats[k]:>12.2f}")

print()
print("=" * 60)
print("SUMMARY")
print("=" * 60)
print(f"  Speaker Similarity: {cos_sim:.4f} ({'PASS' if cos_sim > 0.7 else 'FAIL'})")
print(f"  WER:                {wer:.2%} ({'PASS' if wer < 0.15 else 'FAIL'})")
print(f"  Audio Duration:     {clone_stats['duration']:.1f}s")
print(f"  Overall:            {'✅ ACCEPTABLE FOR PRODUCTION' if cos_sim > 0.7 and wer < 0.15 else '⚠️ NEEDS IMPROVEMENT'}")
