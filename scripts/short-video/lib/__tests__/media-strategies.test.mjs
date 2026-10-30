import { describe, test, expect } from "vitest";

import {
  MEDIA_STRATEGIES,
  resolveMediaPlan,
  resolveGenerationPrompt,
  selectAutoForm,
  shouldSourceStock,
} from "../media-strategies.mjs";

describe("#355 media strategy plan", () => {
  test("the vocabulary keeps the legacy default and adds source-only", () => {
    expect(MEDIA_STRATEGIES).toEqual([
      "asset",
      "source-only",
      "b-roll",
      "asset-then-broll",
      "ai-image",
      "asset-then-ai-image",
    ]);
  });

  test.each([
    [undefined, "chain", true, "fallback", "auto", true],
    ["asset", "chain", true, "fallback", "auto", true],
    ["source-only", "source-only", true, "never", null, false],
    ["b-roll", "always-generate", false, "always", "video", false],
    ["ai-image", "always-generate", false, "always", "image", false],
    ["asset-then-broll", "source-then-generate", true, "fallback", "video", false],
    ["asset-then-ai-image", "source-then-generate", true, "fallback", "image", false],
  ])("%s -> %s", (strategy, kind, sourceStock, generate, form, auto) => {
    const scene = strategy === undefined ? {} : { mediaStrategy: strategy };
    expect(resolveMediaPlan(scene)).toMatchObject({
      kind,
      sourceStock,
      generate,
      form,
      auto,
    });
    expect(shouldSourceStock(scene)).toBe(sourceStock);
  });

  test("an unknown value stays source-first and lets preflight fail it", () => {
    expect(resolveMediaPlan({ mediaStrategy: "broll" })).toMatchObject({
      kind: "unknown",
      sourceStock: true,
      auto: true,
      unknown: true,
    });
  });
});

describe("#355 generation prompt resolution", () => {
  test("explicit prompts win and are preserved verbatim (cache hashes depend on it)", () => {
    const trailing = "a robot arm ";
    expect(resolveGenerationPrompt({ aiVideo: { prompt: trailing } }, "video")).toEqual({
      prompt: trailing,
      source: "aiVideo.prompt",
    });
    expect(
      resolveGenerationPrompt({ aiImage: { prompt: "a diagram " } }, "image", {
        allowDerived: true,
      }),
    ).toEqual({ prompt: "a diagram ", source: "aiImage.prompt" });
  });

  test("explicit overrides never derive; the chain derives assetNeed then voiceover", () => {
    const scene = { assetNeed: "a factory line", voiceover: "narration" };
    expect(resolveGenerationPrompt(scene, "image")).toBeNull();
    expect(resolveGenerationPrompt(scene, "image", { allowDerived: true })).toEqual({
      prompt: "a factory line",
      source: "assetNeed",
    });
    expect(
      resolveGenerationPrompt({ voiceover: " narration " }, "image", { allowDerived: true }),
    ).toEqual({ prompt: "narration", source: "voiceover" });
  });

  test("video prompts only exist when declared", () => {
    expect(resolveGenerationPrompt({ voiceover: "v" }, "video", { allowDerived: true })).toBeNull();
  });
});

describe("#355 automatic form selection", () => {
  test("T2I is the default; a declared motion prompt uses the video budget", () => {
    expect(selectAutoForm({ voiceover: "v" }, 1)).toBe("image");
    expect(selectAutoForm({ aiVideo: { prompt: "a dolly shot" } }, 1)).toBe("video");
    expect(selectAutoForm({ aiVideo: { prompt: "a dolly shot" } }, 0)).toBe("image");
  });
});
