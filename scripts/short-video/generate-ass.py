#!/usr/bin/env python3
"""
Generate ASS subtitles using word-level timestamps from wav2vec2 alignment.

This script replaces lib/generate-srt.mjs. The key improvement:
- Uses ACTUAL word-level timestamps from subtitle-timing.json (wav2vec2 output)
- Groups words by character width (not word count) using real timestamps
- Generates ASS via pysubs2 (proper escaping, styling, timing)
- No proportional time distribution — every cue uses real audio timing

Usage:
    ~/.f5-tts-env/bin/python3 generate-ass.py \
        --timing <subtitle-timing.json> \
        --durations <scene-durations.json> \
        --output <subtitles.ass>

Input:
    subtitle-timing.json: [{ sceneId, segments: [{ text, start, end, words: [{text, start, end}] }] }]
    scene-durations.json: [{ sceneId, duration }]

Output:
    subtitles.ass (ASS v4+ with proper styling)
"""

import argparse
import json
import re
import sys

import pysubs2
from pysubs2 import SSAFile, SSAStyle, SSAEvent, Color, Alignment, make_time


# ── Constants ──
MAX_CHARS = 38          # Soft limit: don't split unless exceeds this
SPLIT_THRESHOLD = 49    # Hard split threshold (MAX_CHARS * 1.3) — allow 30% overflow
MIN_DURATION = 0.8      # Minimum display time per subtitle (seconds)
GAP_PADDING = 0.1       # Gap between consecutive subtitles (seconds)
SCENE_BUFFER = 0.5      # Recording buffer added per scene (seconds)
START_OFFSET = -0.1     # Subtitles appear 0.1s before audio (subtle, not jarring)

# ASS style parameters
FONT_NAME = "Helvetica Neue"
FONT_SIZE = 42
MARGIN_L = 65
MARGIN_R = 65
MARGIN_V = 450
PRIMARY_COLOR = Color(245, 245, 245, 0)    # &H00F5F5F5 — spoken words (white)
SECONDARY_COLOR = Color(148, 163, 184, 0)  # &H00B8A394 — unspoken words (gray #94A3B8)
OUTLINE_COLOR = Color(0, 0, 0, 102)        # &H66000000
BACK_COLOR = Color(0, 0, 0, 102)           # &H66000000


def group_words_by_width(words):
    """
    Group word-level timestamps into subtitle chunks that fit within MAX_CHARS.
    Uses ACTUAL word timestamps — no proportional distribution.

    Rules:
    - Group words until adding the next would exceed MAX_CHARS
    - Flush at sentence-ending punctuation (. ! ?)
    - Don't leave a single word as the last chunk (merge with previous)
    - Each chunk's start/end comes from the actual first/last word timestamp

    Returns: [{ text, start, end }] where start/end come from real word timing.
    """
    if not words:
        return []

    chunks = []
    current_words = []
    current_len = 0

    for w in words:
        word_text = w["text"]
        word_len = len(word_text) + (1 if current_words else 0)  # +1 for space
        ends_sentence = bool(re.search(r"[.!?:;]$", word_text))

        # Flush if adding this word would exceed SPLIT_THRESHOLD (hard limit),
        # or at sentence end with enough words
        should_flush = False
        if current_words:
            if current_len + word_len > SPLIT_THRESHOLD:
                # Hard limit exceeded — must split
                should_flush = True
            elif ends_sentence and len(current_words) >= 2:
                # Sentence end with 2+ words — flush for natural break
                should_flush = True
            elif current_len + word_len > MAX_CHARS:
                # Soft limit exceeded — check if remaining words would be too few
                remaining_words = words[words.index(w) + 1:] if w in words else []
                if len(remaining_words) >= 2:
                    should_flush = True
                # If only 0-1 words remain, keep them together (allow overflow)

        if should_flush:
                chunk_text = " ".join(wd["text"] for wd in current_words)
                chunk_text = re.sub(r"\s+([,.;:!?])", r"\1", chunk_text)
                chunks.append({
                    "text": chunk_text,
                    "start": current_words[0]["start"],
                    "end": current_words[-1]["end"],
                    "words": list(current_words),  # Keep word objects for \kf tags
                })
                current_words = []
                current_len = 0

        current_words.append(w)
        current_len += word_len

    # Don't leave a single-word trailing chunk — merge with previous
    if current_words:
        if len(current_words) == 1 and chunks:
            # Merge into previous chunk
            prev = chunks[-1]
            prev_words_text = prev["text"] + " " + current_words[0]["text"]
            prev_words_text = re.sub(r"\s+([,.;:!?])", r"\1", prev_words_text)
            # Only merge if it doesn't exceed MAX_CHARS too much (allow 10% overflow)
            if len(prev_words_text) <= MAX_CHARS * 1.1:
                prev["text"] = prev_words_text
                prev["end"] = current_words[0]["end"]
            else:
                # Can't merge — keep as separate chunk
                chunk_text = " ".join(wd["text"] for wd in current_words)
                chunk_text = re.sub(r"\s+([,.;:!?])", r"\1", chunk_text)
                chunks.append({
                    "text": chunk_text,
                    "start": current_words[0]["start"],
                    "end": current_words[-1]["end"],
                    "words": list(current_words),
                })
        else:
            chunk_text = " ".join(wd["text"] for wd in current_words)
            chunk_text = re.sub(r"\s+([,.;:!?])", r"\1", chunk_text)
            chunks.append({
                "text": chunk_text,
                "start": current_words[0]["start"],
                "end": current_words[-1]["end"],
                "words": list(current_words),
            })

    return chunks


def build_subtitles(timing_data, scene_durations):
    """
    Build subtitle list from word-level timing data.

    Each subtitle's start/end comes from the ACTUAL first/last word timestamp,
    not from proportional distribution.
    """
    subtitles = []
    scene_offset = 0.0

    for scene in timing_data:
        scene_id = scene.get("sceneId")
        scene_dur = 0.0
        for sd in scene_durations:
            if sd["sceneId"] == scene_id:
                scene_dur = sd["duration"]
                break

        for seg in scene.get("segments", []):
            # Use word-level timestamps if available
            words = seg.get("words", [])

            if words:
                # Group by character width using REAL word timestamps
                chunks = group_words_by_width(words)
            else:
                # Fallback: use segment-level timing
                seg_words = seg.get("text", "").split()
                if len(seg_words) <= 7:
                    chunks = [{"text": seg["text"], "start": seg["start"], "end": seg["end"]}]
                else:
                    # Split text and use segment timing (less precise)
                    text = seg["text"]
                    mid = len(text) // 2
                    split_idx = text.rfind(" ", 0, mid)
                    if split_idx == -1:
                        split_idx = mid
                    chunks = [
                        {"text": text[:split_idx], "start": seg["start"], "end": (seg["start"] + seg["end"]) / 2},
                        {"text": text[split_idx+1:], "start": (seg["start"] + seg["end"]) / 2, "end": seg["end"]},
                    ]

            for chunk in chunks:
                # Apply scene offset and start offset
                start_abs = max(scene_offset + chunk["start"] + START_OFFSET, 0.0)
                end_abs = scene_offset + min(chunk["end"], scene_dur)

                # Enforce minimum duration
                if end_abs - start_abs < MIN_DURATION:
                    end_abs = start_abs + MIN_DURATION

                # Adjust word timestamps to absolute time (for \kf tags)
                # NOTE: START_OFFSET is applied to the subtitle LINE display time
                # (start_abs above), NOT to individual word timestamps.
                # Word \kf durations must use raw alignment timing so highlights
                # sync exactly with speech. Adding START_OFFSET to each word
                # inflates every \kf duration by 0.1s, causing cumulative drift.
                chunk_words = []
                for wd in chunk.get("words", []):
                    wd_start = scene_offset + wd["start"]
                    wd_end = scene_offset + min(wd["end"], scene_dur)
                    chunk_words.append({
                        "text": wd["text"],
                        "start": wd_start,
                        "end": wd_end,
                    })

                subtitles.append({
                    "start": start_abs,
                    "end": end_abs,
                    "text": chunk["text"],
                    "words": chunk_words,
                })

        scene_offset += scene_dur + SCENE_BUFFER

    # Sort by start time
    subtitles.sort(key=lambda s: s["start"])

    # Merge single-word subtitles with neighbors
    merged = []
    for sub in subtitles:
        word_count = len(sub["text"].split())
        if word_count == 1 and merged:
            # Try merging with previous subtitle
            prev = merged[-1]
            combined_text = prev["text"] + " " + sub["text"]
            combined_text = re.sub(r"\s+([,.;:!?])", r"\1", combined_text)
            if len(combined_text) <= SPLIT_THRESHOLD:
                prev["text"] = combined_text
                prev["end"] = sub["end"]
                # Merge word lists too
                prev_words = prev.get("words", [])
                sub_words = sub.get("words", [])
                if prev_words and sub_words:
                    prev["words"] = prev_words + sub_words
                continue
        merged.append(sub)
    subtitles = merged

    # Fix overlaps: clamp start to previous subtitle's end
    for i in range(1, len(subtitles)):
        if subtitles[i]["start"] < subtitles[i - 1]["end"]:
            subtitles[i]["start"] = subtitles[i - 1]["end"]

    # Gap-fill: extend each subtitle to just before next start
    for i in range(len(subtitles) - 1):
        next_start = subtitles[i + 1]["start"]
        if next_start > subtitles[i]["end"] + GAP_PADDING:
            subtitles[i]["end"] = next_start - GAP_PADDING

    return subtitles


def make_karaoke_text(words, sub_start, sub_end):
    """
    Build ASS text with \kf karaoke tags from word-level timestamps.

    Each word gets a \kf tag whose duration (in centiseconds) comes from the
    word's actual audio timing. Gaps (silence between words) get \k tags.
    The total of all \k + \kf durations equals (sub_end - sub_start).

    Effect: words start gray (secondarycolor), fill to white (primarycolor)
    as they are spoken — matching TikTok's native caption style.

    Args:
        words: [{text, start, end}] — absolute timestamps
        sub_start: float — subtitle display start time (absolute)
        sub_end: float — subtitle display end time (absolute)

    Returns: str — ASS text with \kf / \k tags
    """
    if not words:
        return ""

    parts = []
    prev_end = sub_start

    for i, w in enumerate(words):
        word_start = max(w["start"], sub_start)
        word_end = min(w["end"], sub_end)

        # Gap before this word (silence) — \k advances timer without filling
        gap = word_start - prev_end
        if gap > 0.03:
            gap_cs = max(int(gap * 100), 1)
            parts.append(f"{{\\k{gap_cs}}}")

        # Word fill duration in centiseconds (1/100 second)
        fill = word_end - word_start
        fill_cs = max(int(fill * 100), 1)

        # Word text — include trailing space if not last word
        word_text = w["text"]
        if i < len(words) - 1:
            word_text += " "

        parts.append(f"{{\\kf{fill_cs}}}{word_text}")
        prev_end = word_end

    # Trailing gap to fill remaining display time
    trailing = sub_end - prev_end
    if trailing > 0.03:
        trailing_cs = max(int(trailing * 100), 1)
        parts.append(f"{{\\k{trailing_cs}}}")

    return "".join(parts)


def generate_ass(subtitles, output_path):
    """Generate ASS file using pysubs2 with proper styling and escaping."""
    subs = SSAFile()

    # Script Info
    subs.info["PlayResX"] = "1080"
    subs.info["PlayResY"] = "1920"
    subs.info["WrapStyle"] = "0"  # Smart wrapping (safety net)

    # Default style — secondarycolor is the unspoken word color (gray)
    # \kf karaoke: words start as secondarycolor (gray), fill to primarycolor (white)
    style = SSAStyle(
        fontname=FONT_NAME,
        fontsize=FONT_SIZE,
        primarycolor=PRIMARY_COLOR,
        secondarycolor=SECONDARY_COLOR,
        outlinecolor=OUTLINE_COLOR,
        backcolor=BACK_COLOR,
        bold=True,
        italic=False,
        underline=False,
        strikeout=False,
        scalex=100,
        scaley=100,
        spacing=0,
        angle=0,
        borderstyle=1,
        outline=3,
        shadow=1,
        alignment=Alignment.BOTTOM_CENTER,
        marginl=MARGIN_L,
        marginr=MARGIN_R,
        marginv=MARGIN_V,
    )
    subs.styles["Default"] = style

    # Add subtitle events with \kf karaoke tags
    for sub in subtitles:
        start_ms = int(sub["start"] * 1000)
        end_ms = int(sub["end"] * 1000)

        # Build karaoke text if we have word-level timing, else plain text
        words = sub.get("words", [])
        if words:
            karaoke_text = make_karaoke_text(words, sub["start"], sub["end"])
        else:
            karaoke_text = sub["text"]

        event = subs.append(
            SSAEvent(
                start=start_ms,
                end=end_ms,
                style="Default",
                text=karaoke_text,
            )
        )

    subs.save(output_path)
    return len(subtitles)


def main():
    parser = argparse.ArgumentParser(description="Generate ASS subtitles from word-level timing")
    parser.add_argument("--timing", required=True, help="Path to subtitle-timing.json")
    parser.add_argument("--durations", required=True, help="Path to scene-durations.json")
    parser.add_argument("--output", required=True, help="Output ASS file path")
    args = parser.parse_args()

    # Load timing data
    with open(args.timing) as f:
        timing_data = json.load(f)

    # Load scene durations
    with open(args.durations) as f:
        scene_durations = json.load(f)

    # Build subtitles from word-level timestamps
    subtitles = build_subtitles(timing_data, scene_durations)

    # Generate ASS file
    count = generate_ass(subtitles, args.output)

    # Output summary to stderr (stdout reserved for JSON result)
    print(f"  📝 ASS generated: {count} cues → {args.output}", file=sys.stderr)

    # Output JSON result to stdout (for main.mjs to parse)
    result = {"assPath": args.output, "count": count}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
