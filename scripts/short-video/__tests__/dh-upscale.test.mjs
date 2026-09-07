import { describe, expect, it } from "vitest";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { resolveUpscalePlan, upscaleDigitalHuman } from "../lib/dh-upscale.mjs";
import { FFMPEG_PATH, FFPROBE_PATH } from "../lib/upscale.mjs";

describe("dh-upscale resolveUpscalePlan", () => {
  it("video default: realesr-animevideov3 at 2x, keeping the native upscaled size", () => {
    // #194: the B-roll path clamps the short side to 720, which would shrink a
    // 512² digital-human frame upscaled 2× to 1024² back down to 720². The
    // digital-human default must keep the native 2× result.
    const plan = resolveUpscalePlan({ isVideo: true });
    expect(plan).toEqual({
      mode: "video",
      model: "realesr-animevideov3",
      scale: 2,
      tile: 256,
      targetShortSide: null,
    });
  });

  it("image default: realesrgan-x4plus", () => {
    const plan = resolveUpscalePlan({ isVideo: false });
    expect(plan.model).toBe("realesrgan-x4plus");
    expect(plan.mode).toBe("image");
  });

  it("explicit overrides for model, scale, tile and short-side clamp", () => {
    const plan = resolveUpscalePlan({
      isVideo: true,
      model: "realesrgan-x4plus",
      scale: 4,
      tile: 128,
      shortSide: 720,
    });
    expect(plan.model).toBe("realesrgan-x4plus");
    expect(plan.scale).toBe(4);
    expect(plan.tile).toBe(128);
    expect(plan.targetShortSide).toBe(720);
  });

  it("rejects upscale ratios and short-side clamps the binary path cannot honor", () => {
    expect(() => resolveUpscalePlan({ isVideo: true, scale: 3.5 })).toThrow();
    expect(() => resolveUpscalePlan({ isVideo: true, scale: 1 })).toThrow();
    expect(() => resolveUpscalePlan({ isVideo: true, shortSide: -5 })).toThrow();
  });
});

describe("dh-upscale real-data smoke (#194)", () => {
  // SoulX-FlashHead Model_Lite output (2026-09-04, gitignored): 512×512 @ 25fps,
  // 3.08s, AAC audio.
  const input = join(
    process.cwd(),
    "scripts/short-video/experiments/digital-human/soulx-flashhead/soulx_lite_aac.mp4",
  );

  it.skipIf(!existsSync(input))(
    "upscales SoulX-FlashHead 512×512 → 1024×1024 preserving duration and audio",
    () => {
      const outputPath = join(tmpdir(), `dh-upscale-smoke-${Date.now()}.mp4`);
      const result = upscaleDigitalHuman(input, outputPath);
      expect(result, JSON.stringify(result)).toEqual({ success: true, path: outputPath });
      expect(existsSync(outputPath)).toBe(true);

      const probe = (args) => execFileSync(FFPROBE_PATH, args, { encoding: "utf8" }).trim();
      const dims = probe([
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0",
        outputPath,
      ]);
      expect(dims).toBe("1024,1024");

      const duration = Number(
        probe(["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", outputPath]),
      );
      expect(duration).toBeGreaterThan(3.0);
      expect(duration).toBeLessThan(3.5);

      const audioStreams = probe([
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=index",
        "-of",
        "csv=p=0",
        outputPath,
      ]);
      expect(audioStreams).not.toBe("");
    },
    // Full pipeline: 77-frame realesrgan + 2 ffmpeg passes ≈ 40s on Metal.
    300000,
  );
});
