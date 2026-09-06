/**
 * Tests for the single-pass render finalize chain (#198 Item 1).
 *
 * renderRemotion used to run up to 4 sequential ffmpeg passes over the same
 * mp4 (burnSubtitles → mixBgm → normalizeLoudness → realignAudioToTimeline),
 * costing 2-3 full re-encodes plus 3 generations of AAC loss per render.
 * finalizeRenderedVideo() collapses subs + BGM + loudnorm + #176 head trim
 * into one -filter_complex pass, with the head-trim drift measured on the
 * RAW remotion output before the single encode.
 */
import { describe, it, expect, afterEach } from "vitest";
import { execSync, execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { buildFinalizeArgs, finalizeRenderedVideo } from "../lib/post-process.mjs";
import { measureAudioDrift, verifyAudioSync } from "../lib/audio/sync.mjs";
import { buildVoiceoverTrack } from "../lib/audio/track.mjs";
import { writeWavPcm } from "../lib/audio/wav.mjs";

// ─── buildFinalizeArgs: pure filter-graph composition ───

describe("buildFinalizeArgs", () => {
  const base = {
    videoPath: "/tmp/in.mp4",
    outputPath: "/tmp/out.mp4",
    bgmFadeOutStart: 57.0,
  };

  it("burns subs, mixes BGM, applies loudnorm and head trim in one pass", () => {
    const args = buildFinalizeArgs({
      ...base,
      assPath: "/tmp/subs.ass",
      bgmPath: "/tmp/bgm.wav",
      audioFilter: "atrim=start=0.120000,asetpts=PTS-STARTPTS",
    });
    const cmd = args.join(" ");
    // one command, one filter_complex
    expect(args.filter((a) => a === "-filter_complex")).toHaveLength(1);
    // subtitle burn on video
    expect(cmd).toContain("[0:v]ass=/tmp/subs.ass[vout]");
    // head trim feeds the TTS branch before the mix
    expect(cmd).toContain("[0:a]atrim=start=0.120000,asetpts=PTS-STARTPTS[tts]");
    // BGM branch: fades + volume, then amix duration=first
    expect(cmd).toContain("afade=t=in:st=0:d=0.1");
    expect(cmd).toContain("afade=t=out:st=57.00:d=3");
    expect(cmd).toContain("volume=0.12");
    expect(cmd).toContain("amix=inputs=2:duration=first:dropout_transition=0");
    // loudnorm comes after the amix (current chain order)
    const amixAt = cmd.indexOf("amix=");
    const normAt = cmd.indexOf("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(amixAt).toBeGreaterThan(-1);
    expect(normAt).toBeGreaterThan(amixAt);
    // mapped filtered outputs, audio codec params match the old chain
    expect(cmd).toContain("-map [vout]");
    expect(cmd).toContain("-map [aout]");
    expect(cmd).toContain("-c:a aac -b:a 192k -ar 44100");
    // subtitles force a video re-encode — no -c:v copy
    expect(args).not.toContain("copy");
    // looped BGM input after the video input
    expect(args).toContain("-stream_loop");
    expect(args).toContain("-1");
    expect(args.indexOf("/tmp/bgm.wav")).toBeGreaterThan(args.indexOf("/tmp/in.mp4"));
  });

  it("copies the video stream when no subtitles are supplied", () => {
    const args = buildFinalizeArgs({
      ...base,
      assPath: null,
      bgmPath: "/tmp/bgm.wav",
      audioFilter: null,
    });
    const cmd = args.join(" ");
    expect(cmd).not.toContain("ass=");
    expect(cmd).toContain("-c:v copy");
    expect(cmd).toContain("-map 0:v");
  });

  it("skips the amix branch when no BGM is supplied", () => {
    const args = buildFinalizeArgs({
      ...base,
      assPath: "/tmp/subs.ass",
      bgmPath: null,
      audioFilter: null,
    });
    const cmd = args.join(" ");
    expect(cmd).not.toContain("amix");
    expect(cmd).toContain("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(cmd).toContain("[0:v]ass=/tmp/subs.ass[vout]");
    // audio chain goes straight into loudnorm
    expect(cmd).toContain("[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[aout]");
  });

  it("emits no audio filter head when the trim is a no-op", () => {
    const args = buildFinalizeArgs({
      ...base,
      assPath: null,
      bgmPath: null,
      audioFilter: null,
    });
    const cmd = args.join(" ");
    expect(cmd).not.toContain("atrim");
    expect(cmd).not.toContain("adelay");
  });

  it("supports head padding (negative drift) via the audio filter", () => {
    const args = buildFinalizeArgs({
      ...base,
      assPath: null,
      bgmPath: "/tmp/bgm.wav",
      audioFilter: "adelay=90:all=1",
    });
    const cmd = args.join(" ");
    expect(cmd).toContain("[0:a]adelay=90:all=1[tts]");
  });
});

// ─── measureAudioDrift: drift measurement extracted from realign ───

describe("measureAudioDrift (integration, real ffmpeg)", () => {
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

  /** Real mp3 scene audio + a shipped mp4 whose track starts `delayMs` late. */
  function makeFixture(delayMs) {
    const dir = mkdtempSync(join(tmpdir(), "finalize-drift-"));
    dirs.push(dir);
    const audioDir = join(dir, "audio");
    mkdirSync(audioDir);

    const mp3Paths = [];
    for (const [id, seconds, seed] of [
      [1, 1.0, 42],
      [2, 0.5, 1337],
    ]) {
      const srcWav = join(dir, `scene-${id}-src.wav`);
      writeWavPcm(srcWav, noise(seconds, seed), 44100);
      const mp3Path = join(audioDir, `scene-${id}.mp3`);
      execSync(
        `ffmpeg -y -i "${srcWav}" -codec:a libmp3lame -q:a 4 "${mp3Path}" 2>/dev/null`,
      );
      mp3Paths.push(mp3Path);
    }

    const alignedWav = join(dir, "aligned.wav");
    buildVoiceoverTrack({
      sceneAudioPaths: mp3Paths,
      ttsDurations: [1.0, 0.5],
      outputPath: alignedWav,
    });

    // Wrap the voiceover in a real mp4 (h264 + aac), like the Remotion raw output.
    const videoSrc = join(dir, "video-src.mp4");
    execSync(
      `ffmpeg -y -f lavfi -i color=c=black:s=320x568:d=2.2 -i "${alignedWav}" ` +
        `-c:v libx264 -c:a aac -shortest "${videoSrc}" 2>/dev/null`,
    );

    const rawPath = join(dir, "raw.mp4");
    if (delayMs > 0) {
      execSync(
        `ffmpeg -y -i "${videoSrc}" -af adelay=${delayMs}:all=1 -c:v copy -c:a aac "${rawPath}" 2>/dev/null`,
      );
    } else {
      execSync(`ffmpeg -y -i "${videoSrc}" -c copy "${rawPath}" 2>/dev/null`);
    }
    return { dir, rawPath, mp3Paths };
  }

  it("returns an atrim filter for a constant leading delay", () => {
    const { dir, rawPath, mp3Paths } = makeFixture(120);

    const m = measureAudioDrift({
      videoPath: rawPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
      audioPaths: mp3Paths,
    });

    expect(m.measured).toBe(true);
    expect(m.driftMsBefore).toBeGreaterThan(100);
    expect(m.filter).toContain("atrim=start=");
    expect(m.filter).toContain("asetpts=PTS-STARTPTS");
  }, 30000);

  it("returns no filter when the track is already aligned", () => {
    const { dir, rawPath, mp3Paths } = makeFixture(0);

    const m = measureAudioDrift({
      videoPath: rawPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
      audioPaths: mp3Paths,
    });

    expect(m.measured).toBe(true);
    expect(m.filter).toBeNull();
    expect(Math.abs(m.driftMsBefore)).toBeLessThan(5);
  }, 30000);

  it("refuses a trim when drift is not constant across scenes", () => {
    const { dir, rawPath, mp3Paths } = makeFixture(120);
    // Early audio clamps scene 1's correlation peak at track start — the
    // non-constant-drift fixture family from the realign tests.
    execSync(
      `ffmpeg -y -i "${rawPath}" -af atrim=start=0.12,asetpts=PTS-STARTPTS -c:v copy -c:a aac "${join(dir, "early.mp4")}" 2>/dev/null`,
    );

    const m = measureAudioDrift({
      videoPath: join(dir, "early.mp4"),
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
      audioPaths: mp3Paths,
    });

    expect(m.filter).toBeNull();
    expect(m.reason).toBeTruthy();
  }, 30000);
});

// ─── finalizeRenderedVideo: single-pass integration (real ffmpeg) ───

describe("finalizeRenderedVideo (integration, real ffmpeg)", () => {
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

  function makeAss(dir) {
    const assPath = join(dir, "subs.ass");
    writeFileSync(
      assPath,
      [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 320",
        "PlayResY: 568",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Default,Helvetica,16,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        "Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,hello",
        "",
      ].join("\n"),
      "utf8",
    );
    return assPath;
  }

  function makeBgm(dir) {
    const bgmPath = join(dir, "bgm.wav");
    execSync(
      `ffmpeg -y -f lavfi -i sine=frequency=440:duration=3 -ar 44100 "${bgmPath}" 2>/dev/null`,
    );
    return bgmPath;
  }

  /** Same fixture family as measureAudioDrift, with an optional 120ms delay. */
  function makeRaw(dir, delayMs) {
    const audioDir = join(dir, "audio");
    mkdirSync(audioDir);

    const mp3Paths = [];
    for (const [id, seconds, seed] of [
      [1, 1.0, 42],
      [2, 0.5, 1337],
    ]) {
      const srcWav = join(dir, `scene-${id}-src.wav`);
      writeWavPcm(srcWav, noise(seconds, seed), 44100);
      const mp3Path = join(audioDir, `scene-${id}.mp3`);
      execSync(
        `ffmpeg -y -i "${srcWav}" -codec:a libmp3lame -q:a 4 "${mp3Path}" 2>/dev/null`,
      );
      mp3Paths.push(mp3Path);
    }

    const alignedWav = join(dir, "aligned.wav");
    buildVoiceoverTrack({
      sceneAudioPaths: mp3Paths,
      ttsDurations: [1.0, 0.5],
      outputPath: alignedWav,
    });

    const videoSrc = join(dir, "video-src.mp4");
    execSync(
      `ffmpeg -y -f lavfi -i color=c=black:s=320x568:d=2.2 -i "${alignedWav}" ` +
        `-c:v libx264 -c:a aac -shortest "${videoSrc}" 2>/dev/null`,
    );

    const rawPath = join(dir, "raw.mp4");
    if (delayMs > 0) {
      execSync(
        `ffmpeg -y -i "${videoSrc}" -af adelay=${delayMs}:all=1 -c:v copy -c:a aac "${rawPath}" 2>/dev/null`,
      );
    } else {
      execSync(`ffmpeg -y -i "${videoSrc}" -c copy "${rawPath}" 2>/dev/null`);
    }
    return { rawPath, mp3Paths };
  }

  /** Integrated loudness (LUFS) via ebur128 (stats print to stderr). */
  function integratedLufs(path) {
    const out = execSync(
      `ffmpeg -hide_banner -nostats -i "${path}" -af ebur128=peak=true -f null - 2>&1`,
      { encoding: "utf8" },
    ).toString();
    const match = [...out.matchAll(/I:\s+(-?\d+\.?\d*)\s+LUFS/g)].pop();
    return match ? parseFloat(match[1]) : NaN;
  }

  /** Mean absolute sample value via pcm decode. */
  function meanAbsSamples(path) {
    const out = execFileSync(
      "ffmpeg",
      ["-hide_banner", "-i", path, "-f", "s16le", "-ac", "1", "-ar", "44100", "-"],
      { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
    );
    let sum = 0;
    const n = out.length >> 1;
    for (let i = 0; i < n; i++) {
      sum += Math.abs(out.readInt16LE(i * 2));
    }
    return sum / n;
  }

  it("produces an aligned, normalized, BGM-mixed, subtitled output in one pass", () => {
    const dir = mkdtempSync(join(tmpdir(), "finalize-it-"));
    dirs.push(dir);
    const { rawPath, mp3Paths } = makeRaw(dir, 120);
    const assPath = makeAss(dir);
    const bgmPath = makeBgm(dir);
    const outPath = join(dir, "out.mp4");

    finalizeRenderedVideo({
      videoPath: rawPath,
      assPath,
      bgmPath,
      outputPath: outPath,
      realign: {
        outputDir: dir,
        sceneDurations: SCENE_DURATIONS,
        audioPaths: mp3Paths,
      },
    });

    // 1. Head trim applied: shipped track sits on the timeline.
    const sync = verifyAudioSync({
      videoPath: outPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
      audioPaths: mp3Paths,
    });
    expect(sync.errored).toBe(false);
    expect(sync.passed).toBe(true);
    for (const scene of sync.scenes) {
      expect(Math.abs(scene.driftMs)).toBeLessThan(30);
    }

    // 2. Loudness normalized (allow generous band — noise-burst fixtures).
    const lufs = integratedLufs(outPath);
    expect(lufs).toBeGreaterThan(-19);
    expect(lufs).toBeLessThan(-13);

    // 3. BGM actually mixed in: same finalize without BGM is quieter.
    const noBgmPath = join(dir, "out-nobgm.mp4");
    finalizeRenderedVideo({
      videoPath: rawPath,
      assPath,
      bgmPath: null,
      outputPath: noBgmPath,
      realign: {
        outputDir: dir,
        sceneDurations: SCENE_DURATIONS,
        audioPaths: mp3Paths,
      },
    });
    expect(meanAbsSamples(outPath)).toBeGreaterThan(meanAbsSamples(noBgmPath));

    // 4. Container sanity: 44.1kHz audio stream, duration ≈ source.
    const probe = execSync(
      `ffprobe -i "${outPath}" -show_entries stream=codec_type,sample_rate -show_entries format=duration -of json 2>/dev/null`,
    ).toString();
    const info = JSON.parse(probe);
    const audio = info.streams.find((s) => s.codec_type === "audio");
    expect(audio.sample_rate).toBe("44100");
    expect(parseFloat(info.format.duration)).toBeGreaterThan(1.9);
    expect(parseFloat(info.format.duration)).toBeLessThan(2.5);
  }, 60000);

  it("leaves the head delay in place when realign info is not supplied", () => {
    const dir = mkdtempSync(join(tmpdir(), "finalize-notrim-"));
    dirs.push(dir);
    const { rawPath, mp3Paths } = makeRaw(dir, 120);
    const outPath = join(dir, "out.mp4");

    finalizeRenderedVideo({
      videoPath: rawPath,
      assPath: null,
      bgmPath: null,
      outputPath: outPath,
      realign: null,
    });

    const sync = verifyAudioSync({
      videoPath: outPath,
      outputDir: dir,
      sceneDurations: SCENE_DURATIONS,
      audioPaths: mp3Paths,
    });
    expect(sync.passed).toBe(false);
    const scene2 = sync.scenes.find((s) => s.sceneId === 2);
    expect(scene2.driftMs).toBeGreaterThan(80);
  }, 60000);
});
