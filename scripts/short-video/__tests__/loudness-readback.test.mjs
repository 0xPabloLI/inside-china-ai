/**
 * Loudness read-back (#415 ①) — EBU R128 / ITU-R BS.1770-4 verification.
 *
 * The finalize pass has always applied a single loudnorm filter and never read
 * the result back; these tests pin the read-back parser, the verification
 * tolerances and the measured two-pass repair argv.
 *
 * Run with: npx vitest run scripts/short-video/__tests__/loudness-readback.test.mjs
 */
import { describe, it, expect } from "vitest";
import {
  LOUDNESS_LU_TOLERANCE,
  LOUDNESS_TP_CEILING_DB,
  parseLoudnormJson,
  measureLoudness,
  verifyLoudness,
  buildLoudnessRepairArgs,
} from "../lib/post-process.mjs";

/** Real `loudnorm=print_format=json` output shape (ffmpeg 7.x). */
const LOUDNORM_JSON = JSON.stringify({
  input_i: "-14.32",
  input_tp: "-1.21",
  input_lra: "6.40",
  input_thresh: "-24.51",
  output_i: "-16.02",
  output_tp: "-1.51",
  output_lra: "6.10",
  output_thresh: "-26.04",
  normalization_type: "dynamic",
  target_offset: "0.01",
});

describe("parseLoudnormJson", () => {
  it("reads the MEASURED (input_*) values of the analysed file, not the prediction", () => {
    const stderr = [
      "ffmpeg version 7.1",
      "[Parsed_loudnorm_0 @ 0x7f8] ",
      LOUDNORM_JSON,
      "size=N/A time=00:00:12.03 bitrate=N/A speed= 210x",
    ].join("\n");
    const m = parseLoudnormJson(stderr);
    // input_* describe the file we analysed (this is a read-back, so those are
    // the truth); output_* is what a second loudnorm pass would produce.
    expect(m.lufs).toBeCloseTo(-14.32, 2);
    expect(m.truePeakDb).toBeCloseTo(-1.21, 2);
    expect(m.lra).toBeCloseTo(6.4, 2);
    expect(m.threshold).toBeCloseTo(-24.51, 2);
    expect(m.offset).toBeCloseTo(0.01, 2);
    expect(m.predictedLufs).toBeCloseTo(-16.02, 2);
  });

  it("returns null when the JSON block is absent or malformed", () => {
    expect(parseLoudnormJson("no json here")).toBeNull();
    expect(parseLoudnormJson("{not json}")).toBeNull();
    expect(parseLoudnormJson(null)).toBeNull();
  });
});

describe("measureLoudness", () => {
  it("runs a read-only loudnorm analysis and returns the parsed measurement", () => {
    const calls = [];
    const exec = (args) => {
      calls.push({ args });
      return { stdout: "", stderr: LOUDNORM_JSON };
    };
    const r = measureLoudness("/tmp/final.mp4", { exec });
    expect(r.ok).toBe(true);
    expect(r.lufs).toBeCloseTo(-14.32, 2);
    const argv = calls[0].args.join(" ");
    expect(argv).toContain("loudnorm=print_format=json");
    expect(argv).toContain("-f null");
    // Read-only: must not name an output media file or a video encoder.
    expect(argv).not.toContain("libx264");
    expect(argv).not.toContain(".mp4 -c:v");
  });

  it("degrades to ok:false when ffmpeg fails", () => {
    const exec = () => {
      throw new Error("ffmpeg: not found");
    };
    const r = measureLoudness("/tmp/missing.mp4", { exec });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/);
    expect(r.lufs).toBeNull();
  });

  it("degrades to ok:false when the output has no JSON block", () => {
    const exec = () => ({ stdout: "", stderr: "size=N/A time=00:00:01" });
    const r = measureLoudness("/tmp/final.mp4", { exec });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/could not parse/);
  });
});

describe("verifyLoudness", () => {
  it("passes when loudness and true peak are within tolerance", () => {
    const v = verifyLoudness({ lufs: -16.2, truePeakDb: -1.6 }, { target: -16 });
    expect(v.ok).toBe(true);
    expect(v.deltaLu).toBeCloseTo(-0.2, 6);
    expect(v.reasons).toEqual([]);
  });

  it("fails when loudness drifts past the LU tolerance", () => {
    const v = verifyLoudness({ lufs: -14.0, truePeakDb: -1.6 }, { target: -16 });
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/loudness/);
  });

  it("fails when true peak exceeds the ceiling", () => {
    const v = verifyLoudness({ lufs: -16.0, truePeakDb: -0.2 }, { target: -16 });
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/true peak/i);
  });

  it("refuses to pass an unmeasurable file", () => {
    const v = verifyLoudness({ lufs: null, truePeakDb: null }, { target: -16 });
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/not measured/);
  });

  it("documents the tolerance constants", () => {
    expect(LOUDNESS_LU_TOLERANCE).toBeLessThanOrEqual(1.0);
    expect(LOUDNESS_TP_CEILING_DB).toBeLessThanOrEqual(-1.0);
  });
});

describe("buildLoudnessRepairArgs", () => {
  it("builds a measured two-pass loudnorm argv with a copied video stream", () => {
    const args = buildLoudnessRepairArgs({
      inputPath: "/tmp/in.mp4",
      outputPath: "/tmp/out.mp4",
      target: -16,
      measurement: {
        lufs: -14.32,
        truePeakDb: -1.21,
        lra: 6.4,
        threshold: -24.51,
        offset: 0.01,
      },
    });
    const s = args.join(" ");
    expect(s).toContain("measured_I=-14.32");
    expect(s).toContain("measured_TP=-1.21");
    expect(s).toContain("measured_LRA=6.4");
    expect(s).toContain("measured_thresh=-24.51");
    expect(s).toContain("offset=0.01");
    expect(s).toContain("linear=true");
    expect(s).toContain("I=-16");
    expect(args).toContain("-c:v");
    expect(args[args.indexOf("-c:v") + 1]).toBe("copy");
  });

  it("falls back to the non-linear mode when the file is too far off target", () => {
    // loudnorm refuses linear correction when the measured loudness needs more
    // than ~+11 dB of gain; the argv must not request linear there.
    const args = buildLoudnessRepairArgs({
      inputPath: "/tmp/in.mp4",
      outputPath: "/tmp/out.mp4",
      target: -16,
      measurement: { lufs: -32, truePeakDb: -20, lra: 6, threshold: -45, offset: 0 },
    });
    expect(args.join(" ")).not.toContain("linear=true");
  });
});
