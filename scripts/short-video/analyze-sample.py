"""
Analyze M4A voice sample: duration, SNR, silence distribution, audio quality.
Then extract multiple processed versions with different parameters.
"""
import subprocess
import json
import os
import numpy as np
import wave

M4A = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/assets/audio6507181385.m4a"
OUT = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/assets"

# 1. Basic info
print("=" * 60)
print("1. BASIC INFO")
print("=" * 60)
r = subprocess.run(
    ["ffprobe", "-i", M4A, "-show_entries", "format=duration,bit_rate",
     "-show_entries", "stream=codec_name,sample_rate,channels",
     "-v", "quiet", "-of", "json"],
    capture_output=True, text=True
)
d = json.loads(r.stdout)
fmt = d["format"]
stm = d["streams"][0]
print(f"  Duration:   {float(fmt['duration']):.1f}s")
print(f"  Bitrate:    {fmt.get('bit_rate', '?')} bps")
print(f"  Codec:      {stm['codec_name']}")
print(f"  Sample rate:{stm['sample_rate']} Hz")
print(f"  Channels:   {stm['channels']}")

# 2. Silence detection at multiple thresholds
print()
print("=" * 60)
print("2. SILENCE ANALYSIS")
print("=" * 60)
for threshold_db in [-50, -40, -35, -30]:
    r = subprocess.run(
        ["ffmpeg", "-i", M4A, "-af",
         f"silencedetect=noise={threshold_db}dB:d=0.3", "-f", "null", "-"],
        capture_output=True, text=True
    )
    starts = []
    ends = []
    for line in r.stderr.split("\n"):
        if "silence_start" in line:
            import re
            m = re.search(r"silence_start:\s*([\d.]+)", line)
            if m: starts.append(float(m.group(1)))
        if "silence_end" in line:
            m = re.search(r"silence_end:\s*([\d.]+)", line)
            if m: ends.append(float(m.group(1)))
    
    # Calculate speech segments
    speech_segs = []
    prev_end = 0.0
    for s, e in zip(starts, ends):
        if s > prev_end:
            speech_segs.append((prev_end, s))
        prev_end = e
    total_dur = float(fmt['duration'])
    if total_dur > prev_end:
        speech_segs.append((prev_end, total_dur))
    
    speech_dur = sum(e - s for s, e in speech_segs)
    silence_dur = total_dur - speech_dur
    
    print(f"  Threshold {threshold_db}dB: {len(speech_segs)} speech segments, "
          f"speech={speech_dur:.1f}s, silence={silence_dur:.1f}s "
          f"({silence_dur/total_dur*100:.0f}% silence)")
    
    if threshold_db == -40:
        print(f"    Speech segments:")
        for i, (s, e) in enumerate(speech_segs[:15]):
            print(f"      {i+1}: {s:.1f}s - {e:.1f}s ({e-s:.1f}s)")

# 3. Audio quality: decode to raw PCM and analyze
print()
print("=" * 60)
print("3. AUDIO QUALITY")
print("=" * 60)
# Decode to raw PCM
r = subprocess.run(
    ["ffmpeg", "-i", M4A, "-f", "s16le", "-ar", "22050", "-ac", "1", "-"],
    capture_output=True
)
samples = np.frombuffer(r.stdout, dtype=np.int16).astype(float)
sr = 22050

# RMS, peak, dynamic range
rms = np.sqrt(np.mean(samples**2))
peak = np.max(np.abs(samples))
# SNR estimate: signal is speech segments, noise is silence
# Use a simple approach: high energy frames = signal, low = noise
frame_size = int(0.02 * sr)  # 20ms frames
n_frames = len(samples) // frame_size
frame_energy = np.array([
    np.mean(samples[i*frame_size:(i+1)*frame_size]**2)
    for i in range(n_frames)
])
threshold = np.median(frame_energy) * 0.1
signal_frames = frame_energy[frame_energy > threshold]
noise_frames = frame_energy[frame_energy <= threshold]
if len(signal_frames) > 0 and len(noise_frames) > 0:
    signal_power = np.mean(signal_frames)
    noise_power = np.mean(noise_frames)
    snr_db = 10 * np.log10(signal_power / (noise_power + 1e-10))
else:
    snr_db = float('nan')

print(f"  RMS level:        {rms:.0f} (out of 32768)")
print(f"  Peak level:       {peak:.0f} ({20*np.log10(peak/32768):.1f} dBFS)")
print(f"  Dynamic range:    {20*np.log10(peak/(rms+1)):.1f} dB")
print(f"  Estimated SNR:    {snr_db:.1f} dB")
print(f"  Quality:          {'Good' if snr_db > 20 else 'Fair' if snr_db > 10 else 'Poor'}")

# 4. Frequency analysis
print()
print("=" * 60)
print("4. FREQUENCY ANALYSIS")
print("=" * 60)
# Check for low-frequency noise (rumble) and high-frequency content
from numpy.fft import fft
N = min(len(samples), 22050 * 5)  # analyze first 5 seconds
freqs = np.abs(fft(samples[:N]))[:N//2]
freq_bins = np.arange(N//2) * (sr / N)
low_energy = np.sum(freqs[(freq_bins > 0) & (freq_bins < 85)])
mid_energy = np.sum(freqs[(freq_bins >= 85) & (freq_bins < 4000)])
high_energy = np.sum(freqs[(freq_bins >= 4000) & (freq_bins < 8000)])
total = low_energy + mid_energy + high_energy
print(f"  Low freq (<85Hz):   {low_energy/total*100:.1f}% (rumble/noise)")
print(f"  Mid freq (85-4kHz): {mid_energy/total*100:.1f}% (speech core)")
print(f"  High freq (4-8kHz): {high_energy/total*100:.1f}% (clarity/sibilance)")
print(f"  Low/Mid ratio:      {low_energy/mid_energy:.2f} ({'high rumble' if low_energy/mid_energy > 0.3 else 'normal'})")
