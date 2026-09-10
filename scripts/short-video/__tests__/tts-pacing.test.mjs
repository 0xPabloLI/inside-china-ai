/**
 * Tests for per-scene TTS native speed resolution (#235 — voiceover pacing).
 *
 * Policy under test (user-approved decision table on #235 + #234 paired-experiment
 * evidence): Chinese scenes never speed up (236-288 chars/min is already the fast
 * broadcast tier); English hook stays at 1.0 (already 152-160 WPM, sweet-spot upper
 * edge); other English visualTypes default to 1.2 (130 WPM baseline → ~156 WPM);
 * TTS_SPEED env is the escape hatch; everything clamps to [1.0, 1.2] — 1.5x native
 * loses 36% spectral flux (transient smearing, measured in
 * docs/research/voiceover-pacing-research.md §2).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSceneSpeed, MAX_TTS_SPEED } from "../lib/tts/pacing.mjs";
import { buildCV3CudaManifest } from "../lib/tts/cosyvoice3-kaggle-cuda.mjs";

const enNarrative = {
  id: 1,
  visualType: "narrative",
  voiceover: "Alibaba revealed the weights for free and the race changed forever.",
};
const enHook = { id: 2, visualType: "hook", voiceover: "China just dropped a model that beats GPT." };
const zhScene = {
  id: 3,
  visualType: "narrative",
  voiceover: "阿里巴巴刚刚开源了新模型，权重直接免费下载。",
};

afterEach(() => {
  delete process.env.TTS_SPEED;
  delete process.env.TTS_PROSODY;
});

describe("resolveSceneSpeed", () => {
  it("defaults English narrative/data/cta scenes to 1.2 (decision table)", () => {
    expect(resolveSceneSpeed(enNarrative)).toBe(1.2);
  });

  it("keeps English hook at 1.0 — already at the 152-160 WPM sweet-spot edge (#234)", () => {
    expect(resolveSceneSpeed(enHook)).toBe(1.0);
  });

  it("honors refStyle like visualType when resolving the hook exemption", () => {
    expect(resolveSceneSpeed({ id: 4, refStyle: "hook", voiceover: "This model just beat GPT." })).toBe(1.0);
  });

  it("never speeds up Chinese scenes (240-300 chars/min is already the fast tier)", () => {
    expect(resolveSceneSpeed(zhScene)).toBe(1.0);
  });

  it("TTS_SPEED env overrides the English default", () => {
    process.env.TTS_SPEED = "1.15";
    expect(resolveSceneSpeed(enNarrative)).toBe(1.15);
  });

  it("TTS_SPEED env does not lift the Chinese 1.0 — no global speedup", () => {
    process.env.TTS_SPEED = "1.15";
    expect(resolveSceneSpeed(zhScene)).toBe(1.0);
  });

  it("clamps to the 1.2 ceiling — 1.5x native smears transients", () => {
    process.env.TTS_SPEED = "1.5";
    expect(resolveSceneSpeed(enNarrative)).toBe(MAX_TTS_SPEED);
  });

  it("floors at 1.0 — pacing only compensates upward", () => {
    process.env.TTS_SPEED = "0.8";
    expect(resolveSceneSpeed(enNarrative)).toBe(1.0);
  });

  it("falls back to the English default for a scene without text", () => {
    expect(resolveSceneSpeed({ id: 5 })).toBe(1.2);
  });

  it("classifies EN prose quoting a CJK brand name as English (0.3 guard)", () => {
    const mixed = {
      id: 6,
      visualType: "narrative",
      voiceover: "Alibaba 阿里巴巴 revealed the weights — the race changed.",
    };
    // ~4/43 CJK letters → below the 0.3 guard → EN default applies
    expect(resolveSceneSpeed(mixed)).toBe(1.2);
  });
});

describe("buildCV3CudaManifest per-scene speed (#235)", () => {
  it("sets manifest speed only for boost-eligible scenes", () => {
    const manifest = buildCV3CudaManifest([enNarrative, enHook, zhScene]);
    expect(manifest[0].speed).toBe(1.2);
    expect(manifest[1].speed).toBeUndefined();
    expect(manifest[2].speed).toBeUndefined();
  });

  it("prosody opt-in keeps precedence over the pacing default", () => {
    process.env.TTS_PROSODY = "1";
    const manifest = buildCV3CudaManifest([enHook, enNarrative]);
    // hook profile tempo 1.06; narrative has no profile → no speed at all
    expect(manifest[0].speed).toBe(1.06);
    expect(manifest[1].speed).toBeUndefined();
  });
});
