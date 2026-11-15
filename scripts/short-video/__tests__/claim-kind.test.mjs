import { describe, it, expect } from "vitest";
import { classifyClaimKind, isEvergreenClaim, CLAIM_KIND } from "../lib/claim-kind.mjs";
import {
  archetypeForText,
  archetypeWord,
  composeArchetypePhrase,
} from "../lib/visual-archetypes.mjs";
import {
  claimQueryPhrases,
  evergreenQueryPhrases,
  entityPhraseFor,
} from "../lib/claim-keywords.mjs";

// ── classifyClaimKind ──

describe("classifyClaimKind", () => {
  it("calls a standing valuation fact evergreen", () => {
    const claim = {
      assetNeed: "Hang Seng TECH index chart",
      voiceover: "The Hang Seng TECH index sits 80% below its 2021 peak.",
    };
    expect(classifyClaimKind(claim)).toBe(CLAIM_KIND.EVERGREEN);
    expect(isEvergreenClaim(claim)).toBe(true);
  });

  it("calls a launch with a time anchor news", () => {
    expect(
      classifyClaimKind({
        assetNeed: "unitree humanoid robot",
        voiceover: "Unitree unveiled its new humanoid robot today.",
      }),
    ).toBe(CLAIM_KIND.NEWS);
  });

  it("calls an event verb without any time anchor news", () => {
    expect(
      classifyClaimKind({
        assetNeed: "boardroom",
        voiceover: "The two firms signed a partnership.",
      }),
    ).toBe(CLAIM_KIND.NEWS);
  });

  it("calls disclosure verbs news — the zhipu-glm6 regression (#1353 A/B)", () => {
    // "just disclosed" must not read as a standing fact: the A/B on the real
    // zhipu-glm6-self-training package caught "disclosed" missing from the
    // event vocabulary and misclassifying the hook as evergreen.
    expect(
      classifyClaimKind({
        voiceover: "China's Zhipu AI just disclosed GLM-6.0. The next model will train itself.",
      }),
    ).toBe(CLAIM_KIND.NEWS);
    expect(classifyClaimKind({ voiceover: "Sources revealed the chip design." })).toBe(
      CLAIM_KIND.NEWS,
    );
  });

  it("does not treat a bare year as a happening", () => {
    expect(classifyClaimKind({ voiceover: "The index is 80% below its 2021 peak." })).toBe(
      CLAIM_KIND.EVERGREEN,
    );
  });

  it("does not treat weak recency adverbs as news", () => {
    // "now" / "latest" appear in standing facts; firing on them would classify
    // exactly the claims this split exists for.
    expect(classifyClaimKind({ voiceover: "The index is now 80% off its peak." })).toBe(
      CLAIM_KIND.EVERGREEN,
    );
    expect(classifyClaimKind({ assetNeed: "latest model lineup chart" })).toBe(
      CLAIM_KIND.EVERGREEN,
    );
  });

  it("reads Chinese event cues", () => {
    expect(classifyClaimKind({ voiceover: "智谱今天发布了新模型。" })).toBe(CLAIM_KIND.NEWS);
    expect(classifyClaimKind({ voiceover: "恒生科技指数较峰值下跌 80%。" })).toBe(
      CLAIM_KIND.EVERGREEN,
    );
  });

  it("falls back to news when there is no text to judge", () => {
    expect(classifyClaimKind({})).toBe(CLAIM_KIND.NEWS);
    expect(classifyClaimKind(null)).toBe(CLAIM_KIND.NEWS);
  });

  it("reads a news source title as context", () => {
    expect(
      classifyClaimKind({
        voiceover: "The round values it at 40 billion yuan.",
        sourceRef: { title: "智谱宣布完成新一轮融资" },
      }),
    ).toBe(CLAIM_KIND.NEWS);
  });
});

// ── visual-archetypes ──

describe("archetypeForText", () => {
  it("maps chart cues to the chart archetype", () => {
    expect(archetypeForText("Hang Seng TECH index chart")).toBe("chart");
    expect(archetypeForText("the benchmark has fallen 80%")).toBe("chart");
  });

  it("prefers the specific multi-word cue", () => {
    expect(archetypeForText("a GPU cluster inside the data center")).toBe("data_center");
    expect(archetypeForText("robot arm picking a block")).toBe("robot_arm");
  });

  it("does not fire a single-word cue inside a longer word", () => {
    expect(archetypeForText("factory planting season")).toBe("factory");
    expect(archetypeForText("label printing")).toBe(null);
  });

  it("returns null for text with no archetype", () => {
    expect(archetypeForText("a founder speaking to camera")).toBe(null);
    expect(archetypeForText("")).toBe(null);
  });

  it("exposes the retrieval term per archetype", () => {
    expect(archetypeWord("chart")).toBe("chart");
    expect(archetypeWord("data_center")).toBe("data center");
    expect(archetypeWord("nope")).toBe(null);
  });

  it("composes entity + archetype only when both halves exist", () => {
    expect(composeArchetypePhrase("Hang Seng TECH", "chart")).toBe("Hang Seng TECH chart");
    expect(composeArchetypePhrase("", "chart")).toBe(null);
    expect(composeArchetypePhrase("Hang Seng TECH", null)).toBe(null);
  });
});

// ── entity extraction ──

describe("entityPhraseFor", () => {
  it("takes the proper-noun run and drops a leading determiner", () => {
    expect(entityPhraseFor("The Hang Seng TECH index is down")).toBe("Hang Seng TECH");
  });

  it("drops a trailing picture noun so the archetype is not doubled", () => {
    expect(entityPhraseFor("Hang Seng TECH index")).toBe("Hang Seng TECH");
  });

  it("accepts a brand-shaped single word", () => {
    expect(entityPhraseFor("UBTECH walker")).toBe("UBTECH");
    expect(entityPhraseFor("DeepSeek pricing")).toBe("DeepSeek");
  });

  it("rejects a sentence-initial capitalised common noun", () => {
    expect(entityPhraseFor("Robot up close")).toBe("");
  });

  it("returns nothing for un-capitalised or Chinese text", () => {
    expect(entityPhraseFor("zhipu headquarters")).toBe("");
    expect(entityPhraseFor("恒生科技指数")).toBe("");
  });
});

// ── evergreenQueryPhrases / claimQueryPhrases ──

describe("evergreenQueryPhrases", () => {
  it("builds entity + archetype for an evergreen claim", () => {
    expect(
      evergreenQueryPhrases({
        assetNeed: "Hang Seng TECH index chart",
        voiceover: "The Hang Seng TECH index sits 80% below its 2021 peak.",
      }),
    ).toEqual(["Hang Seng TECH chart"]);
  });

  it("returns nothing for a news claim", () => {
    expect(
      evergreenQueryPhrases({ voiceover: "Unitree unveiled its humanoid robot today." }),
    ).toEqual([]);
  });

  it("returns nothing when no archetype is identifiable", () => {
    expect(evergreenQueryPhrases({ voiceover: "The two founders met at Stanford." })).toEqual([]);
  });

  it("returns nothing when no entity is identifiable", () => {
    expect(evergreenQueryPhrases({ assetNeed: "a chart of the sector" })).toEqual([]);
  });
});

describe("claimQueryPhrases with the evergreen branch", () => {
  it("uses the archetype phrase instead of the tokenized one", () => {
    expect(
      claimQueryPhrases({
        assetNeed: "Hang Seng TECH index chart",
        voiceover: "The index is 80% below its 2021 peak.",
      }),
    ).toEqual(["Hang Seng TECH chart"]);
  });

  it("keeps writer searchHints ahead of the archetype branch", () => {
    expect(
      claimQueryPhrases({
        assetNeed: "Hang Seng TECH index chart",
        searchHints: ["hang seng tech chart screenshot"],
      }),
    ).toEqual(["hang seng tech chart screenshot"]);
  });

  it("falls back to tokenization for news claims", () => {
    const phrases = claimQueryPhrases({
      assetNeed: "humanoid robot walking in a lab",
      voiceover: "It was announced today.",
    });
    expect(phrases[0]).not.toContain("chart");
    expect(phrases.join(" ")).toContain("humanoid");
  });
});
