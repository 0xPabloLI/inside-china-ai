import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildWavBuffer, writeWavPcm, readWavPcm } from "../lib/audio/wav.mjs";

describe("buildWavBuffer", () => {
  it("emits a RIFF header for mono s16 PCM at the requested rate", () => {
    const buf = buildWavBuffer(new Float32Array([0, 0.5, -0.5]), 44100);
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
    expect(buf.readUInt16LE(20)).toBe(1); // PCM
    expect(buf.readUInt16LE(22)).toBe(1); // mono
    expect(buf.readUInt32LE(24)).toBe(44100);
    expect(buf.readUInt16LE(34)).toBe(16); // bits per sample
    expect(buf.readUInt32LE(40)).toBe(6); // data chunk = 3 samples × 2 bytes
    expect(buf.length).toBe(50);
  });

  it("clamps out-of-range samples to s16 bounds", () => {
    const buf = buildWavBuffer(new Float32Array([2, -2]), 8000);
    expect(buf.readInt16LE(44)).toBe(32767);
    expect(buf.readInt16LE(46)).toBe(-32768);
  });
});

describe("readWavPcm", () => {
  it("round-trips samples exactly through a written file", () => {
    const dir = mkdtempSync(join(tmpdir(), "wav-test-"));
    const path = join(dir, "t.wav");
    const samples = new Float32Array([0, 0.1, -0.3, 0.999, -0.999, 0]);
    writeWavPcm(path, samples, 22050);
    const { sampleRate, samples: read } = readWavPcm(path);
    expect(sampleRate).toBe(22050);
    expect(read).toHaveLength(samples.length);
    for (let i = 0; i < samples.length; i++) {
      expect(read[i]).toBeCloseTo(samples[i], 4);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws on non-PCM (float) wav files", () => {
    const dir = mkdtempSync(join(tmpdir(), "wav-test-"));
    const path = join(dir, "float.wav");
    const buf = Buffer.alloc(48);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(40, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(3, 20); // IEEE float, not PCM
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(16000, 24);
    buf.writeUInt32LE(64000, 28);
    buf.writeUInt16LE(4, 32);
    buf.writeUInt16LE(32, 34);
    buf.write("data", 36);
    buf.writeUInt32LE(4, 40);
    buf.writeFloatLE(0.5, 44);
    writeFileSync(path, buf);
    expect(() => readWavPcm(path)).toThrow(/format/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws on multi-channel wav files", () => {
    const dir = mkdtempSync(join(tmpdir(), "wav-test-"));
    const path = join(dir, "stereo.wav");
    const buf = buildWavBuffer(new Float32Array([0, 0, 0, 0]), 8000);
    buf.writeUInt16LE(2, 22); // make it stereo (data stays mono-length; header is what we assert)
    writeFileSync(path, buf);
    expect(() => readWavPcm(path)).toThrow(/mono/i);
    rmSync(dir, { recursive: true, force: true });
  });
});
