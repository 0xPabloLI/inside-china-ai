/**
 * Tests for per-scene TTS native speed resolution + the measured-WPM pacing
 * feedback loop (#235 decision table → #252 redesign).
 *
 * Policy under test (#252, user-approved):
 * - Chinese scenes never speed up (236-288 chars/min is already the fast
 *   broadcast tier; #235 research).
 * - ALL English scenes baseline at 1.0 — the static hook exemption AND the
 *   static 1.2 narrative default are cancelled (#252: the static pair made
 *   narrative measure FASTER than hook, inverting the energy curve; the
 *   relative relationship is now decided by measured WPM, not static class).
 * - A per-scene `ttsSpeed` override (feedback-loop compensation, or operator)
 *   wins over everything and clamps to [1.0, 1.2] — 1.5x native loses 36%
 *   spectral flux (docs/research/voiceover-pacing-research.md §2).
 * - TTS_SPEED env stays as the operator escape hatch.
 * - planPacingResponse: measured < 135 → compensate (speed = 150/measured,
 *   clamp ≤1.2); measured > 225 → reroll (take drift ±10-20%, #234); in
 *   between → keep.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveSceneSpeed,
  planPacingResponse,
  MAX_TTS_SPEED,
  WPM_TARGET,
  WPM_COMPENSATE_BELOW,
  WPM_HARD_CEILING,
} from "../lib/tts/pacing.mjs";
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
  it("baselines English narrative scenes at 1.0 — compensation is measurement-driven (#252)", () => {
    // #252: the static 1.2 made Scene 2/5 of ant-lingbot-world-13b measure
    // 228/257 WPM while hook sat at 157 — the static pair is cancelled.
    expect(resolveSceneSpeed(enNarrative)).toBe(1.0);
  });

  it("keeps English hook at 1.0 — same baseline as narrative, no static exemption (#252)", () => {
    expect(resolveSceneSpeed(enHook)).toBe(1.0);
  });

  it("honors refStyle like visualType when classifying the scene", () => {
    expect(resolveSceneSpeed({ id: 4, refStyle: "hook", voiceover: "This model just beat GPT." })).toBe(1.0);
  });

  it("never speeds up Chinese scenes (240-300 chars/min is already the fast tier)", () => {
    expect(resolveSceneSpeed(zhScene)).toBe(1.0);
  });

  it("honors an explicit scene.ttsSpeed override (feedback-loop compensation path)", () => {
    expect(resolveSceneSpeed({ ...enNarrative, ttsSpeed: 1.15 })).toBe(1.15);
  });

  it("scene.ttsSpeed beats the TTS_SPEED env (per-scene measurement > global operator knob)", () => {
    process.env.TTS_SPEED = "1.05";
    expect(resolveSceneSpeed({ ...enNarrative, ttsSpeed: 1.2 })).toBe(1.2);
  });

  it("clamps scene.ttsSpeed to the 1.2 ceiling — 1.5x native smears transients", () => {
    expect(resolveSceneSpeed({ ...enNarrative, ttsSpeed: 1.5 })).toBe(MAX_TTS_SPEED);
  });

  it("floors scene.ttsSpeed at 1.0 — pacing only compensates upward", () => {
    expect(resolveSceneSpeed({ ...enNarrative, ttsSpeed: 0.9 })).toBe(1.0);
  });

  it("ignores a non-positive ttsSpeed and falls through to baseline", () => {
    expect(resolveSceneSpeed({ ...enNarrative, ttsSpeed: 0 })).toBe(1.0);
    expect(resolveSceneSpeed({ ...enNarrative, ttsSpeed: Number.NaN })).toBe(1.0);
  });

  it("TTS_SPEED env overrides the English baseline", () => {
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

  it("falls back to the baseline for a scene without text", () => {
    expect(resolveSceneSpeed({ id: 5 })).toBe(1.0);
  });

  it("classifies EN prose quoting a CJK brand name as English (0.3 guard)", () => {
    const mixed = {
      id: 6,
      visualType: "narrative",
      voiceover: "Alibaba 阿里巴巴 revealed the weights — the race changed.",
    };
    // ~4/43 CJK letters → below the 0.3 guard → EN baseline applies
    expect(resolveSceneSpeed(mixed)).toBe(1.0);
  });
});

describe("planPacingResponse (#252 measured-WPM ladder)", () => {
  // Bands from the #252 review comment: <135 compensate (native 1.1-1.2),
  // 135-225 keep, >225 reroll (take drift), reroll still >225 → block.
  it("compensates a slow hook (116 WPM) with the clamped 1.2 speed", () => {
    const plan = planPacingResponse(enHook, 116);
    expect(plan.action).toBe("compensate");
    expect(plan.speed).toBe(1.2); // 150/116 = 1.29 → clamp
  });

  it("compensates a mildly slow scene with a proportional speed", () => {
    const plan = planPacingResponse(enNarrative, 134);
    expect(plan.action).toBe("compensate");
    expect(plan.speed).toBeCloseTo(150 / 134, 5); // ≈1.119 — inside the 1.1-1.2 review band
  });

  it("keeps scenes inside the hysteresis band [135, 225]", () => {
    expect(planPacingResponse(enNarrative, 135).action).toBe("keep");
    expect(planPacingResponse(enNarrative, 150).action).toBe("keep");
    expect(planPacingResponse(enNarrative, 171).action).toBe("keep"); // CTA above sweet spot, below ceiling
    expect(planPacingResponse(enNarrative, 225).action).toBe("keep");
  });

  it("rerolls a >225 scene — take drift ±10-20% is the first lever (#234)", () => {
    expect(planPacingResponse(enNarrative, 228).action).toBe("reroll");
    expect(planPacingResponse(enNarrative, 257).action).toBe("reroll");
  });

  it("never manipulates Chinese scenes — WPM is not the ZH metric", () => {
    expect(planPacingResponse(zhScene, 50).action).toBe("keep");
    expect(planPacingResponse(zhScene, 900).action).toBe("keep");
  });

  it("keeps scenes without a usable measurement (defensive)", () => {
    expect(planPacingResponse(enNarrative, Number.NaN).action).toBe("keep");
    expect(planPacingResponse(enNarrative, 0).action).toBe("keep");
    expect(planPacingResponse(enNarrative, undefined).action).toBe("keep");
  });

  it("exposes the review constants for cross-module checks", () => {
    expect(WPM_TARGET).toBe(150);
    expect(WPM_COMPENSATE_BELOW).toBe(135);
    expect(WPM_HARD_CEILING).toBe(225);
  });
});

describe("buildCV3CudaManifest per-scene speed (#252)", () => {
  it("emits no static speed for baseline scenes — measurement decides", () => {
    const manifest = buildCV3CudaManifest([enNarrative, enHook, zhScene]);
    expect(manifest[0].speed).toBeUndefined();
    expect(manifest[1].speed).toBeUndefined();
    expect(manifest[2].speed).toBeUndefined();
  });

  it("emits the compensation speed when a scene carries ttsSpeed", () => {
    const compensated = { ...enNarrative, ttsSpeed: 1.2 };
    const manifest = buildCV3CudaManifest([compensated]);
    expect(manifest[0].speed).toBe(1.2);
  });

  it("prosody opt-in keeps precedence over the pacing default", () => {
    process.env.TTS_PROSODY = "1";
    const manifest = buildCV3CudaManifest([enHook, enNarrative]);
    // hook profile tempo 1.06; narrative has no profile → no speed at all
    expect(manifest[0].speed).toBe(1.06);
    expect(manifest[1].speed).toBeUndefined();
  });
});
