"""Tests for CosyVoice3-MLX model directory resolution (#327).

The default moved from ``~/.cosyvoice3-mlx-model`` to
``~/models/cosyvoice3-mlx`` with the old path kept as an automatic fallback.
These tests only exercise the resolver: no model is loaded, nothing is
downloaded and no generation runs.
"""
import os
import sys

# Add parent dir to path so we can import from cosyvoice3_mlx_batch_tts
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import cosyvoice3_mlx_batch_tts as batch_tts


def _make_home(tmp_path, canonical=False, legacy=False):
    home = tmp_path / "home"
    home.mkdir()
    if canonical:
        (home / "models" / "cosyvoice3-mlx").mkdir(parents=True)
    if legacy:
        (home / ".cosyvoice3-mlx-model").mkdir()
    return home


def _new_path(home):
    return os.path.join(str(home), "models", "cosyvoice3-mlx")


def _legacy_path(home):
    return os.path.join(str(home), ".cosyvoice3-mlx-model")


def test_cli_value_beats_env(tmp_path):
    home = _make_home(tmp_path)

    resolved = batch_tts.resolve_model_dir(
        cli_value="/cli/cv3-model",
        env={
            "HOME": str(home),
            "COSYVOICE3_MLX_MODEL_DIR": "/env/cv3-model",
        },
    )

    assert resolved == "/cli/cv3-model"


def test_env_beats_default_and_is_used_verbatim(tmp_path):
    home = _make_home(tmp_path, canonical=True)

    resolved = batch_tts.resolve_model_dir(
        env={
            "HOME": str(home),
            "COSYVOICE3_MLX_MODEL_DIR": "/env/cv3-model",
        }
    )

    assert resolved == "/env/cv3-model"


def test_prefers_new_path_when_both_exist(tmp_path):
    home = _make_home(tmp_path, canonical=True, legacy=True)

    assert batch_tts.resolve_model_dir(env={"HOME": str(home)}) == _new_path(home)


def test_skips_non_directory_at_new_path_and_falls_back_to_legacy(tmp_path):
    home = _make_home(tmp_path, legacy=True)
    (home / "models").mkdir()
    (home / "models" / "cosyvoice3-mlx").write_text("not a directory")

    assert batch_tts.resolve_model_dir(env={"HOME": str(home)}) == _legacy_path(home)


def test_falls_back_to_legacy_when_only_it_exists(tmp_path):
    home = _make_home(tmp_path, legacy=True)

    assert batch_tts.resolve_model_dir(env={"HOME": str(home)}) == _legacy_path(home)


def test_returns_new_path_when_neither_exists(tmp_path):
    home = _make_home(tmp_path)

    assert batch_tts.resolve_model_dir(env={"HOME": str(home)}) == _new_path(home)


def test_home_parameter_overrides_env_home(tmp_path):
    home = _make_home(tmp_path, legacy=True)

    resolved = batch_tts.resolve_model_dir(env={}, home=str(home))

    assert resolved == _legacy_path(home)
