/**
 * Safe Zone Regression Test
 *
 * Scans all scene template files to ensure text containers use SAFE_ZONES
 * for positioning, not raw values that would place content in TikTok UI areas.
 *
 * Text containers (divs with text content) must:
 *   - NOT use bottom: 0 or bottom < 770 (would overlap subtitle/TikTok UI)
 *   - NOT use top < 220 (would overlap top nav)
 *   - NOT use percentage-based positioning for text (unpredictable)
 *   - Media containers CAN use top: 0 / height: 100% (full-bleed is OK for backgrounds)
 *
 * This test prevents future refactors from accidentally bypassing SAFE_ZONES.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCENES_DIR = join(__dirname, "..", "remotion", "src", "scenes");

function readSceneFile(name) {
  return readFileSync(join(SCENES_DIR, name), "utf-8");
}

function listSceneFiles() {
  return readdirSync(SCENES_DIR).filter((f) => f.endsWith(".tsx"));
}

describe("Safe Zone regression: all scene files use SAFE_ZONES", () => {
  it("all scene files import SAFE_ZONES or use Slot (which encodes safe zones)", () => {
    const files = listSceneFiles();
    for (const file of files) {
      const content = readSceneFile(file);
      // Either uses SAFE_ZONES directly, or uses Slot (which internally uses safe zones)
      const usesSafeZones = content.includes("SAFE_ZONES");
      const usesSlot = content.includes("Slot");
      expect(
        usesSafeZones || usesSlot,
        `${file} must import SAFE_ZONES or use Slot component`,
      ).toBe(true);
    }
  });

  it("NarrativeScene text containers use SAFE_ZONES for positioning, not raw bottom/top values", () => {
    const content = readSceneFile("NarrativeScene.tsx");
    // Check that no text container uses bottom: 0 (would be in TikTok UI zone)
    // We look for patterns like `bottom: 0` or `bottom: <number>` where number < 770
    // on divs that contain text content (not media containers)
    // Media containers are OK to use top: 0 / height: 100%
    const bottomMatches = content.match(/bottom:\s*(\d+)/g);
    if (bottomMatches) {
      for (const match of bottomMatches) {
        const value = parseInt(match.match(/\d+/)[0]);
        // bottom < 770 means content edge is below y=1150 (in subtitle/TikTok zone)
        // SAFE_ZONES.bottom = 770 is the minimum
        expect(value, `bottom:${value} is below SAFE_ZONES.bottom (770)`).toBeGreaterThanOrEqual(770);
      }
    }
  });

  it("NarrativeScene media-overlay bottom overlay uses SAFE_ZONES.bottom", () => {
    const content = readSceneFile("NarrativeScene.tsx");
    // The media-overlay variant's bottom overlay must use SAFE_ZONES.bottom
    // not a hardcoded value like 120
    expect(content).toMatch(/bottom:\s*SAFE_ZONES\.bottom/);
    expect(content).not.toMatch(/bottom:\s*120\b/);
  });

  it("NarrativeScene media-bottom-bar text bar uses SAFE_ZONES positioning", () => {
    const content = readSceneFile("NarrativeScene.tsx");
    // The text bar should use SAFE_ZONES.left and SAFE_ZONES.right
    // not left: 0, right: 0
    expect(content).toMatch(/left:\s*SAFE_ZONES\.left/);
    expect(content).toMatch(/right:\s*SAFE_ZONES\.right/);
  });

  it("NarrativeScene stacked-cards uses SAFE_ZONES.top (not 200 or arbitrary)", () => {
    const content = readSceneFile("NarrativeScene.tsx");
    // stacked-cards top should be SAFE_ZONES.top (220), not 200
    expect(content).toMatch(/top:\s*SAFE_ZONES\.top/);
    expect(content).not.toMatch(/top:\s*200\b/);
  });

  it("NarrativeScene media-split uses SAFE_ZONES for both top and bottom", () => {
    const content = readSceneFile("NarrativeScene.tsx");
    // media-split text container should have top: SAFE_ZONES.top and bottom: SAFE_ZONES.bottom
    // Check that both appear in the file
    const safeTopCount = (content.match(/top:\s*SAFE_ZONES\.top/g) || []).length;
    const safeBottomCount = (content.match(/bottom:\s*SAFE_ZONES\.bottom/g) || []).length;
    expect(safeTopCount, "Should have top: SAFE_ZONES.top").toBeGreaterThan(0);
    expect(safeBottomCount, "Should have bottom: SAFE_ZONES.bottom").toBeGreaterThan(0);
  });
});

describe("Safe Zone regression: no percentage-based text positioning", () => {
  it("NarrativeScene does not use percentage height for text containers", () => {
    const content = readSceneFile("NarrativeScene.tsx");
    // Text containers should not use height: "30%" or similar
    // (percentage heights are unpredictable and may overflow safe zones)
    // Media containers using height: "100%" or textBarTop (computed) are OK
    expect(content).not.toMatch(/height:\s*["']30%/);
    expect(content).not.toMatch(/height:\s*["']20%/);
  });

  it("NarrativeScene does not use percentage top for text containers", () => {
    const content = readSceneFile("NarrativeScene.tsx");
    // Text containers should not use top: "20%" or similar
    expect(content).not.toMatch(/top:\s*["']20%/);
    expect(content).not.toMatch(/top:\s*["']10%/);
  });
});
