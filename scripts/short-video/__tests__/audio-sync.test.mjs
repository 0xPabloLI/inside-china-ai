import { describe, it, expect, afterEach } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  evaluateAudioSync,
  applyAudioSyncToSummary,
  verifyAudioSync,
  realignAudioToTimeline,
  resolveSceneAudio,
} from "../lib/audio/sync.mjs";
import { buildVoiceoverTrack } from "../lib/audio/track.mjs";
import { writeWavPcm } from "../lib/audio/wav.mjs";

describe("evaluateAudioSync", () => {
  const TOL = 0.08;

  it("passes when every scene's measured onset is within tolerance", () => {
    const result = evaluateAudioSync(
      [
        { sceneId: 1, expected: 0.0, measured: 0.024 },
        { sceneId: 2, expected: 4.533, measured: 4.56 },
        { sceneId: 11, expected: 67.733, measured: 67.7 },
      ],
      TOL,
    );
    expect(result.passed).toBe(true);
    expect(result.errors).toBe(0);
    expect(result.checked).toBe(3);
  });

  it("fails when a scene drifts beyond tolerance", () => {
    const result = evaluateAudioSync(
      [
        { sceneId: 1, expected: 0.0, measured: 0.024 },
        // 4.533 → 4.73 = +197ms
        { sceneId: 2, expected: 4.533, measured: 4.73 },
      ],
      TOL,
    );
    expect(result.passed).toBe(false);
    expect(result.errors).toBe(1);
    const offender = result.scenes.find((s) => s.sceneId === 2);
    expect(offender.ok).toBe(false);
    expect(offender.driftMs).toBeCloseTo(197, 0);
  });

  it("accepts drift exactly at the tolerance boundary and rejects just past it", () => {
    const atBoundary = evaluateAudioSync([{ sceneId: 1, expected: 1.0, measured: 1.08 }], TOL);
    expect(atBoundary.passed).toBe(true);

    const pastBoundary = evaluateAudioSync([{ sceneId: 1, expected: 1.0, measured: 1.0801 }], TOL);
    expect(pastBoundary.passed).toBe(false);
  });

  it("accepts symmetric negative drift", () => {
    const result = evaluateAudioSync([{ sceneId: 1, expected: 5.0, measured: 4.95 }], TOL);
    expect(result.passed).toBe(true);
  });

  it("reports zero checked scenes as passed", () => {
    const result = evaluateAudioSync([], TOL);
    expect(result.passed).toBe(true);
    expect(result.checked).toBe(0);
  });
});

describe("applyAudioSyncToSummary", () => {
  const base = { errors: 2, warnings: 1, passed: false };

  it("returns the summary unchanged when audio sync did not run", () => {
    expect(applyAudioSyncToSummary(base, null)).toBe(base);
  });

  it("adds audio sync errors and flips passed when audio sync fails", () => {
    const audioSync = { errors: 1, passed: false };
    const merged = applyAudioSyncToSummary(base, audioSync);
    expect(merged.errors).toBe(3);
    expect(merged.warnings).toBe(1);
    expect(merged.passed).toBe(false);
    expect(base.errors).toBe(2); // original not mutated
  });

  it("stays failed when the base summary already failed even if audio sync passes", () => {
    const merged = applyAudioSyncToSummary(base, { errors: 0, passed: true });
    expect(merged.passed).toBe(false);
    expect(merged.errors).toBe(2);
  });

  it("passes only when both axes pass", () => {
    const merged = applyAudioSyncToSummary(
      { errors: 0, warnings: 0, passed: true },
      { errors: 0, passed: true },
    );
    expect(merged.passed).toBe(true);
  });
});

/**
 * Integration: verifyAudioSync against real files through real ffmpeg.
 * Scene voiceovers are deterministic noise bursts (unique correlation peak),
 * encoded to actual mp3s; the "final video" is assembled from those mp3s by
 * buildVoiceoverTrack — exactly what the retired FFmpeg assembler
 * (retired-html-path/) did — so encoder delay affects needle and haystack
 * identically and cancels out.
 */
describe("verifyAudioSync (integration, real ffmpeg)", () => {
  // durations → clips 1.5s + 1.0s → scene 2 expected offset = 1.5s
  const SCENE_DURATIONS = [
    { sceneId: 1, duration: 1.0 },
    { sceneId: 2, duration: 0.5 },
  ];
  const SCENE2_OFFSET = 1.5;
  let dirs = [];

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs = [];
  });

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

  /** Build {outputDir}/audio/scene-{1,2}.mp3 — real mp3s, like the TTS stage. */
  function makeFixture() {
    const dir = mkdtempSync(join(tmpdir(), "audiosync-it-"));
    dirs.push(dir);
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
    return { dir };
  }

  /** Assemble the shipped track from the scene mp3s, exactly like assemble.mjs. */
  function buildFinal(dir, ttsDurations) {
    const finalPath = join(dir, "final.wav");
    buildVoiceoverTrack({
      sceneAudioPaths: [join(dir, "audio", "scene-1.mp3"), join(dir, "audio", "scene-2.mp3")],
      ttsDurations,
      outputPath: finalPath,
    });
    return finalPath;
  }

  it("measures both scenes at their exact timeline offsets and passes", () => {
    const { dir } = makeFixture();
    const finalPath = buildFinal(dir, [1.0, 0.5]);

    const result = verifyAudioSync({
      videoPath: finalPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
    });

    expect(result.errored).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.checked).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(0);
    const scene2 = result.scenes.find((s) => s.sceneId === 2);
    expect(scene2.expected).toBeCloseTo(SCENE2_OFFSET, 3);
    expect(Math.abs(scene2.measured - SCENE2_OFFSET)).toBeLessThan(0.03);
  }, 20000);

  it("fails when the shipped audio actually drifted (scene placed 200ms late)", () => {
    const { dir } = makeFixture();
    // Lie about scene 1's duration when assembling: scene 2 lands at 1.7s,
    // while the timeline still expects 1.5s.
    const finalPath = buildFinal(dir, [1.2, 0.5]);

    const result = verifyAudioSync({
      videoPath: finalPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
    });

    expect(result.passed).toBe(false);
    expect(result.errors).toBe(1);
    const scene2 = result.scenes.find((s) => s.sceneId === 2);
    expect(scene2.ok).toBe(false);
    expect(scene2.driftMs).toBeCloseTo(200, -1);
  }, 20000);

  it("skips a scene whose audio file is missing (fail-open), without failing", () => {
    const { dir } = makeFixture();
    const finalPath = buildFinal(dir, [1.0, 0.5]);
    rmSync(join(dir, "audio", "scene-2.mp3"));

    const result = verifyAudioSync({
      videoPath: finalPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
    });

    expect(result.passed).toBe(true);
    expect(result.errors).toBe(0);
    expect(result.checked).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.skippedScenes).toEqual([2]);
  }, 20000);

  it("counts a present-but-undecodable scene file as an error (fail-closed)", () => {
    const { dir } = makeFixture();
    const finalPath = buildFinal(dir, [1.0, 0.5]);
    writeFileSync(join(dir, "audio", "scene-2.mp3"), "this is not audio");

    const result = verifyAudioSync({
      videoPath: finalPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
    });

    expect(result.passed).toBe(false);
    expect(result.errors).toBe(1);
    expect(result.checked).toBe(1);
    expect(result.failedScenes).toHaveLength(1);
    expect(result.failedScenes[0].sceneId).toBe(2);
  }, 20000);

  it("errors when the shipped video has no audio track at all", () => {
    const { dir } = makeFixture();
    const silentPath = join(dir, "silent.mp4");
    execSync(
      `ffmpeg -y -f lavfi -i color=c=black:s=64x64:d=1 -pix_fmt yuv420p "${silentPath}" 2>/dev/null`,
    );

    const result = verifyAudioSync({
      videoPath: silentPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
    });

    expect(result.errored).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.errors).toBe(1);
    expect(result.checked).toBe(0);
  }, 20000);
});

// ─── resolveSceneAudio: format-agnostic file resolution ───
//
// TTS engines output different formats: F5-MLX and Qwen3 output .wav; edge-tts
// and `say` output .mp3. resolveSceneAudio finds the right file without
// hard-coding an extension — the root cause of the silent audioSync skip bug.
//
describe("resolveSceneAudio", () => {
  let dirs = [];

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs = [];
  });

  function makeDir() {
    const dir = mkdtempSync(join(tmpdir(), "resolve-audio-"));
    dirs.push(dir);
    mkdirSync(join(dir, "audio"));
    return dir;
  }

  it("finds a .wav scene file (F5-MLX / Qwen3 path)", () => {
    const dir = makeDir();
    const wavPath = join(dir, "audio", "scene-1.wav");
    writeFileSync(wavPath, "dummy");

    const result = resolveSceneAudio(join(dir, "audio"), 1);
    expect(result).toBe(wavPath);
  });

  it("finds a .mp3 scene file (edge-tts / say path)", () => {
    const dir = makeDir();
    const mp3Path = join(dir, "audio", "scene-1.mp3");
    writeFileSync(mp3Path, "dummy");

    const result = resolveSceneAudio(join(dir, "audio"), 1);
    expect(result).toBe(mp3Path);
  });

  it("prefers .wav when both .wav and .mp3 exist", () => {
    const dir = makeDir();
    const wavPath = join(dir, "audio", "scene-1.wav");
    const mp3Path = join(dir, "audio", "scene-1.mp3");
    writeFileSync(wavPath, "wav-content");
    writeFileSync(mp3Path, "mp3-content");

    const result = resolveSceneAudio(join(dir, "audio"), 1);
    expect(result).toBe(wavPath);
  });

  it("returns null when neither .wav nor .mp3 exists", () => {
    const dir = makeDir();

    const result = resolveSceneAudio(join(dir, "audio"), 99);
    expect(result).toBeNull();
  });

  it("returns null for null/undefined sceneId", () => {
    const dir = makeDir();
    expect(resolveSceneAudio(join(dir, "audio"), null)).toBeNull();
    expect(resolveSceneAudio(join(dir, "audio"), undefined)).toBeNull();
  });
});

// ─── verifyAudioSync with .wav scene files (F5-MLX / Qwen3 path) ───
//
describe("verifyAudioSync with .wav scene files (integration, real ffmpeg)", () => {
  const SCENE_DURATIONS = [
    { sceneId: 1, duration: 1.0 },
    { sceneId: 2, duration: 0.5 },
  ];
  const SCENE2_OFFSET = 1.5;
  let dirs = [];

  afterEach(() => {
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

  /** Build {outputDir}/audio/scene-{1,2}.wav — real wavs, like F5-MLX / Qwen3. */
  function makeWavFixture() {
    const dir = mkdtempSync(join(tmpdir(), "audiosync-wav-"));
    dirs.push(dir);
    const audioDir = join(dir, "audio");
    mkdirSync(audioDir);

    for (const [id, seconds, seed] of [
      [1, 1.0, 42],
      [2, 0.5, 1337],
    ]) {
      const wavPath = join(audioDir, `scene-${id}.wav`);
      writeWavPcm(wavPath, noise(seconds, seed), 44100);
    }
    return { dir };
  }

  /** Assemble the shipped track from scene wavs (track.mjs accepts wav too). */
  function buildFinal(dir, ttsDurations) {
    const finalPath = join(dir, "final.wav");
    buildVoiceoverTrack({
      sceneAudioPaths: [join(dir, "audio", "scene-1.wav"), join(dir, "audio", "scene-2.wav")],
      ttsDurations,
      outputPath: finalPath,
    });
    return finalPath;
  }

  it("measures both .wav scenes at their exact timeline offsets and passes", () => {
    const { dir } = makeWavFixture();
    const finalPath = buildFinal(dir, [1.0, 0.5]);

    const result = verifyAudioSync({
      videoPath: finalPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
    });

    expect(result.errored).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.checked).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(0);
    const scene2 = result.scenes.find((s) => s.sceneId === 2);
    expect(scene2.expected).toBeCloseTo(SCENE2_OFFSET, 3);
    expect(Math.abs(scene2.measured - SCENE2_OFFSET)).toBeLessThan(0.03);
  }, 20000);

  it("skips all scenes when only .wav exists but sync looks for .mp3 (regression guard)", () => {
    // This test documents the bug: if sync hard-coded .mp3 but TTS output .wav,
    // every scene was silently skipped. With resolveSceneAudio, this should NOT
    // happen — .wav files should be found and measured.
    const { dir } = makeWavFixture();
    const finalPath = buildFinal(dir, [1.0, 0.5]);

    const result = verifyAudioSync({
      videoPath: finalPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
    });

    // Before fix: skipped=2, checked=0. After fix: skipped=0, checked=2.
    expect(result.skipped).toBe(0);
    expect(result.checked).toBe(2);
  }, 20000);
});

// ─── verifyAudioSync honors audioPaths over re-resolution (regression) ───
//
// Render-only packs can retain a stale .mp3 while a fresh .wav (from a later
// TTS regeneration) sits beside it. Assembly picks .mp3 (mp3-first); the old
// verifier re-resolved with wav-priority and measured the WRONG generation,
// producing a false audio-sync-drift failure across every scene. audioPaths
// threads the exact assembly source through so the verifier measures the file
// actually burned into the shipped artifact.
describe("verifyAudioSync honors audioPaths (assembly-source regression)", () => {
  const SCENE_DURATIONS = [
    { sceneId: 1, duration: 1.0 },
    { sceneId: 2, duration: 0.5 },
  ];
  const SCENE2_OFFSET = 1.5;
  let dirs = [];

  afterEach(() => {
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

  /** Real .mp3 per scene + an undecodable stale .wav, like a regenerated pack. */
  function makeStaleMp3Fixture() {
    const dir = mkdtempSync(join(tmpdir(), "audiosync-stale-"));
    dirs.push(dir);
    const audioDir = join(dir, "audio");
    mkdirSync(audioDir);

    const mp3Paths = [];
    for (const [id, seconds, seed] of [
      [1, 1.0, 42],
      [2, 0.5, 1337],
    ]) {
      const wavSrc = join(dir, `scene-${id}-src.wav`);
      writeWavPcm(wavSrc, noise(seconds, seed), 44100);
      const mp3Path = join(audioDir, `scene-${id}.mp3`);
      execSync(`ffmpeg -y -i "${wavSrc}" -codec:a libmp3lame -q:a 4 "${mp3Path}" 2>/dev/null`);
      mp3Paths.push(mp3Path);
      // Stale .wav from a different generation — undecodable, so re-resolution
      // that picks it lands in failedScenes instead of silently matching.
      writeFileSync(join(audioDir, `scene-${id}.wav`), "this is not audio");
    }
    return { dir, mp3Paths };
  }

  function buildFinal(dir, ttsDurations) {
    const finalPath = join(dir, "final.wav");
    buildVoiceoverTrack({
      sceneAudioPaths: [join(dir, "audio", "scene-1.mp3"), join(dir, "audio", "scene-2.mp3")],
      ttsDurations,
      outputPath: finalPath,
    });
    return finalPath;
  }

  it("re-resolution picks .wav and FAILS when mp3 was assembled (the old bug)", () => {
    const { dir } = makeStaleMp3Fixture();
    const finalPath = buildFinal(dir, [1.0, 0.5]);

    const result = verifyAudioSync({
      videoPath: finalPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
    });

    // resolveSceneAudio chose the undecodable .wav for each scene → failures.
    expect(result.passed).toBe(false);
    expect(result.errors).toBeGreaterThan(0);
  }, 20000);

  it("audioPaths pins the assembled .mp3 and PASSES (the fix)", () => {
    const { dir, mp3Paths } = makeStaleMp3Fixture();
    const finalPath = buildFinal(dir, [1.0, 0.5]);

    const result = verifyAudioSync({
      videoPath: finalPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
      audioPaths: mp3Paths,
    });

    expect(result.errored).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.checked).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(0);
    const scene2 = result.scenes.find((s) => s.sceneId === 2);
    expect(scene2.expected).toBeCloseTo(SCENE2_OFFSET, 3);
    expect(Math.abs(scene2.measured - SCENE2_OFFSET)).toBeLessThan(0.03);
  }, 20000);
});

describe("realignAudioToTimeline (integration, real ffmpeg)", () => {
  // Same fixture family as the verifyAudioSync integration tests above.
  const SCENE_DURATIONS = [
    { sceneId: 1, duration: 1.0 },
    { sceneId: 2, duration: 0.5 },
  ];
  let dirs = [];

  afterEach(() => {
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

  function makeFixture() {
    const dir = mkdtempSync(join(tmpdir(), "realign-it-"));
    dirs.push(dir);
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
      sceneAudioPaths: [join(dir, "audio", "scene-1.mp3"), join(dir, "audio", "scene-2.mp3")],
      ttsDurations: [1.0, 0.5],
      outputPath: finalPath,
    });
    return { dir, finalPath };
  }

  /** Simulate the Remotion AAC-priming delay: pad the whole track's start. */
  function delayTrack(finalPath, ms) {
    const delayed = finalPath.replace(".wav", `-delayed${ms}.wav`);
    execSync(`ffmpeg -y -i "${finalPath}" -af adelay=${ms}:all=1 "${delayed}" 2>/dev/null`);
    return delayed;
  }

  /** Simulate audio placed early: cut into the track's head. */
  function trimTrack(finalPath, seconds) {
    const early = finalPath.replace(".wav", `-early.wav`);
    execSync(
      `ffmpeg -y -i "${finalPath}" -af atrim=start=${seconds},asetpts=PTS-STARTPTS "${early}" 2>/dev/null`,
    );
    return early;
  }

  it("trims a constant leading delay back onto the timeline", () => {
    const { dir, finalPath } = makeFixture();
    const delayedPath = delayTrack(finalPath, 120);

    const result = realignAudioToTimeline({
      videoPath: delayedPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
    });

    expect(result.realigned).toBe(true);
    expect(result.driftMsBefore).toBeGreaterThan(100);

    const after = verifyAudioSync({
      videoPath: delayedPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
    });
    expect(after.passed).toBe(true);
    for (const scene of after.scenes) {
      expect(Math.abs(scene.driftMs)).toBeLessThan(20);
    }
  }, 30000);

  it("leaves an already-aligned track untouched", () => {
    const { dir, finalPath } = makeFixture();

    const result = realignAudioToTimeline({
      videoPath: finalPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
    });

    expect(result.realigned).toBe(false);

    const after = verifyAudioSync({
      videoPath: finalPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
    });
    expect(after.passed).toBe(true);
  }, 30000);

  it("refuses early audio (negative drift) — not the AAC-priming bug class", () => {
    const { dir, finalPath } = makeFixture();
    const earlyPath = trimTrack(finalPath, 0.12);

    const result = realignAudioToTimeline({
      videoPath: earlyPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
    });

    // Scene 1's correlation peak clamps at track start for early audio, so
    // the drift is not measurable as a constant — head trimming must refuse
    // rather than guess, and the verifier stays the loud failure path.
    expect(result.realigned).toBe(false);
    expect(result.reason).toBeTruthy();

    const after = verifyAudioSync({
      videoPath: earlyPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
    });
    expect(after.passed).toBe(false);
  }, 30000);
});
