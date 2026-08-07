import { describe, it, expect } from "vitest";
import { assembleTrackPcm, TRACK_SAMPLE_RATE } from "../lib/audio/track.mjs";
import { findOnset } from "../lib/audio/fft.mjs";

/** A short tonal burst at `freq` with the rest silence — a synthetic "voiceover". */
function burstPcm(seconds, freq, sampleRate) {
  const length = Math.round(seconds * sampleRate);
  const out = new Float32Array(length);
  const burstLen = Math.min(Math.round(0.1 * sampleRate), length);
  for (let i = 0; i < burstLen; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

describe("assembleTrackPcm", () => {
  it("pads each scene to its frame-aligned clip and concatenates sample-exactly", () => {
    const sr = TRACK_SAMPLE_RATE;
    // tts durations → clip durations (frame-aligned, 30fps): 1.0→1.5, 0.5→1.0, 0.7→1.2
    const tts = [1.0, 0.5, 0.7];
    const clips = [1.5, 1.0, 1.2];
    const pcms = [burstPcm(0.9, 440, sr), burstPcm(0.4, 550, sr), burstPcm(0.6, 660, sr)];

    const track = assembleTrackPcm(pcms, tts, sr);
    const expectedTotal = clips.reduce((s, c) => s + Math.round(c * sr), 0);
    expect(track.length).toBe(expectedTotal);

    // Each scene's burst must start exactly at its cumulative clip offset.
    let offset = 0;
    for (let i = 0; i < pcms.length; i++) {
      const { sample } = findOnset(track, pcms[i], sr);
      expect(sample).toBe(offset);
      offset += Math.round(clips[i] * sr);
    }
  });

  it("keeps trailing scene silence in the track (no gap compaction)", () => {
    const sr = TRACK_SAMPLE_RATE;
    const tts = [1.0];
    const pcm = burstPcm(1.0, 330, sr);
    const track = assembleTrackPcm([pcm], tts, sr);
    // Speech ends at tts=1.0s; the clip is 1.5s — the 0.5s tail must be real silence.
    expect(track.length).toBe(Math.round(1.5 * sr));
    const tailStart = Math.round(1.0 * sr);
    for (let i = tailStart; i < track.length; i++) {
      expect(track[i]).toBe(0);
    }
  });

  it("throws when a scene's audio exceeds its clip length (would truncate speech)", () => {
    const sr = TRACK_SAMPLE_RATE;
    // tts 0.1s → clip = ceil(0.6*30)/30 = 18 frames = 0.6s; feed it 1s of audio
    const tooLong = new Float32Array(Math.round(1.0 * sr));
    expect(() => assembleTrackPcm([tooLong], [0.1], sr)).toThrow(/exceed|truncate/i);
  });

  it("throws on empty scene lists and on count mismatch", () => {
    expect(() => assembleTrackPcm([], [], TRACK_SAMPLE_RATE)).toThrow(/no scene/i);
    expect(() => assembleTrackPcm([new Float32Array(10)], [0.5, 0.5], TRACK_SAMPLE_RATE)).toThrow();
  });
});
