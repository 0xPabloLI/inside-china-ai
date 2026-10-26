#!/usr/bin/env python3
"""Prosody probe for TTS hook takes.

Measures the three dimensions that make a read sound "energetic" rather than
flat, so a take can be compared against another take of the same or a
different script:

  pitch range   — F0 p90-p10 in semitones. Wider = more expressive contour.
  pitch motion  — mean absolute F0 delta between voiced frames, semitones.
                  High = the voice moves around instead of sitting on a note.
  loudness dyn. — RMS p90-p10 in dB. Wider = more dynamic stress.

Also reports voiced ratio and speech rate so a slower/flatter take cannot be
mistaken for a calmer one.

Usage: prosody-probe.py <wav> [<wav> ...]
"""

import sys

import librosa
import numpy as np


def probe(path):
    y, sr = librosa.load(path, sr=22050, mono=True)
    if y.size == 0:
        return None

    # F0 via pyin (probabilistic YIN) — voiced frames only.
    f0, voiced_flag, _ = librosa.pyin(
        y, fmin=60, fmax=500, sr=sr, frame_length=2048, hop_length=256
    )
    voiced = f0[~np.isnan(f0)]
    voiced_ratio = float(np.mean(voiced_flag)) if voiced_flag.size else 0.0

    if voiced.size < 10:
        return {
            "path": path,
            "duration": float(librosa.get_duration(y=y, sr=sr)),
            "voiced_ratio": voiced_ratio,
            "error": "too few voiced frames for F0 statistics",
        }

    # Semitones relative to the median pitch — makes ranges comparable across
    # speakers/takes regardless of absolute register.
    ref = np.median(voiced)
    st = 12.0 * np.log2(voiced / ref)
    pitch_p10, pitch_p90 = np.percentile(st, [10, 90])
    pitch_motion = float(np.mean(np.abs(np.diff(st))))

    # Loudness dynamics from RMS in dB.
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=256)[0]
    rms_db = 20.0 * np.log10(np.maximum(rms, 1e-9))
    active = rms_db[rms_db > (rms_db.max() - 40.0)]  # ignore silence floor
    loud_p10, loud_p90 = np.percentile(active, [10, 90]) if active.size else (0.0, 0.0)

    duration = float(librosa.get_duration(y=y, sr=sr))
    # Speech rate over voiced time only: pauses must not masquerade as calm.
    voiced_seconds = duration * voiced_ratio
    syllables = librosa.beat.tempo(y=y, sr=sr)[0]  # rough tempo, unused placeholder
    del syllables

    return {
        "path": path,
        "duration": duration,
        "voiced_ratio": voiced_ratio,
        "voiced_seconds": voiced_seconds,
        "median_f0_hz": float(ref),
        "pitch_range_st": float(pitch_p90 - pitch_p10),
        "pitch_motion_st": pitch_motion,
        "loudness_range_db": float(loud_p90 - loud_p10),
    }


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    rows = []
    for path in sys.argv[1:]:
        try:
            r = probe(path)
        except Exception as exc:  # noqa: BLE001 - report and continue
            print(f"{path}: probe failed: {exc}")
            continue
        if r:
            rows.append(r)

    if not rows:
        return 1

    width = max(len(r["path"]) for r in rows)
    header = (
        f"{'file':<{width}}  {'dur':>6}  {'voiced':>7}  {'F0med':>6}  "
        f"{'pitchRng':>8}  {'motion':>7}  {'loudRng':>8}"
    )
    print(header)
    print("-" * len(header))
    for r in rows:
        if "error" in r:
            print(f"{r['path']:<{width}}  {r['duration']:6.2f}  {r['voiced_ratio']*100:6.1f}%  {r['error']}")
            continue
        print(
            f"{r['path']:<{width}}  {r['duration']:6.2f}  "
            f"{r['voiced_ratio']*100:6.1f}%  {r['median_f0_hz']:6.1f}  "
            f"{r['pitch_range_st']:8.2f}  {r['pitch_motion_st']:7.3f}  "
            f"{r['loudness_range_db']:8.2f}"
        )
    print()
    print("pitchRng / motion in semitones; loudRng in dB. Wider = more expressive.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
