/**
 * Tests for lib/upscale.mjs — Real-ESRGAN super-resolution integration.
 *
 * TDD: Tests written first (red), implementation second (green).
 *
 * These are interface/contract tests with mocked execSync — they verify
 * the functions exist, accept the right arguments, handle edge cases,
 * and degrade gracefully when Real-ESRGAN is unavailable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fs and child_process at module level
vi.mock("fs", () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock("child_process", () => ({
  execSync: vi.fn(() => ""),
}));

// Import after mocks are set up
import { existsSync } from "fs";
import { execSync } from "child_process";

import {
  checkResolution,
  upscaleVideo,
  upscaleImage,
  autoUpscaleIfNeeded,
  REALESRGAN_PATH,
  FFPROBE_PATH,
  FFMPEG_PATH,
} from "../lib/upscale.mjs";

// ─── checkResolution ───

describe("checkResolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSync.mockReturnValue(true);
    execSync.mockReturnValue("");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Scenario #8: file doesn't exist
  it("returns needsUpscale=false when file doesn't exist", () => {
    existsSync.mockReturnValue(false);
    const result = checkResolution("/nonexistent/video.mp4");
    expect(result.needsUpscale).toBe(false);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  // Scenario #10: ffprobe output parse failure
  it("returns needsUpscale=false when ffprobe fails", () => {
    execSync.mockImplementation(() => {
      throw new Error("ffprobe not found");
    });
    const result = checkResolution("/fake/video.mp4");
    expect(result.needsUpscale).toBe(false);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  // Scenario #1: video 480x854 (portrait, width<720) → needsUpscale=true
  it("detects 480x854 video needs upscale", () => {
    execSync.mockReturnValue("480x854");
    const result = checkResolution("/fake/video.mp4");
    expect(result.width).toBe(480);
    expect(result.height).toBe(854);
    expect(result.needsUpscale).toBe(true);
    expect(result.isVideo).toBe(true);
  });

  // Scenario #2: video 720x1280 → needsUpscale=false
  it("detects 720x1280 video does not need upscale", () => {
    execSync.mockReturnValue("720x1280");
    const result = checkResolution("/fake/video.mp4");
    expect(result.needsUpscale).toBe(false);
  });

  // Scenario #3: video 1080x1920 → needsUpscale=false
  it("detects 1080x1920 video does not need upscale", () => {
    execSync.mockReturnValue("1080x1920");
    const result = checkResolution("/fake/video.mp4");
    expect(result.needsUpscale).toBe(false);
  });

  // Scenario #4: image 640x1138 → needsUpscale=true, isVideo=false
  it("detects 640x1138 image needs upscale", () => {
    execSync.mockReturnValue("640x1138");
    const result = checkResolution("/fake/image.jpg");
    expect(result.needsUpscale).toBe(true);
    expect(result.isVideo).toBe(false);
  });

  // Scenario #9: unsupported format (.gif)
  it("returns needsUpscale=false for unsupported format .gif", () => {
    execSync.mockReturnValue("480x854");
    const result = checkResolution("/fake/animation.gif");
    expect(result.needsUpscale).toBe(false);
  });

  // Scenario #9: unsupported format (.webm)
  it("returns needsUpscale=false for unsupported format .webm", () => {
    execSync.mockReturnValue("480x854");
    const result = checkResolution("/fake/video.webm");
    expect(result.needsUpscale).toBe(false);
  });

  // Also test width=HEIGHT\nheight= format
  it("parses width=NNN height=NNN format from ffprobe", () => {
    execSync.mockReturnValue("width=480\nheight=854\n");
    const result = checkResolution("/fake/video.mp4");
    expect(result.width).toBe(480);
    expect(result.height).toBe(854);
    expect(result.needsUpscale).toBe(true);
  });
});

// ─── upscaleVideo ───

describe("upscaleVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSync.mockReturnValue(true);
    execSync.mockReturnValue("");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Scenario #6: Real-ESRGAN binary doesn't exist
  it("returns failure when Real-ESRGAN binary doesn't exist", () => {
    existsSync.mockReturnValue(false);
    const result = upscaleVideo("/fake/input.mp4", "/fake/output.mp4");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  // Scenario #7: Real-ESRGAN execution fails (Step 2 fails)
  it("returns failure when Real-ESRGAN frame processing fails", () => {
    let callCount = 0;
    execSync.mockImplementation(() => {
      callCount++;
      // Step 1 (ffprobe fps) + Step 1 (ffmpeg extract frames) succeed
      if (callCount <= 2) return callCount === 1 ? "25/1" : "";
      // Step 2 (Real-ESRGAN) fails
      throw new Error("GPU error");
    });
    const result = upscaleVideo("/fake/input.mp4", "/fake/output.mp4");
    expect(result.success).toBe(false);
    expect(result.error).toContain("GPU error");
  });

  // Scenario #1: successful video upscale via 3-step pipeline
  it("returns success on valid video upscale", () => {
    let callCount = 0;
    execSync.mockImplementation(() => {
      callCount++;
      // Step 0: ffprobe fps → "25/1"
      // Step 1: ffmpeg extract frames → ""
      // Step 2: Real-ESRGAN batch → ""
      // Step 3: ffmpeg reassemble + audio → ""
      if (callCount === 1) return "25/1";
      return "";
    });
    const result = upscaleVideo("/fake/input.mp4", "/fake/output.mp4");
    expect(result.success).toBe(true);
    expect(result.path).toBe("/fake/output.mp4");
  });

  // Verify 3-step pipeline: Step 1 = ffmpeg extract frames
  it("Step 1: extracts frames with ffmpeg image2", () => {
    let callCount = 0;
    execSync.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? "25/1" : "";
    });
    upscaleVideo("/fake/input.mp4", "/fake/output.mp4");
    // Step 0 = ffprobe for fps, Step 1 = ffmpeg extract
    const extractCmd = execSync.mock.calls[1]?.[0];
    expect(extractCmd).toContain("image2");
    expect(extractCmd).toContain("/fake/input.mp4");
  });

  // Verify Step 2: Real-ESRGAN processes frame directory
  it("Step 2: uses realesr-animevideov3 on extracted frames", () => {
    let callCount = 0;
    execSync.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? "25/1" : "";
    });
    upscaleVideo("/fake/input.mp4", "/fake/output.mp4");
    // Find the Real-ESRGAN call (3rd execSync)
    const realesrganCmd = execSync.mock.calls[2]?.[0];
    expect(realesrganCmd).toContain("realesr-animevideov3");
    expect(realesrganCmd).toContain("-s 2");
  });

  // Verify Step 3: ffmpeg reassembles with original framerate + audio
  it("Step 3: reassembles with original framerate and preserves audio", () => {
    let callCount = 0;
    execSync.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? "25/1" : "";
    });
    upscaleVideo("/fake/input.mp4", "/fake/output.mp4");
    // 4th execSync call = ffmpeg reassemble
    const reassembleCmd = execSync.mock.calls[3]?.[0];
    expect(reassembleCmd).toContain("-framerate");
    expect(reassembleCmd).toContain("-map 0:v");
    expect(reassembleCmd).toContain("-map 1:a?");
    expect(reassembleCmd).toContain("-c:a copy");
    // Original input must appear as second -i (audio source)
    expect(reassembleCmd).toContain("/fake/input.mp4");
  });
});

// ─── upscaleImage ───

describe("upscaleImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSync.mockReturnValue(true);
    execSync.mockReturnValue("");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Scenario #6: binary doesn't exist
  it("returns failure when Real-ESRGAN binary doesn't exist", () => {
    existsSync.mockReturnValue(false);
    const result = upscaleImage("/fake/input.jpg", "/fake/output.jpg");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  // Scenario #4: successful image upscale
  it("returns success on valid image upscale", () => {
    const result = upscaleImage("/fake/input.jpg", "/fake/output.jpg");
    expect(result.success).toBe(true);
    expect(result.path).toBe("/fake/output.jpg");
  });

  // Verify correct model is used for image
  it("uses realesrgan-x4plus model for image", () => {
    const result = upscaleImage("/fake/input.jpg", "/fake/output.jpg");
    const calledCmd = execSync.mock.calls[0]?.[0];
    expect(calledCmd).toContain("realesrgan-x4plus");
  });
});

// ─── autoUpscaleIfNeeded ───

describe("autoUpscaleIfNeeded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSync.mockReturnValue(true);
    execSync.mockReturnValue("");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Scenario #2: 720x1280 video → no upscale
  it("returns upscaled=false for 720p video", () => {
    execSync.mockReturnValue("720x1280");
    const result = autoUpscaleIfNeeded("/fake/video.mp4");
    expect(result.upscaled).toBe(false);
    expect(result.path).toBe("/fake/video.mp4");
  });

  // Scenario #3: 1080x1920 video → no upscale
  it("returns upscaled=false for 1080p video", () => {
    execSync.mockReturnValue("1080x1920");
    const result = autoUpscaleIfNeeded("/fake/video.mp4");
    expect(result.upscaled).toBe(false);
  });

  // Scenario #5: 720x1280 image → no upscale
  it("returns upscaled=false for 720p image", () => {
    execSync.mockReturnValue("720x1280");
    const result = autoUpscaleIfNeeded("/fake/image.jpg");
    expect(result.upscaled).toBe(false);
  });

  // Scenario #8: file doesn't exist
  it("returns upscaled=false for non-existent file", () => {
    existsSync.mockReturnValue(false);
    const result = autoUpscaleIfNeeded("/nonexistent/file.mp4");
    expect(result.upscaled).toBe(false);
    expect(result.path).toBe("/nonexistent/file.mp4");
  });

  // Scenario #6: binary doesn't exist → degrade
  it("returns upscaled=false when Real-ESRGAN binary doesn't exist", () => {
    // existsSync: true for input file, false for binary
    existsSync.mockImplementation((path) => {
      return !String(path).includes("realesrgan-ncnn-vulkan");
    });
    execSync.mockReturnValue("480x854");
    const result = autoUpscaleIfNeeded("/fake/video.mp4");
    expect(result.upscaled).toBe(false);
    expect(result.path).toBe("/fake/video.mp4");
  });

  // Scenario #1: 480x854 video → upscale, returns new path
  it("returns upscaled=true with new path for 480p video", () => {
    execSync.mockReturnValue("480x854");
    const result = autoUpscaleIfNeeded("/fake/video.mp4");
    expect(result.upscaled).toBe(true);
    expect(result.path).toContain("-upscaled.");
  });

  // Scenario #9: unsupported format
  it("returns upscaled=false for .gif file", () => {
    execSync.mockReturnValue("480x854");
    const result = autoUpscaleIfNeeded("/fake/animation.gif");
    expect(result.upscaled).toBe(false);
    expect(result.path).toBe("/fake/animation.gif");
  });

  // Scenario #7: Real-ESRGAN fails → return original path
  it("returns upscaled=false with original path when upscale fails", () => {
    let callCount = 0;
    execSync.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return "480x854";
      }
      throw new Error("GPU error");
    });
    const result = autoUpscaleIfNeeded("/fake/video.mp4");
    expect(result.upscaled).toBe(false);
    expect(result.path).toBe("/fake/video.mp4");
  });
});

// ─── Constants ───

describe("constants", () => {
  it("REALESRGAN_PATH points to ~/.local/realesrgan/", () => {
    expect(REALESRGAN_PATH).toContain("realesrgan-ncnn-vulkan");
    expect(REALESRGAN_PATH).toContain(".local/realesrgan");
  });

  it("FFPROBE_PATH points to ffmpeg-full bin", () => {
    expect(FFPROBE_PATH).toContain("ffprobe");
    expect(FFPROBE_PATH).toContain("ffmpeg-full");
  });

  it("FFMPEG_PATH points to ffmpeg-full bin", () => {
    expect(FFMPEG_PATH).toContain("ffmpeg");
    expect(FFMPEG_PATH).toContain("ffmpeg-full");
  });
});
