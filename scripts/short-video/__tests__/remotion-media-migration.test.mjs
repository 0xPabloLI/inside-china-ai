/**
 * T2: @remotion/media Migration + CanvasImage
 *
 * Tests that Img is replaced by CanvasImage, Video/Audio by @remotion/media,
 * and MediaBackground accepts optional effects prop.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REMOTION_SRC = join(__dirname, "..", "remotion", "src");

function readFile(relPath) {
  return readFileSync(join(REMOTION_SRC, relPath), "utf-8");
}

describe("T2: CanvasImage replaces Img in visuals.tsx", () => {
  it("BrandBar uses CanvasImage instead of Img", () => {
    const content = readFile("components/visuals.tsx");
    expect(content).toMatch(/CanvasImage/);
    // BrandBar should not use bare Img
    const brandBarSection = content.match(/BrandBar[\s\S]*?\n\};/);
    expect(brandBarSection).toBeTruthy();
    expect(brandBarSection[0]).not.toMatch(/<Img/);
  });

  it("Watermark uses CanvasImage instead of Img", () => {
    const content = readFile("components/visuals.tsx");
    const watermarkSection = content.match(/Watermark[\s\S]*?\n\};/);
    expect(watermarkSection).toBeTruthy();
    expect(watermarkSection[0]).not.toMatch(/<Img/);
    expect(watermarkSection[0]).toMatch(/CanvasImage/);
  });

  it("visuals.tsx imports CanvasImage from remotion", () => {
    const content = readFile("components/visuals.tsx");
    expect(content).toMatch(/import\s+\{[^}]*CanvasImage[^}]*\}\s+from\s+["']remotion["']/);
  });
});

describe("T2: MediaBackground uses @remotion/media", () => {
  it("MediaBackground imports Video from @remotion/media", () => {
    const content = readFile("components/MediaBackground.tsx");
    expect(content).toMatch(/from\s+["']@remotion\/media["']/);
  });

  it("MediaBackground uses CanvasImage for image type", () => {
    const content = readFile("components/MediaBackground.tsx");
    expect(content).toMatch(/CanvasImage/);
    // Should not use bare Img for image rendering
    expect(content).not.toMatch(/<Img\s/);
  });

  it("MediaBackground accepts optional effects prop", () => {
    const content = readFile("components/MediaBackground.tsx");
    expect(content).toMatch(/effects\??\s*:/);
  });
});

describe("T2: ShortVideo uses @remotion/media Audio", () => {
  it("ShortVideo.tsx imports Audio from @remotion/media", () => {
    const content = readFile("ShortVideo.tsx");
    expect(content).toMatch(/from\s+["']@remotion\/media["']/);
  });

  it("ShortVideo.tsx does not import Audio from remotion directly", () => {
    const content = readFile("ShortVideo.tsx");
    // Audio should come from @remotion/media, not from "remotion"
    const remotionImportMatch = content.match(/import\s+\{([^}]*)\}\s+from\s+["']remotion["']/);
    if (remotionImportMatch) {
      expect(remotionImportMatch[1]).not.toMatch(/\bAudio\b/);
    }
  });
});

describe("T2: FullscreenMedia uses @remotion/media", () => {
  it("FullscreenMedia.tsx does not use bare Img or Video from remotion", () => {
    const content = readFile("scenes/FullscreenMedia.tsx");
    // FullscreenMedia delegates to MediaBackground, so it should not need
    // direct Img/Video imports
    expect(content).not.toMatch(/<Img\s/);
    expect(content).not.toMatch(/<Video\s/);
  });
});

describe("T2: HookScene uses CanvasImage for subjectLogo", () => {
  it("HookScene.tsx uses CanvasImage instead of Img for logo", () => {
    const content = readFile("scenes/HookScene.tsx");
    expect(content).toMatch(/CanvasImage/);
    // Should not have bare <Img for subjectLogo
    // (Img import is fine if removed entirely)
    expect(content).not.toMatch(/<Img\s/);
  });
});

describe("T2: CtaScene uses CanvasImage for brand logo", () => {
  it("CtaScene.tsx uses CanvasImage instead of Img", () => {
    const content = readFile("scenes/CtaScene.tsx");
    expect(content).toMatch(/CanvasImage/);
    expect(content).not.toMatch(/<Img\s/);
  });
});
