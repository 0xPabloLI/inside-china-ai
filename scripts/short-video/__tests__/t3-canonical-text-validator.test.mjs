import { describe, it, expect } from "vitest";
import {
  normalizeText,
  buildProperNounDictionary,
  greedyMerge,
  verifyCanonicalText,
} from "../lib/verify-canonical-text.mjs";

// ─── Test data ───

const scenes = [
  {
    id: 1,
    voiceover:
      "382 million users. That's ByteDance's Doubao. Today it launched Doubao Work, an agent operating your computer.",
  },
  {
    id: 2,
    voiceover: "The differentiator is Feishu, or Lark overseas. ByteDance's Slack rival.",
  },
  {
    id: 3,
    voiceover:
      "Doubao Work doesn't just generate content. It writes plans, analyzes data, builds apps.",
  },
  {
    id: 4,
    voiceover: "", // Empty voiceover — visual-only scene
  },
];

const keyEntities = {
  companies: ["bytedance", "doubao", "tencent"],
  people: ["zhao-qi"],
  models: ["doubao-work"],
};

// Timing data where words match scene-data voiceover
const matchingTiming = [
  {
    sceneId: 1,
    segments: [
      {
        words: [
          { text: "382", start: 0, end: 0.3 },
          { text: "million", start: 0.3, end: 0.6 },
          { text: "users.", start: 0.6, end: 0.9 },
          { text: "That's", start: 0.9, end: 1.1 },
          { text: "ByteDance's", start: 1.1, end: 1.5 },
          { text: "Doubao.", start: 1.5, end: 1.8 },
          { text: "Today", start: 1.8, end: 2.0 },
          { text: "it", start: 2.0, end: 2.1 },
          { text: "launched", start: 2.1, end: 2.4 },
          { text: "Doubao", start: 2.4, end: 2.6 },
          { text: "Work,", start: 2.6, end: 2.8 },
          { text: "an", start: 2.8, end: 2.9 },
          { text: "agent", start: 2.9, end: 3.1 },
          { text: "operating", start: 3.1, end: 3.4 },
          { text: "your", start: 3.4, end: 3.5 },
          { text: "computer.", start: 3.5, end: 3.9 },
        ],
      },
    ],
  },
  {
    sceneId: 2,
    segments: [
      {
        words: [
          { text: "The", start: 0, end: 0.1 },
          { text: "differentiator", start: 0.1, end: 0.5 },
          { text: "is", start: 0.5, end: 0.6 },
          { text: "Feishu,", start: 0.6, end: 0.9 },
          { text: "or", start: 0.9, end: 1.0 },
          { text: "Lark", start: 1.0, end: 1.2 },
          { text: "overseas.", start: 1.2, end: 1.6 },
          { text: "ByteDance's", start: 1.6, end: 2.0 },
          { text: "Slack", start: 2.0, end: 2.3 },
          { text: "rival.", start: 2.3, end: 2.6 },
        ],
      },
    ],
  },
  {
    sceneId: 3,
    segments: [
      {
        words: [
          { text: "Doubao", start: 0, end: 0.2 },
          { text: "Work", start: 0.2, end: 0.4 },
          { text: "doesn't", start: 0.4, end: 0.6 },
          { text: "just", start: 0.6, end: 0.7 },
          { text: "generate", start: 0.7, end: 1.0 },
          { text: "content.", start: 1.0, end: 1.3 },
          { text: "It", start: 1.3, end: 1.4 },
          { text: "writes", start: 1.4, end: 1.6 },
          { text: "plans,", start: 1.6, end: 1.9 },
          { text: "analyzes", start: 1.9, end: 2.2 },
          { text: "data,", start: 2.2, end: 2.4 },
          { text: "builds", start: 2.4, end: 2.6 },
          { text: "apps.", start: 2.6, end: 2.9 },
        ],
      },
    ],
  },
  // Scene 4 has empty voiceover — no segments
  {
    sceneId: 4,
    segments: [],
  },
];

// ─── normalizeText ───

describe("normalizeText", () => {
  it("strips punctuation from word", () => {
    expect(normalizeText("users.")).toBe("users");
    expect(normalizeText("Work,")).toBe("work");
    expect(normalizeText("overseas.")).toBe("overseas");
  });

  it("folds to lowercase", () => {
    expect(normalizeText("ByteDance")).toBe("bytedance");
    expect(normalizeText("DOUBAO")).toBe("doubao");
  });

  it("handles empty string", () => {
    expect(normalizeText("")).toBe("");
  });

  it("preserves hyphenated words as-is (lowercased)", () => {
    expect(normalizeText("zhao-qi")).toBe("zhao-qi");
  });
});

// ─── buildProperNounDictionary ───

describe("buildProperNounDictionary", () => {
  it("builds dictionary from keyEntities", () => {
    const dict = buildProperNounDictionary(keyEntities);
    expect(dict.size).toBeGreaterThan(0);
    expect(dict.has("bytedance")).toBe(true);
    expect(dict.has("doubao")).toBe(true);
    expect(dict.has("doubao-work")).toBe(true);
    expect(dict.has("zhao-qi")).toBe(true);
  });

  it("includes multi-word forms for greedy merge", () => {
    const dict = buildProperNounDictionary(keyEntities);
    // "doubao-work" should be in the dictionary as a multi-word phrase
    expect(dict.has("doubao-work")).toBe(true);
  });

  it("handles empty keyEntities", () => {
    const dict = buildProperNounDictionary({});
    expect(dict.size).toBe(0);
  });
});

// ─── greedyMerge ───

describe("greedyMerge", () => {
  it("merges split proper noun: ['byte', 'dance'] -> ['bytedance']", () => {
    const dict = buildProperNounDictionary(keyEntities);
    const tokens = ["byte", "dance", "slack", "rival"];
    const merged = greedyMerge(tokens, dict);
    expect(merged).toEqual(["bytedance", "slack", "rival"]);
  });

  it("merges multi-word proper noun: ['doubao', 'work'] -> ['doubao-work']", () => {
    const dict = buildProperNounDictionary(keyEntities);
    const tokens = ["doubao", "work", "doesn't", "just"];
    const merged = greedyMerge(tokens, dict);
    expect(merged).toEqual(["doubao-work", "doesn't", "just"]);
  });

  it("leaves unknown words untouched", () => {
    const dict = buildProperNounDictionary(keyEntities);
    const tokens = ["hello", "world", "foo"];
    const merged = greedyMerge(tokens, dict);
    expect(merged).toEqual(["hello", "world", "foo"]);
  });

  it("handles empty token list", () => {
    const dict = buildProperNounDictionary(keyEntities);
    expect(greedyMerge([], dict)).toEqual([]);
  });
});

// ─── verifyCanonicalText ───

describe("verifyCanonicalText", () => {
  // Scenario 1: timing matches scene-data voiceover
  it("S1: passes when timing words match scene-data voiceover", () => {
    const result = verifyCanonicalText(matchingTiming, scenes, keyEntities);
    expect(result.passed).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });

  // Scenario 2: scene-data changed (ByteDance -> Tencent), timing stale
  it("S2: fails when scene-data voiceover changed but timing not regenerated", () => {
    const modifiedScenes = JSON.parse(JSON.stringify(scenes));
    modifiedScenes[0].voiceover = modifiedScenes[0].voiceover.replace("ByteDance", "Tencent");
    const result = verifyCanonicalText(matchingTiming, modifiedScenes, keyEntities);
    expect(result.passed).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
    expect(result.mismatches[0].sceneId).toBe(1);
  });

  // Scenario 4: timing has "ByteDance" split as ["Byte", "Dance"] — greedy merge handles it
  it("S4: passes when proper noun is split in timing (greedy merge)", () => {
    const splitTiming = JSON.parse(JSON.stringify(matchingTiming));
    // Replace "ByteDance's" with ["Byte", "Dance's"] in scene 1
    const words = splitTiming[0].segments[0].words;
    const bdIdx = words.findIndex((w) => w.text === "ByteDance's");
    expect(bdIdx).toBeGreaterThanOrEqual(0);
    words.splice(
      bdIdx,
      1,
      { text: "Byte", start: 1.1, end: 1.3 },
      { text: "Dance's", start: 1.3, end: 1.5 },
    );
    const result = verifyCanonicalText(splitTiming, scenes, keyEntities);
    expect(result.passed).toBe(true);
  });

  // Scenario 5: proper noun not in dictionary — false positive FAIL
  it("S5: fails when proper noun not in keyEntities dictionary (acceptable false positive)", () => {
    const splitTiming = JSON.parse(JSON.stringify(matchingTiming));
    // Replace "Feishu," with ["Fei", "shu,"] in scene 2
    const words = splitTiming[1].segments[0].words;
    const feishuIdx = words.findIndex((w) => w.text === "Feishu,");
    words.splice(
      feishuIdx,
      1,
      { text: "Fei", start: 0.6, end: 0.75 },
      { text: "shu,", start: 0.75, end: 0.9 },
    );
    const result = verifyCanonicalText(splitTiming, scenes, keyEntities);
    expect(result.passed).toBe(false);
  });

  // Scenario 14: scene with empty voiceover — skip, not FAIL
  it("S14: skips scene with empty voiceover", () => {
    const result = verifyCanonicalText(matchingTiming, scenes, keyEntities);
    // Scene 4 has empty voiceover, should not appear in mismatches
    const scene4Mismatch = result.mismatches.find((m) => m.sceneId === 4);
    expect(scene4Mismatch).toBeUndefined();
  });

  // Scenario 15: voiceover non-empty but timing has 0 words — FAIL
  it("S15: fails when voiceover is non-empty but timing has 0 words", () => {
    const emptyTiming = JSON.parse(JSON.stringify(matchingTiming));
    emptyTiming[0].segments[0].words = [];
    const result = verifyCanonicalText(emptyTiming, scenes, keyEntities);
    expect(result.passed).toBe(false);
    const scene1Mismatch = result.mismatches.find((m) => m.sceneId === 1);
    expect(scene1Mismatch).toBeDefined();
  });

  // Scenario 16: 100% match required — partial match is FAIL
  it("S16: fails on partial match (one word different)", () => {
    const modifiedTiming = JSON.parse(JSON.stringify(matchingTiming));
    modifiedTiming[0].segments[0].words[0].text = "500"; // "382" -> "500"
    const result = verifyCanonicalText(modifiedTiming, scenes, keyEntities);
    expect(result.passed).toBe(false);
  });
});
