import { describe, it, expect } from "vitest";
import { classifyClaimKind, isEvergreenClaim, CLAIM_KIND } from "../lib/claim-kind.mjs";
import { evergreenQueryPhrases } from "../lib/claim-keywords.mjs";

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

  it("does not treat weak recency adverbs as news — English or Chinese", () => {
    // "now" / "latest" / 刚刚 / 最新 appear in standing facts; firing on them
    // would classify exactly the claims this split exists for.
    expect(classifyClaimKind({ voiceover: "The index is now 80% off its peak." })).toBe(
      CLAIM_KIND.EVERGREEN,
    );
    expect(classifyClaimKind({ assetNeed: "latest model lineup chart" })).toBe(
      CLAIM_KIND.EVERGREEN,
    );
    expect(classifyClaimKind({ voiceover: "这是最新款的四足机器人。" })).toBe(CLAIM_KIND.EVERGREEN);
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

  it("reads a source title only when the claim has no own text", () => {
    // Review #1353: the title rides along only when assetNeed and voiceover
    // are both empty — a news headline must not override the claim's own
    // standing fact.
    expect(
      classifyClaimKind({
        sourceRef: { title: "智谱宣布完成新一轮融资" },
      }),
    ).toBe(CLAIM_KIND.NEWS);
    expect(
      classifyClaimKind({
        voiceover: "The round values it at 40 billion yuan.",
        sourceRef: { title: "智谱宣布完成新一轮融资" },
      }),
    ).toBe(CLAIM_KIND.EVERGREEN);
  });
});

// ── integration with the query seam: only the review-fix regressions ──
// (archetype / entity / phrase-branch units live in visual-archetypes.test.mjs
// and claim-keywords.test.mjs; this file keeps the classifier and the two
// behaviours the #1353 review changed.)

describe("claim-kind integration with the query seam", () => {
  it("a newsy source title no longer poisons an evergreen claim's query", () => {
    // Review #1353: the title used to be joined unconditionally, so any
    // evergreen claim attached to a news headline classified news and the
    // split could never fire where it exists to.
    const claim = {
      assetNeed: "Hang Seng TECH index chart",
      voiceover: "The Hang Seng TECH index sits 80% below its 2021 peak.",
      sourceRef: { title: "恒生科技指数暴跌背后：AI股何去何从" },
    };
    expect(classifyClaimKind(claim)).toBe(CLAIM_KIND.EVERGREEN);
    expect(evergreenQueryPhrases(claim)).toEqual(["Hang Seng TECH chart"]);
  });

  it("entity and archetype come from the same field", () => {
    // Review #1353: the assetNeed declared a chart while a passing data-center
    // mention in the narration decided the archetype, sourcing "Hang Seng TECH
    // data center" for a chart scene.
    const claim = {
      assetNeed: "Hang Seng TECH index chart showing the drawdown",
      voiceover: "Alibaba is pouring billions into new data centers.",
    };
    expect(evergreenQueryPhrases(claim)).toEqual(["Hang Seng TECH chart"]);
  });
});
