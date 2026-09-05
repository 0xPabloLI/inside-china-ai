import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  resolveMediaPath,
  mediaExists,
  animationCss,
  mediaLayer,
  validateMedia,
  VALID_PRESETS,
  VALID_FITS,
  VALID_FOCUSES,
} from "../lib/media-bg.mjs";

// ─── Mock paths ───

const CONTENT_DIR = "/fake/content/unitree";
const REAL_CONTENT_DIR =
  "/Users/pabloli/Documents/code/inside-china-ai/scripts/short-video/content/deepseek";

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
    // Use an existing video file in content/unitree/assets/
    const videoPath = "../unitree/assets/unitree-demo.mp4";
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
    const result = validateMedia({ type: "image", path: "missing.jpg" }, CONTENT_DIR);
    expect(result.valid).toBe(true); // still valid, just warns
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("not found");
  });

  it("returns error for invalid media type", () => {
    const result = validateMedia({ type: "gif", path: "assets/demo.gif" }, CONTENT_DIR);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("type");
  });

  it("returns error when path is missing", () => {
    const result = validateMedia({ type: "image" }, CONTENT_DIR);
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

  // ── mode field tests (fullscreen support) ──

  it("returns valid when mode is 'background'", () => {
    const result = validateMedia(
      { type: "video", path: "assets/demo.mp4", mode: "background" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid when mode is 'fullscreen'", () => {
    const result = validateMedia(
      { type: "video", path: "assets/demo.mp4", mode: "fullscreen" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid when mode is undefined (defaults to background)", () => {
    const result = validateMedia({ type: "image", path: "assets/demo.jpg" }, CONTENT_DIR);
    expect(result.valid).toBe(true);
    // no mode-related warnings
    expect(result.warnings.some((w) => w.includes("mode"))).toBe(false);
  });

  it("warns when mode has an invalid value", () => {
    const result = validateMedia(
      { type: "video", path: "assets/demo.mp4", mode: "split" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true); // warn, not error
    expect(result.warnings.some((w) => w.includes("mode"))).toBe(true);
  });

  it("warns when fullscreen mode has texts content", () => {
    // validateMedia only sees the media object, not scene.texts.
    // This test verifies the VALID_MODES constant recognizes "fullscreen".
    // The texts check is in scene-rules.mjs (separate test).
    const result = validateMedia(
      { type: "video", path: "assets/demo.mp4", mode: "fullscreen", overlay: 0.7 },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    // overlay is accepted but will be forced to 0 at render time
  });

  // ── volume field tests (per-scene volume + envelope ducking) ──

  it("does not warn when volume is undefined (default 0.08 applies at render time)", () => {
    const result = validateMedia({ type: "video", path: "assets/demo.mp4" }, CONTENT_DIR);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("volume"))).toBe(false);
  });

  it("does not warn when volume is 0 (explicit silence)", () => {
    const result = validateMedia(
      { type: "video", path: "assets/demo.mp4", volume: 0 },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("volume"))).toBe(false);
  });

  it("does not warn when volume is within [0, 1]", () => {
    const result = validateMedia(
      { type: "video", path: "assets/demo.mp4", volume: 0.12 },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("volume"))).toBe(false);
  });

  it("warns when volume > 1", () => {
    const result = validateMedia(
      { type: "video", path: "assets/demo.mp4", volume: 1.5 },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true); // warning, not error
    expect(
      result.warnings.some((w) => w.toLowerCase().includes("volume") && w.includes("1.5")),
    ).toBe(true);
  });

  it("warns when volume is negative", () => {
    const result = validateMedia(
      { type: "video", path: "assets/demo.mp4", volume: -0.5 },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true); // warning, not error
    expect(
      result.warnings.some((w) => w.toLowerCase().includes("volume") && w.includes("-0.5")),
    ).toBe(true);
  });

  it("does not warn when image has volume (harmless dead data)", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", volume: 0.1 },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("volume"))).toBe(false);
  });
});

// ─── fit/focus field tests ───

describe("validateMedia — fit field", () => {
  it("does not warn when fit is undefined (default cover applies)", () => {
    const result = validateMedia({ type: "image", path: "assets/demo.jpg" }, CONTENT_DIR);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("fit"))).toBe(false);
  });

  it("does not warn when fit is cover", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", fit: "cover" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.toLowerCase().includes("fit"))).toBe(false);
  });

  it("does not warn when fit is contain", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", fit: "contain" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.toLowerCase().includes("fit"))).toBe(false);
  });

  it("warns when fit is invalid", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", fit: "stretch" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true); // warning, not error
    expect(
      result.warnings.some((w) => w.toLowerCase().includes("fit") && w.includes("stretch")),
    ).toBe(true);
  });
});

describe("validateMedia — focus field", () => {
  it("does not warn when focus is undefined (default center applies)", () => {
    const result = validateMedia({ type: "image", path: "assets/demo.jpg" }, CONTENT_DIR);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("focus"))).toBe(false);
  });

  it("does not warn when focus is top", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", focus: "top" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.toLowerCase().includes("focus"))).toBe(false);
  });

  it("does not warn when focus is center", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", focus: "center" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.toLowerCase().includes("focus"))).toBe(false);
  });

  it("does not warn when focus is bottom", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", focus: "bottom" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.toLowerCase().includes("focus"))).toBe(false);
  });

  it("warns when focus is invalid", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", focus: "left" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true); // warning, not error
    expect(
      result.warnings.some((w) => w.toLowerCase().includes("focus") && w.includes("left")),
    ).toBe(true);
  });
});

// ─── VALID_FITS and VALID_FOCUSES constants ───

describe("VALID_FITS constant", () => {
  it("contains cover and contain", () => {
    expect(VALID_FITS).toContain("cover");
    expect(VALID_FITS).toContain("contain");
  });
});

describe("VALID_FOCUSES constant", () => {
  it("contains top, center, and bottom", () => {
    expect(VALID_FOCUSES).toContain("top");
    expect(VALID_FOCUSES).toContain("center");
    expect(VALID_FOCUSES).toContain("bottom");
  });
});

// ─── cropFocus field tests (VC-13, VC-14) ───

describe("validateMedia — cropFocus field", () => {
  it("does not warn when cropFocus is undefined (default center applies)", () => {
    const result = validateMedia({ type: "image", path: "assets/demo.jpg" }, CONTENT_DIR);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("cropFocus"))).toBe(false);
  });

  it("does not warn when cropFocus is valid {x: 0.3, y: 0.5}", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", cropFocus: { x: 0.3, y: 0.5 } },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("cropFocus"))).toBe(false);
  });

  it("does not warn when cropFocus is at boundary {x: 0, y: 1}", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", cropFocus: { x: 0, y: 1 } },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("cropFocus"))).toBe(false);
  });

  it("VC-13: warns when cropFocus.x is out of range (> 1)", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", cropFocus: { x: 1.5, y: 0.5 } },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true); // warning, not error
    expect(result.warnings.some((w) => w.includes("cropFocus") && w.includes("1.5"))).toBe(true);
  });

  it("VC-13: warns when cropFocus.x is negative", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", cropFocus: { x: -0.1, y: 0.5 } },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("cropFocus") && w.includes("-0.1"))).toBe(true);
  });

  it("VC-14: warns when cropFocus.x is a string instead of number", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", cropFocus: { x: "0.5", y: 0.5 } },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("cropFocus") && w.includes("string"))).toBe(true);
  });

  it("warns when cropFocus.y is out of range", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", cropFocus: { x: 0.5, y: 2.0 } },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("cropFocus") && w.includes("2"))).toBe(true);
  });

  it("warns when cropFocus is not an object", () => {
    const result = validateMedia(
      { type: "image", path: "assets/demo.jpg", cropFocus: "center" },
      CONTENT_DIR,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("cropFocus"))).toBe(true);
  });
});

// ─── #156: validateMedia backdrop awareness ───

describe("validateMedia — backdrop (#156)", () => {
  function dirWithBackdrop(withBackdropFile) {
    const dir = mkdtempSync(join(tmpdir(), "media-validate-"));
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "assets", "chart.png"), "x");
    if (withBackdropFile) {
      mkdirSync(join(dir, "assets", "b-roll"), { recursive: true });
      writeFileSync(join(dir, "assets", "b-roll", "scene-8.mp4"), "x");
    }
    return dir;
  }

  it("missing backdrop file → warning mentioning backdrop (same tier as missing media)", () => {
    const dir = dirWithBackdrop(false);
    const r = validateMedia(
      {
        type: "image",
        path: "assets/chart.png",
        backdrop: { type: "video", path: "assets/b-roll/scene-8.mp4", volume: 0 },
      },
      dir,
    );
    expect(r.valid).toBe(true);
    expect(r.warnings.filter((w) => w.includes("backdrop"))).toHaveLength(1);
  });

  it("valid backdrop file produces no backdrop warning", () => {
    const dir = dirWithBackdrop(true);
    const r = validateMedia(
      {
        type: "image",
        path: "assets/chart.png",
        backdrop: { type: "video", path: "assets/b-roll/scene-8.mp4", volume: 0 },
      },
      dir,
    );
    expect(r.warnings.filter((w) => w.includes("backdrop"))).toHaveLength(0);
  });
});
