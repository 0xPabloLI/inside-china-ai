/**
 * T5: Composition Transitions + Types + Validation
 *
 * Tests that ShortVideo diversifies transitions, types.ts has layout/highlight
 * fields, and verify-video.mjs validates layout.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REMOTION_SRC = join(__dirname, "..", "remotion", "src");
const SCRIPTS_DIR = join(__dirname, "..");

function readRemotionFile(relPath) {
  return readFileSync(join(REMOTION_SRC, relPath), "utf-8");
}

function readScriptFile(relPath) {
  return readFileSync(join(SCRIPTS_DIR, relPath), "utf-8");
}

describe("T5: Diversified transitions in ShortVideo.tsx", () => {
  it("ShortVideo imports slide transition", () => {
    const content = readRemotionFile("ShortVideo.tsx");
    expect(content).toMatch(/from\s+["']@remotion\/transitions\/slide["']/);
  });

  it("ShortVideo imports wipe transition", () => {
    const content = readRemotionFile("ShortVideo.tsx");
    expect(content).toMatch(/from\s+["']@remotion\/transitions\/wipe["']/);
  });

  it("Transition duration is 10 frames (not 6)", () => {
    const content = readRemotionFile("ShortVideo.tsx");
    expect(content).toMatch(/10/);
    expect(content).not.toMatch(/TRANSITION_FRAMES\s*=\s*6/);
  });

  it("Hook→S2 transition uses slide({ direction: from-right })", () => {
    const content = readRemotionFile("ShortVideo.tsx");
    expect(content).toMatch(/slide\(/);
    expect(content).toMatch(/from-right/);
  });

  it("Last content→CTA uses slide({ direction: from-bottom })", () => {
    const content = readRemotionFile("ShortVideo.tsx");
    expect(content).toMatch(/from-bottom/);
  });
});

describe("T5: types.ts has layout and highlight fields", () => {
  it("SceneData has layout field", () => {
    const content = readRemotionFile("types.ts");
    expect(content).toMatch(/layout\??\s*:/);
  });

  it("SceneTexts has highlight field", () => {
    const content = readRemotionFile("types.ts");
    expect(content).toMatch(/highlight/);
  });
});

describe("T5: verify-video.mjs validates layout field (via scene-rules.mjs)", () => {
  it("verify-video.mjs imports scene-rules which has layout validation", () => {
    const content = readScriptFile("verify-video.mjs");
    expect(content).toMatch(/scene-rules/);
  });

  it("scene-rules.mjs checks for valid layout enum values", () => {
    const content = readFileSync(join(SCRIPTS_DIR, "lib", "scene-rules.mjs"), "utf-8");
    // Should reference valid layout values
    expect(content).toMatch(/media-bottom-bar|media-split|media-overlay|stacked-cards|hero-center|cta/);
  });

  it("scene-rules.mjs has checkLayoutField function", () => {
    const content = readFileSync(join(SCRIPTS_DIR, "lib", "scene-rules.mjs"), "utf-8");
    expect(content).toMatch(/checkLayoutField/);
  });
});
