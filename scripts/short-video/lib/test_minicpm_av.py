#!/usr/bin/env python3
"""
MiniCPM-o 4.5 audio + video combined test on M2 Pro 32GB.

Tests true omni-modal capability: simultaneously processing video frames
and audio from the same source, or from different sources.

Usage:
    python test_minicpm_av.py
"""

import json
import os
import sys
import time

MODEL_PATH = os.path.expanduser("~/models/MiniCPM-o-4_5-4bit")
ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")

# ─── Test cases ───

TESTS = [
    {
        "label": "pexels-alibaba-av",
        "video": os.path.join(ASSETS_DIR, "pexels-video-alibaba-01.mp4"),
        "audio": "/tmp/pexels-video-alibaba-01-audio.wav",
        "desc": "Pexels Alibaba video with its own audio track",
    },
    {
        "label": "feathertalk-av",
        "video": "/tmp/feathertalk-10s-video.mp4",
        "audio": "/tmp/feathertalk-10s.wav",
        "desc": "Feathertalk 10s clip with its audio",
    },
    {
        "label": "scene-10-video + tts-audio",
        "video": os.path.join(ASSETS_DIR, "scene-10.mp4"),
        "audio": os.path.join(ASSETS_DIR, "tts-comparison", "indextts-emotion", "indextts-hook-shock-zh.wav"),
        "desc": "Scene-10 video (no audio) + TTS hook-shock Chinese audio",
    },
]

# ─── Combined analysis prompt ───

PROMPT_AV = """Analyze this video with its audio for use in short video production. Provide your analysis as Markdown:

## Visual Description
1-2 sentences describing what is happening visually.

## Audio Transcription
Transcribe the speech in the audio (if any).

## Audio Emotion
The primary emotion in the audio: happy, sad, angry, surprised, fearful, disgusted, neutral, excited, calm

## Audio-Visual Alignment
How well does the audio match the visual content? Are they telling the same story?

## Content Kind
One of: product_demo, talking_head, landscape, chart, text_screenshot, other

## Production Notes
1-2 sentences of notes for short video production (e.g., "voiceover matches B-roll well", "audio is unrelated to visual").
"""

PROMPT_AV_SIMPLE = """Describe what you see in the video and what you hear in the audio. Give a 2-3 sentence summary."""


def load_model():
    from mlx_vlm import load

    print(f"\n{'='*60}")
    print(f"Loading MiniCPM-o 4.5 (MLX 4bit)...")
    print(f"{'='*60}")

    t0 = time.time()
    model, processor = load(MODEL_PATH)
    load_time = time.time() - t0

    print(f"  Loaded in {load_time:.1f}s")
    return model, processor, load_time


def run_av_inference(model, processor, video_path, audio_path, prompt_text, label=""):
    from mlx_vlm import generate
    from mlx_vlm.prompt_utils import apply_chat_template as mlx_apply_chat_template
    from mlx_vlm.generate.video import (
        processor_handles_video,
        resolve_video_inputs,
    )

    # Sample video frames (MiniCPM-o has no native video support)
    if not processor_handles_video(processor):
        resolution = resolve_video_inputs(
            processor, [video_path], fps=2.0, max_frames=16,
        )
        frame_paths = resolution.images
    else:
        frame_paths = None

    num_images = len(frame_paths) if frame_paths else 0
    num_audios = 1

    try:
        prompt = mlx_apply_chat_template(
            processor,
            model.config,
            prompt_text,
            add_generation_prompt=True,
            num_images=num_images,
            num_audios=num_audios,
        )
    except Exception as e:
        return {"label": label, "error": f"chat_template failed: {e}", "response": ""}

    t0 = time.time()
    try:
        kwargs = {
            "temperature": 0.0,
            "max_tokens": 500,
            "verbose": False,
        }
        if frame_paths:
            kwargs["image"] = frame_paths
        if audio_path:
            kwargs["audio"] = [audio_path]

        response = generate(
            model, processor, prompt=prompt, **kwargs,
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
        "num_frames": num_images,
        "response": text,
        "gen_time": round(gen_time, 2),
        "token_count": token_count,
        "tokens_per_sec": round(token_count / gen_time, 1) if gen_time > 0 else 0,
        "error": None,
    }


def main():
    model, processor, load_time = load_model()

    results = {
        "model": "MiniCPM-o 4.5 (MLX 4bit)",
        "load_time": load_time,
        "tests": [],
    }

    print(f"\n{'='*60}")
    print(f"Test: Audio + Video Combined Analysis ({len(TESTS)} cases)")
    print(f"{'='*60}")

    for i, test in enumerate(TESTS):
        if not os.path.exists(test["video"]):
            print(f"\n  [{i+1}/{len(TESTS)}] {test['label']}: VIDEO NOT FOUND")
            continue
        if not os.path.exists(test["audio"]):
            print(f"\n  [{i+1}/{len(TESTS)}] {test['label']}: AUDIO NOT FOUND")
            continue

        print(f"\n  [{i+1}/{len(TESTS)}] {test['label']}")
        print(f"    {test['desc']}")

        result = run_av_inference(
            model, processor, test["video"], test["audio"],
            PROMPT_AV, test["label"],
        )
        results["tests"].append(result)

        if result.get("error"):
            print(f"    ERROR: {result['error']}")
        else:
            print(f"    Frames: {result.get('num_frames', 0)} | Time: {result['gen_time']}s | Tokens: {result['token_count']} | Speed: {result['tokens_per_sec']} tok/s")
            print(f"    Response:")
            for line in result["response"].split("\n"):
                if line.strip():
                    print(f"      {line}")

    # Summary
    valid = [t for t in results["tests"] if not t.get("error")]
    if valid:
        print(f"\n{'='*60}")
        print(f"Summary:")
        print(f"  Total: {len(results['tests'])}, Success: {len(valid)}, Failed: {len(results['tests']) - len(valid)}")
        print(f"  Avg time: {sum(t['gen_time'] for t in valid) / len(valid):.2f}s")
        print(f"  Avg speed: {sum(t['tokens_per_sec'] for t in valid) / len(valid):.1f} tok/s")

    output = json.dumps(results, indent=2, ensure_ascii=False)
    out_path = "/tmp/minicpm-av-results.json"
    with open(out_path, "w") as f:
        f.write(output)
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()