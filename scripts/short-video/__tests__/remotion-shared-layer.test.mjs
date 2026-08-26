/**
 * T1: Shared Layer Foundation — tests for SPACING, configurable Slot,
 * weakened GridBg, new animation components, perceptual-scale.
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

describe("T1: SPACING system", () => {
  it("SPACING constant exists in shared.ts with correct 4pt scale values", () => {
    const content = readFile("components/shared.ts");
    expect(content).toMatch(/SPACING/);
    expect(content).toMatch(/xs:\s*4/);
    expect(content).toMatch(/sm:\s*8/);
    expect(content).toMatch(/md:\s*12/);
    expect(content).toMatch(/lg:\s*16/);
    expect(content).toMatch(/xl:\s*24/);
    expect(content).toMatch(/'2xl':\s*32/);
    expect(content).toMatch(/'3xl':\s*48/);
    expect(content).toMatch(/'4xl':\s*64/);
    expect(content).toMatch(/'5xl':\s*96/);
  });
});

describe("T1: Configurable Slot", () => {
  it("Slot component accepts optional top and height props", () => {
    const content = readFile("components/visuals.tsx");
    expect(content).toMatch(/top\??:\s*number/);
    expect(content).toMatch(/height\??:\s*number/);
  });

  it("Slot uses default values when top/height not provided", () => {
    const content = readFile("components/visuals.tsx");
    expect(content).toMatch(/220/);
    expect(content).toMatch(/180/);
    expect(content).toMatch(/400/);
    expect(content).toMatch(/550/);
    expect(content).toMatch(/950/);
    expect(content).toMatch(/200/);
  });
});

describe("T1: GridBg weakening", () => {
  it("GridBg opacity reduced to 0.015", () => {
    const content = readFile("components/visuals.tsx");
    expect(content).toMatch(/0\.015/);
    const gridBgSection = content.match(/GridBg[\s\S]*?\/>/);
    expect(gridBgSection).toBeTruthy();
    expect(gridBgSection[0]).not.toMatch(/0\.04/);
  });
});

describe("T1: New animation components", () => {
  it("SlideRight component exists in entrance.tsx", () => {
    const content = readFile("components/animations/entrance.tsx");
    expect(content).toMatch(/SlideRight/);
    expect(content).toMatch(/-50/);
  });

  it("SlideUpFromBottom component exists in entrance.tsx", () => {
    const content = readFile("components/animations/entrance.tsx");
    expect(content).toMatch(/SlideUpFromBottom/);
    expect(content).toMatch(/\[50,\s*0\]/);
  });
});

describe("T1: perceptual-scale on scale animations", () => {
  it("ScaleIn uses output: 'perceptual-scale'", () => {
    const content = readFile("components/animations/entrance.tsx");
    // Find from the ScaleIn comment to the closing of the function
    const scaleInMatch = content.match(/\/\*\* scaleIn[\s\S]*?\n\}/);
    expect(scaleInMatch).toBeTruthy();
    expect(scaleInMatch[0]).toMatch(/perceptual-scale/);
  });

  it("StampIn uses output: 'perceptual-scale'", () => {
    const content = readFile("components/animations/entrance.tsx");
    // Find from the StampIn comment to the closing of the function
    const stampInMatch = content.match(/\/\*\* stampIn[\s\S]*?\n\}/);
    expect(stampInMatch).toBeTruthy();
    expect(stampInMatch[0]).toMatch(/perceptual-scale/);
  });
});

describe("T1: remotion.config.ts with ANGLE", () => {
  it("remotion.config.ts exists and enables ANGLE renderer", () => {
    const configPath = join(REMOTION_SRC, "..", "remotion.config.ts");
    const configContent = readFileSync(configPath, "utf-8");
    expect(configContent).toMatch(/setChromiumOpenGlRenderer/);
    expect(configContent).toMatch(/angle/i);
  });
});

describe("T1: package.json has new dependencies", () => {
  it("@remotion/media is in dependencies", () => {
    const pkg = JSON.parse(
      readFileSync(join(REMOTION_SRC, "..", "package.json"), "utf-8"),
    );
    expect(pkg.dependencies).toHaveProperty("@remotion/media");
  });

  it("@remotion/rough-notation is in dependencies", () => {
    const pkg = JSON.parse(
      readFileSync(join(REMOTION_SRC, "..", "package.json"), "utf-8"),
    );
    expect(pkg.dependencies).toHaveProperty("@remotion/rough-notation");
  });

  it("@remotion/effects is in dependencies", () => {
    const pkg = JSON.parse(
      readFileSync(join(REMOTION_SRC, "..", "package.json"), "utf-8"),
    );
    expect(pkg.dependencies).toHaveProperty("@remotion/effects");
  });
});
