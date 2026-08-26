/**
 * Fix Scene Flicker (Double Fade) — TDD tests
 *
 * Tests the source-level contract for MediaBackground opacity envelope,
 * video volume independence, and overlay behavior after the fix.
 *
 * Scenarios S1–S9 map to the spec's Behavioral Scenarios matrix.
 * See: docs/spec-fix-scene-flicker.md
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

// ═══════════════════════════════════════════════════════════════
//  S1: Narrative → narrative — exit opacity ramp removed
// ═══════════════════════════════════════════════════════════════
describe("S1: Media opacity — no exit fade for default (fade) preset", () => {
  it("opacity interpolate has 3 input stops (no outStart in opacity)", () => {
    const content = readFile("components/MediaBackground.tsx");

    // Extract the opacity assignment
    const opacityMatch = content.match(
      /const opacity\s*=\s*preset\s*===\s*"none"\s*\?\s*1\s*:\s*interpolate\(([^)]+)\)/s,
    );
    expect(opacityMatch).toBeTruthy();

    // The interpolate args should NOT contain outStart in the input array
    // and should have 3 output values [0, 1, 1] not 4 [0, 1, 1, 0]
    const interpolateArgs = opacityMatch[1];
    expect(interpolateArgs).not.toMatch(/outStart/);
    expect(interpolateArgs).toMatch(/\[0,\s*inFrames,\s*totalFrames\]/);
    expect(interpolateArgs).toMatch(/\[0,\s*1,\s*1\]/);
  });

  it("opacity does NOT have 4-stop envelope with outStart", () => {
    const content = readFile("components/MediaBackground.tsx");

    // The old pattern: [0, inFrames, outStart, totalFrames], [0, 1, 1, 0]
    // should NOT appear in the opacity variable assignment
    const opacityMatch = content.match(
      /const opacity\s*=\s*preset\s*===\s*"none"\s*\?\s*1\s*:\s*interpolate\([^)]+\)/s,
    );
    expect(opacityMatch).toBeTruthy();
    expect(opacityMatch[0]).not.toMatch(/outStart.*totalFrames.*0,\s*1,\s*1,\s*0/);
  });
});

// ═══════════════════════════════════════════════════════════════
//  S2: All non-none presets use the same 3-stop opacity envelope
// ═══════════════════════════════════════════════════════════════
describe("S2: Media opacity — 3-stop envelope for all non-none presets", () => {
  it("opacity is shared across all presets (no per-preset opacity override)", () => {
    const content = readFile("components/MediaBackground.tsx");

    // After the opacity assignment, there should be no reassignment of opacity
    // within the preset if/else blocks
    const opacityAssignmentIndex = content.indexOf("const opacity");
    expect(opacityAssignmentIndex).toBeGreaterThan(-1);

    // Get the content after opacity assignment
    const afterOpacity = content.slice(opacityAssignmentIndex);

    // Check that none of the preset blocks reassign opacity
    // (they should only reassign scale, translateX, translateY, filter)
    const presetBlockMatch = afterOpacity.match(
      /if \(preset === "fade"\)[\s\S]*?}(?:\s*else if[\s\S]*?})*/,
    );
    if (presetBlockMatch) {
      expect(presetBlockMatch[0]).not.toMatch(/opacity\s*=/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
//  S3: `none` preset has constant opacity 1
// ═══════════════════════════════════════════════════════════════
describe("S3: `none` preset — static opacity 1", () => {
  it("opacity ternary checks preset === 'none' and returns 1", () => {
    const content = readFile("components/MediaBackground.tsx");

    expect(content).toMatch(/preset\s*===\s*"none"\s*\?\s*1\s*:/);
  });
});

// ═══════════════════════════════════════════════════════════════
//  S4: Video volume — independent exit fade (not tied to media opacity)
// ═══════════════════════════════════════════════════════════════
describe("S4: Video volume — independent exit fade envelope", () => {
  it("videoVolume uses interpolate with 4-stop envelope (not baseVolume * opacity)", () => {
    const content = readFile("components/MediaBackground.tsx");

    // videoVolume should NOT be baseVolume * opacity
    expect(content).not.toMatch(/videoVolume\s*=\s*baseVolume\s*\*\s*opacity/);

    // Should use interpolate with outStart in input stops
    // The assignment is multi-line: baseVolume * interpolate(...)
    expect(content).toMatch(/baseVolume\s*\*\s*interpolate\(/);
    expect(content).toMatch(/videoVolume[\s\S]{0,200}?outStart/);
    expect(content).toMatch(/videoVolume[\s\S]{0,200}?\[0,\s*1,\s*1,\s*0\]/);
  });

  it("videoVolume interpolate has 4 input stops including outStart", () => {
    const content = readFile("components/MediaBackground.tsx");

    // Extract videoVolume section — multi-line due to ternary
    // Pattern: const videoVolume = ... baseVolume * interpolate(...)
    const volumeMatch = content.match(
      /const videoVolume[\s\S]*?baseVolume\s*\*\s*interpolate\(([\s\S]*?)\);/,
    );
    expect(volumeMatch).toBeTruthy();

    // Should have [0, inFrames, outStart, totalFrames] input
    expect(volumeMatch[1]).toMatch(/0,\s*inFrames,\s*outStart,\s*totalFrames/);
    // Should have [0, 1, 1, 0] output
    expect(volumeMatch[1]).toMatch(/0,\s*1,\s*1,\s*0/);
  });
});

// ═══════════════════════════════════════════════════════════════
//  S5: Overlay envelope — unchanged (4-stop with exit dim)
// ═══════════════════════════════════════════════════════════════
describe("S5: Overlay envelope — retained exit dim", () => {
  it("overlayOpacity still has 4-stop envelope with outStart", () => {
    const content = readFile("components/MediaBackground.tsx");

    // The overlayOpacity uses interpolate with 4-stop envelope
    // Extract the section around overlayOpacity
    const overlaySection = content.match(
      /const overlayOpacity\s*=\s*preset\s*===\s*"none"\s*\?\s*overlay\s*:\s*interpolate\(([\s\S]*?)\)\s*;/,
    );
    expect(overlaySection).toBeTruthy();
    expect(overlaySection[1]).toMatch(/outStart/);
    expect(overlaySection[1]).toMatch(/totalFrames/);
    // Output should include overlay * 0.3
    expect(overlaySection[1]).toMatch(/overlay\s*\*\s*0\.3/);
  });
});

// ═══════════════════════════════════════════════════════════════
//  S6: Preset-specific transforms still reference outStart
// ═══════════════════════════════════════════════════════════════
describe("S6: Preset transforms — outStart still used", () => {
  it("fade preset translateY still references outStart", () => {
    const content = readFile("components/MediaBackground.tsx");

    // fade preset: translateY = interpolate(frame, [outStart, totalFrames], [0, -30], clamp)
    const fadeMatch = content.match(/preset === "fade"[\s\S]*?(?=else if)/);
    expect(fadeMatch).toBeTruthy();
    expect(fadeMatch[0]).toMatch(/outStart/);
  });

  it("slide preset transformX still references outStart", () => {
    const content = readFile("components/MediaBackground.tsx");

    const slideMatch = content.match(/preset === "slide"[\s\S]*?(?=else if)/);
    expect(slideMatch).toBeTruthy();
    expect(slideMatch[0]).toMatch(/outStart/);
  });

  it("zoom preset scale still references outStart", () => {
    const content = readFile("components/MediaBackground.tsx");

    const zoomMatch = content.match(/preset === "zoom"[\s\S]*?(?=})\s*}/);
    expect(zoomMatch).toBeTruthy();
    expect(zoomMatch[0]).toMatch(/outStart/);
  });
});

// ═══════════════════════════════════════════════════════════════
//  S7: `outStart` variable still computed
// ═══════════════════════════════════════════════════════════════
describe("S7: outStart variable — still computed", () => {
  it("outStart is defined and used in the component", () => {
    const content = readFile("components/MediaBackground.tsx");

    // outStart should still be defined
    expect(content).toMatch(/const outStart\s*=\s*totalFrames\s*-\s*outFrames/);

    // outStart should appear in at least one interpolate call (transforms or volume)
    const outStartUsages = content.match(/outStart/g);
    expect(outStartUsages).toBeTruthy();
    expect(outStartUsages.length).toBeGreaterThanOrEqual(3); // definition + at least 2 uses
  });

  it("outFrames still defined (needed for outStart)", () => {
    const content = readFile("components/MediaBackground.tsx");

    expect(content).toMatch(/const outFrames\s*=\s*secToFrames/);
  });
});

// ═══════════════════════════════════════════════════════════════
//  S8: Short scenes — timing clamps to half duration
// ═══════════════════════════════════════════════════════════════
describe("S8: Short scenes — clamping behavior", () => {
  it("inFrames and outFrames are clamped to duration/2", () => {
    const content = readFile("components/MediaBackground.tsx");

    expect(content).toMatch(/Math\.min\(timing\.in,\s*duration\s*\/\s*2\)/);
    expect(content).toMatch(/Math\.min\(timing\.out,\s*duration\s*\/\s*2\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
//  S9: Overlay — independent from media opacity
// ═══════════════════════════════════════════════════════════════
describe("S9: Overlay — independent envelope from media opacity", () => {
  it("overlayOpacity uses its own interpolate, not the media opacity variable", () => {
    const content = readFile("components/MediaBackground.tsx");

    // overlayOpacity should be its own interpolate call, not referencing `opacity`
    const overlayMatch = content.match(
      /const overlayOpacity\s*=\s*preset\s*===\s*"none"\s*\?\s*overlay\s*:\s*interpolate\(/,
    );
    expect(overlayMatch).toBeTruthy();
    // Should not be simply `opacity`
    expect(overlayMatch[0]).not.toMatch(/=\s*opacity/);
  });
});
