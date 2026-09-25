#!/usr/bin/env python3
"""
MiniCPM-o 4.5 audio capability test on M2 Pro 32GB.

Tests:
  1. ASR (transcription) — Chinese & English
  2. Emotion recognition — shock, calm, CTA
  3. Speaking style/tone analysis
  4. Combined audio + video analysis

Usage:
    python test_minicpm_audio.py
    python test_minicpm_audio.py --audio path/to/audio.wav
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

MODEL_PATH = os.path.expanduser("~/models/MiniCPM-o-4_5-4bit")

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")

# ─── Audio test files ───

TTS_EMOTION_DIR = os.path.join(ASSETS_DIR, "tts-comparison", "indextts-emotion")

AUDIO_TESTS = [
    {
        "file": os.path.join(TTS_EMOTION_DIR, "indextts-hook-shock-zh.wav"),
        "label": "hook-shock-zh",
        "expected": "中文, 震惊/惊讶情绪, hook 风格",
    },
    {
        "file": os.path.join(TTS_EMOTION_DIR, "indextts-hook-shock-en.wav"),
        "label": "hook-shock-en",
        "expected": "English, shock/surprise emotion, hook style",
    },
    {
        "file": os.path.join(TTS_EMOTION_DIR, "indextts-cta-call-zh.wav"),
        "label": "cta-call-zh",
        "expected": "中文, 行动号召/激动情绪, CTA 风格",
    },
    {
        "file": os.path.join(TTS_EMOTION_DIR, "indextts-narrative-calm-zh.wav"),
        "label": "narrative-calm-zh",
        "expected": "中文, 平静/叙述情绪, narrative 风格",
    },
    {
        "file": os.path.join(TTS_EMOTION_DIR, "indextts-narrative-calm-en.wav"),
        "label": "narrative-calm-en",
        "expected": "English, calm/narrative emotion, narrative style",
    },
    {
        "file": os.path.join(ASSETS_DIR, "dh-fixtures", "audio-10s.mp3"),
        "label": "real-audio-10s",
        "expected": "真实音频, 未知",
    },
]

# ─── Audio analysis prompts ───

PROMPT_ASR = """Transcribe the speech in this audio. Output only the transcription, nothing else."""

PROMPT_EMOTION = """Analyze the emotion and tone of the speech in this audio. Provide your analysis as Markdown:

## Transcription
Transcribe the speech (if any).

## Emotion
One of: happy, sad, angry, surprised, fearful, disgusted, neutral, excited, calm

## Tone
Describe the tone of voice (e.g., "urgent and energetic", "calm and measured", "dramatic and intense").

## Speaking Style
One of: hook, narrative, cta, conversational, formal, casual

## Confidence
Your confidence in the emotion classification (high/medium/low) and why.
"""

PROMPT_FULL_ANALYSIS = """Analyze this audio for use in a short video production pipeline. Provide your analysis as Markdown:

## Transcription
Transcribe the speech in this audio. If the audio is not speech, describe what you hear.

## Language
The language spoken (e.g., "Chinese", "English", "mixed").

## Emotion
The primary emotion conveyed: happy, sad, angry, surprised, fearful, disgusted, neutral, excited, calm

## Tone
Describe the tone of voice in 1-2 sentences.

## Speaking Style
The speaking style: hook, narrative, cta, conversational, formal, casual

## Delivery Quality
Assess the delivery quality for short video production: pace, clarity, engagement level.

## Summary
One sentence summary of this audio segment's characteristics.
"""

# ─── Video + audio combined test ───

VIDEO_AUDIO_TESTS = [
    {
        "video": os.path.join(ASSETS_DIR, "scene-10.mp4"),
        "label": "scene-10-video+extracted-audio",
    },
]


def load_model():
    from mlx_vlm import load

    print(f"\n{'='*60}")
    print(f"Loading MiniCPM-o 4.5 (MLX 4bit)...")
    print(f"  Path: {MODEL_PATH}")
    print(f"{'='*60}")

    t0 = time.time()
    model, processor = load(MODEL_PATH)
    load_time = time.time() - t0

    print(f"  Loaded in {load_time:.1f}s")
    return model, processor, load_time


def run_audio_inference(model, processor, audio_path, prompt_text, label=""):
    from mlx_vlm import generate
    from mlx_vlm.prompt_utils import apply_chat_template as mlx_apply_chat_template

    try:
        prompt = mlx_apply_chat_template(
            processor,
            model.config,
            prompt_text,
            add_generation_prompt=True,
            num_audios=1,
        )
    except Exception as e:
        return {"label": label, "error": f"chat_template failed: {e}", "response": ""}

    t0 = time.time()
    try:
        response = generate(
            model, processor, prompt=prompt, audio=[audio_path],
            temperature=0.0, max_tokens=500, verbose=False,
        )
    except Exception as e:
        return {
            "label": label,
            "error": f"generate failed: {e}",
            "response": "",
            "gen_time": time.time() - t0,
        }

    gen_time = time.time() - t0

    if hasattr(response, "text"):
        text = response.text
    elif isinstance(response, dict):
        text = response.get("text", str(response))
    else:
        text = str(response)

    token_count = len(text.split())

    return {
        "label": label,
        "response": text,
        "gen_time": round(gen_time, 2),
        "token_count": token_count,
        "tokens_per_sec": round(token_count / gen_time, 1) if gen_time > 0 else 0,
        "error": None,
    }


def main():
    parser = argparse.ArgumentParser(description="MiniCPM-o 4.5 audio test")
    parser.add_argument(
        "--audio", default=None,
        help="Single audio file to test"
    )
    parser.add_argument(
        "--output", default=None,
        help="Output JSON file"
    )
    args = parser.parse_args()

    model, processor, load_time = load_model()

    results = {
        "model": "MiniCPM-o 4.5 (MLX 4bit)",
        "load_time": load_time,
        "tests": [],
    }

    if args.audio:
        test_files = [{"file": args.audio, "label": "custom", "expected": ""}]
    else:
        test_files = AUDIO_TESTS

    # Test 1: Full analysis on each audio file
    print(f"\n{'='*60}")
    print(f"Test: Full Audio Analysis ({len(test_files)} files)")
    print(f"{'='*60}")

    for i, test in enumerate(test_files):
        if not os.path.exists(test["file"]):
            print(f"\n  [{i+1}/{len(test_files)}] {test['label']}: FILE NOT FOUND")
            continue

        print(f"\n  [{i+1}/{len(test_files)}] {test['label']}")
        print(f"    Expected: {test.get('expected', 'N/A')}")

        result = run_audio_inference(
            model, processor, test["file"], PROMPT_FULL_ANALYSIS, test["label"]
        )
        result["prompt"] = "full_analysis"
        result["expected"] = test.get("expected", "")
        results["tests"].append(result)

        if result.get("error"):
            print(f"    ERROR: {result['error']}")
        else:
            print(f"    Time: {result['gen_time']}s | Tokens: {result['token_count']} | Speed: {result['tokens_per_sec']} tok/s")
            print(f"    Response:")
            for line in result["response"].split("\n"):
                if line.strip():
                    print(f"      {line}")

    # Test 2: ASR only on first 2 files
    print(f"\n{'='*60}")
    print(f"Test: ASR Only (first 2 files)")
    print(f"{'='*60}")

    for i, test in enumerate(test_files[:2]):
        if not os.path.exists(test["file"]):
            continue

        print(f"\n  [{i+1}/2] {test['label']}")

        result = run_audio_inference(
            model, processor, test["file"], PROMPT_ASR, f"{test['label']}-asr"
        )
        result["prompt"] = "asr_only"
        results["tests"].append(result)

        if result.get("error"):
            print(f"    ERROR: {result['error']}")
        else:
            print(f"    Time: {result['gen_time']}s | Response: {result['response'][:200]}")

    # Clear cache between tests
    try:
        import mlx.core as mx
        mx.metal.clear_cache()
    except:
        pass

    # Summary
    valid = [t for t in results["tests"] if not t.get("error")]
    if valid:
        print(f"\n{'='*60}")
        print(f"Summary:")
        print(f"  Total tests: {len(results['tests'])}")
        print(f"  Successful: {len(valid)}")
        print(f"  Failed: {len(results['tests']) - len(valid)}")
        print(f"  Avg time: {sum(t['gen_time'] for t in valid) / len(valid):.2f}s")
        print(f"  Avg speed: {sum(t['tokens_per_sec'] for t in valid) / len(valid):.1f} tok/s")

    output = json.dumps(results, indent=2, ensure_ascii=False)
    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"\nResults saved to {args.output}")
    else:
        print(f"\n{'='*60}")
        print("FULL RESULTS JSON:")
        print(output)


if __name__ == "__main__":
    main()