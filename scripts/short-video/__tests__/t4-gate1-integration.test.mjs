import { describe, it, expect, vi } from "vitest";

// Mock process.exit so we can test "hard fail" without killing the test process
const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
  throw new Error(`process.exit(${code})`);
});

// We test the gate logic via the exported helper — not the entire main.mjs
import { runCanonicalTextGate } from "../lib/verify-canonical-text.mjs";

const scenes = [
  {
    id: 1,
    voiceover: "ByteDance launched Doubao Work today.",
  },
  {
    id: 2,
    voiceover: "It controls your browser and software.",
  },
];

const keyEntities = {
  companies: ["bytedance", "doubao"],
  models: ["doubao-work"],
};

const matchingTiming = [
  {
    sceneId: 1,
    segments: [
      {
        words: [
          { text: "ByteDance", start: 0, end: 0.5 },
          { text: "launched", start: 0.5, end: 0.8 },
          { text: "Doubao", start: 0.8, end: 1.0 },
          { text: "Work", start: 1.0, end: 1.2 },
          { text: "today.", start: 1.2, end: 1.5 },
        ],
      },
    ],
  },
  {
    sceneId: 2,
    segments: [
      {
        words: [
          { text: "It", start: 0, end: 0.1 },
          { text: "controls", start: 0.1, end: 0.4 },
          { text: "your", start: 0.4, end: 0.5 },
          { text: "browser", start: 0.5, end: 0.8 },
          { text: "and", start: 0.8, end: 0.9 },
          { text: "software.", start: 0.9, end: 1.3 },
        ],
      },
    ],
  },
];

describe("T4: Gate 1 — runCanonicalTextGate", () => {
  it("passes through when canonical text matches (no exit)", () => {
    exitSpy.mockClear();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Should not throw (no process.exit)
    expect(() => {
      runCanonicalTextGate(matchingTiming, scenes, keyEntities, { label: "Gate 1" });
    }).not.toThrow();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Gate 1"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("PASS"));
    logSpy.mockRestore();
  });

  it("hard fails (exit 1) when canonical text mismatches", () => {
    exitSpy.mockClear();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const modifiedScenes = JSON.parse(JSON.stringify(scenes));
    modifiedScenes[0].voiceover = "Tencent launched Doubao Work today.";

    expect(() => {
      runCanonicalTextGate(matchingTiming, modifiedScenes, keyEntities, { label: "Gate 1" });
    }).toThrow("process.exit(1)");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("FAIL"));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Scene 1"));
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("renders hint about running full pipeline when --render-only context", () => {
    exitSpy.mockClear();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const modifiedScenes = JSON.parse(JSON.stringify(scenes));
    modifiedScenes[0].voiceover = "Tencent launched Doubao Work today.";

    try {
      runCanonicalTextGate(matchingTiming, modifiedScenes, keyEntities, {
        label: "Gate 1",
        renderOnly: true,
      });
    } catch {
      // expected
    }

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("full pipeline"));
    errorSpy.mockRestore();
  });
});
