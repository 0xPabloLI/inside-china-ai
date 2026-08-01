#!/usr/bin/env python3
"""
Forced alignment of known text to known TTS audio using ffmpeg silencedetect.
Unlike Whisper (which tries to RECOGNIZE speech), this aligns KNOWN text
to KNOWN audio by detecting silence boundaries as natural split points.

Usage:
  python3 force-align.py --audio-dir <path> --manifest <path> --output <path>
"""
import argparse
import json
import os
import re
import subprocess
import sys

def detect_silence(audio_path, threshold=0.015, min_duration=0.15):
    """Use ffmpeg silencedetect to find silence boundaries in audio."""
    result = subprocess.run(
        ["ffmpeg", "-i", audio_path, "-af",
         f"silencedetect=noise={threshold}:d={min_duration}",
         "-f", "null", "-"],
        capture_output=True, text=True
    )
    # Parse silence_start and silence_end from stderr
    starts = []
    ends = []
    for line in result.stderr.split("\n"):
        m = re.search(r"silence_start:\s*([\d.]+)", line)
        if m:
            starts.append(float(m.group(1)))
        m = re.search(r"silence_end:\s*([\d.]+)", line)
        if m:
            ends.append(float(m.group(1)))

    # Get total duration
    dur_result = subprocess.run(
        ["ffprobe", "-i", audio_path, "-show_entries", "format=duration",
         "-v", "quiet", "-of", "csv=p=0"],
        capture_output=True, text=True
    )
    total_duration = float(dur_result.stdout.strip())

    # Build segments: non-silent parts between silences
    segments = []
    prev_end = 0.0
    for s, e in zip(starts, ends):
        if s > prev_end:
            segments.append((prev_end, s))  # non-silent segment
        prev_end = e
    if total_duration > prev_end:
        segments.append((prev_end, total_duration))

    return segments, total_duration


def split_text_clauses(text):
    """Split text into clauses at sentence boundaries, commas, etc."""
    # Split on sentence boundaries first
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    clauses = []
    for sent in sentences:
        # Split long sentences at commas/semicolons
        parts = re.split(r"(,\s+|;\s+)", sent)
        current = ""
        for p in parts:
            if re.match(r"^[,;]\s", p):
                current += p
            else:
                if current.strip():
                    clauses.append(current.strip())
                current = p
        if current.strip():
            clauses.append(current.strip())
    return clauses


def count_words(text):
    return len(text.split())


def align_text_to_audio(text, segments, duration):
    """Map known text clauses to audio segments based on proportional word count."""
    clauses = split_text_clauses(text)
    total_words = sum(count_words(c) for c in clauses)

    if not segments or not clauses:
        return []

    # If we have more clauses than segments, merge segments
    # If we have more segments than clauses, split clauses
    results = []

    if len(segments) >= len(clauses):
        # Map clauses to segments proportionally
        seg_idx = 0
        for clause in clauses:
            words = count_words(clause)
            # Assign proportional number of segments based on word count
            seg_count = max(1, round(len(segments) * words / total_words))
            seg_slice = segments[seg_idx:seg_idx + seg_count]
            if seg_slice:
                start = seg_slice[0][0]
                end = seg_slice[-1][1]
            else:
                # No more silence segments — extend from previous end to audio duration
                start = results[-1]["end"] if results else 0.0
                end = duration
            # Ensure minimum 1s display time
            if end - start < 1.0:
                end = start + 1.0
            results.append({
                "text": clause,
                "start": round(start, 3),
                "end": round(min(end, duration), 3),
            })
            seg_idx += seg_count
    else:
        # Fewer segments than clauses - distribute clauses across segments
        words_remaining = total_words
        time_elapsed = 0.0
        for clause in clauses:
            words = count_words(clause)
            # Proportional time allocation
            clause_duration = duration * words / total_words
            start = time_elapsed
            end = min(time_elapsed + clause_duration, duration)
            results.append({
                "text": clause,
                "start": round(start, 3),
                "end": round(end, 3),
            })
            time_elapsed = end

    # Group into 3-7 word chunks
    chunked = []
    current = []
    for item in results:
        current.append(item)
        if count_words(" ".join(c["text"] for c in current)) >= 4 or \
           any(c["text"].endswith((".", "!", "?")) for c in current):
            text = " ".join(c["text"] for c in current)
            start = current[0]["start"]
            end = current[-1]["end"]
            chunked.append({"text": text, "start": start, "end": end})
            current = []
    if current:
        text = " ".join(c["text"] for c in current)
        start = current[0]["start"]
        end = current[-1]["end"]
        chunked.append({"text": text, "start": start, "end": end})

    return chunked


def main():
    parser = argparse.ArgumentParser(description="Force-align known text to TTS audio")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with open(args.manifest) as f:
        scenes = json.load(f)

    results = []
    for scene in scenes:
        sid = scene["sceneId"]
        audio = scene.get("audioPath", "")
        text = scene.get("text", "")
        print(f"  Scene {sid}: aligning {len(text)} chars...", file=sys.stderr)

        segments, duration = detect_silence(audio)
        aligned = align_text_to_audio(text, segments, duration)
        print(f"    {len(aligned)} subtitle chunks, {len(segments)} silence gaps", file=sys.stderr)

        results.append({"sceneId": sid, "segments": aligned})

    with open(args.output, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved to: {args.output}", file=sys.stderr)
    print(json.dumps(results))


if __name__ == "__main__":
    main()
