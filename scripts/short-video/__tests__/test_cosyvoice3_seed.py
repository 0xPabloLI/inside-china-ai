"""Tests for the per-scene RNG seeding helpers in cosyvoice3_mlx_batch_tts.py (#704).

Run via the suite runner: npm run test:python.
These tests do NOT load the CosyVoice3 model, download anything or run
generation — MLX is replaced with a fake module injected into sys.modules.
"""
import json
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


# ── generate_batch wiring ──────────────────────────────────────────────────
#
# These helpers alone staying green is not enough: #704 regressed because
# generate_batch could stop calling them without any test noticing. The test
# below pins the per-scene call order inside generate_batch itself.

SCENE_TEXTS = {1: "Scene one voiceover text.", 2: "Scene two voiceover text."}


def _write_two_scene_manifest(tmp_path):
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            [
                {"sceneId": scene_id, "text": text, "output": f"scene-{scene_id}.wav"}
                for scene_id, text in SCENE_TEXTS.items()
            ]
        ),
        encoding="utf-8",
    )
    return manifest_path


@pytest.fixture
def fake_generation_stack(monkeypatch):
    """Fake ``mlx``/``mlx_audio`` sharing one ordered event log.

    Seeding, generation and cache clearing all append to ``events`` so that
    ``generate_batch``'s wiring (not just its helpers) can be asserted. No
    real model is loaded, no audio is written and ``ffprobe`` never runs.
    """
    events = []
    generate_calls = []
    load_calls = []
    model_sentinel = object()
    scene_by_text = {text: scene_id for scene_id, text in SCENE_TEXTS.items()}

    def record_seed(value):
        events.append(("seed", value))

    def record_clear():
        events.append(("clear",))

    core = types.ModuleType("mlx.core")
    core.random = types.SimpleNamespace(seed=record_seed)
    core.clear_cache = record_clear

    mlx_package = types.ModuleType("mlx")
    mlx_package.core = core
    monkeypatch.setitem(sys.modules, "mlx", mlx_package)
    monkeypatch.setitem(sys.modules, "mlx.core", core)

    def load_model(**kwargs):
        load_calls.append(kwargs)
        return model_sentinel

    def generate_audio(**kwargs):
        events.append(("gen", scene_by_text[kwargs["text"]]))
        generate_calls.append(kwargs)

    mlx_audio_package = types.ModuleType("mlx_audio")
    tts_package = types.ModuleType("mlx_audio.tts")
    generate_module = types.ModuleType("mlx_audio.tts.generate")
    generate_module.load_model = load_model
    generate_module.generate_audio = generate_audio
    mlx_audio_package.tts = tts_package
    tts_package.generate = generate_module
    monkeypatch.setitem(sys.modules, "mlx_audio", mlx_audio_package)
    monkeypatch.setitem(sys.modules, "mlx_audio.tts", tts_package)
    monkeypatch.setitem(sys.modules, "mlx_audio.tts.generate", generate_module)

    return types.SimpleNamespace(
        events=events,
        generate_calls=generate_calls,
        load_calls=load_calls,
        model_sentinel=model_sentinel,
    )


def test_generate_batch_seeds_each_scene_then_clears_cache(
    fake_generation_stack, monkeypatch, tmp_path
):
    """#704 wiring: seed(scene_seed(base, id)) -> generate -> clear, per scene.

    Deleting either the ``seed_scene_rngs(seed)`` or the ``clear_mlx_cache()``
    call from ``generate_batch`` must turn this test red.
    """
    stack = fake_generation_stack
    manifest_path = _write_two_scene_manifest(tmp_path)
    monkeypatch.setenv("COSYVOICE3_SEED", "42")
    monkeypatch.setattr(
        batch_tts.subprocess,
        "run",
        lambda *args, **kwargs: types.SimpleNamespace(stdout="1.0\n"),
    )

    results = batch_tts.generate_batch(
        str(manifest_path), str(tmp_path), "ref.wav", "ref text"
    )

    assert len(stack.load_calls) == 1, "the batch must load the model exactly once"
    assert stack.events == [
        ("seed", batch_tts.scene_seed(42, 1)),
        ("gen", 1),
        ("clear",),
        ("seed", batch_tts.scene_seed(42, 2)),
        ("gen", 2),
        ("clear",),
    ]
    # generate_audio ran once per scene, in manifest order.
    assert [call["text"] for call in stack.generate_calls] == [
        SCENE_TEXTS[1],
        SCENE_TEXTS[2],
    ]
    assert all(call["model"] is stack.model_sentinel for call in stack.generate_calls)
    # Exactly one cache clear per finished scene.
    assert sum(1 for event in stack.events if event[0] == "clear") == 2
    assert [item["sceneId"] for item in results] == [1, 2]
    assert [item["duration"] for item in results] == [1.0, 1.0]
