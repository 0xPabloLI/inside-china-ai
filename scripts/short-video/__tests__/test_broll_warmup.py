#!/usr/bin/env python3
"""
Tests for the #240 B-roll batch warm-up: prompt pre-encoding with ONE
text-encoder load per batch.

Background (#240 review + code evidence): the batch previously encoded each
job's prompt inline via the repo's get_prompt_embeds(), which reloads and
unloads the UMT5 text encoder for EVERY cache miss (measured 634s cold /
220s warm per reload; 9 unique prompts per 18-job batch). The warm-up phase
encodes all unique uncached prompts up front with a single encoder load,
then frees the encoder before the DiT loads (lower peak memory than the old
interleaved encode-while-DiT-resident flow).

Run with: python3 -m pytest __tests__/test_broll_warmup.py -v
Or:       python3 __tests__/test_broll_warmup.py

TDD: Tests written first (red), implementation second (green).
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib", "b-roll"))

from mlx_wan_batch import plan_warmup, preencode_prompts, unique_prompts_in_order


# ─── fixtures ───


def jobs_for(prompts, seeds_per_prompt=2):
    """Mimic the orchestrator's job shape: same-prompt seeds are consecutive."""
    jobs = []
    for prompt in prompts:
        for i in range(seeds_per_prompt):
            jobs.append({
                "label": f"scene-{len(jobs) // seeds_per_prompt + 1}-seed{1024 + i}",
                "prompt": prompt,
                "output_path": f"/out/scene-{len(jobs) // seeds_per_prompt + 1}-seed{1024 + i}.mp4",
                "seed": 1024 + i,
            })
    return jobs


class FakeEncoder:
    """Counts encoder loads; per-prompt encode behavior is injectable."""

    def __init__(self, fail_prompts=(), events=None, embeds=None):
        self.fail_prompts = set(fail_prompts)
        self.events = events if events is not None else []
        self.embeds = embeds if embeds is not None else {}
        self.encode_calls = []

    def encode(self, prompt):
        self.events.append(f"encode:{prompt}")
        self.encode_calls.append(prompt)
        if prompt in self.fail_prompts:
            raise RuntimeError(f"encode exploded for {prompt}")
        return self.embeds.get(prompt, [[0.0, 1.0]])

    def close(self):
        self.events.append("close")


# ─── unique_prompts_in_order ───


class TestUniquePrompts:
    def test_same_prompt_seeds_dedup_to_one(self):
        jobs = jobs_for(["prompt A"])
        assert unique_prompts_in_order(jobs) == ["prompt A"]

    def test_first_seen_order_preserved(self):
        jobs = jobs_for(["prompt B", "prompt A", "prompt B"])
        assert unique_prompts_in_order(jobs) == ["prompt B", "prompt A"]


# ─── plan_warmup ───


class TestPlanWarmup:
    def test_two_seeds_one_encode(self):
        jobs = jobs_for(["prompt A"])
        plan = plan_warmup(jobs, cache_exists=lambda p: False)
        assert plan["unique"] == ["prompt A"]
        assert plan["to_encode"] == ["prompt A"]
        assert plan["cached"] == []

    def test_cached_prompts_are_skipped(self):
        jobs = jobs_for(["prompt A", "prompt B"])
        plan = plan_warmup(jobs, cache_exists=lambda p: p == "prompt A")
        assert plan["to_encode"] == ["prompt B"]
        assert plan["cached"] == ["prompt A"]

    def test_all_cached_rerun_needs_no_encoder_load(self):
        # Escalated reruns over unchanged prompts must not pay any encoder
        # load: to_encode empty is the signal main() uses to skip warm-up.
        jobs = jobs_for(["prompt A", "prompt B"])
        plan = plan_warmup(jobs, cache_exists=lambda p: True)
        assert plan["to_encode"] == []
        assert plan["cached"] == ["prompt A", "prompt B"]

    def test_no_cache_probe_encodes_everything(self):
        # --prompt-cache disabled: nothing is cached, everything encodes
        # (in-memory reuse only).
        jobs = jobs_for(["prompt A", "prompt B"])
        plan = plan_warmup(jobs, cache_exists=None)
        assert plan["to_encode"] == ["prompt A", "prompt B"]
        assert plan["cached"] == []


# ─── preencode_prompts ───


class TestPreencodePrompts:
    def test_one_encoder_load_for_many_prompts(self):
        events = []
        opened = []

        def open_encoder():
            events.append("open")
            enc = FakeEncoder(events=events)
            opened.append(enc)
            return enc

        warm = preencode_prompts(
            ["prompt A", "prompt B", "prompt C"],
            open_encoder=open_encoder,
        )
        assert events.count("open") == 1
        assert opened[0].encode_calls == ["prompt A", "prompt B", "prompt C"]
        assert warm["prompt A"] == [[0.0, 1.0]]
        assert warm["prompt C"] == [[0.0, 1.0]]

    def test_encoder_closed_after_all_prompts(self):
        events = []

        def open_encoder():
            return FakeEncoder(events=events)

        preencode_prompts(["prompt A", "prompt B"], open_encoder=open_encoder)
        assert events[-1] == "close"
        assert events.count("close") == 1

    def test_per_prompt_failure_is_isolated(self):
        # A failing prompt must not abort the batch: it is simply absent from
        # the warm dict and the job loop falls back to inline encode for it.
        def open_encoder():
            return FakeEncoder(fail_prompts={"prompt B"})

        warm = preencode_prompts(
            ["prompt A", "prompt B", "prompt C"],
            open_encoder=open_encoder,
        )
        assert set(warm.keys()) == {"prompt A", "prompt C"}

    def test_encoder_load_failure_returns_empty(self):
        def open_encoder():
            raise RuntimeError("transformers import exploded")

        warm = preencode_prompts(["prompt A"], open_encoder=open_encoder)
        assert warm == {}

    def test_no_prompts_skips_encoder_load(self):
        calls = []

        def open_encoder():
            calls.append("open")
            return FakeEncoder()

        warm = preencode_prompts([], open_encoder=open_encoder)
        assert warm == {}
        assert calls == []

    def test_cache_save_receives_every_embed(self):
        saved = []

        def cache_save(prompt, embeds):
            saved.append((prompt, embeds))

        embeds = {"prompt A": [[1.0]], "prompt B": [[2.0]]}
        preencode_prompts(
            ["prompt A", "prompt B"],
            open_encoder=lambda: FakeEncoder(embeds=embeds),
            cache_save=cache_save,
        )
        assert saved == [("prompt A", [[1.0]]), ("prompt B", [[2.0]])]

    def test_cache_save_failure_keeps_embed_in_memory(self):
        # save_prompt_cache is best-effort upstream, but an unexpected write
        # bug must not drop the embed from the warm dict.
        def cache_save(prompt, embeds):
            raise OSError("cache dir unwritable")

        warm = preencode_prompts(
            ["prompt A"],
            open_encoder=lambda: FakeEncoder(embeds={"prompt A": [[7.0]]}),
            cache_save=cache_save,
        )
        assert warm["prompt A"] == [[7.0]]


if __name__ == "__main__":
    import unittest

    unittest.main(module="test_broll_warmup", verbosity=2)
