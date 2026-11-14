import { describe, test, expect } from "vitest";

import { deriveVisualScenePrompt, DERIVED_VOICEOVER_SOURCE } from "../b-roll/claim-to-visual.mjs";

describe("claim-to-visual (#1324): voiceover echo → visual scene clause", () => {
  test("digits and quantity words never reach the clause", () => {
    const out = deriveVisualScenePrompt(
      "That is 80 percent gone in five months for China's most watched AI listing, according to HKEX closes.",
    );
    expect(out).not.toMatch(/\d/);
    expect(out).not.toContain("percent");
    expect(out).not.toContain("according");
    // The narration sentence is never echoed verbatim.
    expect(out).not.toContain("That is 80");
    expect(out).toMatch(/scene, abstract cinematic atmosphere$/);
  });

  test("currency amounts and decimals are dropped, subject words survive", () => {
    const out = deriveVisualScenePrompt(
      "QbitAI reported the API at 0.2 yuan an image, with half off in week one.",
    );
    expect(out).not.toMatch(/\d/);
    expect(out).not.toContain("yuan");
    expect(out).not.toContain("half");
    // "api" is tech-meta that steers toward UI screens — excluded like the
    // market nouns below.
    expect(out).not.toContain("api");
    expect(out).toContain("image");
  });

  test("digit-led spec tokens drop even when they name a model", () => {
    const out = deriveVisualScenePrompt(
      "MiniMax open sourced a 4K image model, at half the price of closed rivals.",
    );
    expect(out).not.toContain("4k");
    // "MiniMax" is a brand token — never a visual subject (see the brand test
    // below); only its content words survive.
    expect(out).not.toContain("minimax");
    expect(out).toContain("model");
  });

  test("spelled-out small numbers and relative time are quantity/meta words", () => {
    const out = deriveVisualScenePrompt("Two launches this month, up from one last week.");
    expect(out).not.toContain("two");
    expect(out).not.toContain("month");
    expect(out).not.toContain("week");
    expect(out).toContain("launches");
  });

  test("claim order is preserved and duplicates collapse", () => {
    const out = deriveVisualScenePrompt("A robot arm stacks boxes. The robot arm repeats it.");
    expect(out.startsWith("robot arm stacks boxes repeats")).toBe(true);
    expect(out.match(/robot/g) ?? []).toHaveLength(1);
  });

  test("the clause is capped at six content words", () => {
    const out = deriveVisualScenePrompt(
      "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
    );
    const body = out.split(" scene,")[0].split(" ");
    expect(body.length).toBe(6);
  });

  test("market nouns and exchange names never become visual subjects", () => {
    // Verified regression (#1324): "hkex listing scene" painted a giant "80%"
    // quote board — exchange/market nouns steer the model to data displays,
    // which are wall-to-wall numbers and lettering.
    const out = deriveVisualScenePrompt(
      "That is 80 percent gone in five months for China's most watched AI listing, according to HKEX closes.",
    );
    expect(out).not.toContain("hkex");
    expect(out).not.toContain("listing");
    expect(out).not.toContain("closes");
    expect(out).not.toContain("ai");
    const share = deriveVisualScenePrompt(
      "From the peak, 2,526 Hong Kong dollars a share vanished. 85 percent of the value.",
    );
    expect(share).not.toContain("share");
    const index = deriveVisualScenePrompt("Hang Seng tech fell; the index repriced Zhipu.");
    expect(index).not.toContain("seng");
    expect(index).not.toContain("index");
  });

  test("brand names and acronyms never become visual subjects", () => {
    // Verified regression (#1324): "qbitai image scene" painted a giant — and
    // misspelled — "qibitai" wordmark, and the gate rewarded it because the
    // claim names the company. Attribution belongs to the injection layer's
    // entity accent, not to lettering in the background.
    const brand = deriveVisualScenePrompt(
      "QbitAI reported the API at 0.2 yuan an image, with half off in week one.",
    );
    expect(brand).not.toContain("qbitai");
    expect(brand).not.toContain("api");
    expect(brand).toContain("image");
    const camel = deriveVisualScenePrompt("MiniMax open sourced a 4K image model.");
    expect(camel).not.toContain("minimax");
    // A sentence-initial capital is not a brand cue — ordinary words survive
    // lowercased.
    const ordinary = deriveVisualScenePrompt("Vault peaked early, then it slid sideways.");
    expect(ordinary).toContain("vault");
    // Company names cannot rely on casing ("Zhipu" is sentence-initial): they
    // come from the shared KNOWN_COMPANIES vocabulary. Verified regression:
    // the hook clause "zhipu peaked hong kong scene" painted a glowing
    // app-icon wordmark (2026-11-14).
    const company = deriveVisualScenePrompt("Zhipu peaked early, then it slid sideways.");
    expect(company).not.toContain("zhipu");
    expect(company).toContain("peaked");
  });

  test("an empty or all-meta claim falls back to a generic scene with the visualType flavor", () => {
    expect(deriveVisualScenePrompt("", { visualType: "stat-reveal" })).toBe(
      "abstract cinematic tech scene, ambient atmosphere, stat-reveal mood",
    );
    expect(deriveVisualScenePrompt("80%. 150%. -80.")).toBe(
      "abstract cinematic tech scene, ambient atmosphere, tech mood",
    );
  });

  test("the scaffolding never trips the injection layer's art-direction skip", () => {
    // "dark" / "background" / "gradient" / color names would suppress the
    // BRAND base prompt and the entity accent — the derived clause must stay
    // free of them so prompt-injection keeps decorating it.
    const ART_DIRECTION_PATTERN =
      /\bdark\b|\bpalette\b|aesthetic|background|backdrop|gradient|#[0-9a-f]{6}|\b(?:blue|cyan|red|amber|green|purple|orange|pink|gold|white|gray|grey|monochrome)\b/i;
    const samples = [
      "That is 80 percent gone in five months, according to HKEX closes.",
      "",
      "Up to 16 reference images in one prompt. That is the consistency problem, mostly solved.",
    ];
    for (const text of samples) {
      expect(ART_DIRECTION_PATTERN.test(deriveVisualScenePrompt(text))).toBe(false);
    }
  });

  test("the derived source label is exported for the orchestrator's report entries", () => {
    expect(DERIVED_VOICEOVER_SOURCE).toBe("voiceover-visual");
  });

  test("deterministic: identical input, identical clause (cache hash depends on it)", () => {
    const text =
      "From the peak, 2,526 Hong Kong dollars a share vanished. 85 percent of the value.";
    expect(deriveVisualScenePrompt(text)).toBe(deriveVisualScenePrompt(text));
    expect(deriveVisualScenePrompt(text)).toContain("peak");
    expect(deriveVisualScenePrompt(text)).not.toMatch(/\d/);
  });
});
