import { describe, test, expect } from "vitest";

import {
  PROMPT_INJECTION_VERSION,
  NEGATIVE_CONSTANTS,
  NEGATIVE_CLAUSES,
  BRAND_BASE_PROMPT,
  ENTITY_COLORS,
  VISUAL_TYPE_DIMENSION_DEFAULTS,
  composeGenerationPrompt,
  composeImagePrompt,
  dimensionDefaultsFor,
  estimateTokens,
  tokenBudgetExceeded,
  detectEntityColor,
  stripNegativeClauses,
  MAX_PROMPT_TOKENS,
  IMAGE_MAX_PROMPT_TOKENS,
} from "../b-roll/prompt-injection.mjs";
import { NEGATIVE_GROUPS, coversNegativeGroup } from "../scene-rules.mjs";

// ─── fixtures ───

function scene(overrides = {}) {
  return {
    id: 5,
    visualType: "narrative",
    voiceover: "Training cost just one ninth of Qwen3.7-Plus.",
    mediaStrategy: "b-roll",
    aiVideo: {
      prompt: "One tall glowing vertical bar shrinking beside a short one, cinematic data visualization.",
    },
    ...overrides,
  };
}

// ─── constants ───

describe("injection constants (#166)", () => {
  test("PROMPT_INJECTION_VERSION is a positive integer", () => {
    expect(Number.isInteger(PROMPT_INJECTION_VERSION)).toBe(true);
    expect(PROMPT_INJECTION_VERSION).toBeGreaterThanOrEqual(1);
  });

  test("NEGATIVE_CONSTANTS covers all three semantic groups", () => {
    for (const phrases of Object.values(NEGATIVE_GROUPS)) {
      const covered = phrases.some((p) =>
        new RegExp(`\\b${p}\\b`, "i").test(NEGATIVE_CONSTANTS),
      );
      expect(covered).toBe(true);
    }
  });

  test("every NEGATIVE group has a canonical clause (the module-load guard's contract)", () => {
    for (const group of Object.keys(NEGATIVE_GROUPS)) {
      expect(NEGATIVE_CLAUSES[group]).toBeTruthy();
    }
  });

  test("BRAND_BASE_PROMPT carries the #0a0a14 dark base and the blue-cyan palette", () => {
    expect(BRAND_BASE_PROMPT).toContain("#0a0a14");
    expect(BRAND_BASE_PROMPT.toLowerCase()).toContain("blue");
    expect(BRAND_BASE_PROMPT.toLowerCase()).toContain("cyan");
  });

  test("ENTITY_COLORS maps the brand-system entity palette", () => {
    expect(ENTITY_COLORS.deepseek).toMatchObject({ color: "blue", hex: "#4d8bff" });
    expect(ENTITY_COLORS.huawei).toMatchObject({ color: "red", hex: "#ef4444" });
    expect(ENTITY_COLORS.alibaba).toMatchObject({ color: "amber", hex: "#f59e0b" });
    expect(ENTITY_COLORS.tencent).toMatchObject({ color: "green", hex: "#34d399" });
  });

  test("every visualType default carries camera, motion and lighting", () => {
    for (const dims of Object.values(VISUAL_TYPE_DIMENSION_DEFAULTS)) {
      expect(typeof dims.camera).toBe("string");
      expect(typeof dims.motion).toBe("string");
      expect(typeof dims.lighting).toBe("string");
    }
  });
});

// ─── NEGATIVE injection ───

describe("NEGATIVE injection (#166 R3 baseline)", () => {
  test("scene 5 baseline: prompt without watermark protection gets the ARTIFACT clause injected", () => {
    const raw = "One tall glowing bar, dark reflective studio floor, no text, no letters, no hands";
    const composed = composeGenerationPrompt(scene({ aiVideo: { prompt: raw } }));
    expect(composed).toContain("no watermark");
    // Explicit clauses are preserved, never duplicated.
    expect(composed.match(/\bno text\b/g)).toHaveLength(1);
    expect(composed.match(/\bno hands\b/g)).toHaveLength(1);
  });

  test("scene 6 baseline: prompt with only 'no hands' gets TEXT and ARTIFACT clauses injected", () => {
    const raw = "Abstract transformer layers folding inward, no hands";
    const composed = composeGenerationPrompt(scene({ aiVideo: { prompt: raw } }));
    expect(composed).toContain("no text");
    expect(composed).toContain("no watermark");
    expect(composed.match(/\bno hands\b/g)).toHaveLength(1);
  });

  test("a prompt already covering all three groups gets no NEGATIVE injection", () => {
    const raw =
      "Two lanes of glowing particles, dark studio, no text, no watermark, no hands";
    expect(composeGenerationPrompt(scene({ aiVideo: { prompt: raw } }))).toBe(raw);
  });

  test("'no texture' is not credited as TEXT coverage", () => {
    const raw = "A bar with no texture, no hands, no watermark";
    const composed = composeGenerationPrompt(scene({ aiVideo: { prompt: raw } }));
    expect(composed).toContain("no text");
  });

  test("matching is case-insensitive", () => {
    const raw = "A glowing bar on a dark stage, No Text, No Hands, No Watermark";
    expect(composeGenerationPrompt(scene({ aiVideo: { prompt: raw } }))).toBe(raw);
  });

  test("coversNegativeGroup uses word boundaries", () => {
    expect(coversNegativeGroup("no text here", NEGATIVE_GROUPS.TEXT)).toBe(true);
    expect(coversNegativeGroup("no texture", NEGATIVE_GROUPS.TEXT)).toBe(false);
  });
});

// ─── BRAND injection ───

describe("BRAND base injection", () => {
  test("a prompt without a dark-background descriptor gets the brand base appended", () => {
    const raw = "One tall glowing vertical bar shrinking beside a short one";
    const composed = composeGenerationPrompt(scene({ aiVideo: { prompt: raw } }));
    expect(composed).toContain(BRAND_BASE_PROMPT);
  });

  test("a prompt that already declares a dark scene is not branded twice (agent wins)", () => {
    const raw = "Two lanes of glowing particles across a dark studio, no text, no watermark, no hands";
    const composed = composeGenerationPrompt(scene({ aiVideo: { prompt: raw } }));
    expect(composed).not.toContain("#0a0a14");
    expect(composed).toBe(raw);
  });
});

// ─── entity color mapping ───

describe("entity color detection and injection", () => {
  test("detects Qwen via alias and maps it to Alibaba amber", () => {
    const entity = detectEntityColor(
      scene({ texts: { action: "PREFILL THROUGHPUT VS QWEN3.7-PLUS" } }),
    );
    expect(entity).toMatchObject({ label: "Alibaba", color: "amber", hex: "#f59e0b" });
  });

  test("detects DeepSeek directly", () => {
    const entity = detectEntityColor(scene({ voiceover: "DeepSeek trained it for less." }));
    expect(entity).toMatchObject({ label: "DeepSeek", color: "blue", hex: "#4d8bff" });
  });

  test("returns null when no known entity appears in the scene", () => {
    expect(
      detectEntityColor(scene({ voiceover: "Layers compress history.", texts: {} })),
    ).toBeNull();
  });

  test("a prompt-free-of-color-words gets the entity clause appended", () => {
    const raw = "A giant chip stamped with the model name, no text, no watermark, no hands";
    const composed = composeGenerationPrompt(
      scene({ aiVideo: { prompt: raw }, voiceover: "Qwen ships it open-source." }),
    );
    expect(composed).toContain("amber");
    expect(composed).toContain("#f59e0b");
  });

  test("a prompt that already declares a palette keeps the agent's colors (no entity override)", () => {
    const raw = "Two lanes of glowing particles in deep blue and cyan, no text, no watermark, no hands";
    const composed = composeGenerationPrompt(
      scene({ aiVideo: { prompt: raw }, voiceover: "Qwen ships it open-source." }),
    );
    expect(composed).not.toContain("#f59e0b");
    expect(composed).toBe(raw);
  });
});

// ─── composition ───

describe("composeGenerationPrompt", () => {
  test("composes raw, brand base, entity color and NEGATIVE in that order", () => {
    const raw = "One tall glowing vertical bar shrinking beside a short one";
    const composed = composeGenerationPrompt(
      scene({ aiVideo: { prompt: raw }, voiceover: "DeepSeek trained it for less." }),
    );
    const brandIdx = composed.indexOf(BRAND_BASE_PROMPT);
    const entityIdx = composed.indexOf("#4d8bff");
    const negIdx = composed.indexOf("no watermark");
    const rawIdx = composed.indexOf(raw);
    expect(rawIdx).toBe(0);
    expect(brandIdx).toBeGreaterThan(rawIdx);
    expect(entityIdx).toBeGreaterThan(brandIdx);
    expect(negIdx).toBeGreaterThan(entityIdx);
  });

  test("returns the empty string for a scene without a declared prompt", () => {
    expect(composeGenerationPrompt(scene({ aiVideo: undefined }))).toBe("");
    expect(composeGenerationPrompt(scene({ aiVideo: { prompt: "   " } }))).toBe("");
  });

  test("is deterministic and never mutates the scene", () => {
    const s = scene();
    const snapshot = JSON.stringify(s);
    const a = composeGenerationPrompt(s);
    const b = composeGenerationPrompt(s);
    expect(a).toBe(b);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  test("strips the declared prompt's trailing full stop when appending", () => {
    const composed = composeGenerationPrompt(
      scene({ aiVideo: { prompt: "A glowing bar with high detail." } }),
    );
    expect(composed.startsWith("A glowing bar with high detail, dark")).toBe(true);
    expect(composed).not.toContain("detail.,");
  });

  test("trim surrounding whitespace of the declared prompt", () => {
    const composed = composeGenerationPrompt(scene({ aiVideo: { prompt: "  A glowing bar  " } }));
    expect(composed.startsWith("A glowing bar")).toBe(true);
  });
});

// ─── CAMERA / MOTION / LIGHTING defaults (half-auto, never force-injected) ───

describe("dimensionDefaultsFor", () => {
  test("returns the per-visualType defaults", () => {
    expect(dimensionDefaultsFor("stat-reveal").camera).toBeTruthy();
    expect(dimensionDefaultsFor("narrative").motion).toBeTruthy();
  });

  test("falls back to the narrative defaults for unknown visualTypes", () => {
    expect(dimensionDefaultsFor("whatever")).toEqual(VISUAL_TYPE_DIMENSION_DEFAULTS.narrative);
  });

  test("defaults are suggestions only — composeGenerationPrompt never injects them", () => {
    const composed = composeGenerationPrompt(scene());
    for (const dims of Object.values(VISUAL_TYPE_DIMENSION_DEFAULTS)) {
      expect(composed).not.toContain(dims.camera);
    }
  });
});

// ─── token budget (constraint 2: no silent 512 truncation) ───

describe("token budget", () => {
  test("estimateTokens is 0 for empty text and grows with length", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("one two three")).toBeGreaterThan(0);
    expect(estimateTokens("word ".repeat(100))).toBeGreaterThan(estimateTokens("word ".repeat(50)));
  });

  test("estimate is conservative — never below the whitespace token count", () => {
    const text = "word ".repeat(40);
    expect(estimateTokens(text)).toBeGreaterThanOrEqual(40);
  });

  test("each CJK character counts as its own token (UMT5 ≈ 1 token per CJK char)", () => {
    expect(estimateTokens("发光")).toBe(2);
    expect(estimateTokens("dark 暗色背景 glowing")).toBeGreaterThanOrEqual(6);
  });

  test("stripNegativeClauses removes exactly the injection-owned surface", () => {
    expect(
      stripNegativeClauses("A glowing bar, dark studio floor, high detail, no text, no letters, no hands."),
    ).toBe("A glowing bar, dark studio floor, high detail");
    // "no texture" is not a NEGATIVE clause — it survives the strip.
    expect(stripNegativeClauses("A bar with no texture")).toBe("A bar with no texture");
  });

  test("a prompt under the budget passes, a 600-word prompt is flagged", () => {
    expect(tokenBudgetExceeded("word ".repeat(100))).toBe(false);
    expect(tokenBudgetExceeded("word ".repeat(600))).toBe(true);
    expect(tokenBudgetExceeded("")).toBe(false);
  });
});

// ─── image prompt composition (#155: T2I, 6 dimensions = 8 minus CAMERA/MOTION) ───

describe("composeImagePrompt (#155)", () => {
  function imageScene(overrides = {}) {
    return {
      id: 11,
      visualType: "narrative",
      voiceover: "Training cost just one ninth of Qwen3.7-Plus.",
      mediaStrategy: "ai-image",
      aiImage: { prompt: "abstract architecture diagram of memory channels, high detail." },
      ...overrides,
    };
  }

  test("reads aiImage.prompt (not aiVideo.prompt)", () => {
    const scene = imageScene({ aiVideo: { prompt: "a video prompt" } });
    const composed = composeImagePrompt(scene);
    expect(composed).toContain("abstract architecture diagram");
    expect(composed).not.toContain("a video prompt");
  });

  test("returns '' when the scene declares no aiImage.prompt", () => {
    expect(composeImagePrompt(imageScene({ aiImage: undefined }))).toBe("");
    expect(composeImagePrompt(imageScene({ aiImage: { prompt: "  " } }))).toBe("");
  });

  test("injects the same BRAND base and entity accent as the video path", () => {
    const composed = composeImagePrompt(imageScene());
    expect(composed).toContain(BRAND_BASE_PROMPT);
    // voiceover mentions Qwen -> Alibaba amber
    expect(composed).toContain("#f59e0b");
  });

  test("respects the agent's own art direction (no double injection)", () => {
    const composed = composeImagePrompt(
      imageScene({ aiImage: { prompt: "blueprint on deep navy backdrop, high detail" } }),
    );
    expect(composed).not.toContain(BRAND_BASE_PROMPT);
  });

  test("injects missing NEGATIVE clauses and never duplicates present ones", () => {
    const bare = composeImagePrompt(imageScene());
    expect(bare).toContain("no text");
    expect(bare).toContain("no watermark");
    expect(bare).toContain("no hands");

    const covered = composeImagePrompt(
      imageScene({ aiImage: { prompt: "memory channels, high detail, no text" } }),
    );
    expect(covered.match(/\bno text\b/g)).toHaveLength(1);
    expect(covered).toContain("no watermark");
  });

  test("no CAMERA/MOTION language is ever injected (still images have neither)", () => {
    const composed = composeImagePrompt(imageScene());
    expect(composed).not.toMatch(/\bdolly\b|\bpush-in\b|\bpan\b|\bmotion\b/i);
  });

  test("video composition is untouched — composeGenerationPrompt still reads aiVideo.prompt", () => {
    const scene = imageScene();
    expect(composeGenerationPrompt(scene)).toBe("");
    const videoScene = { id: 5, aiVideo: { prompt: "a video prompt" } };
    expect(composeGenerationPrompt(videoScene)).toContain("a video prompt");
  });

  test("image budget: the same conservative 480-token estimate applies via the explicit limit", () => {
    // Z-Image's text encoder has a larger native context than UMT5's 512, but
    // the fail-safe budget is shared — the caller passes the image limit.
    expect(tokenBudgetExceeded("word ".repeat(100), IMAGE_MAX_PROMPT_TOKENS)).toBe(false);
    expect(tokenBudgetExceeded("word ".repeat(600), IMAGE_MAX_PROMPT_TOKENS)).toBe(true);
    expect(IMAGE_MAX_PROMPT_TOKENS).toBe(MAX_PROMPT_TOKENS);
  });
});
