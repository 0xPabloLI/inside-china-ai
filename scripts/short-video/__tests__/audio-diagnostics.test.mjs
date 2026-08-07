import { describe, it, expect, afterEach } from "vitest";
import { execSync } from "child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
  readdirSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import {
  parsePacketPts,
  findGaps,
  collectPacketGaps,
  collectStreamDurations,
  writeBundleFiles,
  writeDiagnosticsBundle,
  PACKET_GAP_THRESHOLD,
} from "../lib/audio/diagnostics.mjs";
import { verifySubtitles } from "../lib/verify-subtitles.mjs";
import { buildVoiceoverTrack } from "../lib/audio/track.mjs";
import { writeWavPcm } from "../lib/audio/wav.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI = join(__dirname, "..", "verify-subtitles.mjs");

let dirs = [];

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function freshDir(tag) {
  const dir = mkdtempSync(join(tmpdir(), `diag-${tag}-`));
  dirs.push(dir);
  return dir;
}

/** Build a real mp4: "tone" = 2s sine + black video, "silent" = 1s black, no audio. */
function buildMp4(dir, name, kind) {
  const p = join(dir, `${name}.mp4`);
  if (kind === "tone") {
    execSync(
      `ffmpeg -y -f lavfi -i "sine=frequency=440:duration=2" -f lavfi -i "color=c=black:s=64x64:d=2" -shortest -pix_fmt yuv420p "${p}" 2>/dev/null`,
    );
  } else {
    execSync(
      `ffmpeg -y -f lavfi -i "color=c=black:s=64x64:d=1" -pix_fmt yuv420p "${p}" 2>/dev/null`,
    );
  }
  return p;
}

describe("parsePacketPts", () => {
  it("parses ffprobe csv output with trailing commas and negative priming pts", () => {
    // Real sample from the restraint-pt1 packet dump: "value," per line, and
    // the first audio packet carries AAC priming (negative pts).
    const raw = "-0.023220,\n0.500000,\n1.011000,\n";
    expect(parsePacketPts(raw)).toEqual([-0.02322, 0.5, 1.011]);
  });

  it("skips empty lines and non-numeric garbage", () => {
    expect(parsePacketPts("\n0.5,\ngarbage,\n1.0\n\n")).toEqual([0.5, 1.0]);
  });

  it("returns [] for empty input", () => {
    expect(parsePacketPts("")).toEqual([]);
    expect(parsePacketPts(null)).toEqual([]);
  });
});

describe("findGaps", () => {
  const MIN = PACKET_GAP_THRESHOLD;

  it("finds no gaps in a normal packet sequence", () => {
    expect(findGaps([0, 0.0213, 0.0426, 0.0639], MIN)).toEqual([]);
  });

  it("reports each jump with its jump point and rounded ms", () => {
    // 0 → 0.5 jumps 500ms; 0.5 → 1.1 jumps 600ms.
    expect(findGaps([0, 0.5, 1.1], MIN)).toEqual([
      { at: 0.5, gapMs: 500 },
      { at: 1.1, gapMs: 600 },
    ]);
  });

  it("does not count a gap exactly at the threshold (strictly greater)", () => {
    expect(findGaps([0, 0.1], MIN)).toEqual([]);
    expect(findGaps([0, 0.1001], MIN)).toEqual([{ at: 0.1001, gapMs: 100 }]);
  });

  it("lists all 10 gaps across 11 scene packets", () => {
    const pts = [];
    for (let i = 0; i < 11; i++) pts.push(i * 0.51);
    const gaps = findGaps(pts, MIN);
    expect(gaps).toHaveLength(10);
    expect(gaps[0]).toEqual({ at: 0.51, gapMs: 510 });
    expect(gaps[9]).toEqual({ at: 5.1, gapMs: 510 });
  });

  it("ignores negative deltas (non-monotonic pts) and negative priming start", () => {
    // -0.023 → 0.5 is a real 523ms jump; 0.5 → 0.3 is a rewind, not a gap.
    expect(findGaps([-0.023, 0.5, 0.3], MIN)).toEqual([{ at: 0.5, gapMs: 523 }]);
  });
});

describe("collectPacketGaps (integration, real ffmpeg)", () => {
  it("reads a continuous track with zero gaps", () => {
    const dir = freshDir("gaps");
    const result = collectPacketGaps(buildMp4(dir, "tone", "tone"));
    expect(result.error).toBeNull();
    expect(result.packets).toBeGreaterThan(50);
    expect(result.gaps).toEqual([]);
    expect(result.firstPts).toBeLessThan(0.05);
  });

  it("reports an error for a video with no audio stream instead of throwing", () => {
    const dir = freshDir("gaps");
    const result = collectPacketGaps(buildMp4(dir, "silent", "silent"));
    expect(result.error).not.toBeNull();
    expect(result.gaps).toEqual([]);
    expect(result.packets).toBe(0);
  });
});

describe("collectStreamDurations (integration, real ffmpeg)", () => {
  it("reports both stream durations for a tone mp4", () => {
    const dir = freshDir("streams");
    const result = collectStreamDurations(buildMp4(dir, "tone", "tone"));
    expect(result.error).toBeNull();
    expect(result.video).toBeCloseTo(2.0, 1);
    expect(result.audio).toBeCloseTo(2.0, 1);
  });

  it("reports null audio (not an error) when the video has no audio stream", () => {
    const dir = freshDir("streams");
    const result = collectStreamDurations(buildMp4(dir, "silent", "silent"));
    expect(result.error).toBeNull();
    expect(result.video).toBeCloseTo(1.0, 1);
    expect(result.audio).toBeNull();
  });
});

/** A FAIL-shaped report covering every axis the bundle summarizes. */
const FAIL_REPORT = {
  videoDuration: 73.87,
  totalCues: 41,
  totalWords: 170,
  wordSequence: {
    matches: false,
    rendered: 169,
    expected: 170,
    firstMismatch: { index: 41, expected: "openness", rendered: null },
  },
  sync: { maxDeviation: 0.2, tolerance: 0.08, offenders: [] },
  gaps: { violations: [] },
  durations: { tooShort: [] },
  wordsPerLine: { overLong: [] },
  coverage: { gaps: [], percent: 100 },
  audioSync: {
    errored: false,
    checked: 2,
    skipped: 0,
    errors: 1,
    passed: false,
    scenes: [
      { sceneId: 1, expected: 0.0, measured: 0.01, drift: 0.01, driftMs: 10, ok: true },
      { sceneId: 2, expected: 4.533, measured: 4.733, drift: 0.2, driftMs: 200, ok: false },
    ],
    failedScenes: [],
    skippedScenes: [],
  },
  summary: { errors: 2, warnings: 0, passed: false },
};

describe("writeBundleFiles", () => {
  it("writes all five files with the full diagnosis", () => {
    const bundleDir = freshDir("bundle");
    const videoPath = buildMp4(bundleDir, "tone", "tone");
    const result = writeBundleFiles(bundleDir, { report: FAIL_REPORT, videoPath });

    expect(result.errors).toEqual([]);
    for (const name of [
      "summary.txt",
      "drift.json",
      "packet-gaps.json",
      "streams.json",
      "verification-report.json",
    ]) {
      expect(existsSync(join(bundleDir, name))).toBe(true);
    }

    // Machine files carry exact data.
    expect(JSON.parse(readFileSync(join(bundleDir, "drift.json"), "utf8"))).toEqual(
      FAIL_REPORT.audioSync,
    );
    expect(JSON.parse(readFileSync(join(bundleDir, "packet-gaps.json"), "utf8")).gaps).toEqual([]);
    expect(JSON.parse(readFileSync(join(bundleDir, "streams.json"), "utf8")).audio).toBeCloseTo(
      2.0,
      1,
    );
    expect(JSON.parse(readFileSync(join(bundleDir, "verification-report.json"), "utf8"))).toEqual(
      FAIL_REPORT,
    );

    // The human summary names the offender with its drift.
    const summary = readFileSync(join(bundleDir, "summary.txt"), "utf8");
    expect(summary).toContain("scene 2");
    expect(summary).toContain("+200ms");
    expect(summary).toContain("FAIL");
    expect(summary).toContain("firstMismatch");
  });

  it("writes drift.json as null when the report has no audioSync data", () => {
    const bundleDir = freshDir("bundle");
    const videoPath = buildMp4(bundleDir, "tone", "tone");
    const noSync = { ...FAIL_REPORT, audioSync: undefined };
    writeBundleFiles(bundleDir, { report: noSync, videoPath });
    expect(JSON.parse(readFileSync(join(bundleDir, "drift.json"), "utf8"))).toBeNull();
  });

  it("survives a bogus video path and records the collection errors", () => {
    const bundleDir = freshDir("bundle");
    const result = writeBundleFiles(bundleDir, {
      report: FAIL_REPORT,
      videoPath: join(bundleDir, "does-not-exist.mp4"),
    });
    expect(existsSync(join(bundleDir, "summary.txt"))).toBe(true);
    expect(existsSync(join(bundleDir, "verification-report.json"))).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
    const summary = readFileSync(join(bundleDir, "summary.txt"), "utf8");
    expect(summary).toContain("packet gaps");
  });

  it("keeps writing the remaining files when one write fails (EISDIR injection)", () => {
    const bundleDir = freshDir("bundle");
    const videoPath = buildMp4(bundleDir, "tone", "tone");
    mkdirSync(join(bundleDir, "packet-gaps.json")); // sabotage: file path is a directory
    const result = writeBundleFiles(bundleDir, { report: FAIL_REPORT, videoPath });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(existsSync(join(bundleDir, "drift.json"))).toBe(true);
    expect(existsSync(join(bundleDir, "streams.json"))).toBe(true);
    expect(existsSync(join(bundleDir, "summary.txt"))).toBe(true);
    const summary = readFileSync(join(bundleDir, "summary.txt"), "utf8");
    expect(summary).toContain("packet-gaps.json");
  });
});

describe("writeDiagnosticsBundle", () => {
  it("creates a timestamped dir under {outputDir}/diagnostics and returns its path", () => {
    const outputDir = freshDir("root");
    const videoPath = buildMp4(outputDir, "tone", "tone");

    const dir = writeDiagnosticsBundle({ outputDir, report: FAIL_REPORT, videoPath });
    expect(dir).not.toBeNull();
    expect(dir.startsWith(join(outputDir, "diagnostics"))).toBe(true);
    expect(existsSync(join(dir, "summary.txt"))).toBe(true);
  });

  it("never collides: same second (fixed ts) twice creates two distinct dirs", () => {
    const outputDir = freshDir("root");
    const videoPath = buildMp4(outputDir, "tone", "tone");

    const d1 = writeDiagnosticsBundle({ outputDir, report: FAIL_REPORT, videoPath, ts: "same-ts" });
    const d2 = writeDiagnosticsBundle({ outputDir, report: FAIL_REPORT, videoPath, ts: "same-ts" });
    expect(d1).not.toBe(d2);
    expect(existsSync(d1)).toBe(true);
    expect(existsSync(d2)).toBe(true);
  });

  it("returns null when the diagnostics root cannot be created", () => {
    // Sabotage: a FILE where the diagnostics directory should go.
    const outputDir = freshDir("root");
    writeFileSync(join(outputDir, "diagnostics"), "not a dir");
    const videoPath = buildMp4(outputDir, "tone", "tone");

    const dir = writeDiagnosticsBundle({ outputDir, report: FAIL_REPORT, videoPath });
    expect(dir).toBeNull();
  });
});

const GOOD_ASS = "Dialogue: 0,0:00:00.20,0:00:00.70,Default,,0,0,0,,{\\kt0\\kf50}expected-word";
const BAD_ASS = "Dialogue: 0,0:00:00.20,0:00:01.00,Default,,0,0,0,,plain-text";
const TIMING_DATA = [
  { sceneId: 1, segments: [{ words: [{ text: "expected-word", start: 0.2, end: 0.7 }] }] },
];
// clips 1.5s + 1.0s → scene 2 offset 1.5s (matches the audio-sync tests)
const SCENE_DURATIONS = [
  { sceneId: 1, duration: 1.0 },
  { sceneId: 2, duration: 0.5 },
];

/** Deterministic noise burst — aperiodic, so the correlation peak is unique. */
function noise(seconds, seed, rate = 44100) {
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (s / 0x40000000 - 1) * 0.5;
  }
  return out;
}

/** Scene mp3s + a shipped track assembled from them — exactly like assemble.mjs. */
function makeDriftFixture(ttsDurations) {
  const dir = freshDir("drift");
  const audioDir = join(dir, "audio");
  mkdirSync(audioDir);

  for (const [id, seconds, seed] of [
    [1, 1.0, 42],
    [2, 0.5, 1337],
  ]) {
    const srcWav = join(dir, `scene-${id}-src.wav`);
    writeWavPcm(srcWav, noise(seconds, seed), 44100);
    execSync(
      `ffmpeg -y -i "${srcWav}" -codec:a libmp3lame -q:a 4 "${join(audioDir, `scene-${id}.mp3`)}" 2>/dev/null`,
    );
  }

  const finalPath = join(dir, "final.wav");
  buildVoiceoverTrack({
    sceneAudioPaths: [join(audioDir, "scene-1.mp3"), join(audioDir, "scene-2.mp3")],
    ttsDurations,
    outputPath: finalPath,
  });

  const assPath = join(dir, "good.ass");
  writeFileSync(assPath, GOOD_ASS);
  return { dir, finalPath, assPath };
}

describe("verifySubtitles FAIL trigger (integration, real ffmpeg)", () => {
  it("writes a diagnostics bundle when verification fails with outputDir", () => {
    const dir = freshDir("trigger");
    const videoPath = buildMp4(dir, "silent", "silent");
    const assPath = join(dir, "bad.ass");
    writeFileSync(assPath, BAD_ASS);

    const report = verifySubtitles({
      videoPath,
      assPath,
      timingData: TIMING_DATA,
      sceneDurations: SCENE_DURATIONS,
      outputDir: dir,
    });

    expect(report.summary.passed).toBe(false);
    const bundleRoot = join(dir, "diagnostics");
    expect(existsSync(bundleRoot)).toBe(true);
    const bundleDir = join(bundleRoot, readdirSync(bundleRoot)[0]);
    for (const name of [
      "summary.txt",
      "drift.json",
      "packet-gaps.json",
      "streams.json",
      "verification-report.json",
    ]) {
      expect(existsSync(join(bundleDir, name))).toBe(true);
    }
  });

  it("writes nothing and does not crash when outputDir is absent", () => {
    const dir = freshDir("trigger");
    const videoPath = buildMp4(dir, "silent", "silent");
    const assPath = join(dir, "bad.ass");
    writeFileSync(assPath, BAD_ASS);

    const report = verifySubtitles({
      videoPath,
      assPath,
      timingData: TIMING_DATA,
      sceneDurations: SCENE_DURATIONS,
    });

    expect(report.summary.passed).toBe(false);
    expect(existsSync(join(dir, "diagnostics"))).toBe(false);
  });

  it("writes ZERO diagnostics bytes on PASS (hard rule, row 1)", () => {
    const dir = freshDir("trigger");
    const videoPath = buildMp4(dir, "tone", "tone");
    const assPath = join(dir, "good.ass");
    writeFileSync(assPath, GOOD_ASS);

    const report = verifySubtitles({
      videoPath,
      assPath,
      timingData: TIMING_DATA,
      sceneDurations: SCENE_DURATIONS,
      outputDir: dir,
    });

    expect(report.summary.passed).toBe(true);
    expect(existsSync(join(dir, "diagnostics"))).toBe(false);
    // Only what PASS already writes: nothing new beyond the report file.
    expect(readdirSync(dir).sort()).toEqual(["good.ass", "tone.mp4", "verification-report.json"]);
  }, 20000);

  it("triggers the bundle on a pure audio-sync drift FAIL (row 2 live path)", () => {
    // Scene 1's voiceover is lied to 1.2s during assembly → scene 2's audio
    // lands 200ms late, while the timeline still expects 1.5s. The word axis
    // passes; only the end-to-end audio check fails.
    const { dir, finalPath, assPath } = makeDriftFixture([1.2, 0.5]);

    const report = verifySubtitles({
      videoPath: finalPath,
      assPath,
      timingData: TIMING_DATA,
      sceneDurations: SCENE_DURATIONS,
      outputDir: dir,
    });

    expect(report.summary.passed).toBe(false);
    const bundleRoot = join(dir, "diagnostics");
    expect(existsSync(bundleRoot)).toBe(true);
    const bundleDir = join(bundleRoot, readdirSync(bundleRoot)[0]);
    const summary = readFileSync(join(bundleDir, "summary.txt"), "utf8");
    expect(summary).toContain("scene 2");
    expect(summary).toContain("+200ms");
    // drift.json carries the exact (pre-rounding) measurement — 199.75ms here,
    // because 44100→4000 resampling snaps the onset to a sample boundary.
    const drift = JSON.parse(readFileSync(join(bundleDir, "drift.json"), "utf8"));
    const scene2 = drift.scenes.find((s) => s.sceneId === 2);
    expect(scene2.ok).toBe(false);
    expect(Math.round(scene2.driftMs)).toBe(200);
  }, 20000);

  it("writes the bundle when run through the CLI wrapper with output-dir (exit 1)", () => {
    const dir = freshDir("trigger");
    const videoPath = buildMp4(dir, "silent", "silent");
    const assPath = join(dir, "bad.ass");
    writeFileSync(assPath, BAD_ASS);
    const timingPath = join(dir, "timing.json");
    const durationsPath = join(dir, "durations.json");
    writeFileSync(timingPath, JSON.stringify(TIMING_DATA));
    writeFileSync(durationsPath, JSON.stringify(SCENE_DURATIONS));

    let status = 0;
    try {
      execSync(
        `node "${CLI}" "${videoPath}" "${assPath}" "${timingPath}" "${durationsPath}" "${dir}"`,
        { stdio: "pipe" },
      );
    } catch (e) {
      status = e.status;
    }
    expect(status).toBe(1);
    expect(existsSync(join(dir, "diagnostics"))).toBe(true);
  });
});
