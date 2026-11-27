/**
 * #1582: audio decode and measurement must resolve ffmpeg through
 * `lib/ffmpeg-bins.mjs`, never through a bare `"ffmpeg"` PATH lookup.
 *
 * Failure this pins: an agent shell or clean worktree has no Homebrew on PATH,
 * so `decodeToWavFile()` died with `spawnSync ffmpeg ENOENT`, the realign pass
 * could not fix drift, and every `ffmpegMeasureCmd` consumer (verify-subtitles,
 * post-process read-back, BGM/cut detectors) failed — while `FFMPEG_BIN` pointed
 * at a perfectly good ffmpeg-full.
 *
 * The behavioural cases run the real modules in a child process whose PATH is
 * stripped to `/usr/bin:/bin` (no Homebrew) and only `FFMPEG_BIN` is supplied.
 * The statics keep future call sites from re-growing a literal.
 */
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { FFMPEG_BIN } from "../lib/ffmpeg-bins.mjs";
import { writeWavPcm } from "../lib/audio/wav.mjs";
import { buildVoiceoverTrack } from "../lib/audio/track.mjs";
import { ffmpegMeasureCmd } from "../lib/tts/ffmpeg-cmd.mjs";

const LIB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "lib");

/** Absolute ffmpeg to hand the stripped-PATH child; null when none is installed. */
function absoluteFfmpeg() {
  if (FFMPEG_BIN.startsWith("/")) return existsSync(FFMPEG_BIN) ? FFMPEG_BIN : null;
  const which = spawnSync("which", ["ffmpeg"], { encoding: "utf8" });
  if (which.status !== 0) return null;
  const p = which.stdout.trim();
  return p && existsSync(p) ? p : null;
}

const FFMPEG_ABS = absoluteFfmpeg();
const STRIPPED_PATH = "/usr/bin:/bin"; // macOS: neither bin carries ffmpeg

let dirs = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

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

/** A real voiceover track (1.0s + 0.5s scenes) delayed 120ms — the #176 shape. */
function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), "ffmpeg-seam-"));
  dirs.push(dir);
  const audioDir = join(dir, "audio");
  mkdirSync(audioDir);

  const scene1 = join(audioDir, "scene-1.wav");
  const scene2 = join(audioDir, "scene-2.wav");
  writeWavPcm(scene1, noise(1.0, 42), 44100);
  writeWavPcm(scene2, noise(0.5, 1337), 44100);

  const base = join(dir, "final.wav");
  buildVoiceoverTrack({
    sceneAudioPaths: [scene1, scene2],
    ttsDurations: [1.0, 0.5],
    outputPath: base,
  });

  const delayed = join(dir, "final-delayed.wav");
  execFileSync(FFMPEG_ABS, ["-y", "-i", base, "-af", "adelay=120:all=1", delayed], {
    stdio: "pipe",
  });

  return {
    dir,
    delayed,
    sceneDurations: [
      { sceneId: 1, duration: 1.0 },
      { sceneId: 2, duration: 0.5 },
    ],
  };
}

/** Run the real modules in a child whose PATH has no Homebrew. */
function runStrippedPath({ dir, delayed, sceneDurations }, { ffmpegBin }) {
  const wavUrl = pathToFileURL(join(LIB_DIR, "audio", "wav.mjs")).href;
  const syncUrl = pathToFileURL(join(LIB_DIR, "audio", "sync.mjs")).href;
  const cmdUrl = pathToFileURL(join(LIB_DIR, "tts", "ffmpeg-cmd.mjs")).href;
  const decoded = join(dir, "decoded-stripped-path.wav");

  const program = `
const { decodeToWavFile } = await import(${JSON.stringify(wavUrl)});
const { realignAudioToTimeline } = await import(${JSON.stringify(syncUrl)});
const { ffmpegMeasureCmd } = await import(${JSON.stringify(cmdUrl)});
const { existsSync } = await import("fs");

const payload = { measureCmd: ffmpegMeasureCmd };
try {
  decodeToWavFile(${JSON.stringify(join(dir, "audio", "scene-1.wav"))}, ${JSON.stringify(decoded)}, 4000);
  payload.decode = existsSync(${JSON.stringify(decoded)}) ? "ok" : "no output file";
} catch (e) {
  payload.decode = String(e.message).split("\\n")[0];
}

const r = realignAudioToTimeline({
  videoPath: ${JSON.stringify(delayed)},
  outputDir: ${JSON.stringify(dir)},
  sceneDurations: ${JSON.stringify(sceneDurations)},
});
payload.realign = { realigned: r.realigned, driftMsBefore: r.driftMsBefore, reason: r.reason };
process.stdout.write(JSON.stringify(payload));
`;

  const out = execFileSync(process.execPath, ["--input-type=module", "-e", program], {
    encoding: "utf8",
    env: { PATH: STRIPPED_PATH, FFMPEG_BIN: ffmpegBin },
  });
  return JSON.parse(out);
}

describe("ffmpegMeasureCmd resolves through the shared seam (#1582)", () => {
  it("equals the resolved FFMPEG_BIN, not a literal name", () => {
    expect(ffmpegMeasureCmd).toBe(FFMPEG_BIN);
  });

  it("follows an explicit FFMPEG_BIN override", () => {
    const moduleUrl = pathToFileURL(join(LIB_DIR, "tts", "ffmpeg-cmd.mjs")).href;
    const program = `const m = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(m.ffmpegMeasureCmd);`;
    const resolved = execFileSync(process.execPath, ["--input-type=module", "-e", program], {
      encoding: "utf8",
      env: { ...process.env, FFMPEG_BIN: "/tmp/measure-override-ffmpeg" },
    });
    expect(resolved).toBe("/tmp/measure-override-ffmpeg");
  });
});

describe("decode / realign under a PATH without Homebrew (#1582)", () => {
  it.skipIf(!FFMPEG_ABS)(
    "decodes and realigns with only FFMPEG_BIN available",
    () => {
      const fixture = makeFixture();
      const result = runStrippedPath(fixture, { ffmpegBin: FFMPEG_ABS });

      expect(result.decode).toBe("ok");
      expect(result.realign.realigned).toBe(true);
      expect(result.realign.driftMsBefore).toBeGreaterThan(100);
      expect(result.measureCmd).toBe(FFMPEG_ABS);
    },
    30000,
  );

  it.skipIf(!FFMPEG_ABS)(
    "names the override path when it is missing — no silent PATH fallback",
    () => {
      const fixture = makeFixture();
      const result = runStrippedPath(fixture, { ffmpegBin: "/tmp/does-not-exist-ffmpeg" });

      expect(result.decode).toMatch(/does-not-exist-ffmpeg/);
      expect(result.realign.realigned).toBe(false);
    },
    30000,
  );
});

describe("no bare ffmpeg call sites remain in the audio decode/measure layer", () => {
  it.each(["audio/wav.mjs", "audio/sync.mjs"])("%s routes through ffmpeg-bins", (file) => {
    const src = readFileSync(join(LIB_DIR, file), "utf8");
    expect(src).toMatch(/from "\.\.\/ffmpeg-bins\.mjs"/);
    expect(src).not.toMatch(/execFileSync\(\s*["']ffmpeg["']/);
  });

  it("tts/ffmpeg-cmd.mjs does not hardcode the measurement binary", () => {
    const src = readFileSync(join(LIB_DIR, "tts", "ffmpeg-cmd.mjs"), "utf8");
    expect(src).not.toMatch(/ffmpegMeasureCmd\s*=\s*["']ffmpeg["']/);
  });
});
