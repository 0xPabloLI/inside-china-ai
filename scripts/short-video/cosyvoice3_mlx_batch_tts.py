#!/usr/bin/env python3
"""
CosyVoice3-MLX batch TTS generator — loads model ONCE, processes ALL scenes.
Uses voice cloning via reference audio + instruct_text for emotion control.

CosyVoice3-MLX supports simultaneous ref_audio + instruct_text + speed control.
MLX version auto-appends <|endofprompt|> — do NOT include it in instruct_text.

Usage:
  python cosyvoice3_mlx_batch_tts.py --manifest /path/to/manifest.json --output-dir /path/to/audio/

Environment:
  COSYVOICE3_REF_AUDIO — path to ref-audio WAV (24kHz)
  COSYVOICE3_REF_TEXT  — exact transcription of ref-audio
  COSYVOICE3_SPEED     — speech speed multiplier (default: 1.0)
  COSYVOICE3_MLX_MODEL_DIR — model directory (default: ~/models/cosyvoice3-mlx;
                         the pre-#327 ~/.cosyvoice3-mlx-model is auto-detected
                         when the new path is absent)
  COSYVOICE3_SEED      — optional int seed for reproducible takes; when unset,
                         each process draws its own entropy base seed (#704)
"""
import argparse
import json
import sys
import os
import secrets
import time
import subprocess

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

# Per-scene seeds are spread by a prime stride so neighbouring scene ids never
# share a seed, then masked into MLX's non-negative 31-bit seed range.
SCENE_SEED_STRIDE = 1009
SEED_MASK = 0x7FFFFFFF

# #327: models live under ~/models/. The pre-#327 install used a hidden
# dot-directory; the resolver keeps that working as a fallback without moving
# or deleting the user's existing model.
CV3_MODEL_RELATIVE_PATH = os.path.join("models", "cosyvoice3-mlx")
CV3_LEGACY_MODEL_DIRNAME = ".cosyvoice3-mlx-model"


def resolve_model_dir(cli_value=None, env=None, home=None):
    """Resolve the CosyVoice3-MLX model directory (#327).

    Priority:
    1. ``cli_value`` (``--model-dir``) — explicit, used verbatim.
    2. ``COSYVOICE3_MLX_MODEL_DIR`` — explicit, used verbatim (no existence
       probe: a wrong path must fail loudly at model load, not silently
       fall back).
    3. ``<home>/models/cosyvoice3-mlx`` when it exists.
    4. ``<home>/.cosyvoice3-mlx-model`` when it exists (pre-#327 install).
    5. ``<home>/models/cosyvoice3-mlx`` — canonical default, so the eventual
       error names the location the model is expected to live in.
    """
    if cli_value:
        return cli_value

    if env is None:
        env = os.environ
    explicit = env.get("COSYVOICE3_MLX_MODEL_DIR")
    if explicit:
        return explicit

    home_dir = home or env.get("HOME") or os.path.expanduser("~")
    candidates = [
        os.path.join(home_dir, CV3_MODEL_RELATIVE_PATH),
        os.path.join(home_dir, CV3_LEGACY_MODEL_DIRNAME),
    ]
    for candidate in candidates:
        if os.path.isdir(candidate):
            return candidate
    return candidates[0]


def resolve_seed_base(env=os.environ):
    """Return the batch-wide base seed.

    ``COSYVOICE3_SEED`` pins the run for reproducibility; otherwise a fresh
    31-bit entropy seed is drawn once per process, so separate runs cannot
    converge on the same (sometimes broken) take. Invalid values fail fast
    instead of being silently ignored.
    """
    raw = env.get("COSYVOICE3_SEED")
    if raw is None:
        return secrets.randbits(31)
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"COSYVOICE3_SEED must be an integer, got {raw!r}"
        ) from exc


def scene_seed(base_seed, scene_id):
    """Deterministic non-negative seed for one scene."""
    return (int(base_seed) + int(scene_id) * SCENE_SEED_STRIDE) & SEED_MASK


def seed_scene_rngs(seed):
    """Seed MLX, numpy and stdlib RNGs for one scene and return the seed.

    mlx_audio's flow calls ``mx.random.seed(0)`` after every scene while the
    LLM sampler draws through ``mx.random.categorical``, so without an explicit
    per-scene seed every scene in a batch collapses onto the same take (#704).
    """
    seed = int(seed) & SEED_MASK
    import mlx.core as mx

    mx.random.seed(seed)

    import numpy as np

    np.random.seed(seed)

    import random

    random.seed(seed)
    return seed


def clear_mlx_cache():
    """Best-effort MLX cache clear between scenes.

    Generation must never abort because the cache API is missing or fails;
    KeyboardInterrupt/SystemExit still propagate (they are BaseException).
    """
    try:
        import mlx.core as mx

        clear = getattr(mx, "clear_cache", None)
        if clear is None:
            clear = getattr(getattr(mx, "metal", None), "clear_cache", None)
        if clear is not None:
            clear()
    except Exception as exc:  # noqa: BLE001 - cache clearing is opportunistic
        print(f"Warning: MLX cache clear failed: {exc}", file=sys.stderr)


def generate_batch(manifest_path, output_dir, ref_audio, ref_text, speed=1.0, model_dir=None):
    base_seed = resolve_seed_base()
    print(f"Random base seed: {base_seed}", file=sys.stderr)

    from mlx_audio.tts.generate import load_model, generate_audio

    with open(manifest_path, "r") as f:
        scenes = json.load(f)

    if model_dir is None:
        model_dir = resolve_model_dir()

    print(f"\nLoading CosyVoice3-MLX model from {model_dir}...", file=sys.stderr)
    t0 = time.time()
    model = load_model(model_path=model_dir)
    print(f"Model loaded in {time.time()-t0:.1f}s", file=sys.stderr)
    print(f"Processing {len(scenes)} scenes (speed={speed})...\n", file=sys.stderr)

    results = []
    for scene in scenes:
        scene_id = scene["sceneId"]
        text = scene["text"]
        output_name = scene.get("output", f"scene-{scene_id}.wav").replace(".mp3", ".wav")
        output_path = os.path.join(output_dir, output_name)
        file_prefix = output_path.replace(".wav", "")
        item_ref_audio = scene.get("ref_audio") or ref_audio
        item_ref_text = scene.get("ref_text") or ref_text
        instruct_text = scene.get("instruct_text")

        print(f"  Scene {scene_id}: generating {len(text)} chars...", file=sys.stderr)
        if instruct_text:
            print(f"    instruct: {instruct_text[:60]}...", file=sys.stderr)
        t2 = time.time()

        gen_kwargs = dict(
            text=text,
            model=model,
            ref_audio=item_ref_audio,
            ref_text=item_ref_text,
            speed=speed,
            file_prefix=file_prefix,
            audio_format="wav",
            verbose=False,
        )
        if instruct_text:
            gen_kwargs["instruct_text"] = instruct_text

        seed = scene_seed(base_seed, scene_id)
        seed_scene_rngs(seed)
        print(f"    Scene {scene_id} seed: {seed}", file=sys.stderr)

        generate_audio(**gen_kwargs)
        t3 = time.time()
        clear_mlx_cache()

        dur_result = subprocess.run(
            ["ffprobe", "-i", output_path, "-show_entries", "format=duration", "-v", "quiet", "-of", "csv=p=0"],
            capture_output=True, text=True
        )
        duration = float(dur_result.stdout.strip()) if dur_result.stdout.strip() else 0.0

        print(f"    Duration: {duration:.2f}s, RTF: {(t3 - t2) / max(duration, 0.01):.2f}x", file=sys.stderr)

        results.append({
            "sceneId": scene_id,
            "audioPath": os.path.abspath(output_path),
            "duration": duration,
        })

    print(f"\nAll {len(scenes)} scenes processed!", file=sys.stderr)
    print(json.dumps(results))
    return results


def main():
    parser = argparse.ArgumentParser(description="CosyVoice3-MLX batch TTS generator")
    parser.add_argument("--manifest", required=True, help="Path to JSON manifest file")
    parser.add_argument("--output-dir", required=True, help="Output directory for audio files")
    parser.add_argument("--ref-audio", help="Path to 24kHz ref-audio WAV")
    parser.add_argument("--ref-text", help="Exact transcription of ref-audio")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed multiplier")
    parser.add_argument("--model-dir", help="CosyVoice3-MLX model directory")

    args = parser.parse_args()

    ref_audio = args.ref_audio or os.environ.get("COSYVOICE3_REF_AUDIO")
    ref_text = args.ref_text or os.environ.get("COSYVOICE3_REF_TEXT")
    speed = float(os.environ.get("COSYVOICE3_SPEED", args.speed))
    model_dir = resolve_model_dir(cli_value=args.model_dir)

    if not ref_audio or not ref_text:
        print("Error: --ref-audio and --ref-text (or COSYVOICE3_REF_AUDIO/COSYVOICE3_REF_TEXT env vars) are required", file=sys.stderr)
        sys.exit(1)

    generate_batch(args.manifest, args.output_dir, ref_audio, ref_text, speed, model_dir)


if __name__ == "__main__":
    main()