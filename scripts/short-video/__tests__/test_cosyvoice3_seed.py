"""Tests for the per-scene RNG seeding helpers in cosyvoice3_mlx_batch_tts.py (#704).

Run via the suite runner: npm run test:python.
These tests do NOT load the CosyVoice3 model, download anything or run
generation — MLX is replaced with a fake module injected into sys.modules.
"""
import os
import random
import sys
import types

import numpy as np
import pytest

# Add parent dir to path so we can import from cosyvoice3_mlx_batch_tts
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import cosyvoice3_mlx_batch_tts as batch_tts


class Recorder:
    """Callable that records every invocation."""

    def __init__(self):
        self.calls = []

    def __call__(self, *args, **kwargs):
        self.calls.append((args, kwargs))


@pytest.fixture
def install_fake_mlx(monkeypatch):
    """Install a fake ``mlx`` package + ``mlx.core`` module for the test."""

    def _install(core):
        package = types.ModuleType("mlx")
        package.core = core
        monkeypatch.setitem(sys.modules, "mlx", package)
        monkeypatch.setitem(sys.modules, "mlx.core", core)
        return core

    return _install


# ── resolve_seed_base ──────────────────────────────────────────────────────


def test_resolve_seed_base_env_override():
    assert batch_tts.resolve_seed_base({"COSYVOICE3_SEED": "123456"}) == 123456


def test_resolve_seed_base_invalid_value_raises():
    with pytest.raises(ValueError):
        batch_tts.resolve_seed_base({"COSYVOICE3_SEED": "not-a-number"})

    with pytest.raises(ValueError):
        batch_tts.resolve_seed_base({"COSYVOICE3_SEED": ""})


def test_resolve_seed_base_unset_draws_entropy(monkeypatch):
    seen_bits = []

    def fake_randbits(bits):
        seen_bits.append(bits)
        return 0x2A

    monkeypatch.setattr(batch_tts.secrets, "randbits", fake_randbits)
    seed = batch_tts.resolve_seed_base({})
    assert seed == 0x2A
    assert seen_bits == [31]
    assert isinstance(seed, int) and seed >= 0


def test_resolve_seed_base_defaults_to_process_environ(monkeypatch):
    monkeypatch.setenv("COSYVOICE3_SEED", "777")
    assert batch_tts.resolve_seed_base() == 777


# ── scene_seed ─────────────────────────────────────────────────────────────


def test_scene_seed_is_deterministic():
    assert batch_tts.scene_seed(7, 3) == batch_tts.scene_seed(7, 3)
    assert batch_tts.scene_seed("7", "3") == batch_tts.scene_seed(7, 3)


def test_scene_seed_differs_per_scene_id():
    seeds = {batch_tts.scene_seed(1234, scene_id) for scene_id in range(1, 33)}
    assert len(seeds) == 32


def test_scene_seed_stays_non_negative_for_large_ids():
    for base, scene_id in [(0, 10**9), (0x7FFFFFFF, 10**12), (-5, 4)]:
        seed = batch_tts.scene_seed(base, scene_id)
        assert 0 <= seed <= 0x7FFFFFFF


# ── seed_scene_rngs ────────────────────────────────────────────────────────


def test_seed_scene_rngs_seeds_mlx_numpy_and_random(install_fake_mlx):
    core = types.ModuleType("mlx.core")
    core.random = types.SimpleNamespace(seed=Recorder())
    install_fake_mlx(core)

    returned = batch_tts.seed_scene_rngs(4242)

    assert returned == 4242
    assert core.random.seed.calls == [((4242,), {})]
    # numpy and stdlib RNGs must be reset to the same stream.
    assert np.random.rand() == np.random.RandomState(4242).rand()
    assert random.random() == random.Random(4242).random()


def test_seed_scene_rngs_masks_negative_seed(install_fake_mlx):
    core = types.ModuleType("mlx.core")
    core.random = types.SimpleNamespace(seed=Recorder())
    install_fake_mlx(core)

    returned = batch_tts.seed_scene_rngs(-1)

    assert returned == 0x7FFFFFFF
    assert core.random.seed.calls == [((0x7FFFFFFF,), {})]


# ── clear_mlx_cache ────────────────────────────────────────────────────────


def test_clear_cache_prefers_mx_clear_cache(install_fake_mlx):
    core = types.ModuleType("mlx.core")
    core.clear_cache = Recorder()
    core.metal = types.SimpleNamespace(clear_cache=Recorder())
    install_fake_mlx(core)

    batch_tts.clear_mlx_cache()

    assert len(core.clear_cache.calls) == 1
    assert core.metal.clear_cache.calls == []


def test_clear_cache_falls_back_to_metal(install_fake_mlx):
    core = types.ModuleType("mlx.core")
    core.metal = types.SimpleNamespace(clear_cache=Recorder())
    install_fake_mlx(core)

    batch_tts.clear_mlx_cache()

    assert len(core.metal.clear_cache.calls) == 1


def test_clear_cache_is_noop_without_api(install_fake_mlx):
    core = types.ModuleType("mlx.core")
    install_fake_mlx(core)

    batch_tts.clear_mlx_cache()  # must not raise


def test_clear_cache_swallows_runtime_error(install_fake_mlx):
    def boom():
        raise RuntimeError("Metal device lost")

    core = types.ModuleType("mlx.core")
    core.clear_cache = boom
    install_fake_mlx(core)

    batch_tts.clear_mlx_cache()  # logged to stderr, not raised


def test_clear_cache_does_not_swallow_keyboard_interrupt(install_fake_mlx):
    def interrupt():
        raise KeyboardInterrupt()

    core = types.ModuleType("mlx.core")
    core.clear_cache = interrupt
    install_fake_mlx(core)

    with pytest.raises(KeyboardInterrupt):
        batch_tts.clear_mlx_cache()
