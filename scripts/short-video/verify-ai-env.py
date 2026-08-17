#!/usr/bin/env python3
"""
Smoke test for the unified video AI environment.

Verifies that all four core components can be imported and report their
versions. Does NOT download models or run inference — that is covered by
the full pipeline run.

Usage:
  python3 verify-ai-env.py

Exit codes:
  0 — all components imported successfully
  1 — one or more components failed to import
"""
import sys


def check_import(module_name, display_name=None):
    """Try to import a module and print its version."""
    name = display_name or module_name
    try:
        mod = __import__(module_name)
        version = getattr(mod, "__version__", "unknown")
        print(f"  ✓ {name} ({version})")
        return True
    except ImportError as e:
        print(f"  ✗ {name} — ImportError: {e}")
        return False
    except Exception as e:
        print(f"  ✗ {name} — {type(e).__name__}: {e}")
        return False


def main():
    print(f"Python: {sys.version}")
    print(f"Executable: {sys.executable}")
    print()

    # ── Core components ──
    print("Checking core components:")
    results = []

    # 1. F5-TTS-MLX
    results.append(check_import("f5_tts_mlx", "F5-TTS-MLX"))

    # 2. Qwen-TTS
    results.append(check_import("qwen_tts", "Qwen-TTS"))

    # 3. WhisperX (subtitle alignment)
    results.append(check_import("whisperx", "WhisperX"))

    # 4. MLX-VLM (asset analysis)
    results.append(check_import("mlx_vlm", "MLX-VLM"))

    # ── Supporting libraries ──
    print("\nChecking supporting libraries:")
    results.append(check_import("torch", "PyTorch"))
    results.append(check_import("transformers", "Transformers"))
    results.append(check_import("soundfile", "SoundFile"))
    results.append(check_import("librosa", "Librosa"))
    results.append(check_import("mlx", "MLX"))
    results.append(check_import("numpy", "NumPy"))

    # ── Summary ──
    passed = sum(results)
    total = len(results)
    print(f"\n{'='*40}")
    print(f"Results: {passed}/{total} passed")
    print(f"{'='*40}")

    if passed < total:
        print("\n⚠️  Some components failed. The pipeline will degrade gracefully.")
        sys.exit(1)
    else:
        print("\n✅ All components available.")
        sys.exit(0)


if __name__ == "__main__":
    main()
