#!/usr/bin/env python3
"""Measure WER of a generated audio file."""
import sys, whisper

audio_path = sys.argv[1]
original = sys.argv[2] if len(sys.argv) > 2 else "A leaked four hour investor meeting just paused DeepSeek funding round."

model = whisper.load_model("base", device="cpu")
result = model.transcribe(audio_path, language="en")
transcribed = result["text"].strip()

def normalize(t):
    t = t.lower().replace(".", "").replace(",", "").replace("'", "").replace("-", " ")
    t = t.replace("deep seek", "deepseek")
    return t.split()

ow = normalize(original)
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
wer = d / len(ow)
print(f"Original:    {original}")
print(f"Transcribed: {transcribed}")
print(f"WER: {wer:.2%}")
