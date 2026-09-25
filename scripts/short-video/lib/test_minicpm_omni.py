#!/usr/bin/env python3
"""
MiniCPM-o 4.5 vs Qwen3-VL-30B-A3B benchmark on M2 Pro 32GB.

Uses the exact same production prompts as vlm_analyzer.py to ensure
the comparison reflects real-world performance, not synthetic benchmarks.

Usage:
    # Test MiniCPM-o 4.5 only
    python test_minicpm_omni.py --model minicpm

    # Test Qwen3-VL-30B-A3B only
    python test_minicpm_omni.py --model qwen

    # Test both sequentially (loads/unloads each model)
    python test_minicpm_omni.py --model both

    # Test a single asset
    python test_minicpm_omni.py --model minicpm --asset path/to/image.jpg
"""

import argparse
import json
import os
import sys
import tempfile
import time
import traceback
from pathlib import Path

from PIL import Image, ImageOps

# ─── Image preprocessing (mirrors vlm_analyzer.py production logic) ───

MAX_IMAGE_LONG_EDGE = 1920


def resize_image_if_needed(img_path):
    """Resize image if longest edge > MAX_IMAGE_LONG_EDGE.

    Applies EXIF transpose normalization before dimension check, then
    Lanczos resize to MAX_IMAGE_LONG_EDGE. Returns (path_to_use, temp_path).
    If no resize needed, returns (img_path, None).
    """
    try:
        img = Image.open(img_path)
        img = ImageOps.exif_transpose(img)
        w, h = img.size
        longest = max(w, h)
        if longest <= MAX_IMAGE_LONG_EDGE:
            return img_path, None

        scale = MAX_IMAGE_LONG_EDGE / longest
        new_w, new_h = int(w * scale), int(h * scale)
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        fd, tmp = tempfile.mkstemp(suffix=".jpg")
        os.close(fd)
        img.save(tmp, "JPEG", quality=90)
        print(f"    [preprocess] Resized {os.path.basename(img_path)} "
              f"from {w}x{h} to {new_w}x{new_h}")
        return tmp, tmp
    except Exception as e:
        print(f"    [preprocess] Resize failed, using original: {e}")
        return img_path, None

# ─── Production prompts (copied from vlm_analyzer.py) ───

SEMANTICS_PROMPT_IMAGE = """Analyze this image for use in a 9:16 vertical video. Provide your analysis as Markdown with the following sections:

## Description
1-2 sentences describing what is happening in this image.

## Subjects
Comma-separated key subject terms (e.g., "robot, kitchen, product").

## Content Kind
One of: product_demo, talking_head, landscape, chart, text_screenshot, other

## Fit
"cover" or "contain" — will this image be placed in a 9:16 vertical canvas? Use "cover" if edge content is non-critical and can be cropped. Use "contain" if edges have text/UI that must not be cropped.

## Critical Edge Text
"yes" or "no" followed by a brief note if yes (e.g., "yes — bottom edge has product label text").

## Reason
One sentence explaining the fit decision.

Example:
## Description
A humanoid robot demonstrating household tasks in a kitchen setting.

## Subjects
robot, kitchen, product

## Content Kind
product_demo

## Fit
contain

## Critical Edge Text
yes — bottom edge has product label text

## Reason
Bottom edge has product label text that would be cropped in vertical format.
"""

SEMANTICS_PROMPT_VIDEO = """Analyze this video for use in a 9:16 vertical video. Provide your analysis as Markdown with the following sections:

## Description
1-2 sentences describing what is happening in this video.

## Subjects
Comma-separated key subject terms (e.g., "robot, factory, mobility").

## Content Kind
One of: product_demo, talking_head, landscape, chart, text_screenshot, other

Example:
## Description
A humanoid robot walking through a factory floor, demonstrating mobility.

## Subjects
robot, factory, mobility

## Content Kind
talking_head
"""

# ─── Model configs ───

MODELS = {
    "minicpm": {
        "path": os.path.expanduser("~/models/MiniCPM-o-4_5-4bit"),
        "name": "MiniCPM-o 4.5 (MLX 4bit)",
        "max_tokens": 1000,
    },
    "qwen": {
        "path": os.path.expanduser("~/models/Qwen3-VL-30B-A3B-Instruct-4bit"),
        "name": "Qwen3-VL-30B-A3B (MLX 4bit)",
        "max_tokens": 1000,
    },
}

# ─── Test assets ───

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")

TEST_IMAGES = [
    "pexels-alibaba-01.jpg",
    "pexels-dc-server.jpg",
    "pexels-chart-01.jpg",
]

TEST_VIDEOS = [
    "pexels-video-alibaba-01.mp4",
    "scene-1-seed1024.mp4",
    "scene-10.mp4",
]


def load_model(model_key):
    """Load a model and processor, return (model, processor, load_time)."""
    from mlx_vlm import load

    cfg = MODELS[model_key]
    print(f"\n{'='*60}")
    print(f"Loading {cfg['name']}...")
    print(f"  Path: {cfg['path']}")
    print(f"{'='*60}")

    t0 = time.time()
    model, processor = load(cfg["path"])
    load_time = time.time() - t0

    print(f"  Loaded in {load_time:.1f}s")
    return model, processor, load_time


def unload_model(model, processor):
    """Force unload model to free memory."""
    import gc
    import mlx.core as mx

    del model
    del processor
    gc.collect()
    mx.metal.clear_cache()


def run_inference(model, processor, model_key, asset_path, is_video):
    """Run a single inference and return result dict with timing."""
    from mlx_vlm import generate
    from mlx_vlm.prompt_utils import apply_chat_template as mlx_apply_chat_template
    from mlx_vlm.generate.video import (
        processor_handles_video,
        resolve_video_inputs,
    )

    cfg = MODELS[model_key]
    prompt_text = SEMANTICS_PROMPT_VIDEO if is_video else SEMANTICS_PROMPT_IMAGE

    image_path = asset_path
    temp_path = None
    if not is_video:
        image_path, temp_path = resize_image_if_needed(asset_path)

    if model_key == "minicpm":
        if is_video and not processor_handles_video(processor):
            resolution = resolve_video_inputs(
                processor, [asset_path], fps=2.0, max_frames=16,
            )
            frame_paths = resolution.images
            try:
                prompt = mlx_apply_chat_template(
                    processor, model.config, prompt_text,
                    add_generation_prompt=True,
                    num_images=len(frame_paths),
                )
            except Exception as e:
                return {"asset": asset_path, "error": f"chat_template failed: {e}", "response": ""}

            t0 = time.time()
            try:
                response = generate(
                    model, processor, prompt=prompt, image=frame_paths,
                    temperature=0.0, max_tokens=cfg["max_tokens"], verbose=False,
                )
            except Exception as e:
                return {"asset": asset_path, "error": f"generate failed: {e}", "response": "", "gen_time": time.time() - t0}
        else:
            num_images = 0 if is_video else 1
            ct_kwargs = {}
            if is_video:
                ct_kwargs["video"] = [asset_path]
                ct_kwargs["fps"] = 2.0
            try:
                prompt = mlx_apply_chat_template(
                    processor, model.config, prompt_text,
                    add_generation_prompt=True,
                    num_images=num_images,
                    **ct_kwargs,
                )
            except Exception as e:
                return {"asset": asset_path, "error": f"chat_template failed: {e}", "response": ""}

            t0 = time.time()
            try:
                if is_video:
                    response = generate(
                        model, processor, prompt=prompt, video=asset_path,
                        temperature=0.0, max_tokens=cfg["max_tokens"], verbose=False,
                    )
                else:
                    response = generate(
                        model, processor, prompt=prompt, image=[image_path],
                        temperature=0.0, max_tokens=cfg["max_tokens"], verbose=False,
                    )
            except Exception as e:
                return {"asset": asset_path, "error": f"generate failed: {e}", "response": "", "gen_time": time.time() - t0}
    else:
        content = []
        if is_video:
            content.append({"type": "video", "video": asset_path})
        else:
            content.append({"type": "image", "image": image_path})
        content.append({"type": "text", "text": prompt_text})
        messages = [{"role": "user", "content": content}]
        try:
            prompt = processor.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )
        except Exception as e:
            return {"asset": asset_path, "error": f"chat_template failed: {e}", "response": ""}

        t0 = time.time()
        try:
            if is_video:
                response = generate(
                    model, processor, prompt=prompt, video=asset_path,
                    temperature=0.0, max_tokens=cfg["max_tokens"], verbose=False,
                )
            else:
                response = generate(
                    model, processor, prompt=prompt, image=[image_path],
                    temperature=0.0, max_tokens=cfg["max_tokens"], verbose=False,
                )
        except Exception as e:
            return {"asset": asset_path, "error": f"generate failed: {e}", "response": "", "gen_time": time.time() - t0}

    if temp_path:
        try:
            os.unlink(temp_path)
        except OSError:
            pass

    gen_time = time.time() - t0

    if hasattr(response, "text"):
        text = response.text
    elif isinstance(response, dict):
        text = response.get("text", str(response))
    else:
        text = str(response)

    token_count = len(text.split())

    return {
        "asset": os.path.basename(asset_path),
        "type": "video" if is_video else "image",
        "response": text,
        "gen_time": round(gen_time, 2),
        "token_count": token_count,
        "tokens_per_sec": round(token_count / gen_time, 1) if gen_time > 0 else 0,
        "error": None,
    }


def test_model(model_key, assets=None):
    """Run full test suite for one model."""
    results = {
        "model": MODELS[model_key]["name"],
        "model_key": model_key,
        "load_time": 0,
        "inferences": [],
        "summary": {},
    }

    model, processor, load_time = load_model(model_key)
    results["load_time"] = round(load_time, 1)

    # Determine assets to test
    if assets:
        test_items = []
        for a in assets:
            ext = os.path.splitext(a)[1].lower()
            is_vid = ext in (".mp4", ".mov", ".webm", ".avi")
            test_items.append((a, is_vid))
    else:
        test_items = []
        for img in TEST_IMAGES:
            p = os.path.join(ASSETS_DIR, img)
            if os.path.exists(p):
                test_items.append((p, False))
        for vid in TEST_VIDEOS:
            p = os.path.join(ASSETS_DIR, vid)
            if os.path.exists(p):
                test_items.append((p, True))

    print(f"\nTesting {len(test_items)} assets...")
    for i, (path, is_vid) in enumerate(test_items):
        label = "VIDEO" if is_vid else "IMAGE"
        print(f"\n  [{i+1}/{len(test_items)}] {label}: {os.path.basename(path)}")

        result = run_inference(model, processor, model_key, path, is_vid)
        results["inferences"].append(result)

        if result.get("error"):
            print(f"    ERROR: {result['error']}")
        else:
            print(f"    Time: {result['gen_time']}s | "
                  f"Tokens: {result['token_count']} | "
                  f"Speed: {result['tokens_per_sec']} tok/s")
            preview = result["response"][:200].replace("\n", " ")
            print(f"    Preview: {preview}...")

    # Summary
    valid = [r for r in results["inferences"] if not r.get("error")]
    if valid:
        results["summary"] = {
            "total_assets": len(test_items),
            "successful": len(valid),
            "failed": len(test_items) - len(valid),
            "avg_gen_time": round(sum(r["gen_time"] for r in valid) / len(valid), 2),
            "avg_tokens_per_sec": round(
                sum(r["tokens_per_sec"] for r in valid) / len(valid), 1
            ),
        }
        print(f"\n  Summary: {results['summary']}")

    unload_model(model, processor)
    return results


def main():
    parser = argparse.ArgumentParser(description="MiniCPM-o 4.5 benchmark")
    parser.add_argument(
        "--model", choices=["minicpm", "qwen", "both"], default="minicpm",
        help="Which model to test"
    )
    parser.add_argument(
        "--asset", action="append", default=None,
        help="Specific asset path(s) to test (default: standard test set)"
    )
    parser.add_argument(
        "--output", default=None,
        help="Output JSON file (default: stdout)"
    )
    args = parser.parse_args()

    all_results = []

    if args.model in ("minicpm", "both"):
        r = test_model("minicpm", args.asset)
        all_results.append(r)

    if args.model in ("qwen", "both"):
        r = test_model("qwen", args.asset)
        all_results.append(r)

    output = json.dumps(all_results, indent=2, ensure_ascii=False)
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