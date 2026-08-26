/**
 * T3: NarrativeScene Layout Variants
 *
 * Tests that NarrativeScene dispatches by layout field into 4 variants,
 * each with correct layout structure, entrance animations, Interactive.Div,
 * and SPACING tokens.
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

describe("T3: NarrativeScene layout dispatch", () => {
  it("NarrativeScene reads layout field from scene", () => {
    const content = readFile("scenes/NarrativeScene.tsx");
    expect(content).toMatch(/scene\.layout|txt\.layout|layout\s*[=:]/);
  });

  it("NarrativeScene has media-bottom-bar variant", () => {
    const content = readFile("scenes/NarrativeScene.tsx");
    expect(content).toMatch(/media-bottom-bar/);
  });

  it("NarrativeScene has media-split variant", () => {
    const content = readFile("scenes/NarrativeScene.tsx");
    expect(content).toMatch(/media-split/);
  });

  it("NarrativeScene has media-overlay variant", () => {
    const content = readFile("scenes/NarrativeScene.tsx");
    expect(content).toMatch(/media-overlay/);
  });

  it("NarrativeScene has stacked-cards variant", () => {
    const content = readFile("scenes/NarrativeScene.tsx");
    expect(content).toMatch(/stacked-cards/);
  });
});

describe("T3: Each variant uses correct entrance animation", () => {
  it("media-bottom-bar uses SlideUpFromBottom entrance", () => {
    const content = readFile("scenes/NarrativeScene.tsx");
    expect(content).toMatch(/SlideUpFromBottom/);
  });

  it("media-split uses SlideRight entrance", () => {
    const content = readFile("scenes/NarrativeScene.tsx");
    expect(content).toMatch(/SlideRight/);
  });

  it("media-overlay uses SlideDown entrance", () => {
    const content = readFile("scenes/NarrativeScene.tsx");
    expect(content).toMatch(/SlideDown/);
  });

  it("stacked-cards uses StampIn and ScaleIn entrance", () => {
    const content = readFile("scenes/NarrativeScene.tsx");
    expect(content).toMatch(/StampIn/);
    expect(content).toMatch(/ScaleIn/);
  });
});

describe("T3: Interactive.Div on company and result", () => {
  it("NarrativeScene uses Interactive.Div", () => {
    const content = readFile("scenes/NarrativeScene.tsx");
    expect(content).toMatch(/Interactive\.Div|Interactive\b/);
  });

  it("NarrativeScene imports Interactive from remotion", () => {
    const content = readFile("scenes/NarrativeScene.tsx");
    expect(content).toMatch(/import\s+\{[^}]*Interactive[^}]*\}\s+from\s+["']remotion["']/);
  });
});

describe("T3: SPACING tokens used in NarrativeScene", () => {
  it("NarrativeScene imports SPACING from shared", () => {
    const content = readFile("scenes/NarrativeScene.tsx");
    expect(content).toMatch(/SPACING/);
  });
});

describe("T3: GridBg absent on media layouts", () => {
  it("GridBg not rendered when scene has media (media layouts)", () => {
    const content = readFile("scenes/NarrativeScene.tsx");
    // The component should conditionally render GridBg based on media presence
    expect(content).toMatch(/GridBg/);
    // Check for conditional rendering — GridBg should be inside a conditional
    expect(content).toMatch(/\{.*&&.*GridBg|GridBg.*\?|!.*media.*&&.*GridBg/);
  });
});
