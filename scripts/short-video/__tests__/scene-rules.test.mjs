import { describe, it, expect } from "vitest";
import {
  AI_BLACKLIST,
  checkSceneCount,
  checkHookVisualType,
  checkCTAVisualType,
  checkHookCompellingElement,
  checkNoEmDashes,
  checkNoAIVocabulary,
  checkNoWrittenOpener,
  checkHookDiffersFromText,
  checkNoDeadClosers,
  checkSEOKeywords,
  checkSourceAttribution,
  checkShareWorthyData,
  checkVoiceoverWordCount,
  checkOneBreath,
  checkSubjectVisibility,
  checkSeriesMeta,
  checkClickbait,
  checkUnverifiedClaims,
  checkNoWatermarks,
  checkTeleprompterRhythm,
  checkCTAStacking,
  checkPrimaryGoal,
  checkLoopClose,
  runAllSceneDataChecks,
} from "../lib/scene-rules.mjs";

// ── Mock scene data ──

const validScenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover: "A leaked memo reveals DeepSeek paused its 1.4 billion dollar round.",
    texts: { line1: "DEEPSEEK PAUSED", line2: "$1.4B ROUNDD" },
  },
  {
    id: 2,
    name: "context",
    visualType: "context",
    voiceover: "Bloomberg reported the news first. Liang Wenfeng confirmed it.",
    texts: { line1: "BLOOMBERG EXCLUSIVE" },
  },
  {
    id: 3,
    name: "data",
    visualType: "data",
    voiceover: "China AI spending hit 47 billion in 2024.",
    texts: { stat: "$47B" },
  },
  {
    id: 4,
    name: "analysis",
    visualType: "contrast",
    voiceover: "DeepSeek chose open source. Others chose closed.",
    texts: { left: "OPEN", right: "CLOSED" },
  },
  {
    id: 5,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow for more China AI news that matters.",
    texts: { line1: "CHINA AI NEWS" },
  },
];

const validSeriesMeta = {
  seriesId: "restraint",
  partNumber: 1,
  totalParts: 3,
};

// ── checkSceneCount ──

describe("checkSceneCount", () => {
  it("passes for 6-10 scenes", () => {
    for (const n of [6, 7, 8, 9, 10]) {
      const scenes = Array(n).fill(validScenes[0]);
      const results = checkSceneCount(scenes);
      expect(results[0].level).toBe("pass");
    }
  });

  it("warns for <6 scenes", () => {
    const results = checkSceneCount(Array(5).fill(validScenes[0]));
    expect(results[0].level).toBe("warn");
  });

  it("warns for >10 scenes", () => {
    const results = checkSceneCount(Array(11).fill(validScenes[0]));
    expect(results[0].level).toBe("warn");
  });
});

// ── checkHookVisualType ──

describe("checkHookVisualType", () => {
  it("passes when Scene 1 has visualType=hook", () => {
    const results = checkHookVisualType(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when Scene 1 visualType is not hook", () => {
    const scenes = [{ ...validScenes[0], visualType: "narrative" }];
    const results = checkHookVisualType(scenes);
    expect(results[0].level).toBe("fail");
    expect(results[0].fix).toContain("hook");
  });
});

// ── checkCTAVisualType ──

describe("checkCTAVisualType", () => {
  it("passes when last scene has visualType=cta", () => {
    const results = checkCTAVisualType(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when last scene visualType is not cta", () => {
    const scenes = [...validScenes.slice(0, -1), { ...validScenes[4], visualType: "summary" }];
    const results = checkCTAVisualType(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkHookCompellingElement ──

describe("checkHookCompellingElement", () => {
  it("passes when hook has a number", () => {
    const scenes = [{ ...validScenes[0], voiceover: "DeepSeek raised 1.4 billion." }];
    const results = checkHookCompellingElement(scenes);
    expect(results[0].level).toBe("pass");
  });

  it("passes when hook has a strong word", () => {
    const scenes = [{ ...validScenes[0], voiceover: "A leaked memo changed everything." }];
    const results = checkHookCompellingElement(scenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when hook has no number or strong word", () => {
    const scenes = [{ ...validScenes[0], voiceover: "DeepSeek is a company in China." }];
    const results = checkHookCompellingElement(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkNoEmDashes ──

describe("checkNoEmDashes", () => {
  it("passes when no dashes in any scene", () => {
    const results = checkNoEmDashes(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when em dash in voiceover", () => {
    const scenes = [{ ...validScenes[0], voiceover: "DeepSeek — the AI giant — paused." }];
    const results = checkNoEmDashes(scenes);
    expect(results[0].level).toBe("fail");
  });

  it("fails when double dash in on-screen text", () => {
    const scenes = [{ ...validScenes[0], texts: { line1: "DEEPSEEK--PAUSED" } }];
    const results = checkNoEmDashes(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkNoAIVocabulary ──

describe("checkNoAIVocabulary", () => {
  it("passes when no blacklist words", () => {
    const results = checkNoAIVocabulary(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when leverage is used", () => {
    const scenes = [{ ...validScenes[0], voiceover: "They leverage AI for growth." }];
    const results = checkNoAIVocabulary(scenes);
    expect(results[0].level).toBe("fail");
  });

  it("fails when seamless is used", () => {
    const scenes = [{ ...validScenes[1], voiceover: "A seamless integration." }];
    const results = checkNoAIVocabulary(scenes);
    expect(results[0].level).toBe("fail");
  });

  it("catches multiple blacklist words across scenes", () => {
    const scenes = [
      { id: 1, voiceover: "They leverage the ecosystem." },
      { id: 2, voiceover: "A seamless paradigm shift." },
    ];
    const results = checkNoAIVocabulary(scenes);
    expect(results[0].level).toBe("fail");
    expect(results[0].detail).toContain("leverage");
    expect(results[0].detail).toContain("seamless");
  });
});

// ── checkNoWrittenOpener ──

describe("checkNoWrittenOpener", () => {
  it("passes when hook is spoken style", () => {
    const results = checkNoWrittenOpener(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when hook starts with 'In this video I will'", () => {
    const scenes = [{ ...validScenes[0], voiceover: "In this video I will show you DeepSeek." }];
    const results = checkNoWrittenOpener(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkHookDiffersFromText ──

describe("checkHookDiffersFromText", () => {
  it("passes when hook VO and on-screen text use different words", () => {
    const results = checkHookDiffersFromText(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("warns when hook VO and on-screen text are very similar", () => {
    const scenes = [
      {
        ...validScenes[0],
        voiceover: "DeepSeek paused its funding round.",
        texts: { line1: "DeepSeek paused its funding round" },
      },
    ];
    const results = checkHookDiffersFromText(scenes);
    expect(results[0].level).toBe("warn");
  });
});

// ── checkNoDeadClosers ──

describe("checkNoDeadClosers", () => {
  it("passes when no dead closer in last scene", () => {
    const results = checkNoDeadClosers(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when last scene has 'thanks for watching'", () => {
    const scenes = [
      ...validScenes.slice(0, -1),
      { ...validScenes[4], voiceover: "Thanks for watching!" },
    ];
    const results = checkNoDeadClosers(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkSEOKeywords ──

describe("checkSEOKeywords", () => {
  it("passes when all keywords appear in >=2 scenes", () => {
    const results = checkSEOKeywords(validScenes);
    expect(results.every((r) => r.level === "pass")).toBe(true);
  });

  it("fails when a keyword appears in <2 scenes", () => {
    const scenes = [
      { id: 1, voiceover: "China AI news.", texts: {} },
      { id: 2, voiceover: "Some other topic.", texts: {} },
      { id: 3, voiceover: "More news.", texts: {} },
    ];
    const results = checkSEOKeywords(scenes);
    const deepseekResult = results.find((r) => r.check.includes("deepseek"));
    expect(deepseekResult.level).toBe("fail");
  });
});

// ── checkSourceAttribution ──

describe("checkSourceAttribution", () => {
  it("passes when >=2 scenes mention sources", () => {
    const results = checkSourceAttribution(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when <2 scenes mention sources", () => {
    const scenes = [
      { id: 1, voiceover: "Something happened." },
      { id: 2, voiceover: "More things happened." },
      { id: 3, voiceover: "Even more." },
    ];
    const results = checkSourceAttribution(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkShareWorthyData ──

describe("checkShareWorthyData", () => {
  it("passes when >=50% scenes have numbers", () => {
    const results = checkShareWorthyData(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when <50% scenes have numbers", () => {
    const scenes = [
      { id: 1, voiceover: "Something happened.", texts: {} },
      { id: 2, voiceover: "More things.", texts: {} },
      { id: 3, voiceover: "Even more.", texts: {} },
      { id: 4, voiceover: "Still no numbers.", texts: {} },
    ];
    const results = checkShareWorthyData(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkVoiceoverWordCount ──

describe("checkVoiceoverWordCount", () => {
  it("passes when total words <=180", () => {
    const results = checkVoiceoverWordCount(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("warns when total words >180", () => {
    const longVO = Array(200).fill("word").join(" ");
    const scenes = [{ ...validScenes[0], voiceover: longVO }];
    const results = checkVoiceoverWordCount(scenes);
    expect(results[0].level).toBe("warn");
  });
});

// ── checkOneBreath ──

describe("checkOneBreath", () => {
  it("passes when all lines <=25 words", () => {
    const results = checkOneBreath(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("warns when a line exceeds 25 words", () => {
    const longLine = Array(30).fill("word").join(" ");
    const scenes = [{ ...validScenes[0], voiceover: longLine }];
    const results = checkOneBreath(scenes);
    expect(results[0].level).toBe("warn");
  });
});

// ── checkSubjectVisibility ──

describe("checkSubjectVisibility", () => {
  it("passes when company name in hook on-screen text", () => {
    const results = checkSubjectVisibility(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("warns when no company name in hook on-screen text", () => {
    const scenes = [{ ...validScenes[0], texts: { line1: "BIG NEWS" } }];
    const results = checkSubjectVisibility(scenes);
    expect(results[0].level).toBe("warn");
  });
});

// ── checkSeriesMeta ──

describe("checkSeriesMeta", () => {
  it("passes when seriesMeta is complete", () => {
    const results = checkSeriesMeta(validSeriesMeta);
    expect(results[0].level).toBe("pass");
  });

  it("returns empty when seriesMeta is null (single video)", () => {
    const results = checkSeriesMeta(null);
    expect(results).toEqual([]);
  });

  it("fails when seriesMeta is incomplete", () => {
    const results = checkSeriesMeta({ seriesId: "test", partNumber: 1 });
    expect(results[0].level).toBe("fail");
  });
});

// ── checkClickbait ──

describe("checkClickbait", () => {
  it("passes when no clickbait patterns", () => {
    const results = checkClickbait(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when 'you won't believe' is used", () => {
    const scenes = [{ ...validScenes[0], voiceover: "You won't believe what DeepSeek did." }];
    const results = checkClickbait(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkUnverifiedClaims ──

describe("checkUnverifiedClaims", () => {
  it("passes when no unverified 'sources say'", () => {
    const results = checkUnverifiedClaims(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when 'sources say' without attribution", () => {
    const scenes = [{ ...validScenes[0], voiceover: "Sources say DeepSeek is collapsing." }];
    const results = checkUnverifiedClaims(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkNoWatermarks ──

describe("checkNoWatermarks", () => {
  it("passes when no cross-platform references", () => {
    const results = checkNoWatermarks(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("fails when @instagram reference found", () => {
    const scenes = [{ ...validScenes[0], texts: { line1: "Follow @instagram" } }];
    const results = checkNoWatermarks(scenes);
    expect(results[0].level).toBe("fail");
  });
});

// ── checkTeleprompterRhythm ──

describe("checkTeleprompterRhythm", () => {
  it("passes when lines vary in length", () => {
    const results = checkTeleprompterRhythm(validScenes);
    expect(results[0].level).toBe("pass");
  });
});

// ── checkCTAStacking ──

describe("checkCTAStacking", () => {
  it("passes when no CTA stacking", () => {
    const results = checkCTAStacking(validScenes);
    expect(results[0].level).toBe("pass");
  });

  it("warns when 3+ CTAs in one scene", () => {
    const scenes = [
      { ...validScenes[4], voiceover: "Follow, like, comment, share, and subscribe now!" },
    ];
    const results = checkCTAStacking(scenes);
    expect(results[0].level).toBe("warn");
  });
});

// ── checkPrimaryGoal ──

describe("checkPrimaryGoal", () => {
  it("passes when <=2 goal signals", () => {
    const results = checkPrimaryGoal(validScenes);
    expect(results[0].level).toBe("pass");
  });
});

// ── checkLoopClose ──

describe("checkLoopClose", () => {
  it("returns a result (warn level is acceptable)", () => {
    const results = checkLoopClose(validScenes);
    expect(results).toHaveLength(1);
    expect(["warn"]).toContain(results[0].level);
  });
});

// ── runAllSceneDataChecks ──

describe("runAllSceneDataChecks", () => {
  it("returns { pass, warn, fail } arrays", () => {
    const results = runAllSceneDataChecks(validScenes, validSeriesMeta);
    expect(results).toHaveProperty("pass");
    expect(results).toHaveProperty("warn");
    expect(results).toHaveProperty("fail");
    expect(Array.isArray(results.pass)).toBe(true);
    expect(Array.isArray(results.warn)).toBe(true);
    expect(Array.isArray(results.fail)).toBe(true);
  });

  it("produces 0 fails for valid scenes", () => {
    const results = runAllSceneDataChecks(validScenes, validSeriesMeta);
    expect(results.fail.length).toBe(0);
  });

  it("catches missing visualType=hook", () => {
    const badScenes = [{ ...validScenes[0], visualType: "narrative" }, ...validScenes.slice(1)];
    const results = runAllSceneDataChecks(badScenes, null);
    const hookFail = results.fail.find((f) => f.check.includes("Hook scene type"));
    expect(hookFail).toBeDefined();
  });

  it("catches missing visualType=cta", () => {
    const badScenes = [...validScenes.slice(0, -1), { ...validScenes[4], visualType: "summary" }];
    const results = runAllSceneDataChecks(badScenes, null);
    const ctaFail = results.fail.find((f) => f.check.includes("CTA scene type"));
    expect(ctaFail).toBeDefined();
  });

  it("catches em dashes", () => {
    const badScenes = [
      { ...validScenes[0], voiceover: "DeepSeek — paused." },
      ...validScenes.slice(1),
    ];
    const results = runAllSceneDataChecks(badScenes, null);
    const dashFail = results.fail.find((f) => f.check.includes("dash"));
    expect(dashFail).toBeDefined();
  });

  it("catches AI vocabulary", () => {
    const badScenes = [
      { ...validScenes[0], voiceover: "They leverage AI." },
      ...validScenes.slice(1),
    ];
    const results = runAllSceneDataChecks(badScenes, null);
    const aiFail = results.fail.find((f) => f.check.includes("blacklist"));
    expect(aiFail).toBeDefined();
  });

  it("catches dead closer", () => {
    const badScenes = [
      ...validScenes.slice(0, -1),
      { ...validScenes[4], voiceover: "Thanks for watching!" },
    ];
    const results = runAllSceneDataChecks(badScenes, null);
    const closerFail = results.fail.find(
      (f) => f.check.includes("closer") || f.check.includes("dead"),
    );
    expect(closerFail).toBeDefined();
  });

  it("catches clickbait", () => {
    const badScenes = [
      { ...validScenes[0], voiceover: "You won't believe this!" },
      ...validScenes.slice(1),
    ];
    const results = runAllSceneDataChecks(badScenes, null);
    const clickbaitFail = results.fail.find((f) => f.check.includes("clickbait"));
    expect(clickbaitFail).toBeDefined();
  });

  it("works without seriesMeta (single video)", () => {
    const results = runAllSceneDataChecks(validScenes, null);
    expect(results.fail.length).toBe(0);
  });
});
