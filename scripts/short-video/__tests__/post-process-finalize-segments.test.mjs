/**
 * Incremental finalize (#228 ③ / spec `spec-render-incremental-228-3`, T2).
 *
 * The incremental path renders dirty ranges into part files and reuses cached
 * ranges, so finalize no longer has one raw input: it trims N parts, concats
 * them, then burns subtitles / mixes BGM / normalizes loudness in the same
 * single pass. These tests pin the filter graph and run one real ffmpeg smoke
 * over two distinct clips.
 */
import { describe, it, expect, afterEach } from "vitest";
import { execFileSync, execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  buildFinalizeArgs,
  concatSegmentsAudio,
  finalizeRenderedVideo,
} from "../lib/post-process.mjs";

const dirs = [];
afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

const SEGMENTS = [
  { path: "/tmp/part-0.mp4", startFrame: 0, endFrame: 15 },
  { path: "/tmp/part-1.mp4", startFrame: 15, endFrame: 40 },
];

describe("buildFinalizeArgs with segments", () => {
  it("trims each part and concatenates video+audio in one filter graph", () => {
    const args = buildFinalizeArgs({
      videoPath: "/tmp/ignored.mp4",
      segments: SEGMENTS,
      fps: 30,
      assPath: "/tmp/subs.ass",
      bgmPath: null,
      outputPath: "/tmp/out.mp4",
      bgmFadeOutStart: 1.33,
    });
    const cmd = args.join(" ");

    expect(cmd).toContain("-i /tmp/part-0.mp4 -i /tmp/part-1.mp4");
    expect(cmd).not.toContain("/tmp/ignored.mp4");
    // Video trims on frames, audio trims on exact seconds (44100/30 = 1470).
    expect(cmd).toContain("[0:v]trim=start_frame=0:end_frame=15,setpts=PTS-STARTPTS[v0]");
    expect(cmd).toContain("[1:v]trim=start_frame=15:end_frame=40,setpts=PTS-STARTPTS[v1]");
    expect(cmd).toContain("[0:a]atrim=start=0.000000:end=0.500000,asetpts=PTS-STARTPTS[a0]");
    expect(cmd).toContain("[1:a]atrim=start=0.500000:end=1.333333,asetpts=PTS-STARTPTS[a1]");
    expect(cmd).toContain(
      "[v0][a0][v1][a1]concat=n=2:v=1:a=1[vcatraw][acat];[vcatraw]fps=30,settb=1/30[vcat];[vcat]ass=/tmp/subs.ass[vout]",
    );
    expect(cmd).toContain("-map [vout] -map [aout]");
  });

  it("re-encodes the video when there are no subtitles (concat is a filter)", () => {
    const args = buildFinalizeArgs({
      videoPath: null,
      segments: SEGMENTS,
      fps: 30,
      assPath: null,
      bgmPath: null,
      outputPath: "/tmp/out.mp4",
      bgmFadeOutStart: 1.33,
    });
    const cmd = args.join(" ");
    expect(cmd).toContain("-map [vcat] -map [aout]");
    expect(cmd).not.toContain("-c:v copy");
  });

  it("applies the #176 head filter to the concatenated audio, not to input 0", () => {
    const args = buildFinalizeArgs({
      videoPath: null,
      segments: SEGMENTS,
      fps: 30,
      assPath: "/tmp/subs.ass",
      bgmPath: "/tmp/bgm.wav",
      outputPath: "/tmp/out.mp4",
      audioFilter: "atrim=start=0.120000,asetpts=PTS-STARTPTS",
      bgmFadeOutStart: 1.33,
    });
    const cmd = args.join(" ");
    expect(cmd).toContain("[acat]atrim=start=0.120000,asetpts=PTS-STARTPTS[tts]");
    expect(cmd).not.toContain("[0:a]atrim=start=0.120000");
    // BGM is the input after the parts.
    expect(cmd).toContain("[2:a]afade=t=in:st=0:d=0.1");
  });
});

describe("finalizeRenderedVideo with segments (real ffmpeg)", () => {
  it("concats two trimmed parts into one timeline-length file", () => {
    const dir = mkdtempSync(join(tmpdir(), "finalize-segments-"));
    dirs.push(dir);

    for (const [name, color, frequency] of [
      ["part-0.mp4", "red", 440],
      ["part-1.mp4", "blue", 880],
    ]) {
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          `color=c=${color}:s=320x568:r=30:d=1`,
          "-f",
          "lavfi",
          "-i",
          `sine=frequency=${frequency}:sample_rate=44100:duration=1`,
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-shortest",
          join(dir, name),
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
    }

    const segments = [
      { path: join(dir, "part-0.mp4"), startFrame: 0, endFrame: 15 },
      { path: join(dir, "part-1.mp4"), startFrame: 15, endFrame: 30 },
    ];
    const outPath = join(dir, "out.mp4");
    finalizeRenderedVideo({
      videoPath: null,
      segments,
      fps: 30,
      assPath: null,
      bgmPath: null,
      outputPath: outPath,
      realign: null,
      loudnessReadback: false,
    });

    const probe = JSON.parse(
      execSync(
        `ffprobe -i "${outPath}" -count_frames -show_entries stream=codec_type,sample_rate,nb_read_frames -show_entries format=duration -of json 2>/dev/null`,
      ).toString(),
    );
    const video = probe.streams.find((s) => s.codec_type === "video");
    const audio = probe.streams.find((s) => s.codec_type === "audio");
    expect(Number(video.nb_read_frames)).toBe(30);
    expect(audio.sample_rate).toBe("44100");
    expect(parseFloat(probe.format.duration)).toBeGreaterThan(0.9);
    expect(parseFloat(probe.format.duration)).toBeLessThan(1.15);

    // Measurement stand-in spans the same timeline.
    const wavPath = concatSegmentsAudio({ segments, fps: 30, outputDir: dir });
    const wavProbe = execSync(
      `ffprobe -i "${wavPath}" -show_entries format=duration -of json 2>/dev/null`,
    ).toString();
    expect(parseFloat(JSON.parse(wavProbe).format.duration)).toBeGreaterThan(0.9);
    expect(parseFloat(JSON.parse(wavProbe).format.duration)).toBeLessThan(1.15);
  }, 60000);
});
