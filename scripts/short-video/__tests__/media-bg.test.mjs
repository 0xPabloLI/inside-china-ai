import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveMediaPath,
  mediaExists,
  animationCss,
  mediaLayer,
  validateMedia,
  VALID_PRESETS,
} from "../lib/media-bg.mjs";

// ─── Mock paths ───

const CONTENT_DIR = "/fake/content/unitree";
const REAL_CONTENT_DIR = "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/content/deepseek";

// ─── resolveMediaPath ───

describe("resolveMediaPath", () => {
  it("resolves relative path to file:// URL", () => {
    const result = resolveMediaPath("assets/demo.jpg", CONTENT_DIR);
    expect(result).toContain("file://");
    expect(result).toContain("assets/demo.jpg");
    expect(result).toContain(CONTENT_DIR);
  });

  it("handles nested relative paths", () => {
    const result = resolveMediaPath("assets/b-roll/clip.mp4", CONTENT_DIR);
    expect(result).toContain("assets/b-roll/clip.mp4");
  });
});

// ─── mediaExists ───

describe("mediaExists", () => {
  it("returns false for non-existent file", () => {
    expect(mediaExists("nonexistent-file.jpg", CONTENT_DIR)).toBe(false);
  });

  it("returns true for existing file (real path)", () => {
    // deepseek logo exists in assets/logos (../../ from content/deepseek/ → short-video/assets/)
    expect(mediaExists("../../assets/logos/deepseek.svg", REAL_CONTENT_DIR)).toBe(true);
  });
});

// ─── animationCss ───

describe("animationCss", () => {
  it("returns empty string for 'none' preset", () => {
    expect(animationCss("none", 6.0, "image")).toBe("");
  });

  it("generates fade keyframes with correct percentages", () => {
    const css = animationCss("fade", 6.0, "image");
    expect(css).toContain("@keyframes");
    expect(css).toContain("opacity");
    // 0.8s fade in out of 6s = 13.33%
    expect(css).toContain("13.33%");
    // 0.5s fade out: starts at (6-0.5)/6 = 91.67%
    expect(css).toContain("91.67%");
  });

  it("generates ken-burns keyframes with scale transform for images", () => {
    const css = animationCss("ken-burns", 6.0, "image");
    expect(css).toContain("@keyframes");
    expect(css).toContain("scale");
    expect(css).toContain("1.0");
    expect(css).toContain("1.08");
  });

  it("falls back to fade when ken-burns used on video", () => {
    const css = animationCss("ken-burns", 6.0, "video");
    // Should NOT have scale transform (that's ken-burns specific)
    expect(css).not.toContain("1.08");
    // Should have fade keyframes
    expect(css).toContain("opacity");
  });

  it("generates slide keyframes with translateX", () => {
    const css = animationCss("slide", 6.0, "image");
    expect(css).toContain("@keyframes");
    expect(css).toContain("translateX");
    expect(css).toContain("100%");
    expect(css).toContain("-100%");
  });

  it("generates zoom keyframes with scale", () => {
    const css = animationCss("zoom", 6.0, "image");
    expect(css).toContain("@keyframes");
    expect(css).toContain("scale");
    expect(css).toContain("1.2");
    expect(css).toContain("1.1");
  });

  it("falls back to fade for unknown preset", () => {
    const css = animationCss("unknown-preset", 6.0, "image");
    expect(css).toContain("opacity");
  });

  it("returns empty string for zero duration", () => {
    expect(animationCss("fade", 0, "image")).toBe("");
  });

  it("scales transitions proportionally when duration is too short", () => {
    // 1.0s duration, fade in=0.8 + fade out=0.5 = 1.3 > 1.0
    // Scale factor = 1.0 / 1.3 ≈ 0.769
    // Scaled in = 0.615, out = 0.385
    // inPct = 61.5%, outStartPct = 61.5% (they meet)
    const css = animationCss("fade", 1.0, "image");
    expect(css).toContain("@keyframes");
    // Should not have overlapping percentages
    // Both should be around 61.5%
    expect(css).toContain("61.5");
  });
});

// ─── mediaLayer ───

describe("mediaLayer", () => {
  it("returns empty css/html when media is null", () => {
    const result = mediaLayer(null, CONTENT_DIR, 6.0);
    expect(result.css).toBe("");
    expect(result.html).toBe("");
  });

  it("returns empty css/html when media has no path", () => {
    const result = mediaLayer({ type: "image" }, CONTENT_DIR, 6.0);
    expect(result.css).toBe("");
    expect(result.html).toBe("");
  });

  it("returns empty css/html when file does not exist", () => {
    const result = mediaLayer(
      { type: "image", path: "nonexistent.jpg", animation: "fade" },
      CONTENT_DIR,
      6.0,
    );
    expect(result.css).toBe("");
    expect(result.html).toBe("");
  });

  it("generates image background HTML with background-image", () => {
    const result = mediaLayer(
      { type: "image", path: "../../assets/logos/deepseek.svg", animation: "fade", overlay: 0.7 },
      REAL_CONTENT_DIR,
      6.0,
    );
    expect(result.html).toContain("background-image");
    expect(result.html).toContain("file://");
    expect(result.html).toContain("media-overlay");
    expect(result.html).toContain("0.7");
    expect(result.css).toContain("@keyframes");
  });

  it("generates video background HTML with <video> element", () => {
    // Use an existing video file
    const videoPath = "../../assets/liveportrait-pablo-output.mp4";
    const result = mediaLayer(
      { type: "video", path: videoPath, animation: "fade" },
      REAL_CONTENT_DIR,
      6.0,
    );
    expect(result.html).toContain("<video");
    expect(result.html).toContain("autoplay");
    expect(result.html).toContain("loop");
    expect(result.html).toContain("muted");
    expect(result.html).toContain("media-overlay");
    // Default overlay = 0.7
    expect(result.html).toContain("0.7");
  });

  it("omits overlay div when overlay is 0", () => {
    const result = mediaLayer(
      { type: "image", path: "../../assets/logos/deepseek.svg", animation: "fade", overlay: 0 },
      REAL_CONTENT_DIR,
      6.0,
    );
    expect(result.html).not.toContain("media-overlay");
  });

  it("uses default overlay 0.7 when not specified", () => {
    const result = mediaLayer(
      { type: "image", path: "../../assets/logos/deepseek.svg", animation: "fade" },
      REAL_CONTENT_DIR,
      6.0,
    );
    expect(result.html).toContain("0.7");
  });

  it("includes base CSS with media-container and media-bg classes", () => {
    const result = mediaLayer(
      { type: "image", path: "../../assets/logos/deepseek.svg", animation: "fade" },
      REAL_CONTENT_DIR,
      6.0,
    );
    expect(result.css).toContain(".media-container");
    expect(result.css).toContain(".media-bg");
    expect(result.css).toContain(".media-overlay");
  });
});

// ─── validateMedia ───

describe("validateMedia", () => {
  it("returns valid when media is null (no media = valid)", () => {
    const result = validateMedia(null, CONTENT_DIR);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid for existing image file", () => {
    const result = validateMedia(
      { type: "image", path: "../../assets/logos/deepseek.svg" },
      REAL_CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns warning when file not found", () => {
    const result = validateMedia(
      { type: "image", path: "missing.jpg" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true); // still valid, just warns
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("not found");
  });

  it("returns error for invalid media type", () => {
    const result = validateMedia(
      { type: "gif", path: "assets/demo.gif" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("type");
  });

  it("returns error when path is missing", () => {
    const result = validateMedia(
      { type: "image" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("path");
  });

  it("warns when ken-burns used on video", () => {
    const result = validateMedia(
      { type: "video", path: "assets/demo.mp4", animation: "ken-burns" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("ken-burns"))).toBe(true);
  });

  it("warns for unknown animation preset", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", animation: "bounce" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("Unknown animation"))).toBe(true);
  });
});

// ─── VALID_PRESETS constant ───

describe("VALID_PRESETS", () => {
  it("contains all 5 presets", () => {
    expect(VALID_PRESETS).toContain("fade");
    expect(VALID_PRESETS).toContain("ken-burns");
    expect(VALID_PRESETS).toContain("slide");
    expect(VALID_PRESETS).toContain("zoom");
    expect(VALID_PRESETS).toContain("none");
  });
});
