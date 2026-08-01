"""
Multi-parameter voice sample processing + cloning evaluation.
Extracts multiple versions with different settings, clones each, evaluates objectively.
"""
import subprocess
import json
import os
import sys
import time
import numpy as np
import wave

M4A = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/assets/audio6507181385.m4a"
OUT = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/assets"
TEST_TEXT = "A leaked four hour investor meeting just paused DeepSeek funding round."

# Best speech segments from analysis (at -40dB threshold)
SEGMENTS = [
    ("seg1_9-24s", 9, 24),      # 15s from segment 2 (longest)
    ("seg2_9-35s", 9, 35),       # 26s full segment 2
    ("seg3_100-115s", 100, 115), # 15s from middle
    ("seg4_200-215s", 200, 215), # 15s from later
    ("seg5_9-19s", 9, 19),       # 10s short
]

# Processing variants
VARIANTS = [
    # (name, start, end, denoise_nr, highpass, lowpass, extra_filter)
    ("raw_15s",          9, 24, 0,  0,    0,     ""),
    ("light_nr6_15s",    9, 24, 6,  85,   8000,  ""),
    ("medium_nr12_15s",  9, 24, 12, 85,   8000,  ""),
    ("heavy_nr20_15s",   9, 24, 20, 85,   8000,  ""),
    ("light_nr6_26s",    9, 35, 6,  85,   8000,  ""),
    ("light_nr6_10s",    9, 19, 6,  85,   8000,  ""),
    ("light_nr6_15s_mid",100,115, 6,  85,   8000,  ""),
    ("light_nr6_15s_late",200,215,6,  85,   8000, ""),
    ("no_filter_15s",    9, 24, 0,  0,    0,     ""),
    ("nr8_hp80_15s",     9, 24, 8,  80,   7500,  ""),
]

def process_sample(m4a, start, end, nr, hp, lp, extra, out_path):
    """Extract and process a segment from M4A."""
    filters = []
    if nr > 0:
        filters.append(f"afftdn=nr={nr}")
    if hp > 0:
        filters.append(f"highpass=f={hp}")
    if lp > 0:
        filters.append(f"lowpass=f={lp}")
    if extra:
        filters.append(extra)
    
    filter_str = ",".join(filters) if filters else "anull"
    
    cmd = [
        "ffmpeg", "-y", "-i", m4a,
        "-ss", str(start), "-t", str(end - start),
        "-ar", "22050", "-ac", "1",
        "-af", filter_str,
        out_path
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode == 0

def get_audio_stats(wav_path):
    """Get basic audio stats."""
    with wave.open(wav_path, "r") as f:
        n = f.getnframes()
        sr = f.getframerate()
        data = f.readframes(n)
    samples = np.frombuffer(data, dtype=np.int16).astype(float)
    rms = np.sqrt(np.mean(samples**2))
    peak = np.max(np.abs(samples))
    snr_est = 20 * np.log10(peak / (np.std(samples) + 1e-10))
    return {"duration": n/sr, "rms": rms, "peak": peak, "snr": snr_est}

# ── Step 1: Process all variants ──
print("=" * 70)
print("STEP 1: PROCESSING SAMPLES")
print("=" * 70)
processed = []
for name, start, end, nr, hp, lp, extra in VARIANTS:
    out_path = f"{OUT}/voice-samples/{name}.wav"
    os.makedirs(f"{OUT}/voice-samples", exist_ok=True)
    ok = process_sample(M4A, start, end, nr, hp, lp, extra, out_path)
    if ok:
        stats = get_audio_stats(out_path)
        print(f"  ✅ {name:25s} {stats['duration']:.1f}s  RMS={stats['rms']:.0f}  SNR={stats['snr']:.1f}dB")
        processed.append((name, out_path))
    else:
        print(f"  ❌ {name:25s} FAILED")

# ── Step 2: Clone each variant ──
print()
print("=" * 70)
print("STEP 2: CLONING & EVALUATING")
print("=" * 70)

import torch
import torchaudio
os.environ["COQUI_TOS_AGREED"] = "1"
from TTS.api import TTS

print("  Loading XTTS model...", file=sys.stderr)
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("mps")
m = tts.synthesizer.tts_model
m.hifigan_decoder = m.hifigan_decoder.to("cpu")
print("  Model ready", file=sys.stderr)

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

# Get original sample embedding (use longest clean segment)
orig_emb = get_embedding(f"{OUT}/voice-samples/light_nr6_26s.wav")

results = []
for name, wav_path in processed:
    print(f"\n  Testing: {name}")
    
    # Clone
    t0 = time.time()
    try:
        cloned = tts.tts(
            text=TEST_TEXT,
            speaker_wav=wav_path,
            language="en",
            speed=1.15
        )
        clone_time = time.time() - t0
        
        # Save cloned audio
        clone_path = f"/tmp/clone-{name}.wav"
        with wave.open(clone_path, "w") as f:
            f.setnchannels(1)
            f.setsampwidth(2)
            f.setframerate(22050)
            f.writeframes((np.array(cloned) * 32767).astype(np.int16).tobytes())
        
        # Speaker similarity
        clone_emb = get_embedding(clone_path)
        cos_sim = torch.nn.functional.cosine_similarity(orig_emb, clone_emb, dim=0).item()
        
        # WER
        result = whisper_model.transcribe(clone_path, language="en")
        transcribed = result["text"].strip()
        
        def normalize(text):
            t = text.lower().replace(".", "").replace(",", "").replace("'", "").replace("-", " ")
            t = t.replace("deep seek", "deepseek")
            return t.split()
        
        ow = normalize(TEST_TEXT)
        tw = normalize(transcribed)
        
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
        
        d = lev(ow, tw)
        wer = d / len(ow) if ow else 1.0
        
        # Audio stats of clone
        clone_stats = get_audio_stats(clone_path)
        
        print(f"    Similarity: {cos_sim:.4f}")
        print(f"    WER: {wer:.2%}")
        print(f"    Transcribed: {transcribed[:80]}")
        print(f"    Clone duration: {clone_stats['duration']:.1f}s, time: {clone_time:.1f}s")
        
        results.append({
            "name": name,
            "wav_path": wav_path,
            "clone_path": clone_path,
            "similarity": cos_sim,
            "wer": wer,
            "clone_duration": clone_stats["duration"],
            "clone_time": clone_time,
            "transcribed": transcribed,
        })
        
    except Exception as e:
        print(f"    ❌ FAILED: {e}")
        results.append({"name": name, "error": str(e)})

# ── Step 3: Summary ──
print()
print("=" * 70)
print("STEP 3: SUMMARY (sorted by similarity)")
print("=" * 70)
valid = [r for r in results if "error" not in r]
valid.sort(key=lambda x: x["similarity"], reverse=True)

print(f"  {'Name':<25} {'Similarity':>10} {'WER':>8} {'Time':>6} {'Transcribed'}")
print(f"  {'─'*25} {'─'*10} {'─'*8} {'─'*6} {'─'*40}")
for r in valid:
    print(f"  {r['name']:<25} {r['similarity']:>10.4f} {r['wer']:>7.2%} {r['clone_time']:>5.1f}s {r['transcribed'][:40]}")

best = valid[0] if valid else None
if best:
    print(f"\n  🏆 BEST: {best['name']}")
    print(f"     Similarity: {best['similarity']:.4f}")
    print(f"     WER: {best['wer']:.2%}")
    print(f"     Sample: {best['wav_path']}")
    print(f"     Clone:  {best['clone_path']}")
    
    # Copy best sample to voice-sample.wav
    import shutil
    shutil.copy2(best["wav_path"], f"{OUT}/voice-sample.wav")
    print(f"\n  ✅ Best sample copied to: {OUT}/voice-sample.wav")
