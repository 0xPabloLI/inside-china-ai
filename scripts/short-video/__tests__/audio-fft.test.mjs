import { describe, it, expect } from "vitest";
import { findOnset } from "../lib/audio/fft.mjs";

/** Deterministic PRNG so the synthetic bursts are reproducible. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseBurst(length, seed) {
  const rnd = mulberry32(seed);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = rnd() * 2 - 1;
  return out;
}

describe("findOnset", () => {
  it("locates a noise burst at a known offset", () => {
    const sr = 16000;
    const haystack = new Float32Array(sr * 2); // 2s of silence
    const needle = noiseBurst(Math.round(0.3 * sr), 42);
    const offset = Math.round(0.75 * sr);
    haystack.set(needle, offset);

    const { sample, seconds } = findOnset(haystack, needle, sr);
    expect(Math.abs(sample - offset)).toBeLessThanOrEqual(2);
    expect(Math.abs(seconds - 0.75)).toBeLessThanOrEqual(2 / sr);
  });

  it("locates a tonal burst", () => {
    const sr = 16000;
    const needleLen = Math.round(0.3 * sr);
    const needle = new Float32Array(needleLen);
    for (let i = 0; i < needleLen; i++) needle[i] = Math.sin((2 * Math.PI * 440 * i) / sr);

    const haystack = new Float32Array(sr); // 1s
    const offset = Math.round(0.333 * sr);
    haystack.set(needle, offset);

    const { sample } = findOnset(haystack, needle, sr);
    expect(Math.abs(sample - offset)).toBeLessThanOrEqual(2);
  });

  it("is robust to DC offset and amplitude scaling", () => {
    const sr = 16000;
    const haystack = new Float32Array(sr);
    const needle = noiseBurst(Math.round(0.25 * sr), 7);
    const offset = Math.round(0.5 * sr);
    haystack.set(needle, offset);
    // Both sides get DC + different amplitude ratio
    for (let i = 0; i < haystack.length; i++) haystack[i] = haystack[i] * 0.8 + 0.5;
    for (let i = 0; i < needle.length; i++) needle[i] = needle[i] * 0.3 + 0.5;

    const { sample } = findOnset(haystack, needle, sr);
    expect(Math.abs(sample - offset)).toBeLessThanOrEqual(3);
  });

  it("handles non-power-of-two lengths", () => {
    const sr = 16000;
    const haystack = new Float32Array(30000); // deliberately not a power of two
    const needle = noiseBurst(7000, 99);
    const offset = 12345;
    haystack.set(needle, offset);

    const { sample } = findOnset(haystack, needle, sr);
    expect(Math.abs(sample - offset)).toBeLessThanOrEqual(2);
  });

  it("throws when the needle is longer than the haystack", () => {
    expect(() => findOnset(new Float32Array(10), new Float32Array(20), 1)).toThrow(/longer/i);
  });
});
