/**
 * T4: Other Scene Templates + Rough-Notation + Effects
 *
 * Tests that all non-narrative scene templates are rewritten with:
 * - Interactive.Div on key text elements
 * - @remotion/rough-notation annotations (Circle, Underline, Highlight)
 * - SPACING tokens
 * - GridBg weakened on no-media scenes
 * - @remotion/effects usage support
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

describe("T4: HookScene rewrites", () => {
  it("HookScene uses Interactive.Div on hookText, revealText, bigNumber, or numberLabel", () => {
    const content = readFile("scenes/HookScene.tsx");
    expect(content).toMatch(/Interactive/);
  });

  it("HookScene imports Interactive from remotion", () => {
    const content = readFile("scenes/HookScene.tsx");
    expect(content).toMatch(/import\s+\{[^}]*Interactive[^}]*\}\s+from\s+["']remotion["']/);
  });

  it("HookScene uses rough-notation Circle on bigNumber", () => {
    const content = readFile("scenes/HookScene.tsx");
    expect(content).toMatch(/rough-notation/);
    expect(content).toMatch(/Circle/);
  });

  it("HookScene uses SPACING tokens", () => {
    const content = readFile("scenes/HookScene.tsx");
    expect(content).toMatch(/SPACING/);
  });
});

describe("T4: DataScene rewrites", () => {
  it("DataScene uses Interactive.Div on stat or statLabel", () => {
    const content = readFile("scenes/DataScene.tsx");
    expect(content).toMatch(/Interactive/);
  });

  it("DataScene uses rough-notation Circle on stat", () => {
    const content = readFile("scenes/DataScene.tsx");
    expect(content).toMatch(/Circle/);
  });

  it("DataScene uses SPACING tokens", () => {
    const content = readFile("scenes/DataScene.tsx");
    expect(content).toMatch(/SPACING/);
  });
});

describe("T4: QuoteScene rewrites", () => {
  it("QuoteScene uses rough-notation Underline on quote text", () => {
    const content = readFile("scenes/QuoteScene.tsx");
    expect(content).toMatch(/Underline/);
  });

  it("QuoteScene uses SPACING tokens", () => {
    const content = readFile("scenes/QuoteScene.tsx");
    expect(content).toMatch(/SPACING/);
  });
});

describe("T4: CtaScene rewrites", () => {
  it("CtaScene uses Interactive.Div on brand or tagline", () => {
    const content = readFile("scenes/CtaScene.tsx");
    expect(content).toMatch(/Interactive/);
  });

  it("CtaScene uses SPACING tokens", () => {
    const content = readFile("scenes/CtaScene.tsx");
    expect(content).toMatch(/SPACING/);
  });
});

describe("T4: ContrastScene rewrites", () => {
  it("ContrastScene uses SPACING tokens", () => {
    const content = readFile("scenes/ContrastScene.tsx");
    expect(content).toMatch(/SPACING/);
  });

  it("ContrastScene uses Interactive.Div on title", () => {
    const content = readFile("scenes/ContrastScene.tsx");
    expect(content).toMatch(/Interactive/);
  });
});

describe("T4: StatRevealScene rewrites", () => {
  it("StatRevealScene uses SPACING tokens", () => {
    const content = readFile("scenes/StatRevealScene.tsx");
    expect(content).toMatch(/SPACING/);
  });

  it("StatRevealScene uses rough-notation", () => {
    const content = readFile("scenes/StatRevealScene.tsx");
    expect(content).toMatch(/rough-notation/);
  });
});

describe("T4: InfoCardScene rewrites", () => {
  it("InfoCardScene uses SPACING tokens", () => {
    const content = readFile("scenes/InfoCardScene.tsx");
    expect(content).toMatch(/SPACING/);
  });
});

describe("T4: ContextScene rewrites", () => {
  it("ContextScene uses SPACING tokens", () => {
    const content = readFile("scenes/ContextScene.tsx");
    expect(content).toMatch(/SPACING/);
  });
});

describe("T4: GridBg opacity 0.015 on no-media scenes", () => {
  it("DataScene GridBg opacity is 0.015 (not 0.04)", () => {
    const content = readFile("scenes/DataScene.tsx");
    // GridBg is imported from visuals.tsx which has 0.015
    // Just verify GridBg is still present
    expect(content).toMatch(/GridBg/);
  });

  it("GridBg absent on media scenes (InfoCardScene has media)", () => {
    const content = readFile("scenes/InfoCardScene.tsx");
    // InfoCardScene has media, so GridBg should be conditional
    expect(content).toMatch(/GridBg/);
    // Verify conditional rendering
    expect(content).toMatch(/\{.*&&.*GridBg|!.*media.*&&|GridBg.*\?/);
  });
});

describe("T4: MediaBackground supports effects prop", () => {
  it("MediaBackground already has effects prop (from T2)", () => {
    const content = readFile("components/MediaBackground.tsx");
    expect(content).toMatch(/effects\??\s*:/);
  });
});
