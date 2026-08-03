import { describe, it, expect } from "vitest";
import { mergeScenes, filterHookAndCta } from "../compile-series-reconstruct.mjs";

// Mock scene data
const mockScenes1 = [
  { id: 1, name: "hook", voiceover: "hook text" },
  { id: 2, name: "content1", voiceover: "content 1" },
  { id: 3, name: "cta", voiceover: "cta text" },
];

const mockScenes2 = [
  { id: 1, name: "hook", voiceover: "hook 2" },
  { id: 2, name: "content2", voiceover: "content 2" },
  { id: 3, name: "cta", voiceover: "cta 2" },
];

const mockScenes3 = [
  { id: 1, name: "hook", voiceover: "hook 3" },
  { id: 2, name: "content3", voiceover: "content 3" },
  { id: 3, name: "cta", voiceover: "cta 3" },
];

describe("filterHookAndCta", () => {
  it("removes hook and cta scenes, keeps content", () => {
    const result = filterHookAndCta(mockScenes1);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("content1");
  });

  it("handles scenes without hook/cta names by position", () => {
    const scenes = [
      { id: 1, name: "opening", voiceover: "open" },
      { id: 2, name: "middle", voiceover: "mid" },
      { id: 3, name: "ending", voiceover: "end" },
    ];
    // By position: first = hook, last = cta
    const result = filterHookAndCta(scenes);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("middle");
  });
});

describe("mergeScenes", () => {
  it("merges multiple scene arrays: first hook + all middle + last cta", () => {
    const result = mergeScenes([mockScenes1, mockScenes2, mockScenes3]);
    expect(result).toHaveLength(5); // 1 hook + 3 content + 1 cta
    expect(result[0].name).toBe("hook");
    expect(result[0].voiceover).toBe("hook text"); // from first set
    expect(result[4].name).toBe("cta");
    expect(result[4].voiceover).toBe("cta 3"); // from last set
  });

  it("renumbers scene ids sequentially", () => {
    const result = mergeScenes([mockScenes1, mockScenes2]);
    result.forEach((scene, i) => {
      expect(scene.id).toBe(i + 1);
    });
  });

  it("handles single scene array (no merge needed)", () => {
    const result = mergeScenes([mockScenes1]);
    expect(result).toHaveLength(mockScenes1.length);
    expect(result[0].name).toBe("hook");
    expect(result[2].name).toBe("cta");
  });
});
