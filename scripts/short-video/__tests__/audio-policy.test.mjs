import { describe, expect, test } from "vitest";

import {
  AUDIO_MODES,
  DEFAULT_AUDIO_MODE,
  expectedBedFromPolicy,
  renderAudioPolicyViolation,
  resolveAudioMode,
} from "../lib/audio-policy.mjs";

describe("resolveAudioMode", () => {
  test("legacy packs without the field resolve to the default bed", () => {
    const resolved = resolveAudioMode({ pipelineId: "legacy" });
    expect(resolved.mode).toBe(DEFAULT_AUDIO_MODE);
    expect(resolved).toMatchObject({ declared: false, valid: true });
  });

  test("a declared voice-only pack keeps its mode", () => {
    const resolved = resolveAudioMode({ audio: { mode: "voice-only" } });
    expect(resolved).toMatchObject({ mode: "voice-only", declared: true, valid: true });
  });

  test("an unknown value is invalid and falls back to bed", () => {
    const resolved = resolveAudioMode({ audio: { mode: "no-music" } });
    expect(resolved.valid).toBe(false);
    expect(resolved.mode).toBe(DEFAULT_AUDIO_MODE);
  });
});

describe("renderAudioPolicyViolation", () => {
  test("a bed pack rendered without --bgm is refused", () => {
    const violation = renderAudioPolicyViolation({ meta: {}, useBgm: false });
    expect(violation).toMatch(/npm run|--bgm/);
    expect(violation).toMatch(/voice-only/);
  });

  test("a bed pack rendered with --bgm passes", () => {
    expect(renderAudioPolicyViolation({ meta: {}, useBgm: true })).toBeNull();
  });

  test("a voice-only pack may render without --bgm", () => {
    const meta = { audio: { mode: "voice-only", reason: "silent-by-design" } };
    expect(renderAudioPolicyViolation({ meta, useBgm: false })).toBeNull();
  });

  test("an invalid mode is refused even with --bgm", () => {
    expect(renderAudioPolicyViolation({ meta: { audio: { mode: "loud" } }, useBgm: true })).toMatch(
      AUDIO_MODES.join(" / "),
    );
  });
});

describe("expectedBedFromPolicy", () => {
  test("bed expects a bed, voice-only does not", () => {
    expect(expectedBedFromPolicy({})).toBe(true);
    expect(expectedBedFromPolicy({ audio: { mode: "bed" } })).toBe(true);
    expect(expectedBedFromPolicy({ audio: { mode: "voice-only" } })).toBe(false);
  });

  test("an invalid declaration cannot assert either way", () => {
    expect(expectedBedFromPolicy({ audio: { mode: "loud" } })).toBeNull();
  });
});
